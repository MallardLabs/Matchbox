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
import { getAddress, verifyMessage } from "viem"
import { describe, expect, it } from "vitest"
import { z } from "zod"
import { purgeExpiredRows } from "./cleanup"
import type { SiwePublicClient } from "./deps"
import { familyIdForCodeHash, opaqueTokenHash } from "./oidc/tokens"
import { type MemoryIdStore, memorySeed } from "./store/memory-store"
import {
  url,
  type Harness,
  apiHeaders,
  authorize,
  basicAuth,
  createHarness,
  decide,
  devAccount,
  exchangeCode,
  obtainCode,
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

const contractAwareClient: SiwePublicClient = {
  verifySiweMessage({ message, signature, address }) {
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
    const harness = await createHarness({ publicClient: contractAwareClient })
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
    const harness = await createHarness({ publicClient: contractAwareClient })
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
    const harness = await createHarness({ publicClient: contractAwareClient })
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
    const harness = await createHarness({ publicClient: contractAwareClient })
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
    const harness = await createHarness({ publicClient: contractAwareClient })
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
    const first = await refreshRequest(harness, "not-a-token")
    expect(first.status).toBe(400)
    const second = await refreshRequest(harness, "not-a-token")
    expect(second.status).toBe(429)
    expect(await oauthError(second)).toBe("temporarily_unavailable")
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
