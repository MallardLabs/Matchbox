import { createLogger } from "@repo/logger"
import {
  authorizationRequestViewSchema,
  grantListResponseSchema,
  sessionListResponseSchema,
} from "@repo/platform-contracts/identity"
import {
  idTokenClaimsSchema,
  tokenResponseSchema,
} from "@repo/platform-contracts/oidc"
import { decodeJwt } from "jose"
import {
  http,
  createPublicClient,
  defineChain,
  getAddress,
  verifyMessage,
} from "viem"
import {
  type PrivateKeyAccount,
  generatePrivateKey,
  privateKeyToAccount,
} from "viem/accounts"
import { describe, expect, it } from "vitest"
import { z } from "zod"
import { grantListViewResponseSchema } from "../shared/contracts"
import { purgeExpiredRows } from "./cleanup"
import type { SiwePublicClient } from "./deps"
import { familyIdForCodeHash, opaqueTokenHash } from "./oidc/tokens"
import { rpcSignatureClient, verifyContractSignature } from "./siwe"
import { type MemoryIdStore, memorySeed } from "./store/memory-store"
import {
  url,
  type Harness,
  type TestRpc,
  apiHeaders,
  authorize,
  basicAuth,
  createHarness,
  decide,
  devAccount,
  exchangeCode,
  obtainCode,
  otherAccount,
  pkce,
  sessionCookieFrom,
  signIn,
  siweMessage,
  tokenRequest,
  userinfo,
  verifySiwe,
} from "./test-harness"

const oauthErrorSchema = z.object({ error: z.string() })

async function oauthError(response: Response): Promise<string> {
  return oauthErrorSchema.parse(await response.json()).error
}

const silentLogger = createLogger({ sink: () => undefined, level: "error" })

// ---------------------------------------------------------------------------
// M1: SIWE sessions are bound to the signer's network
// ---------------------------------------------------------------------------

/** A smart-contract wallet: ERC-1271 accepts the dev key's signatures. */
const contractWallet = getAddress("0x000000000000000000000000000000000000c0de")

const contractAwareClient: TestRpc = {
  isValidSignature({ message, signature, address }) {
    if (address.toLowerCase() === contractWallet.toLowerCase()) {
      return verifyMessage({ address: devAccount.address, message, signature })
    }
    return verifyMessage({ address, message, signature })
  },
}

async function signInContract(
  harness: Harness,
  chainId: 31611 | 31612,
): Promise<string> {
  const message = await siweMessage(harness, devAccount, {
    address: contractWallet,
    chainId,
  })
  const response = await verifySiwe(harness, message, devAccount)
  expect(response.status).toBe(200)
  return sessionCookieFrom(response)
}

async function requestView(harness: Harness, cookie: string, id: string) {
  const response = await harness.app.request(
    url(`/api/authorization-requests/${id}`),
    { headers: { Cookie: cookie } },
  )
  expect(response.status).toBe(200)
  return authorizationRequestViewSchema.parse(await response.json())
}

function liveAuthorize(harness: Harness, cookie: string, prompt?: string) {
  return pkce().then((challenge) =>
    authorize(harness, cookie, {
      pkce: challenge,
      clientId: memorySeed.liveClientId,
      redirectUri: memorySeed.liveRedirectUris[0],
      ...(prompt === undefined ? {} : { prompt }),
    }),
  )
}

describe("SIWE network binding", () => {
  it("records the SIWE chain and signer kind on the session", async () => {
    const harness = await createHarness({
      publicClients: [contractAwareClient],
    })
    await signIn(harness)
    await signInContract(harness, 31611)
    const sessions = harness.store.admin.sessions()
    expect(
      sessions.map(({ signerKind, siweChainId }) => ({
        signerKind,
        siweChainId,
      })),
    ).toEqual([
      { signerKind: "eoa", siweChainId: 31612 },
      { signerKind: "contract", siweChainId: 31611 },
    ])
  })

  it("makes a testnet contract session sign in on mainnet for a live client", async () => {
    const harness = await createHarness({
      publicClients: [contractAwareClient],
    })
    const cookie = await signInContract(harness, 31611)

    const location = await liveAuthorize(harness, cookie)
    expect(location.pathname).toBe("/authorize")
    const requestId = location.searchParams.get("request") ?? ""
    const view = await requestView(harness, cookie, requestId)
    expect(view).toMatchObject({
      network: "mezo",
      networkSignInRequired: true,
    })

    const approve = await harness.app.request(
      url(`/api/authorization-requests/${requestId}/decision`),
      {
        method: "POST",
        headers: apiHeaders(cookie),
        body: JSON.stringify({ decision: "approve" }),
      },
    )
    expect(approve.status).toBe(403)
    expect(await approve.text()).toContain("Sign in on Mezo")
    expect(harness.store.admin.grants()).toHaveLength(0)

    // The same session is fine for the testnet environment.
    const testLocation = await authorize(harness, cookie, {
      pkce: await pkce(),
    })
    const testView = await requestView(
      harness,
      cookie,
      testLocation.searchParams.get("request") ?? "",
    )
    expect(testView.networkSignInRequired).toBe(false)
  })

  it("lets a mainnet contract session consent and releases the verified network", async () => {
    const harness = await createHarness({
      publicClients: [contractAwareClient],
    })
    const cookie = await signInContract(harness, 31612)
    const challenge = await pkce()
    const code = await obtainCode(harness, cookie, {
      pkce: challenge,
      clientId: memorySeed.liveClientId,
      redirectUri: memorySeed.liveRedirectUris[0],
    })
    const response = await tokenRequest(
      harness,
      {
        grant_type: "authorization_code",
        code,
        code_verifier: challenge.verifier,
        redirect_uri: memorySeed.liveRedirectUris[0],
      },
      {
        Authorization: basicAuth(
          memorySeed.liveClientId,
          memorySeed.liveClientSecret,
        ),
      },
    )
    expect(response.status).toBe(200)
    const tokens = tokenResponseSchema.parse(await response.json())
    const idToken = idTokenClaimsSchema.parse(decodeJwt(tokens.id_token ?? ""))
    expect(idToken.wallet_address).toBe(contractWallet.toLowerCase())
    expect(idToken.wallet_network).toBe("mezo")
  })

  it("never silently approves for a contract session from another network", async () => {
    const harness = await createHarness({
      publicClients: [contractAwareClient],
    })
    const mainnet = await signInContract(harness, 31612)
    await obtainCode(harness, mainnet, {
      pkce: await pkce(),
      clientId: memorySeed.liveClientId,
      redirectUri: memorySeed.liveRedirectUris[0],
    })
    // Silent re-authorization works on the verified network…
    const silent = await liveAuthorize(harness, mainnet, "none")
    expect(silent.searchParams.get("code")).not.toBeNull()

    // …but not for a session whose contract signature was checked on testnet.
    const testnet = await signInContract(harness, 31611)
    const refused = await liveAuthorize(harness, testnet, "none")
    expect(refused.searchParams.get("error")).toBe("login_required")
    expect(refused.searchParams.get("code")).toBeNull()
  })

  it("treats EOA signatures as valid on every network", async () => {
    const harness = await createHarness()
    const message = await siweMessage(harness, devAccount, { chainId: 31611 })
    const cookie = sessionCookieFrom(
      await verifySiwe(harness, message, devAccount),
    )
    const location = await liveAuthorize(harness, cookie)
    const view = await requestView(
      harness,
      cookie,
      location.searchParams.get("request") ?? "",
    )
    expect(view.networkSignInRequired).toBe(false)
  })

  it("scopes connected apps and devices to a contract session's network", async () => {
    const harness = await createHarness({
      publicClients: [contractAwareClient],
    })
    const mainnet = await signInContract(harness, 31612)
    await obtainCode(harness, mainnet, {
      pkce: await pkce(),
      clientId: memorySeed.liveClientId,
      redirectUri: memorySeed.liveRedirectUris[0],
    })
    const testnet = await signInContract(harness, 31611)

    async function grantIds(cookie: string): Promise<number> {
      const response = await harness.app.request(url("/api/grants"), {
        headers: { Cookie: cookie },
      })
      return grantListResponseSchema.parse(await response.json()).data.length
    }
    expect(await grantIds(mainnet)).toBe(1)
    expect(await grantIds(testnet)).toBe(0)

    const grantId = harness.store.admin.grants()[0]?.id ?? ""
    const revoke = await harness.app.request(url(`/api/grants/${grantId}`), {
      method: "DELETE",
      headers: apiHeaders(testnet),
    })
    expect(revoke.status).toBe(404)
    expect(harness.store.admin.grants()[0]?.revokedAt).toBeNull()

    const devices = await harness.app.request(url("/api/sessions"), {
      headers: { Cookie: testnet },
    })
    const listed = sessionListResponseSchema.parse(await devices.json()).data
    expect(listed).toHaveLength(1)
    expect(listed[0]?.current).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// ID-02: no single RPC answer signs a wallet in
// ---------------------------------------------------------------------------

/** 65 bytes nobody signed. */
const junkSignature = `0x${"11".repeat(65)}` as const

/**
 * What a fake RPC answers to the validator's `eth_call`: a result ("valid"
 * from a lying RPC), a revert, an HTTP 503 for every request ("down"), a
 * 429 ("rate-limited") or nothing ("hang").
 */
type RpcAnswer =
  | "valid"
  | "invalid"
  | "revert"
  | "down"
  | "rate-limited"
  | "hang"

type FakeRpcState = { answer: RpcAnswer; ethCalls?: number }

const rpcRequestSchema = z.object({ id: z.number(), method: z.string() })

/**
 * The production client stack (rpcSignatureClient over viem's HTTP
 * transport, timeouts and retries) in front of a fake RPC endpoint.
 */
function fakeRpc(rpc: FakeRpcState, chainId = 31612): SiwePublicClient {
  async function fetchFn(
    _input: unknown,
    init?: RequestInit,
  ): Promise<Response> {
    const { id, method } = rpcRequestSchema.parse(
      JSON.parse(String(init?.body)),
    )
    const reply = (body: object) =>
      Response.json({ jsonrpc: "2.0", id, ...body })
    if (rpc.answer === "down") {
      return new Response("upstream overloaded", { status: 503 })
    }
    if (method === "eth_chainId") {
      return reply({ result: `0x${chainId.toString(16)}` })
    }
    rpc.ethCalls = (rpc.ethCalls ?? 0) + 1
    switch (rpc.answer) {
      case "rate-limited":
        return new Response("Too Many Requests", { status: 429 })
      case "hang":
        return new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new Error()))
        })
      case "revert":
        return reply({ error: { code: 3, message: "execution reverted" } })
      default:
        return reply({ result: rpc.answer === "valid" ? "0x01" : "0x00" })
    }
  }
  return rpcSignatureClient(
    createPublicClient({
      chain: defineChain({
        id: chainId,
        name: "Mezo",
        nativeCurrency: { name: "Bitcoin", symbol: "BTC", decimals: 18 },
        rpcUrls: { default: { http: ["https://rpc.invalid"] } },
      }),
      transport: http("https://rpc.invalid", {
        fetchFn,
        timeout: 100,
        retryCount: 1,
      }),
    }),
  )
}

async function junkSignIn(
  harness: Harness,
  address: `0x${string}`,
): Promise<Response> {
  const message = await siweMessage(harness, devAccount, { address })
  return harness.app.request(url("/api/siwe/verify"), {
    method: "POST",
    headers: apiHeaders(),
    body: JSON.stringify({ message, signature: junkSignature }),
  })
}

describe("SIWE signature proof", () => {
  it("verifies a key's signature locally, without asking an RPC", async () => {
    const harness = await createHarness({
      publicClients: [fakeRpc({ answer: "down" })],
    })
    const response = await verifySiwe(
      harness,
      await siweMessage(harness, devAccount),
      devAccount,
    )
    expect(response.status).toBe(200)
    expect(harness.store.admin.sessions()[0]?.signerKind).toBe("eoa")
    expect(harness.verifySpy.calls).toBe(0)
  })

  it("never lets RPCs vouch for a wallet that signed in with its key", async () => {
    const rpc: FakeRpcState = { answer: "invalid" }
    const harness = await createHarness({
      publicClients: [fakeRpc(rpc), fakeRpc(rpc), fakeRpc(rpc)],
    })
    const victim = await signIn(harness)
    await obtainCode(harness, victim, {
      pkce: await pkce(),
      clientId: memorySeed.liveClientId,
      redirectUri: memorySeed.liveRedirectUris[0],
    })

    // Every configured RPC now lies.
    rpc.answer = "valid"
    const forged = await junkSignIn(harness, devAccount.address)
    expect(forged.status).toBe(401)
    expect(harness.verifySpy.calls).toBe(0)
    expect(harness.store.admin.sessions()).toHaveLength(1)
  })

  it("ends contract sessions RPCs vouched for once the key signs in", async () => {
    const rpc: FakeRpcState = { answer: "valid" }
    const harness = await createHarness({
      publicClients: [fakeRpc(rpc), fakeRpc(rpc), fakeRpc(rpc)],
    })
    // Lying RPCs vouch for a wallet whose owner has not signed in yet.
    const forged = await junkSignIn(harness, devAccount.address)
    expect(forged.status).toBe(200)
    const forgedCookie = sessionCookieFrom(forged)

    await signIn(harness)
    const [first, second] = harness.store.admin
      .sessions()
      .sort(
        (left, right) => left.createdAt.getTime() - right.createdAt.getTime(),
      )
    expect(first?.signerKind).toBe("contract")
    expect(first?.revokedAt).not.toBeNull()
    expect(second?.signerKind).toBe("eoa")
    expect(second?.revokedAt).toBeNull()
    const stale = await harness.app.request(url("/api/sessions"), {
      headers: { Cookie: forgedCookie },
    })
    expect(stale.status).toBe(401)
  })

  it("needs two RPCs to confirm a contract signature and none to deny it", async () => {
    const lying: FakeRpcState = { answer: "valid" }
    const honest: FakeRpcState = { answer: "invalid" }
    const down: FakeRpcState = { answer: "down" }
    // A wallet that never signed in, so only the RPCs can be asked.
    const target = otherAccount.address

    const outvoted = await createHarness({
      publicClients: [fakeRpc(lying), fakeRpc(honest), fakeRpc(honest)],
    })
    expect((await junkSignIn(outvoted, target)).status).toBe(401)

    const alone = await createHarness({
      publicClients: [fakeRpc(lying), fakeRpc(down), fakeRpc(down)],
    })
    expect((await junkSignIn(alone, target)).status).toBe(500)
    expect(alone.store.admin.sessions()).toHaveLength(0)

    // A real contract wallet still signs in with one RPC down.
    const contract = await createHarness({
      publicClients: [contractAwareClient, contractAwareClient, fakeRpc(down)],
    })
    await signInContract(contract, 31612)
    expect(contract.store.admin.sessions()[0]?.signerKind).toBe("contract")
  })

  // viem's verifySiweMessage read a failed eth_call as "invalid", so one
  // flaky confirming RPC refused every contract sign-in.
  it("counts an RPC that fails or hangs on eth_call as no answer", async () => {
    for (const answer of ["rate-limited", "hang", "down"] as const) {
      const contract = await createHarness({
        publicClients: [
          contractAwareClient,
          contractAwareClient,
          fakeRpc({ answer }),
        ],
      })
      await signInContract(contract, 31612)
      expect(contract.store.admin.sessions()[0]?.signerKind).toBe("contract")
    }

    const args = {
      message: "",
      signature: junkSignature,
      address: contractWallet,
    } as const
    const valid = () => fakeRpc({ answer: "valid" })
    const flaky = await verifyContractSignature(
      [valid(), valid(), fakeRpc({ answer: "rate-limited" })],
      args,
      31612,
    )
    expect(flaky).toMatchObject({
      status: "valid",
      errors: [expect.any(Error)],
    })
    // A revert is the chain's answer: the validator rejects the signature.
    expect(
      await verifyContractSignature(
        [valid(), valid(), fakeRpc({ answer: "revert" })],
        args,
        31612,
      ),
    ).toEqual({ status: "invalid", errors: [] })
  })

  it("asks only the primary RPC about a signature it rejects", async () => {
    const primary: FakeRpcState = { answer: "invalid" }
    const confirming: FakeRpcState = { answer: "valid" }
    const harness = await createHarness({
      publicClients: [
        fakeRpc(primary),
        fakeRpc(confirming),
        fakeRpc(confirming),
      ],
    })
    expect((await junkSignIn(harness, otherAccount.address)).status).toBe(401)
    expect(primary.ethCalls).toBe(1)
    expect(confirming.ethCalls).toBeUndefined()

    // A primary with no answer brings in both confirming RPCs.
    primary.answer = "down"
    confirming.answer = "invalid"
    expect((await junkSignIn(harness, otherAccount.address)).status).toBe(401)
    expect(confirming.ethCalls).toBe(2)
  })

  it("ignores an RPC that serves another chain", async () => {
    const args = {
      message: "",
      signature: junkSignature,
      address: contractWallet,
    } as const
    function rpc(chainId: number): SiwePublicClient {
      return {
        getChainId: async () => chainId,
        isValidSignature: async () => true,
      }
    }
    expect(
      await verifyContractSignature([rpc(1), rpc(31612)], args, 31612),
    ).toMatchObject({ status: "unavailable", errors: [expect.any(Error)] })
    expect(
      await verifyContractSignature([rpc(31612), rpc(31612)], args, 31612),
    ).toEqual({ status: "valid", errors: [] })
    expect(await verifyContractSignature([], args, 31612)).toMatchObject({
      status: "unavailable",
    })
  })
})

// ---------------------------------------------------------------------------
// M3: refresh-family revocation cannot be outrun by a concurrent issuance
// ---------------------------------------------------------------------------

type Hook = { run: (() => Promise<void>) | null }

/** Runs `hook.run` once, right after the wrapped store method returns. */
function interleaveAfter(
  method: "consumeAuthorizationCode" | "findRefreshTokenByHash",
  hook: Hook,
) {
  return function wrap(store: MemoryIdStore) {
    async function interleave<Result>(result: Result): Promise<Result> {
      const pending = hook.run
      hook.run = null
      if (pending !== null) await pending()
      return result
    }
    if (method === "consumeAuthorizationCode") {
      return {
        ...store,
        async consumeAuthorizationCode(codeHash: string, now: Date) {
          return interleave(await store.consumeAuthorizationCode(codeHash, now))
        },
      }
    }
    return {
      ...store,
      async findRefreshTokenByHash(tokenHash: string) {
        return interleave(await store.findRefreshTokenByHash(tokenHash))
      },
    }
  }
}

function refreshRequest(harness: Harness, refreshToken: string) {
  return tokenRequest(harness, {
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: memorySeed.testClientId,
  })
}

function codeRequest(harness: Harness, code: string, verifier: string) {
  return tokenRequest(harness, {
    grant_type: "authorization_code",
    code,
    code_verifier: verifier,
    redirect_uri: memorySeed.testRedirectUris[0],
    client_id: memorySeed.testClientId,
  })
}

describe("token family races", () => {
  it("issues nothing when a code replay lands during the first redemption", async () => {
    const hook: Hook = { run: null }
    const harness = await createHarness({
      wrapStore: interleaveAfter("consumeAuthorizationCode", hook),
    })
    const cookie = await signIn(harness)
    const challenge = await pkce()
    const code = await obtainCode(harness, cookie, { pkce: challenge })

    let replay: Response | null = null
    hook.run = async () => {
      replay = await codeRequest(harness, code, challenge.verifier)
    }
    const first = await codeRequest(harness, code, challenge.verifier)

    expect(await oauthError(first)).toBe("invalid_grant")
    expect(replay).not.toBeNull()
    expect(await oauthError(replay ?? new Response("{}"))).toBe("invalid_grant")
    expect(harness.store.admin.refreshTokens()).toHaveLength(0)
    expect(harness.store.admin.accessTokens()).toHaveLength(0)
    const family = familyIdForCodeHash(
      await opaqueTokenHash(harness.deps, code),
    )
    expect(
      harness.store.admin.tokenFamilies().find((row) => row.familyId === family)
        ?.revokedAt,
    ).not.toBeNull()
  })

  it("revokes the winner's successor when a refresh token is reused concurrently", async () => {
    const hook: Hook = { run: null }
    const harness = await createHarness({
      wrapStore: interleaveAfter("findRefreshTokenByHash", hook),
    })
    const cookie = await signIn(harness)
    const challenge = await pkce()
    const code = await obtainCode(harness, cookie, { pkce: challenge })
    const tokens = await exchangeCode(harness, code, challenge.verifier)

    // B rotates while A is between reading the token and rotating it.
    let winner: Response | null = null
    hook.run = async () => {
      winner = await refreshRequest(harness, tokens.refresh_token)
    }
    const loser = await refreshRequest(harness, tokens.refresh_token)
    expect(await oauthError(loser)).toBe("invalid_grant")
    expect(winner).not.toBeNull()
    const winning = tokenResponseSchema.parse(
      await (winner ?? new Response("{}")).json(),
    )

    // The family is revoked, including everything the winner received.
    expect(
      harness.store.admin
        .refreshTokens()
        .every((token) => token.revokedAt !== null),
    ).toBe(true)
    expect(
      harness.store.admin
        .accessTokens()
        .every((token) => token.revokedAt !== null),
    ).toBe(true)
    expect((await userinfo(harness, winning.access_token)).status).toBe(401)
    expect(
      await oauthError(
        await refreshRequest(harness, winning.refresh_token ?? ""),
      ),
    ).toBe("invalid_grant")
    expect(
      harness.store.admin
        .auditEvents()
        .some((event) => event.action === "refresh-token-reuse-detected"),
    ).toBe(true)
  })

  it("refuses to issue or rotate in a family that is already revoked", async () => {
    const harness = await createHarness()
    const cookie = await signIn(harness)
    const challenge = await pkce()
    const code = await obtainCode(harness, cookie, { pkce: challenge })
    const tokens = await exchangeCode(harness, code, challenge.verifier)
    const [issued] = harness.store.admin.refreshTokens()
    if (issued === undefined) throw new Error("No refresh token")
    const now = harness.clock.now

    // Loser revokes first; the (late) winner's writes must not land.
    await harness.store.revokeTokenFamily(issued.familyId, now)
    const prefix = issued.familyId.replaceAll("-", "")
    const rotated = await harness.store.rotateRefreshToken({
      oldTokenHash: await opaqueTokenHash(harness.deps, tokens.refresh_token),
      newTokenId: crypto.randomUUID(),
      newTokenHash: "f".repeat(64),
      scopes: issued.scopes,
      expiresAt: new Date(now.getTime() + 60_000),
      accessJti: `${prefix}late-access-jti`,
      accessExpiresAt: new Date(now.getTime() + 60_000),
      now,
    })
    expect(rotated).toEqual({ status: "invalid" })

    const lateFamily = crypto.randomUUID()
    await harness.store.revokeTokenFamily(lateFamily, now)
    const late = await harness.store.issueCodeTokens({
      familyId: lateFamily,
      grantId: issued.grantId,
      refreshTokenId: crypto.randomUUID(),
      refreshTokenHash: "e".repeat(64),
      scopes: issued.scopes,
      authTime: now,
      refreshExpiresAt: new Date(now.getTime() + 60_000),
      accessJti: `${lateFamily.replaceAll("-", "")}late-code-jti0`,
      accessExpiresAt: new Date(now.getTime() + 60_000),
      now,
    })
    expect(late).toBe("family-revoked")
    expect(
      harness.store.admin
        .refreshTokens()
        .filter((token) => token.revokedAt === null),
    ).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// H2: confidential → public flips do not carry consent or the badge over
// ---------------------------------------------------------------------------

describe("client type changes", () => {
  it("requires consent again after a confidential→public flip bumps scope_version", async () => {
    const harness = await createHarness()
    const cookie = await signIn(harness)
    await obtainCode(harness, cookie, {
      pkce: await pkce(),
      clientId: memorySeed.liveClientId,
      redirectUri: memorySeed.liveRedirectUris[0],
    })
    const skipped = await liveAuthorize(harness, cookie)
    expect(skipped.searchParams.get("code")).not.toBeNull()

    harness.store.admin.setClientType(memorySeed.liveEnvironmentId, "public")
    harness.store.admin.setScopeVersion(memorySeed.liveEnvironmentId, 2)
    const flipped = await liveAuthorize(harness, cookie)
    expect(flipped.pathname).toBe("/authorize")
    const view = await requestView(
      harness,
      cookie,
      flipped.searchParams.get("request") ?? "",
    )
    expect(view.consentRequired).toBe(true)
    expect(view.scopes.every((scope) => !scope.previouslyGranted)).toBe(true)
    // Approved live review: verified, whatever the client type.
    expect(view.app.verified).toBe(true)

    const none = await liveAuthorize(harness, cookie, "none")
    expect(none.searchParams.get("error")).toBe("consent_required")
  })

  it("shows no verified badge for a public client outside an approved live review", async () => {
    const harness = await createHarness()
    const cookie = await signIn(harness)
    const location = await authorize(harness, cookie, { pkce: await pkce() })
    const view = await requestView(
      harness,
      cookie,
      location.searchParams.get("request") ?? "",
    )
    expect(view.environmentKind).toBe("test")
    expect(view.app.verified).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// ID-03: the badge needs staff verification and an active app
// ---------------------------------------------------------------------------

describe("consent verified badge", () => {
  async function liveView(harness: Harness, cookie: string) {
    const location = await liveAuthorize(harness, cookie, "consent")
    return requestView(
      harness,
      cookie,
      location.searchParams.get("request") ?? "",
    )
  }

  async function grantsVerified(harness: Harness, cookie: string) {
    const response = await harness.app.request(url("/api/grants"), {
      headers: { Cookie: cookie },
    })
    return grantListViewResponseSchema
      .parse(await response.json())
      .data.map((grant) => grant.verified)
  }

  it("is not granted by an approved review state alone", async () => {
    const harness = await createHarness()
    const cookie = await signIn(harness)
    harness.store.admin.setVerifiedAt(memorySeed.liveEnvironmentId, null)
    const view = await liveView(harness, cookie)
    expect(view.environmentKind).toBe("live")
    expect(view.app.verified).toBe(false)
  })

  it("is withheld from restricted and suspended apps", async () => {
    const harness = await createHarness()
    const cookie = await signIn(harness)
    await obtainCode(harness, cookie, {
      pkce: await pkce(),
      clientId: memorySeed.liveClientId,
      redirectUri: memorySeed.liveRedirectUris[0],
    })
    expect((await liveView(harness, cookie)).app.verified).toBe(true)
    expect(await grantsVerified(harness, cookie)).toEqual([true])

    harness.store.admin.setAppStatus(memorySeed.appId, "restricted")
    expect((await liveView(harness, cookie)).app.verified).toBe(false)
    expect(await grantsVerified(harness, cookie)).toEqual([false])

    harness.store.admin.setAppStatus(memorySeed.appId, "suspended")
    expect(await grantsVerified(harness, cookie)).toEqual([false])
  })

  describe("logo beside the badge", () => {
    const logoUrl = "https://cdn.example.com/logo.png"
    const pngBytes = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
    const pinned = {
      contentType: "image/png" as const,
      dataBase64: btoa(String.fromCharCode(...pngBytes)),
      sourceUrl: logoUrl,
      // The seeded live environment's verifiedAt.
      verifiedAt: new Date("2026-09-30T00:00:00.000Z"),
    }

    async function logoResponse(harness: Harness, path: string | null) {
      expect(path).not.toBeNull()
      return harness.app.request(url(path ?? ""))
    }

    it("is the pinned copy, never the developer's URL", async () => {
      const harness = await createHarness()
      const cookie = await signIn(harness)
      harness.store.admin.setAppLogoUrl(memorySeed.appId, logoUrl)
      harness.store.admin.setVerifiedLogo(memorySeed.liveEnvironmentId, pinned)
      const view = await liveView(harness, cookie)
      expect(view.app.verified).toBe(true)
      expect(view.app.logoUrl).toMatch(
        new RegExp(`^/api/app-logos/${memorySeed.liveEnvironmentId}\\?v=\\d+$`),
      )
      const response = await logoResponse(harness, view.app.logoUrl)
      expect(response.status).toBe(200)
      expect(response.headers.get("Content-Type")).toBe("image/png")
      expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff")
      expect([...new Uint8Array(await response.arrayBuffer())]).toEqual(
        pngBytes,
      )
    })

    it("is withheld once the URL or the verification changes", async () => {
      const harness = await createHarness()
      const cookie = await signIn(harness)
      harness.store.admin.setAppLogoUrl(memorySeed.appId, logoUrl)
      harness.store.admin.setVerifiedLogo(memorySeed.liveEnvironmentId, pinned)
      const path = (await liveView(harness, cookie)).app.logoUrl

      // A logoUrl the console never pinned (no row, or another URL): 404.
      harness.store.admin.setAppLogoUrl(memorySeed.appId, `${logoUrl}?v=2`)
      expect((await logoResponse(harness, path)).status).toBe(404)
      harness.store.admin.setAppLogoUrl(memorySeed.appId, logoUrl)
      harness.store.admin.setVerifiedLogo(memorySeed.liveEnvironmentId, null)
      expect((await logoResponse(harness, path)).status).toBe(404)

      // A row from another approval (one that lost its close, or an
      // earlier one) is not the current verification's: 404.
      harness.store.admin.setVerifiedLogo(memorySeed.liveEnvironmentId, {
        ...pinned,
        verifiedAt: new Date("2026-10-01T00:00:00.000Z"),
      })
      expect((await logoResponse(harness, path)).status).toBe(404)
      harness.store.admin.setVerifiedLogo(memorySeed.liveEnvironmentId, pinned)
      expect((await logoResponse(harness, path)).status).toBe(200)
      harness.store.admin.setVerifiedAt(
        memorySeed.liveEnvironmentId,
        new Date("2026-10-02T00:00:00.000Z"),
      )
      expect((await logoResponse(harness, path)).status).toBe(404)

      // Unverified: no badge, so the developer's own URL is fine.
      harness.store.admin.setVerifiedLogo(memorySeed.liveEnvironmentId, pinned)
      harness.store.admin.setVerifiedAt(memorySeed.liveEnvironmentId, null)
      expect((await logoResponse(harness, path)).status).toBe(404)
      const view = await liveView(harness, cookie)
      expect(view.app.verified).toBe(false)
      expect(view.app.logoUrl).toBe(logoUrl)
    })
  })
})

// ---------------------------------------------------------------------------
// LOW: authorize limits, redirect re-check, aud, quota overrides, cleanup
// ---------------------------------------------------------------------------

describe("authorize hardening", () => {
  it("rate limits /oauth/authorize per IP prefix", async () => {
    const harness = await createHarness()
    for (let index = 0; index < 60; index++) {
      const location = await authorize(harness, null, { pkce: await pkce() })
      expect(location.pathname).toBe("/authorize")
    }
    const limited = await authorize(harness, null, { pkce: await pkce() })
    expect(limited.pathname).toBe("/error")
    expect(limited.searchParams.get("code")).toBe("temporarily_unavailable")
  })

  it("rate limits /oauth/authorize per client, honouring quota overrides", async () => {
    const harness = await createHarness()
    harness.store.admin.setQuotaOverrides(memorySeed.testEnvironmentId, [
      {
        endpointClass: "oidc-token",
        perMinute: 2,
        perDay: 100,
        expiresAt: null,
      },
    ])
    for (let index = 0; index < 2; index++) {
      const location = await authorize(harness, null, { pkce: await pkce() })
      expect(location.pathname).toBe("/authorize")
    }
    const limited = await authorize(harness, null, { pkce: await pkce() })
    expect(limited.origin).toBe("http://localhost:5174")
    expect(limited.searchParams.get("error")).toBe("temporarily_unavailable")
  })

  it("applies quota overrides to the token endpoint", async () => {
    const harness = await createHarness()
    harness.store.admin.setQuotaOverrides(memorySeed.testEnvironmentId, [
      {
        endpointClass: "oidc-token",
        perMinute: 1,
        perDay: 100,
        expiresAt: null,
      },
    ])
    const cookie = await signIn(harness)
    const challenge = await pkce()
    const code = await obtainCode(harness, cookie, { pkce: challenge })
    const tokens = await exchangeCode(harness, code, challenge.verifier)
    // Rejected requests never spend the quota; issuing tokens does.
    for (let index = 0; index < 3; index++) {
      expect((await refreshRequest(harness, "not-a-token")).status).toBe(400)
    }
    const limited = await refreshRequest(harness, tokens.refresh_token)
    expect(limited.status).toBe(429)
    expect(await oauthError(limited)).toBe("temporarily_unavailable")
    // The refused refresh token was not rotated.
    harness.clock.advance(60_000)
    expect((await refreshRequest(harness, tokens.refresh_token)).status).toBe(
      200,
    )
  })

  // ID-06: junk refresh tokens sent with a public client_id used to spend
  // the environment's bucket, denying sign-in to every user of the app.
  it("keeps rejected token requests off the environment's quota", async () => {
    const harness = await createHarness()
    harness.store.admin.setClientType(memorySeed.liveEnvironmentId, "public")
    const statuses: Record<number, number> = {}
    for (let index = 0; index < 300; index++) {
      const response = await tokenRequest(
        harness,
        {
          grant_type: "refresh_token",
          refresh_token: `junk-${index}`,
          client_id: memorySeed.liveClientId,
        },
        { "CF-Connecting-IP": "203.0.113.7" },
      )
      statuses[response.status] = (statuses[response.status] ?? 0) + 1
    }
    // The prefix's own failure bucket turns it away after 30 a minute.
    expect(statuses).toEqual({ 400: 30, 429: 270 })

    const cookie = await signIn(harness)
    const challenge = await pkce()
    const code = await obtainCode(harness, cookie, {
      pkce: challenge,
      clientId: memorySeed.liveClientId,
      redirectUri: memorySeed.liveRedirectUris[0],
    })
    const exchange = await tokenRequest(
      harness,
      {
        grant_type: "authorization_code",
        code,
        code_verifier: challenge.verifier,
        redirect_uri: memorySeed.liveRedirectUris[0],
        client_id: memorySeed.liveClientId,
      },
      { "CF-Connecting-IP": "198.51.100.9" },
    )
    expect(exchange.status).toBe(200)
  })

  const live = {
    clientId: memorySeed.liveClientId,
    redirectUri: memorySeed.liveRedirectUris[0],
  }

  /** A throwaway wallet's sign-in, redeemed by a public client. */
  async function redeemFrom(
    harness: Harness,
    ip: string,
    account: PrivateKeyAccount = devAccount,
  ): Promise<Response> {
    const challenge = await pkce()
    const code = await obtainCode(harness, await signIn(harness, account), {
      pkce: challenge,
      ...live,
    })
    return tokenRequest(
      harness,
      {
        grant_type: "authorization_code",
        code,
        code_verifier: challenge.verifier,
        redirect_uri: live.redirectUri,
        client_id: live.clientId,
      },
      { "CF-Connecting-IP": ip },
    )
  }

  it("caps the tokens one grant of a public client is issued", async () => {
    const harness = await createHarness()
    harness.store.admin.setClientType(memorySeed.liveEnvironmentId, "public")
    // Valid tokens from a throwaway sign-in, refreshed in a loop from as
    // many IP prefixes.
    let tokens = tokenResponseSchema.parse(
      await (await redeemFrom(harness, "203.0.113.7")).json(),
    )
    const statuses: Record<number, number> = {}
    for (let index = 0; index < 40; index++) {
      const response = await tokenRequest(
        harness,
        {
          grant_type: "refresh_token",
          refresh_token: tokens.refresh_token ?? "",
          client_id: live.clientId,
        },
        { "CF-Connecting-IP": `198.51.${index}.9` },
      )
      statuses[response.status] = (statuses[response.status] ?? 0) + 1
      if (response.status === 200) {
        tokens = tokenResponseSchema.parse(await response.json())
      }
    }
    // 10 a minute, the code redemption included.
    expect(statuses).toEqual({ 200: 9, 429: 31 })
    expect(
      (await redeemFrom(harness, "203.0.113.7", otherAccount)).status,
    ).toBe(200)
  })

  it("gives one IP prefix a share of a public client's quota", async () => {
    const harness = await createHarness()
    harness.store.admin.setClientType(memorySeed.liveEnvironmentId, "public")
    // The share follows quota overrides: a tenth of 50 a minute.
    harness.store.admin.setQuotaOverrides(memorySeed.liveEnvironmentId, [
      {
        endpointClass: "oidc-token",
        perMinute: 50,
        perDay: 1_000,
        expiresAt: null,
      },
    ])
    const statuses: Record<number, number> = {}
    for (let index = 0; index < 7; index++) {
      const wallet = privateKeyToAccount(generatePrivateKey())
      const response = await redeemFrom(harness, "203.0.113.7", wallet)
      statuses[response.status] = (statuses[response.status] ?? 0) + 1
    }
    expect(statuses).toEqual({ 200: 5, 429: 2 })
    expect((await redeemFrom(harness, "198.51.100.9")).status).toBe(200)
  })

  // ID-L06: the code used to be consumed before it was checked.
  it("keeps a code redeemable after wrong or rate-limited requests", async () => {
    const harness = await createHarness()
    harness.store.admin.setQuotaOverrides(memorySeed.testEnvironmentId, [
      {
        endpointClass: "oidc-token",
        perMinute: 1,
        perDay: 100,
        expiresAt: null,
      },
    ])
    const cookie = await signIn(harness)
    const first = await pkce()
    // Spends this minute's single token request.
    await exchangeCode(
      harness,
      await obtainCode(harness, cookie, { pkce: first }),
      first.verifier,
    )
    harness.clock.advance(30_000)

    const challenge = await pkce()
    const code = await obtainCode(harness, cookie, { pkce: challenge })
    const request = {
      grant_type: "authorization_code",
      code,
      code_verifier: challenge.verifier,
      redirect_uri: memorySeed.testRedirectUris[0],
      client_id: memorySeed.testClientId,
    }
    for (const wrong of [
      { code_verifier: (await pkce()).verifier },
      { redirect_uri: memorySeed.testRedirectUris[1] },
      {
        client_id: memorySeed.liveClientId,
        client_secret: memorySeed.liveClientSecret,
        redirect_uri: memorySeed.liveRedirectUris[0],
      },
    ]) {
      const response = await tokenRequest(harness, { ...request, ...wrong })
      expect(await oauthError(response)).toBe("invalid_grant")
    }
    expect((await tokenRequest(harness, request)).status).toBe(429)
    // Next minute, still inside the code's 60 s lifetime.
    harness.clock.advance(31_000)
    expect((await tokenRequest(harness, request)).status).toBe(200)
  })

  it("refuses a decision whose redirect URI was unregistered meanwhile", async () => {
    const harness = await createHarness()
    const cookie = await signIn(harness)
    const location = await authorize(harness, cookie, { pkce: await pkce() })
    harness.store.admin.setRedirectUris(memorySeed.testEnvironmentId, [
      "http://localhost:5174/other",
    ])
    const redirect = await decide(
      harness,
      cookie,
      location.searchParams.get("request") ?? "",
      "approve",
    )
    expect(redirect.origin).toBe("https://id.test")
    expect(redirect.pathname).toBe("/error")
    expect(redirect.searchParams.get("code")).toBe("invalid_redirect_uri")
    expect(harness.store.admin.counts().authorizationCodes).toBe(0)
  })
})

describe("access token audience", () => {
  it("sets aud to the client_id and rejects ID tokens at userinfo", async () => {
    const harness = await createHarness()
    const cookie = await signIn(harness)
    const challenge = await pkce()
    const code = await obtainCode(harness, cookie, { pkce: challenge })
    const tokens = await exchangeCode(harness, code, challenge.verifier)
    expect(decodeJwt(tokens.access_token).aud).toBe(memorySeed.testClientId)
    expect((await userinfo(harness, tokens.access_token)).status).toBe(200)
    expect((await userinfo(harness, tokens.id_token ?? "")).status).toBe(401)
  })
})

describe("expired-row cleanup", () => {
  it("purges expired rows in bounded batches", async () => {
    const harness = await createHarness()
    const cookie = await signIn(harness)
    for (let index = 0; index < 3; index++) {
      await authorize(harness, cookie, { pkce: await pkce() })
    }
    await harness.app.request(url("/api/siwe/nonce"), {
      method: "POST",
      headers: apiHeaders(),
    })
    const before = harness.store.admin.counts()
    expect(before.authorizationRequests).toBe(3)
    expect(before.siweNonces).toBe(2)

    // Nothing is due yet.
    expect(
      (await purgeExpiredRows(harness.store, harness.clock.now, silentLogger))
        .deleted,
    ).toBe(0)

    harness.clock.advance(2 * 60 * 60_000)
    const result = await purgeExpiredRows(
      harness.store,
      harness.clock.now,
      silentLogger,
      { batchSize: 1 },
    )
    expect(result).toEqual({ passes: 4, deleted: 5 })
    const after = harness.store.admin.counts()
    expect(after.authorizationRequests).toBe(0)
    expect(after.siweNonces).toBe(0)
  })
})
