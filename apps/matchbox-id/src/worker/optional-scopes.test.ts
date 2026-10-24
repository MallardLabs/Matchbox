import { authorizationRequestViewSchema } from "@repo/platform-contracts/identity"
import {
  idTokenClaimsSchema,
  tokenResponseSchema,
  userinfoResponseSchema,
} from "@repo/platform-contracts/oidc"
import { decodeJwt } from "jose"
import { describe, expect, it } from "vitest"
import { grantListViewResponseSchema } from "../shared/contracts"
import { memorySeed } from "./store/memory-store"
import {
  url,
  type Harness,
  type Pkce,
  authorize,
  createHarness,
  decide,
  otherAccount,
  pkce,
  signIn,
  tokenRequest,
  userinfo,
} from "./test-harness"

/** Optional scopes: the live seed environment marks discord:* optional. */

const live = {
  clientId: memorySeed.liveClientId,
  redirectUri: memorySeed.liveRedirectUris[0],
}

const allScopes = "openid wallet discord:id discord:profile"

async function consentView(harness: Harness, cookie: string, location: URL) {
  const requestId = location.searchParams.get("request") ?? ""
  const response = await harness.app.request(
    url(`/api/authorization-requests/${requestId}`),
    { headers: { Cookie: cookie } },
  )
  expect(response.status).toBe(200)
  return {
    requestId,
    view: authorizationRequestViewSchema.parse(await response.json()),
  }
}

async function exchangeLive(harness: Harness, code: string, challenge: Pkce) {
  const response = await tokenRequest(harness, {
    grant_type: "authorization_code",
    code,
    code_verifier: challenge.verifier,
    redirect_uri: live.redirectUri,
    client_id: live.clientId,
    client_secret: memorySeed.liveClientSecret,
  })
  expect(response.status).toBe(200)
  return tokenResponseSchema.parse(await response.json())
}

async function userinfoClaims(harness: Harness, accessToken: string) {
  const response = await userinfo(harness, accessToken)
  expect(response.status).toBe(200)
  return userinfoResponseSchema.parse(await response.json())
}

function activeGrant(harness: Harness) {
  return harness.store.admin.grants().find((grant) => grant.revokedAt === null)
}

describe("optional scopes", () => {
  it("marks scopes required or optional on the consent view", async () => {
    const harness = await createHarness()
    const cookie = await signIn(harness)
    const location = await authorize(harness, cookie, {
      pkce: await pkce(),
      ...live,
      scope: allScopes,
    })
    const { view } = await consentView(harness, cookie, location)
    expect(view.approvable).toBe(true)
    expect(
      view.scopes.map(({ scope, requirement, previouslyDeclined }) => ({
        scope,
        requirement,
        previouslyDeclined,
      })),
    ).toEqual([
      { scope: "openid", requirement: "required", previouslyDeclined: false },
      { scope: "wallet", requirement: "required", previouslyDeclined: false },
      {
        scope: "discord:id",
        requirement: "optional",
        previouslyDeclined: false,
      },
      {
        scope: "discord:profile",
        requirement: "optional",
        previouslyDeclined: false,
      },
    ])
  })

  it("signs in without a declined optional scope and never releases it", async () => {
    const harness = await createHarness()
    const cookie = await signIn(harness)
    const challenge = await pkce()
    const location = await authorize(harness, cookie, {
      pkce: challenge,
      ...live,
      scope: allScopes,
      nonce: "nonce-optional",
    })
    const callback = await decide(
      harness,
      cookie,
      location.searchParams.get("request") ?? "",
      "approve",
      ["discord:profile"],
    )
    const code = callback.searchParams.get("code")
    expect(code).not.toBeNull()

    const tokens = await exchangeLive(harness, code ?? "", challenge)
    expect(tokens.scope).toBe("openid wallet discord:id")
    const idToken = idTokenClaimsSchema.parse(decodeJwt(tokens.id_token ?? ""))
    expect(idToken.discord_id).toBe(memorySeed.devDiscord.discordUserId)
    expect(idToken).not.toHaveProperty("discord_username")
    expect(idToken).not.toHaveProperty("discord_display_name")
    expect(idToken).not.toHaveProperty("discord_avatar_url")

    const claims = await userinfoClaims(harness, tokens.access_token)
    expect(claims.discord_id).toBe(memorySeed.devDiscord.discordUserId)
    expect(claims).not.toHaveProperty("discord_username")
    expect(claims).not.toHaveProperty("discord_display_name")
    expect(claims).not.toHaveProperty("discord_avatar_url")

    // A refresh cannot widen back to the declined scope.
    const widened = await tokenRequest(harness, {
      grant_type: "refresh_token",
      refresh_token: tokens.refresh_token,
      scope: allScopes,
      client_id: live.clientId,
      client_secret: memorySeed.liveClientSecret,
    })
    expect(widened.status).toBe(400)

    expect(activeGrant(harness)).toMatchObject({
      scopes: ["openid", "wallet", "discord:id"],
      declinedScopes: ["discord:profile"],
    })
    const grants = grantListViewResponseSchema.parse(
      await (
        await harness.app.request(url("/api/grants"), {
          headers: { Cookie: cookie },
        })
      ).json(),
    )
    expect(grants.data[0]).toMatchObject({
      scopes: ["openid", "wallet", "discord:id"],
      declinedScopes: ["discord:profile"],
      network: "mezo",
      verified: true,
    })
  })

  it("answers access_denied when a required scope is declined", async () => {
    const harness = await createHarness()
    const cookie = await signIn(harness)
    const location = await authorize(harness, cookie, {
      pkce: await pkce(),
      ...live,
      scope: allScopes,
    })
    const callback = await decide(
      harness,
      cookie,
      location.searchParams.get("request") ?? "",
      "approve",
      ["wallet"],
    )
    expect(callback.searchParams.get("code")).toBeNull()
    expect(callback.searchParams.get("error")).toBe("access_denied")
    expect(callback.searchParams.get("error_description")).toBe(
      "required-scope-declined",
    )
    expect(callback.searchParams.get("state")).toBe("state-123")
    expect(harness.store.admin.grants()).toHaveLength(0)
  })

  it("remembers a declined optional scope until prompt=consent", async () => {
    const harness = await createHarness()
    const cookie = await signIn(harness)
    const challenge = await pkce()
    const first = await authorize(harness, cookie, {
      pkce: challenge,
      ...live,
      scope: allScopes,
    })
    await decide(
      harness,
      cookie,
      first.searchParams.get("request") ?? "",
      "approve",
      ["discord:id", "discord:profile"],
    )

    // Every requested scope is decided: no consent screen.
    const silent = await authorize(harness, cookie, {
      pkce: challenge,
      ...live,
      scope: allScopes,
    })
    const code = silent.searchParams.get("code")
    expect(code).not.toBeNull()
    const tokens = await exchangeLive(harness, code ?? "", challenge)
    expect(tokens.scope).toBe("openid wallet")
    const claims = await userinfoClaims(harness, tokens.access_token)
    expect(claims).not.toHaveProperty("discord_id")

    const forced = await authorize(harness, cookie, {
      pkce: challenge,
      ...live,
      scope: allScopes,
      prompt: "consent",
    })
    const { requestId, view } = await consentView(harness, cookie, forced)
    expect(
      view.scopes
        .filter((scope) => scope.previouslyDeclined === true)
        .map((scope) => scope.scope),
    ).toEqual(["discord:id", "discord:profile"])

    // An approval without `declinedScopes` keeps the earlier choices.
    await decide(harness, cookie, requestId, "approve")
    expect(activeGrant(harness)).toMatchObject({
      scopes: ["openid", "wallet"],
      declinedScopes: ["discord:id", "discord:profile"],
    })
  })

  it("asks again when the app requests a new scope", async () => {
    const harness = await createHarness()
    const cookie = await signIn(harness)
    const challenge = await pkce()
    const first = await authorize(harness, cookie, {
      pkce: challenge,
      ...live,
      scope: "openid wallet",
    })
    await decide(
      harness,
      cookie,
      first.searchParams.get("request") ?? "",
      "approve",
    )

    const again = await authorize(harness, cookie, {
      pkce: challenge,
      ...live,
      scope: "openid wallet discord:profile",
    })
    expect(again.pathname).toBe("/authorize")
    const { requestId, view } = await consentView(harness, cookie, again)
    expect(view.consentRequired).toBe(true)
    expect(
      view.scopes.map(({ scope, previouslyGranted, previouslyDeclined }) => ({
        scope,
        new: !previouslyGranted && previouslyDeclined !== true,
      })),
    ).toEqual([
      { scope: "openid", new: false },
      { scope: "wallet", new: false },
      { scope: "discord:profile", new: true },
    ])
    expect(view.diff.added).toEqual(["discord:profile"])

    const callback = await decide(harness, cookie, requestId, "approve")
    const tokens = await exchangeLive(
      harness,
      callback.searchParams.get("code") ?? "",
      challenge,
    )
    expect(tokens.scope).toBe("openid wallet discord:profile")
    expect(activeGrant(harness)?.scopes).toEqual([
      "openid",
      "wallet",
      "discord:profile",
    ])
  })

  it("drops a previously granted optional scope switched off at re-consent", async () => {
    const harness = await createHarness()
    const cookie = await signIn(harness)
    const challenge = await pkce()
    const first = await authorize(harness, cookie, {
      pkce: challenge,
      ...live,
      scope: allScopes,
    })
    const firstCallback = await decide(
      harness,
      cookie,
      first.searchParams.get("request") ?? "",
      "approve",
    )
    const before = await exchangeLive(
      harness,
      firstCallback.searchParams.get("code") ?? "",
      challenge,
    )
    expect(
      (await userinfoClaims(harness, before.access_token)).discord_id,
    ).toBe(memorySeed.devDiscord.discordUserId)

    const forced = await authorize(harness, cookie, {
      pkce: challenge,
      ...live,
      scope: allScopes,
      prompt: "consent",
    })
    await decide(
      harness,
      cookie,
      forced.searchParams.get("request") ?? "",
      "approve",
      ["discord:id"],
    )
    expect(activeGrant(harness)).toMatchObject({
      scopes: ["openid", "wallet", "discord:profile"],
      declinedScopes: ["discord:id"],
    })
    // Tokens issued before the change stop releasing the dropped claim.
    const after = await userinfoClaims(harness, before.access_token)
    expect(after).not.toHaveProperty("discord_id")
    expect(after.discord_username).toBe(memorySeed.devDiscord.username)
  })

  it("signs in without an unavailable optional scope and asks once it is linked", async () => {
    const harness = await createHarness()
    const cookie = await signIn(harness, otherAccount)
    const challenge = await pkce()
    const location = await authorize(harness, cookie, {
      pkce: challenge,
      ...live,
      scope: "openid discord:id",
    })
    const { requestId, view } = await consentView(harness, cookie, location)
    expect(view.approvable).toBe(true)
    expect(view.scopes[1]).toMatchObject({
      scope: "discord:id",
      available: false,
      unavailableReason: "discord-not-linked",
      requirement: "optional",
    })
    const callback = await decide(harness, cookie, requestId, "approve")
    const tokens = await exchangeLive(
      harness,
      callback.searchParams.get("code") ?? "",
      challenge,
    )
    expect(tokens.scope).toBe("openid")
    expect(activeGrant(harness)).toMatchObject({
      scopes: ["openid"],
      declinedScopes: [],
    })

    // Still unlinked: no consent screen on the next sign-in.
    const silent = await authorize(harness, cookie, {
      pkce: challenge,
      ...live,
      scope: "openid discord:id",
    })
    expect(silent.searchParams.get("code")).not.toBeNull()

    harness.store.admin.setDiscordLink(
      otherAccount.address.toLowerCase(),
      {
        discordUserId: "300000000000000003",
        username: "other",
        globalName: null,
        avatarHash: null,
      },
      harness.clock.now,
    )
    const linked = await authorize(harness, cookie, {
      pkce: challenge,
      ...live,
      scope: "openid discord:id",
    })
    expect(linked.pathname).toBe("/authorize")
    const relinked = await consentView(harness, cookie, linked)
    expect(relinked.view.scopes[1]).toMatchObject({
      scope: "discord:id",
      available: true,
      previouslyGranted: false,
      previouslyDeclined: false,
    })
  })

  it("ignores unknown scope values", async () => {
    const harness = await createHarness()
    const cookie = await signIn(harness)
    const challenge = await pkce()
    const location = await authorize(harness, cookie, {
      pkce: challenge,
      ...live,
      scope: "openid email wallet offline_access",
    })
    const { requestId, view } = await consentView(harness, cookie, location)
    expect(view.scopes.map((scope) => scope.scope)).toEqual([
      "openid",
      "wallet",
    ])
    const callback = await decide(harness, cookie, requestId, "approve")
    const tokens = await exchangeLive(
      harness,
      callback.searchParams.get("code") ?? "",
      challenge,
    )
    expect(tokens.scope).toBe("openid wallet")

    const noOpenid = await authorize(harness, null, {
      pkce: challenge,
      ...live,
      scope: "email profile",
    })
    expect(noOpenid.searchParams.get("error")).toBe("invalid_scope")
  })

  it("lists ended grants with their reason", async () => {
    const harness = await createHarness()
    const cookie = await signIn(harness)
    const location = await authorize(harness, cookie, {
      pkce: await pkce(),
      ...live,
      scope: "openid discord:id",
    })
    await decide(
      harness,
      cookie,
      location.searchParams.get("request") ?? "",
      "approve",
    )
    harness.clock.advance(60_000)
    harness.store.admin.setDiscordLink(
      memorySeed.devWallet,
      { ...memorySeed.devDiscord, discordUserId: "200000000000000002" },
      harness.clock.now,
    )
    const grants = grantListViewResponseSchema.parse(
      await (
        await harness.app.request(url("/api/grants"), {
          headers: { Cookie: cookie },
        })
      ).json(),
    )
    expect(grants.data).toHaveLength(0)
    expect(grants.ended).toMatchObject([
      {
        app: { name: "Matchbox Example" },
        environmentKind: "live",
        network: "mezo",
        scopes: ["openid", "discord:id"],
        revokedReason: "discord-link-changed",
        revokedAt: harness.clock.now.toISOString(),
      },
    ])
  })
})
