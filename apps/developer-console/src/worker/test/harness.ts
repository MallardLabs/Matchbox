import type { MembershipRole } from "@repo/platform-contracts/console"
import type { EnvironmentKind } from "@repo/platform-contracts/network"
import { networkForEnvironmentKind } from "@repo/platform-contracts/network"
import type { PlatformScope } from "@repo/platform-contracts/scopes"
import {
  createMemoryRateLimitClient,
  generateClientId,
  generateOpaqueToken,
  localPlatformHealth,
} from "@repo/platform-server"
import type { z } from "zod"
import createApp from "../app"
import type { GoogleIdentity } from "../auth/google"
import { sessionTokenHash } from "../auth/session"
import type { ConsoleDeps } from "../context"
import {
  type MemoryEmailSender,
  createMemoryEmailSender,
} from "../email/sender"
import type {
  AccountRecord,
  AppRecord,
  EnvironmentRecord,
  OrganizationRecord,
} from "../store/console-store"
import createMemoryStore, {
  type MemoryConsoleStore,
} from "../store/memory-store"
import { type UsageAnalytics, createSyntheticUsage } from "../usage/analytics"

export const consoleOrigin = "https://developer.matchbox.markets"
export const sessionPepper = "test-session-pepper-0123456789abcdef"
export const apiKeyPepper = "test-api-key-pepper-0123456789abcdef"
export const clientSecretPepper = "test-client-secret-pepper-012345678"
export const googleClientId = "test-client.apps.googleusercontent.com"
export const staffDomains = ["supernormal.foundation", "thesis.co"]

/** Claims for a fake Google ID token; unset fields default to a verified
 * consumer account. */
export type GoogleTokenClaims = Pick<GoogleIdentity, "sub" | "email"> &
  Partial<Omit<GoogleIdentity, "sub" | "email">>

export type Harness = ReturnType<typeof createHarness>

export type RequestOptions = {
  body?: unknown
  cookie?: string
  origin?: string | null
  headers?: Record<string, string>
}

/** App + memory store + controllable clock for `app.request()` tests. */
export function createHarness(
  options: {
    consoleEnabled?: boolean
    devSignIn?: boolean
    production?: boolean
    analytics?: UsageAnalytics
    health?: ConsoleDeps["health"]
    /** false = `GOOGLE_CLIENT_ID` unset. */
    google?: boolean
  } = {},
) {
  let current = new Date("2026-09-30T12:00:00.000Z")
  const now = () => new Date(current.getTime())
  const store: MemoryConsoleStore = createMemoryStore(now)
  const email: MemoryEmailSender = createMemoryEmailSender()
  const apiLimiter = createMemoryRateLimitClient(() => current.getTime())
  // Fake GIS: tokens are opaque handles for the claims they were minted with.
  const googleTokens = new Map<string, GoogleIdentity>()
  const app = createApp({
    store,
    rateLimits: createMemoryRateLimitClient(() => current.getTime()),
    email,
    analytics: options.analytics ?? createSyntheticUsage(),
    health: options.health ?? {
      read: async (at: Date) => localPlatformHealth(at),
    },
    apiLimiter,
    google:
      options.google === false
        ? null
        : {
            clientId: googleClientId,
            verifier: {
              async verify(credential: string) {
                return googleTokens.get(credential) ?? null
              },
            },
          },
    now,
    flags: {
      consoleEnabled: options.consoleEnabled ?? true,
      devSignIn: options.devSignIn ?? false,
    },
    config: {
      production: options.production ?? false,
      consoleOrigin,
      sessionPepper,
      apiKeyPepper,
      clientSecretPepper,
      devAccountEmail: "dev@matchbox.local",
      staffDomains,
    },
  })

  async function request(
    method: string,
    path: string,
    init: RequestOptions = {},
  ): Promise<Response> {
    const headers: Record<string, string> = { ...init.headers }
    const origin = init.origin === undefined ? consoleOrigin : init.origin
    if (origin !== null) headers.Origin = origin
    if (init.cookie !== undefined) headers.Cookie = init.cookie
    if (init.body !== undefined) headers["Content-Type"] = "application/json"
    return app.request(`${consoleOrigin}${path}`, {
      method,
      headers,
      ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
    })
  }

  async function json<Schema extends z.ZodType>(
    response: Response,
    schema: Schema,
  ): Promise<z.output<Schema>> {
    const body: unknown = await response.json()
    return schema.parse(body)
  }

  async function account(
    emailAddress: string,
    displayName = emailAddress.split("@")[0] ?? "Dev",
  ): Promise<AccountRecord> {
    return store.createAccount({
      email: emailAddress,
      displayName,
      emailVerifiedAt: now().toISOString(),
      googleSub: googleSubFor(emailAddress),
    })
  }

  /** Mints a fake Google ID token the harness verifier accepts. */
  function googleToken(claims: GoogleTokenClaims): string {
    const token = `gis.${crypto.randomUUID()}`
    googleTokens.set(token, {
      emailVerified: true,
      hostedDomain: null,
      name: null,
      nonce: null,
      ...claims,
    })
    return token
  }

  /** Requests a nonce; returns it with the cookie jar that carries it. */
  async function googleNonce(
    purpose: "sign-in" | "step-up",
    cookie = "",
  ): Promise<{ nonce: string; cookie: string }> {
    const response = await request("POST", "/api/auth/google/nonce", {
      body: { purpose },
      ...(cookie === "" ? {} : { cookie }),
    })
    if (response.status !== 200) {
      throw new Error(`nonce request failed: ${response.status}`)
    }
    const body = (await response.json()) as { nonce: string }
    return { nonce: body.nonce, cookie: cookiesFrom(response, cookie) }
  }

  /** Full GIS sign-in: nonce, then a token carrying it. */
  async function googleSignIn(
    claims: GoogleTokenClaims,
    signInOptions: { invitationToken?: string; cookie?: string } = {},
  ): Promise<{ response: Response; cookie: string }> {
    const issued = await googleNonce("sign-in", signInOptions.cookie)
    const response = await request("POST", "/api/auth/google", {
      cookie: issued.cookie,
      body: {
        credential: googleToken({ nonce: issued.nonce, ...claims }),
        ...(signInOptions.invitationToken === undefined
          ? {}
          : { invitationToken: signInOptions.invitationToken }),
      },
    })
    return { response, cookie: cookiesFrom(response, issued.cookie) }
  }

  /** Google step-up for the session in `cookie`, as `target` (or claims). */
  async function googleStepUp(
    cookie: string,
    target: AccountRecord | GoogleTokenClaims,
  ): Promise<Response> {
    const claims =
      "sub" in target
        ? target
        : { sub: target.googleSub ?? "missing", email: target.email }
    const issued = await googleNonce("step-up", cookie)
    return request("POST", "/api/auth/step-up/google", {
      cookie: issued.cookie,
      body: { credential: googleToken({ nonce: issued.nonce, ...claims }) },
    })
  }

  /** Session cookie for `account` (optionally stepped up just now). */
  async function signIn(
    target: AccountRecord,
    signInOptions: { steppedUp?: boolean } = {},
  ): Promise<string> {
    const token = generateOpaqueToken()
    const createdAt = now()
    await store.createSession({
      accountId: target.id,
      tokenHash: await sessionTokenHash(sessionPepper, token),
      createdAt: createdAt.toISOString(),
      expiresAt: new Date(createdAt.getTime() + 12 * 3_600_000).toISOString(),
      userAgent: "vitest",
      ipPrefix: null,
      steppedUpAt: signInOptions.steppedUp ? createdAt.toISOString() : null,
    })
    return `__Host-mbx_dev=${token}`
  }

  async function organization(
    owner: AccountRecord,
    members: { account: AccountRecord; role: MembershipRole }[] = [],
  ): Promise<OrganizationRecord> {
    const created = await store.createOrganization({
      name: "Acme",
      slug: `acme-${crypto.randomUUID().slice(0, 8)}`,
      ownerId: owner.id,
    })
    for (const member of members) {
      await store.addMember({
        organizationId: created.id,
        accountId: member.account.id,
        role: member.role,
      })
    }
    return created
  }

  async function environment(
    appRecord: AppRecord,
    kind: EnvironmentKind,
    scopes: { requested?: PlatformScope[]; approved?: PlatformScope[] } = {},
  ): Promise<EnvironmentRecord> {
    const created = await store.createEnvironment({
      appId: appRecord.id,
      kind,
      network: networkForEnvironmentKind(kind),
      clientId: generateClientId(kind),
      clientType: "confidential",
    })
    return store.updateEnvironment(created.id, {
      requestedScopes: scopes.requested ?? [],
      approvedScopes: scopes.approved ?? [],
      reviewState:
        (scopes.approved ?? []).length > 0 ? "approved" : "development",
    })
  }

  async function appWithEnvironments(
    organizationId: string,
    overrides: { websiteUrl?: string | null } = {},
  ) {
    const created = await store.createApp({
      organizationId,
      name: "Gauge Board",
      slug: `gauge-${crypto.randomUUID().slice(0, 8)}`,
      description: null,
      logoUrl: null,
      websiteUrl:
        overrides.websiteUrl === undefined
          ? "https://gauges.example.com"
          : overrides.websiteUrl,
      privacyUrl: null,
      termsUrl: null,
      supportEmail: null,
    })
    return {
      app: created,
      test: await environment(created, "test"),
      live: await environment(created, "live"),
    }
  }

  return {
    app,
    store,
    email,
    apiLimiter,
    request,
    json,
    account,
    signIn,
    googleToken,
    googleNonce,
    googleSignIn,
    googleStepUp,
    organization,
    environment,
    appWithEnvironments,
    now,
    advance(ms: number) {
      current = new Date(current.getTime() + ms)
    },
  }
}

/** Google `sub` the harness assigns to accounts it creates. */
export function googleSubFor(email: string): string {
  return `google-${email}`
}

/** Every `Set-Cookie` header (iteration keeps them separate). */
export function setCookieHeaders(response: Response): string[] {
  const values: string[] = []
  for (const [name, value] of response.headers) {
    if (name.toLowerCase() === "set-cookie") values.push(value)
  }
  return values
}

/** `name=value` pairs from `Set-Cookie` headers, for the next request. */
export function cookiesFrom(response: Response, existing = ""): string {
  const jar = new Map<string, string>()
  for (const part of existing.split(";")) {
    const [name, ...rest] = part.trim().split("=")
    if (name !== undefined && name.length > 0) jar.set(name, rest.join("="))
  }
  for (const header of setCookieHeaders(response)) {
    const [pair] = header.split(";")
    const [name, ...rest] = (pair ?? "").split("=")
    if (name === undefined || name.length === 0) continue
    const value = rest.join("=")
    if (/Max-Age=0/.test(header) || value.length === 0) jar.delete(name)
    else jar.set(name, value)
  }
  return [...jar].map(([name, value]) => `${name}=${value}`).join("; ")
}
