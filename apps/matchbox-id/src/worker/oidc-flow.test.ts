import {
  discoveryDocumentSchema,
  idTokenClaimsSchema,
  jwksSchema,
  tokenResponseSchema,
  userinfoResponseSchema,
} from "@repo/platform-contracts/oidc"
import { decodeJwt } from "jose"
import { describe, expect, it } from "vitest"
import { z } from "zod"
import { memorySeed } from "./store/memory-store"
import {
  url,
  apiHeaders,
  authorize,
  basicAuth,
  createHarness,
  decide,
  exchangeCode,
  obtainCode,
  otherAccount,
  pkce,
  signIn,
  tokenRequest,
  userinfo,
} from "./test-harness"

const oauthErrorSchema = z.object({
  error: z.string(),
  error_description: z.string().optional(),
})

async function oauthError(response: Response): Promise<string> {
  return oauthErrorSchema.parse(await response.json()).error
}

describe("discovery and JWKS", () => {
  it("publishes discovery with discord scopes only when enabled", async () => {
    const enabled = await createHarness()
    const doc = discoveryDocumentSchema.parse(
      await (
        await enabled.app.request(url("/.well-known/openid-configuration"))
      ).json(),
    )
    expect(doc.issuer).toBe("https://id.test")
    expect(doc.scopes_supported).toContain("discord:id")
    expect(doc.code_challenge_methods_supported).toEqual(["S256"])

    const disabled = await createHarness({ flags: { discordClaims: false } })
    const off = discoveryDocumentSchema.parse(
      await (
        await disabled.app.request(url("/.well-known/openid-configuration"))
      ).json(),
    )
    expect(off.scopes_supported).toEqual(["openid", "wallet"])
    expect(off.claims_supported).not.toContain("discord_id")
  })

  it("serves public keys only", async () => {
    const harness = await createHarness()
    const response = await harness.app.request(url("/oauth/jwks"))
    const body: unknown = await response.json()
    const jwks = jwksSchema.parse(body)
    expect(jwks.keys).toHaveLength(1)
    expect(JSON.stringify(body)).not.toContain('"d"')
  })

  it("answers 503 for everything when the kill switch is off", async () => {
    const harness = await createHarness({ flags: { matchboxId: false } })
    for (const path of [
      "/.well-known/openid-configuration",
      "/oauth/authorize",
      "/api/session",
    ]) {
      const response = await harness.app.request(url(path))
      expect(response.status).toBe(503)
      expect(await response.json()).toMatchObject({
        error: { code: "service_disabled" },
      })
    }
  })
})

describe("authorization code flow", () => {
  it("runs authorize → consent → token → userinfo → refresh → revoke", async () => {
    const harness = await createHarness()
    const cookie = await signIn(harness)
    const challenge = await pkce()

    const toConsent = await authorize(harness, cookie, {
      pkce: challenge,
      nonce: "nonce-1",
    })
    expect(toConsent.origin).toBe("https://id.test")
    expect(toConsent.pathname).toBe("/authorize")
    const requestId = toConsent.searchParams.get("request") ?? ""

    const detail = await harness.app.request(
      url(`/api/authorization-requests/${requestId}`),
      { headers: { Cookie: cookie } },
    )
    expect(detail.status).toBe(200)
    expect(await detail.json()).toMatchObject({
      consentRequired: true,
      environmentKind: "test",
      redirectHost: "localhost:5174",
      approvable: true,
      scopes: [
        { scope: "openid", previouslyGranted: false },
        {
          scope: "wallet",
          claims: [
            { claim: "wallet_address", value: memorySeed.devWallet },
            { claim: "wallet_network", value: "mezo-testnet" },
          ],
        },
      ],
    })

    const callback = await decide(harness, cookie, requestId, "approve")
    expect(callback.origin + callback.pathname).toBe(
      memorySeed.testRedirectUris[0],
    )
    expect(callback.searchParams.get("state")).toBe("state-123")
    expect(callback.searchParams.get("iss")).toBe("https://id.test")
    const code = callback.searchParams.get("code") ?? ""

    const tokens = await exchangeCode(harness, code, challenge.verifier)
    expect(tokens.token_type).toBe("Bearer")
    expect(tokens.expires_in).toBe(600)
    expect(tokens.scope).toBe("openid wallet")
    const idToken = idTokenClaimsSchema.parse(decodeJwt(tokens.id_token ?? ""))
    expect(idToken).toMatchObject({
      aud: memorySeed.testClientId,
      azp: memorySeed.testClientId,
      nonce: "nonce-1",
      wallet_address: memorySeed.devWallet,
    })

    const info = await userinfo(harness, tokens.access_token)
    expect(info.status).toBe(200)
    expect(info.headers.get("Cache-Control")).toBe("no-store")
    const claims = userinfoResponseSchema.parse(await info.json())
    expect(claims).toEqual({
      sub: idToken.sub,
      wallet_address: memorySeed.devWallet,
      wallet_network: "mezo-testnet",
    })

    const refreshed = await tokenRequest(harness, {
      grant_type: "refresh_token",
      refresh_token: tokens.refresh_token,
      client_id: memorySeed.testClientId,
    })
    expect(refreshed.status).toBe(200)
    expect(refreshed.headers.get("Pragma")).toBe("no-cache")
    const rotated = tokenResponseSchema.parse(await refreshed.json())
    expect(rotated.refresh_token).not.toBe(tokens.refresh_token)

    // Reusing the rotated-out refresh token revokes the whole family.
    const reuse = await tokenRequest(harness, {
      grant_type: "refresh_token",
      refresh_token: tokens.refresh_token,
      client_id: memorySeed.testClientId,
    })
    expect(await oauthError(reuse)).toBe("invalid_grant")
    const afterReuse = await tokenRequest(harness, {
      grant_type: "refresh_token",
      refresh_token: rotated.refresh_token,
      client_id: memorySeed.testClientId,
    })
    expect(await oauthError(afterReuse)).toBe("invalid_grant")
    expect((await userinfo(harness, rotated.access_token)).status).toBe(401)
    expect(
      harness.store.admin
        .auditEvents()
        .some((event) => event.action === "refresh-token-reuse-detected"),
    ).toBe(true)

    // A fresh family can be revoked through RFC 7009.
    const second = await exchangeCode(
      harness,
      await obtainCode(harness, cookie, { pkce: challenge }),
      challenge.verifier,
    )
    const revoke = await harness.app.request(url("/oauth/revoke"), {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        token: second.refresh_token,
        client_id: memorySeed.testClientId,
      }).toString(),
    })
    expect(revoke.status).toBe(200)
    expect((await userinfo(harness, second.access_token)).status).toBe(401)
    const unknown = await harness.app.request(url("/oauth/revoke"), {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        token: "not-a-token",
        client_id: memorySeed.testClientId,
      }).toString(),
    })
    expect(unknown.status).toBe(200)
  })

  it("revokes an access token by jti", async () => {
    const harness = await createHarness()
    const cookie = await signIn(harness)
    const challenge = await pkce()
    const tokens = await exchangeCode(
      harness,
      await obtainCode(harness, cookie, { pkce: challenge }),
      challenge.verifier,
    )
    const revoke = await harness.app.request(url("/oauth/revoke"), {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        token: tokens.access_token,
        token_type_hint: "access_token",
        client_id: memorySeed.testClientId,
      }).toString(),
    })
    expect(revoke.status).toBe(200)
    expect((await userinfo(harness, tokens.access_token)).status).toBe(401)
  })

  it("rejects a reused code and revokes what it issued", async () => {
    const harness = await createHarness()
    const cookie = await signIn(harness)
    const challenge = await pkce()
    const code = await obtainCode(harness, cookie, { pkce: challenge })
    const tokens = await exchangeCode(harness, code, challenge.verifier)
    const replay = await tokenRequest(harness, {
      grant_type: "authorization_code",
      code,
      code_verifier: challenge.verifier,
      redirect_uri: memorySeed.testRedirectUris[0],
      client_id: memorySeed.testClientId,
    })
    expect(await oauthError(replay)).toBe("invalid_grant")
    expect((await userinfo(harness, tokens.access_token)).status).toBe(401)
    const refresh = await tokenRequest(harness, {
      grant_type: "refresh_token",
      refresh_token: tokens.refresh_token,
      client_id: memorySeed.testClientId,
    })
    expect(await oauthError(refresh)).toBe("invalid_grant")
  })

  it("expires codes after 60 seconds", async () => {
    const harness = await createHarness()
    const cookie = await signIn(harness)
    const challenge = await pkce()
    const code = await obtainCode(harness, cookie, { pkce: challenge })
    harness.clock.advance(61_000)
    const response = await tokenRequest(harness, {
      grant_type: "authorization_code",
      code,
      code_verifier: challenge.verifier,
      redirect_uri: memorySeed.testRedirectUris[0],
      client_id: memorySeed.testClientId,
    })
    expect(await oauthError(response)).toBe("invalid_grant")
  })

  it("rejects a wrong PKCE verifier", async () => {
    const harness = await createHarness()
    const cookie = await signIn(harness)
    const challenge = await pkce()
    const code = await obtainCode(harness, cookie, { pkce: challenge })
    const response = await tokenRequest(harness, {
      grant_type: "authorization_code",
      code,
      code_verifier: (await pkce()).verifier,
      redirect_uri: memorySeed.testRedirectUris[0],
      client_id: memorySeed.testClientId,
    })
    expect(await oauthError(response)).toBe("invalid_grant")
  })

  it("allows down-scoping on refresh but not widening", async () => {
    const harness = await createHarness()
    const cookie = await signIn(harness)
    const challenge = await pkce()
    const tokens = await exchangeCode(
      harness,
      await obtainCode(harness, cookie, { pkce: challenge }),
      challenge.verifier,
    )
    const narrowed = await tokenRequest(harness, {
      grant_type: "refresh_token",
      refresh_token: tokens.refresh_token,
      scope: "openid",
      client_id: memorySeed.testClientId,
    })
    const narrowedTokens = tokenResponseSchema.parse(await narrowed.json())
    expect(narrowedTokens.scope).toBe("openid")
    const info = userinfoResponseSchema.parse(
      await (await userinfo(harness, narrowedTokens.access_token)).json(),
    )
    expect(info.wallet_address).toBeUndefined()

    const widened = await tokenRequest(harness, {
      grant_type: "refresh_token",
      refresh_token: narrowedTokens.refresh_token,
      scope: "openid wallet discord:id",
      client_id: memorySeed.testClientId,
    })
    expect(await oauthError(widened)).toBe("invalid_scope")
  })
})

describe("authorize validation", () => {
  it("never redirects to an unregistered redirect URI", async () => {
    const harness = await createHarness()
    const location = await authorize(harness, null, {
      pkce: await pkce(),
      redirectUri: "https://evil.example/callback",
    })
    expect(location.href).toBe(
      "https://id.test/error?code=invalid_redirect_uri",
    )
  })

  it("sends unknown clients to the error page", async () => {
    const harness = await createHarness()
    const location = await authorize(harness, null, {
      pkce: await pkce(),
      clientId: "mbx_test_000000000000000000000000",
    })
    expect(location.href).toBe("https://id.test/error?code=invalid_client")
  })

  it("requires PKCE", async () => {
    const harness = await createHarness()
    const location = await authorize(harness, null, {
      pkce: await pkce(),
      challenge: null,
    })
    expect(location.origin + location.pathname).toBe(
      memorySeed.testRedirectUris[0],
    )
    expect(location.searchParams.get("error")).toBe("invalid_request")
    expect(location.searchParams.get("state")).toBe("state-123")
  })

  it("rejects plain PKCE", async () => {
    const harness = await createHarness()
    const location = await authorize(harness, null, {
      pkce: await pkce(),
      extra: { code_challenge_method: "plain" },
    })
    expect(location.searchParams.get("error")).toBe("invalid_request")
  })

  it("requires the openid scope and approved scopes", async () => {
    const harness = await createHarness()
    const noOpenid = await authorize(harness, null, {
      pkce: await pkce(),
      scope: "wallet",
    })
    expect(noOpenid.searchParams.get("error")).toBe("invalid_scope")
    // The test environment has not been approved for Discord scopes.
    const unapproved = await authorize(harness, null, {
      pkce: await pkce(),
      scope: "openid discord:id",
    })
    expect(unapproved.searchParams.get("error")).toBe("invalid_scope")
  })

  it("refuses suspended apps", async () => {
    const harness = await createHarness()
    harness.store.admin.setAppStatus(memorySeed.appId, "suspended")
    const location = await authorize(harness, null, { pkce: await pkce() })
    expect(location.searchParams.get("error")).toBe("access_denied")
  })

  it("handles prompt=none", async () => {
    const harness = await createHarness()
    const challenge = await pkce()
    const anonymous = await authorize(harness, null, {
      pkce: challenge,
      prompt: "none",
    })
    expect(anonymous.searchParams.get("error")).toBe("login_required")

    const cookie = await signIn(harness)
    const noGrant = await authorize(harness, cookie, {
      pkce: challenge,
      prompt: "none",
    })
    expect(noGrant.searchParams.get("error")).toBe("consent_required")

    await obtainCode(harness, cookie, { pkce: challenge })
    const silent = await authorize(harness, cookie, {
      pkce: challenge,
      prompt: "none",
    })
    expect(silent.searchParams.get("code")).not.toBeNull()
  })

  it("skips consent for covered grants unless prompt=consent", async () => {
    const harness = await createHarness()
    const cookie = await signIn(harness)
    const challenge = await pkce()
    await obtainCode(harness, cookie, { pkce: challenge })
    const skipped = await authorize(harness, cookie, { pkce: challenge })
    expect(skipped.searchParams.get("code")).not.toBeNull()
    const forced = await authorize(harness, cookie, {
      pkce: challenge,
      prompt: "consent",
    })
    expect(forced.pathname).toBe("/authorize")
  })

  it("forces consent again after a scope_version bump", async () => {
    const harness = await createHarness()
    const cookie = await signIn(harness)
    const challenge = await pkce()
    await obtainCode(harness, cookie, { pkce: challenge })
    harness.store.admin.setScopeVersion(memorySeed.testEnvironmentId, 2)
    const location = await authorize(harness, cookie, { pkce: challenge })
    expect(location.pathname).toBe("/authorize")
    const requestId = location.searchParams.get("request") ?? ""
    const detail = await harness.app.request(
      url(`/api/authorization-requests/${requestId}`),
      { headers: { Cookie: cookie } },
    )
    expect(await detail.json()).toMatchObject({ consentRequired: true })
    await decide(harness, cookie, requestId, "approve")
    const [grant] = harness.store.admin
      .grants()
      .filter((candidate) => candidate.revokedAt === null)
    expect(grant?.scopeVersion).toBe(2)
    const skipped = await authorize(harness, cookie, { pkce: challenge })
    expect(skipped.searchParams.get("code")).not.toBeNull()
  })

  it("requires a fresh sign-in for prompt=login", async () => {
    const harness = await createHarness()
    const cookie = await signIn(harness)
    const challenge = await pkce()
    await obtainCode(harness, cookie, { pkce: challenge })
    harness.clock.advance(1000)
    const location = await authorize(harness, cookie, {
      pkce: challenge,
      prompt: "login",
    })
    expect(location.pathname).toBe("/authorize")
    const requestId = location.searchParams.get("request") ?? ""
    const stale = await harness.app.request(
      url(`/api/authorization-requests/${requestId}`),
      { headers: { Cookie: cookie } },
    )
    expect(await stale.json()).toMatchObject({
      reauthenticationRequired: true,
    })
    const refused = await harness.app.request(
      url(`/api/authorization-requests/${requestId}/decision`),
      {
        method: "POST",
        headers: apiHeaders(cookie),
        body: JSON.stringify({ decision: "approve" }),
      },
    )
    expect(refused.status).toBe(403)

    harness.clock.advance(1000)
    const fresh = await signIn(harness)
    const callback = await decide(harness, fresh, requestId, "approve")
    expect(callback.searchParams.get("code")).not.toBeNull()
  })

  it("returns access_denied when the user cancels", async () => {
    const harness = await createHarness()
    const cookie = await signIn(harness)
    const location = await authorize(harness, cookie, { pkce: await pkce() })
    const callback = await decide(
      harness,
      cookie,
      location.searchParams.get("request") ?? "",
      "deny",
    )
    expect(callback.searchParams.get("error")).toBe("access_denied")
    expect(callback.searchParams.get("state")).toBe("state-123")
  })
})

describe("client authentication", () => {
  async function liveCode(harness: Awaited<ReturnType<typeof createHarness>>) {
    const cookie = await signIn(harness)
    const challenge = await pkce()
    const code = await obtainCode(harness, cookie, {
      pkce: challenge,
      clientId: memorySeed.liveClientId,
      redirectUri: memorySeed.liveRedirectUris[0],
    })
    return { code, verifier: challenge.verifier }
  }

  it("requires the secret for confidential clients", async () => {
    const harness = await createHarness()
    const { code, verifier } = await liveCode(harness)
    const missing = await tokenRequest(harness, {
      grant_type: "authorization_code",
      code,
      code_verifier: verifier,
      redirect_uri: memorySeed.liveRedirectUris[0],
      client_id: memorySeed.liveClientId,
    })
    expect(missing.status).toBe(401)
    expect(await oauthError(missing)).toBe("invalid_client")

    const wrong = await tokenRequest(
      harness,
      {
        grant_type: "authorization_code",
        code,
        code_verifier: verifier,
        redirect_uri: memorySeed.liveRedirectUris[0],
      },
      {
        Authorization: basicAuth(
          memorySeed.liveClientId,
          `mbx_cs_${memorySeed.liveClientSecretPrefix}_${"x".repeat(43)}`,
        ),
      },
    )
    expect(wrong.status).toBe(401)
    expect(wrong.headers.get("WWW-Authenticate")).toContain("Basic")
  })

  it("accepts client_secret_basic", async () => {
    const harness = await createHarness()
    const { code, verifier } = await liveCode(harness)
    const response = await tokenRequest(
      harness,
      {
        grant_type: "authorization_code",
        code,
        code_verifier: verifier,
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
  })

  it("accepts client_secret_post", async () => {
    const harness = await createHarness()
    const { code, verifier } = await liveCode(harness)
    const response = await tokenRequest(harness, {
      grant_type: "authorization_code",
      code,
      code_verifier: verifier,
      redirect_uri: memorySeed.liveRedirectUris[0],
      client_id: memorySeed.liveClientId,
      client_secret: memorySeed.liveClientSecret,
    })
    expect(response.status).toBe(200)
  })

  it("rejects secrets from public clients and codes from other clients", async () => {
    const harness = await createHarness()
    const cookie = await signIn(harness)
    const challenge = await pkce()
    const code = await obtainCode(harness, cookie, { pkce: challenge })
    const withSecret = await tokenRequest(harness, {
      grant_type: "authorization_code",
      code,
      code_verifier: challenge.verifier,
      redirect_uri: memorySeed.testRedirectUris[0],
      client_id: memorySeed.testClientId,
      client_secret: memorySeed.liveClientSecret,
    })
    expect(await oauthError(withSecret)).toBe("invalid_client")

    const { code: liveOnly, verifier } = await liveCode(harness)
    const crossClient = await tokenRequest(harness, {
      grant_type: "authorization_code",
      code: liveOnly,
      code_verifier: verifier,
      redirect_uri: memorySeed.liveRedirectUris[0],
      client_id: memorySeed.testClientId,
    })
    expect(await oauthError(crossClient)).toBe("invalid_grant")
  })
})

describe("claims", () => {
  it("releases Discord claims for approved scopes and drops them when disabled", async () => {
    const harness = await createHarness()
    const cookie = await signIn(harness)
    const challenge = await pkce()
    const live = { clientId: memorySeed.liveClientId }
    const code = await obtainCode(harness, cookie, {
      pkce: challenge,
      clientId: memorySeed.liveClientId,
      redirectUri: memorySeed.liveRedirectUris[0],
      scope: "openid wallet discord:id discord:profile",
    })
    const response = await tokenRequest(harness, {
      grant_type: "authorization_code",
      code,
      code_verifier: challenge.verifier,
      redirect_uri: memorySeed.liveRedirectUris[0],
      client_id: live.clientId,
      client_secret: memorySeed.liveClientSecret,
    })
    const tokens = tokenResponseSchema.parse(await response.json())
    const info = userinfoResponseSchema.parse(
      await (await userinfo(harness, tokens.access_token)).json(),
    )
    expect(info).toMatchObject({
      wallet_network: "mezo",
      discord_id: memorySeed.devDiscord.discordUserId,
      discord_username: memorySeed.devDiscord.username,
      discord_display_name: memorySeed.devDiscord.globalName,
    })

    harness.deps.flags.discordClaims = false
    const withoutDiscord = userinfoResponseSchema.parse(
      await (await userinfo(harness, tokens.access_token)).json(),
    )
    expect(withoutDiscord.discord_id).toBeUndefined()
    expect(withoutDiscord.wallet_address).toBe(memorySeed.devWallet)
    const refused = await authorize(harness, cookie, {
      pkce: challenge,
      clientId: memorySeed.liveClientId,
      redirectUri: memorySeed.liveRedirectUris[0],
      scope: "openid discord:id",
    })
    expect(refused.searchParams.get("error")).toBe("invalid_scope")
  })

  it("invalidates Discord grants when the link changes", async () => {
    const harness = await createHarness()
    const cookie = await signIn(harness)
    const challenge = await pkce()
    const code = await obtainCode(harness, cookie, {
      pkce: challenge,
      clientId: memorySeed.liveClientId,
      redirectUri: memorySeed.liveRedirectUris[0],
      scope: "openid discord:id",
    })
    const response = await tokenRequest(harness, {
      grant_type: "authorization_code",
      code,
      code_verifier: challenge.verifier,
      redirect_uri: memorySeed.liveRedirectUris[0],
      client_id: memorySeed.liveClientId,
      client_secret: memorySeed.liveClientSecret,
    })
    const tokens = tokenResponseSchema.parse(await response.json())
    harness.store.admin.setDiscordLink(
      memorySeed.devWallet,
      { ...memorySeed.devDiscord, discordUserId: "200000000000000002" },
      harness.clock.now,
    )
    expect((await userinfo(harness, tokens.access_token)).status).toBe(401)
    const [grant] = harness.store.admin.grants()
    expect(grant?.revokedReason).toBe("discord-link-changed")
    const refresh = await tokenRequest(harness, {
      grant_type: "refresh_token",
      refresh_token: tokens.refresh_token,
      client_id: memorySeed.liveClientId,
      client_secret: memorySeed.liveClientSecret,
    })
    expect(await oauthError(refresh)).toBe("invalid_grant")
  })

  it("marks Discord scopes unavailable without a link", async () => {
    const harness = await createHarness()
    const cookie = await signIn(harness, otherAccount)
    const location = await authorize(harness, cookie, {
      pkce: await pkce(),
      clientId: memorySeed.liveClientId,
      redirectUri: memorySeed.liveRedirectUris[0],
      scope: "openid discord:id",
    })
    const requestId = location.searchParams.get("request") ?? ""
    const detail = await harness.app.request(
      url(`/api/authorization-requests/${requestId}`),
      { headers: { Cookie: cookie } },
    )
    expect(await detail.json()).toMatchObject({
      approvable: false,
      app: { verified: true },
      scopes: [
        { scope: "openid", available: true },
        {
          scope: "discord:id",
          available: false,
          unavailableReason: "discord-not-linked",
        },
      ],
    })
    const callback = await decide(harness, cookie, requestId, "approve")
    expect(callback.searchParams.get("error")).toBe("access_denied")
    expect(callback.searchParams.get("error_description")).toBe(
      "discord-not-linked",
    )
  })

  it("uses pairwise subjects: stable per sector, different across sectors", async () => {
    const harness = await createHarness()
    const cookie = await signIn(harness)
    const challenge = await pkce()
    const testTokens = await exchangeCode(
      harness,
      await obtainCode(harness, cookie, { pkce: challenge }),
      challenge.verifier,
    )
    const testAgain = await exchangeCode(
      harness,
      await obtainCode(harness, cookie, { pkce: challenge }),
      challenge.verifier,
    )
    const liveCode = await obtainCode(harness, cookie, {
      pkce: challenge,
      clientId: memorySeed.liveClientId,
      redirectUri: memorySeed.liveRedirectUris[0],
    })
    const liveResponse = await tokenRequest(harness, {
      grant_type: "authorization_code",
      code: liveCode,
      code_verifier: challenge.verifier,
      redirect_uri: memorySeed.liveRedirectUris[0],
      client_id: memorySeed.liveClientId,
      client_secret: memorySeed.liveClientSecret,
    })
    const liveTokens = tokenResponseSchema.parse(await liveResponse.json())
    const sub = (token: string | undefined) =>
      idTokenClaimsSchema.parse(decodeJwt(token ?? "")).sub
    expect(sub(testTokens.id_token)).toBe(sub(testAgain.id_token))
    expect(sub(testTokens.id_token)).not.toBe(sub(liveTokens.id_token))
  })
})

describe("account API", () => {
  it("rejects cross-origin writes", async () => {
    const harness = await createHarness()
    const cookie = await signIn(harness)
    const response = await harness.app.request(url("/api/session/sign-out"), {
      method: "POST",
      headers: { Origin: "https://evil.example", Cookie: cookie },
    })
    expect(response.status).toBe(403)
    const missing = await harness.app.request(url("/api/siwe/nonce"), {
      method: "POST",
    })
    expect(missing.status).toBe(403)
  })

  it("lists and revokes grants and sessions", async () => {
    const harness = await createHarness()
    const cookie = await signIn(harness)
    const challenge = await pkce()
    const tokens = await exchangeCode(
      harness,
      await obtainCode(harness, cookie, { pkce: challenge }),
      challenge.verifier,
    )
    const grants = z
      .object({ data: z.array(z.object({ id: z.string() })) })
      .parse(
        await (
          await harness.app.request(url("/api/grants"), {
            headers: { Cookie: cookie },
          })
        ).json(),
      )
    expect(grants.data).toHaveLength(1)
    const revoke = await harness.app.request(
      url(`/api/grants/${grants.data[0]?.id}`),
      { method: "DELETE", headers: apiHeaders(cookie) },
    )
    expect(revoke.status).toBe(200)
    expect((await userinfo(harness, tokens.access_token)).status).toBe(401)

    const sessions = z
      .object({
        data: z.array(z.object({ id: z.string(), current: z.boolean() })),
      })
      .parse(
        await (
          await harness.app.request(url("/api/sessions"), {
            headers: { Cookie: cookie },
          })
        ).json(),
      )
    expect(sessions.data).toEqual([expect.objectContaining({ current: true })])
    const end = await harness.app.request(
      url(`/api/sessions/${sessions.data[0]?.id}`),
      { method: "DELETE", headers: apiHeaders(cookie) },
    )
    expect(end.status).toBe(200)
    const session = await harness.app.request(url("/api/session"), {
      headers: { Cookie: cookie },
    })
    expect(await session.json()).toEqual({ account: null })
  })
})
