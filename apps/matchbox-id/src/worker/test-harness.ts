import {
  type SigningJwk,
  tokenResponseSchema,
} from "@repo/platform-contracts/oidc"
import {
  createMemoryRateLimitClient,
  randomToken,
  sha256Base64Url,
} from "@repo/platform-server"
import type { Hono } from "hono"
import { exportJWK, generateKeyPair } from "jose"
import { verifyMessage } from "viem"
import { type PrivateKeyAccount, privateKeyToAccount } from "viem/accounts"
import { createSiweMessage } from "viem/siwe"
import { z } from "zod"
import { createApp } from "./app"
import type { IdFlags } from "./config"
import type { AppDeps, SiwePublicClient } from "./deps"
import { createSigningKeys } from "./oidc/keys"
import type { IdStore } from "./store/id-store"
import {
  type MemoryIdStore,
  createMemoryIdStore,
  memorySeed,
} from "./store/memory-store"

/** Test-only harness: memory store, fake clock, real ES256 keys. */

export const origin = "https://id.test"
export const host = "id.test"

/** Hardhat #0 / #1: well-known local keys (memorySeed.devWallet is #0). */
export const devAccount = privateKeyToAccount(
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
)
export const otherAccount = privateKeyToAccount(
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
)

const signingKeySchema = z.object({
  kty: z.literal("EC"),
  crv: z.literal("P-256"),
  x: z.string(),
  y: z.string(),
  d: z.string(),
})

let cachedKey: SigningJwk | null = null

async function testSigningKey(): Promise<SigningJwk> {
  if (cachedKey !== null) return cachedKey
  const { privateKey } = await generateKeyPair("ES256", { extractable: true })
  const jwk = signingKeySchema.parse(await exportJWK(privateKey))
  cachedKey = { ...jwk, kid: "test-key" }
  return cachedKey
}

export const verifyingPublicClient: SiwePublicClient = {
  verifySiweMessage({ message, signature, address }) {
    return verifyMessage({ address, message, signature })
  },
}

export type Harness = {
  app: Hono
  store: MemoryIdStore
  deps: AppDeps
  clock: { now: Date; advance(ms: number): void }
  verifySpy: { calls: number }
}

export async function createHarness(
  options: {
    flags?: Partial<IdFlags>
    publicClient?: SiwePublicClient
    /** Wraps the memory store the app sees (e.g. to interleave requests). */
    wrapStore?: (store: MemoryIdStore) => IdStore
  } = {},
): Promise<Harness> {
  const clock = {
    now: new Date("2026-09-30T12:00:00.000Z"),
    advance(ms: number) {
      clock.now = new Date(clock.now.getTime() + ms)
    },
  }
  const clientSecretPepper = "test-client-secret-pepper"
  const store = await createMemoryIdStore({ clientSecretPepper })
  const verifySpy = { calls: 0 }
  const publicClient = options.publicClient ?? verifyingPublicClient
  const deps: AppDeps = {
    store: options.wrapStore?.(store) ?? store,

    rateLimits: createMemoryRateLimitClient(() => clock.now.getTime()),
    keys: await createSigningKeys([await testSigningKey()]),
    now: () => clock.now,
    flags: { matchboxId: true, discordClaims: true, ...options.flags },
    config: {
      issuer: origin,
      sessionPepper: "test-session-pepper-0000",
      clientSecretPepper,
    },
    publicClientFactory: () => ({
      verifySiweMessage(args) {
        verifySpy.calls += 1
        return publicClient.verifySiweMessage(args)
      },
    }),
  }
  return { app: createApp(deps), store, deps, clock, verifySpy }
}

export function url(path: string): string {
  return `${origin}${path}`
}

export function apiHeaders(cookie: string | null = null): HeadersInit {
  return {
    Origin: origin,
    "Content-Type": "application/json",
    ...(cookie === null ? {} : { Cookie: cookie }),
  }
}

const nonceSchema = z.object({ nonce: z.string() })

export async function siweMessage(
  harness: Harness,
  account: PrivateKeyAccount,
  overrides: Partial<Parameters<typeof createSiweMessage>[0]> = {},
): Promise<string> {
  const response = await harness.app.request(url("/api/siwe/nonce"), {
    method: "POST",
    headers: apiHeaders(),
  })
  const { nonce } = nonceSchema.parse(await response.json())
  return createSiweMessage({
    domain: host,
    address: account.address,
    statement: "Sign in to Matchbox ID.",
    uri: origin,
    version: "1",
    chainId: 31612,
    nonce,
    issuedAt: harness.clock.now,
    expirationTime: new Date(harness.clock.now.getTime() + 5 * 60_000),
    ...overrides,
  })
}

export async function verifySiwe(
  harness: Harness,
  message: string,
  account: PrivateKeyAccount,
  cookie: string | null = null,
): Promise<Response> {
  const signature = await account.signMessage({ message })
  return harness.app.request(url("/api/siwe/verify"), {
    method: "POST",
    headers: apiHeaders(cookie),
    body: JSON.stringify({ message, signature }),
  })
}

export function sessionCookieFrom(response: Response): string {
  const header = response.headers.get("Set-Cookie") ?? ""
  const match = /(__Host-mbx_id=[A-Za-z0-9_-]+)/.exec(header)
  if (match?.[1] === undefined) throw new Error("No session cookie set")
  return match[1]
}

export async function signIn(
  harness: Harness,
  account: PrivateKeyAccount = devAccount,
): Promise<string> {
  const message = await siweMessage(harness, account)
  const response = await verifySiwe(harness, message, account)
  if (response.status !== 200) {
    throw new Error(
      `Sign-in failed: ${response.status} ${await response.text()}`,
    )
  }
  return sessionCookieFrom(response)
}

export type Pkce = { verifier: string; challenge: string }

export async function pkce(): Promise<Pkce> {
  const verifier = randomToken(48)
  return { verifier, challenge: await sha256Base64Url(verifier) }
}

export type AuthorizeOptions = {
  clientId?: string
  redirectUri?: string
  scope?: string
  state?: string
  nonce?: string
  prompt?: string
  challenge?: string | null
  extra?: Record<string, string>
}

export async function authorize(
  harness: Harness,
  cookie: string | null,
  options: AuthorizeOptions & { pkce: Pkce },
): Promise<URL> {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: options.clientId ?? memorySeed.testClientId,
    redirect_uri: options.redirectUri ?? memorySeed.testRedirectUris[0],
    scope: options.scope ?? "openid wallet",
    state: options.state ?? "state-123",
    ...(options.challenge === null
      ? {}
      : {
          code_challenge: options.challenge ?? options.pkce.challenge,
          code_challenge_method: "S256",
        }),
    ...(options.nonce === undefined ? {} : { nonce: options.nonce }),
    ...(options.prompt === undefined ? {} : { prompt: options.prompt }),
    ...options.extra,
  })
  const response = await harness.app.request(
    url(`/oauth/authorize?${params}`),
    { headers: cookie === null ? {} : { Cookie: cookie } },
  )
  if (response.status !== 302) {
    throw new Error(`Expected 302, got ${response.status}`)
  }
  return new URL(response.headers.get("Location") ?? "")
}

const decisionSchema = z.object({ redirectTo: z.string() })

export async function decide(
  harness: Harness,
  cookie: string,
  requestId: string,
  decision: "approve" | "deny",
): Promise<URL> {
  const response = await harness.app.request(
    url(`/api/authorization-requests/${requestId}/decision`),
    {
      method: "POST",
      headers: apiHeaders(cookie),
      body: JSON.stringify({ decision }),
    },
  )
  if (response.status !== 200) {
    throw new Error(
      `Decision failed: ${response.status} ${await response.text()}`,
    )
  }
  return new URL(decisionSchema.parse(await response.json()).redirectTo)
}

/** Authorize + consent, returning the code from the client redirect. */
export async function obtainCode(
  harness: Harness,
  cookie: string,
  options: AuthorizeOptions & { pkce: Pkce },
): Promise<string> {
  let location = await authorize(harness, cookie, options)
  const requestId = location.searchParams.get("request")
  if (location.pathname === "/authorize" && requestId !== null) {
    location = await decide(harness, cookie, requestId, "approve")
  }
  const code = location.searchParams.get("code")
  if (code === null) throw new Error(`No code in ${location.href}`)
  return code
}

export async function tokenRequest(
  harness: Harness,
  body: Record<string, string>,
  headers: Record<string, string> = {},
): Promise<Response> {
  return await harness.app.request(url("/oauth/token"), {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      ...headers,
    },
    body: new URLSearchParams(body).toString(),
  })
}

export async function exchangeCode(
  harness: Harness,
  code: string,
  verifier: string,
  client: { clientId?: string; redirectUri?: string } = {},
) {
  const response = await tokenRequest(harness, {
    grant_type: "authorization_code",
    code,
    code_verifier: verifier,
    redirect_uri: client.redirectUri ?? memorySeed.testRedirectUris[0],
    client_id: client.clientId ?? memorySeed.testClientId,
  })
  if (response.status !== 200) {
    throw new Error(
      `Exchange failed: ${response.status} ${await response.text()}`,
    )
  }
  return tokenResponseSchema.parse(await response.json())
}

export function basicAuth(clientId: string, secret: string): string {
  return `Basic ${btoa(`${encodeURIComponent(clientId)}:${encodeURIComponent(secret)}`)}`
}

export function userinfo(harness: Harness, accessToken: string) {
  return harness.app.request(url("/oauth/userinfo"), {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
}
