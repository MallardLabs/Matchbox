import {
  environmentSchema,
  meResponseSchema,
  revokeOtherSessionsResponseSchema,
} from "@repo/platform-contracts/console"
import { errorBodySchema } from "@repo/platform-contracts/errors"
import { describe, expect, it } from "vitest"
import { inertText, invitationEmail } from "./email/templates"
import {
  type Harness,
  cookiesFrom,
  createHarness,
  setCookieHeaders,
} from "./test/harness"

/**
 * Regression tests for the console security review: step-up is bound to the
 * signed-in Google account (H1), client type and redirect changes (H2),
 * sessions (M2), staff roles (M4), and the low-severity hardening items.
 */

async function errorCode(harness: Harness, response: Response) {
  return (await harness.json(response, errorBodySchema)).error.code
}

function mailTo(harness: Harness, to: string) {
  return harness.email.sent.filter((message) => message.to === to)
}

describe("H1: step-up needs the signed-in Google account", () => {
  it("a stolen session cannot step up with another Google account", async () => {
    const harness = createHarness()
    const victim = await harness.account("dev@example.com")
    const stolen = await harness.signIn(victim)
    const response = await harness.googleStepUp(stolen, {
      sub: "attacker-sub",
      email: "attacker@example.com",
    })
    expect(response.status).toBe(403)
    const me = await harness.json(
      await harness.request("GET", "/api/me", { cookie: stolen }),
      meResponseSchema,
    )
    expect(me.session.steppedUpUntil).toBeNull()
  })

  it("a Google token minted for another page is refused", async () => {
    const harness = createHarness()
    const account = await harness.account("dev@example.com")
    const cookie = await harness.signIn(account)
    const issued = await harness.googleNonce("step-up", cookie)
    const response = await harness.request("POST", "/api/auth/step-up/google", {
      cookie: issued.cookie,
      body: {
        credential: harness.googleToken({
          sub: account.googleSub ?? "",
          email: account.email,
          nonce: null,
        }),
      },
    })
    expect(response.status).toBe(401)
  })

  it("a step-up nonce cannot be reused", async () => {
    const harness = createHarness()
    const account = await harness.account("dev@example.com")
    const cookie = await harness.signIn(account)
    const issued = await harness.googleNonce("step-up", cookie)
    const credential = harness.googleToken({
      sub: account.googleSub ?? "",
      email: account.email,
      nonce: issued.nonce,
    })
    const first = await harness.request("POST", "/api/auth/step-up/google", {
      cookie: issued.cookie,
      body: { credential },
    })
    expect(first.status).toBe(200)
    const replay = await harness.request("POST", "/api/auth/step-up/google", {
      cookie: cookiesFrom(first, issued.cookie),
      body: { credential },
    })
    expect(replay.status).toBe(400)
  })
})

describe("H2: client type and redirect changes", () => {
  async function ownerContext(steppedUp: boolean) {
    const harness = createHarness()
    const owner = await harness.account("owner@example.com")
    const organization = await harness.organization(owner)
    const envs = await harness.appWithEnvironments(organization.id)
    const cookie = await harness.signIn(owner, { steppedUp })
    return { harness, owner, cookie, ...envs }
  }

  it("requires step-up to change the client type", async () => {
    const { harness, cookie, live } = await ownerContext(false)
    const response = await harness.request(
      "PATCH",
      `/api/environments/${live.id}`,
      { cookie, body: { clientType: "public" } },
    )
    expect(response.status).toBe(403)
    expect(await errorCode(harness, response)).toBe("step_up_required")
    expect((await harness.store.getEnvironment(live.id))?.clientType).toBe(
      "confidential",
    )
  })

  it("confidential -> public revokes the environment's tokens and forces re-consent", async () => {
    const { harness, cookie, live, test } = await ownerContext(true)
    const expiresAt = new Date(harness.now().getTime() + 3_600_000)
    const grantId = harness.store.seedGrant({
      environmentId: live.id,
      scopes: ["openid", "wallet"],
      createdAt: harness.now().toISOString(),
      revokedAt: null,
      revokedReason: null,
    })
    const otherGrantId = harness.store.seedGrant({
      environmentId: test.id,
      scopes: ["openid"],
      createdAt: harness.now().toISOString(),
      revokedAt: null,
      revokedReason: null,
    })
    const familyId = crypto.randomUUID()
    for (const kind of ["refresh", "refresh", "access"] as const) {
      harness.store.seedOAuthToken({
        kind,
        grantId,
        familyId: kind === "refresh" ? familyId : null,
        expiresAt: expiresAt.toISOString(),
      })
    }
    harness.store.seedOAuthToken({
      kind: "access",
      grantId: otherGrantId,
      familyId: null,
      expiresAt: expiresAt.toISOString(),
    })

    const response = await harness.request(
      "PATCH",
      `/api/environments/${live.id}`,
      { cookie, body: { clientType: "public" } },
    )
    expect(response.status).toBe(200)
    const environment = await harness.json(response, environmentSchema)
    expect(environment.clientType).toBe("public")
    expect(environment.scopeVersion).toBe(live.scopeVersion + 1)

    const tokens = harness.store.oauthTokens()
    expect(
      tokens
        .filter((token) => token.grantId === grantId)
        .every((token) => token.revokedAt !== null),
    ).toBe(true)
    expect(
      tokens.find((token) => token.grantId === otherGrantId)?.revokedAt,
    ).toBeNull()

    const events = harness.store.auditEvents()
    const system = events.find(
      (event) => event.action === "oauth-tokens-revoked",
    )
    expect(system?.actorType).toBe("system")
    expect(system?.metadata).toMatchObject({
      reason: "client-type-public",
      refreshTokenFamiliesRevoked: 1,
      accessTokensRevoked: 1,
    })
    const updated = events.find(
      (event) => event.action === "environment-updated",
    )
    expect(updated?.metadata).toMatchObject({
      tokensRevoked: { refreshTokenFamiliesRevoked: 1 },
    })
  })

  it("requires step-up to add redirect URIs or origins, not to remove them", async () => {
    const { harness, owner, live } = await ownerContext(false)
    await harness.store.replaceRedirectUris(live.id, [
      "https://app.example.com/callback",
      "https://app.example.com/other",
    ])
    await harness.store.replaceOrigins(live.id, ["https://app.example.com"])
    const cookie = await harness.signIn(owner)

    const add = await harness.request(
      "PUT",
      `/api/environments/${live.id}/redirect-uris`,
      {
        cookie,
        body: {
          uris: [
            "https://app.example.com/callback",
            "https://evil.example/callback",
          ],
        },
      },
    )
    expect(add.status).toBe(403)
    expect(await errorCode(harness, add)).toBe("step_up_required")
    expect(await harness.store.listRedirectUris(live.id)).toHaveLength(2)

    const remove = await harness.request(
      "PUT",
      `/api/environments/${live.id}/redirect-uris`,
      { cookie, body: { uris: ["https://app.example.com/callback"] } },
    )
    expect(remove.status).toBe(200)
    expect(await harness.store.listRedirectUris(live.id)).toEqual([
      "https://app.example.com/callback",
    ])

    const addOrigin = await harness.request(
      "PUT",
      `/api/environments/${live.id}/origins`,
      {
        cookie,
        body: { origins: ["https://app.example.com", "https://evil.example"] },
      },
    )
    expect(addOrigin.status).toBe(403)
    const removeOrigin = await harness.request(
      "PUT",
      `/api/environments/${live.id}/origins`,
      { cookie, body: { origins: [] } },
    )
    expect(removeOrigin.status).toBe(200)

    const stepped = await harness.signIn(owner, { steppedUp: true })
    const retry = await harness.request(
      "PUT",
      `/api/environments/${live.id}/redirect-uris`,
      {
        cookie: stepped,
        body: { uris: ["https://app.example.com/new"] },
      },
    )
    expect(retry.status).toBe(200)
  })
})

describe("M2: sessions", () => {
  it("signs out every other session", async () => {
    const harness = createHarness()
    const account = await harness.account("dev@example.com")
    const other = await harness.signIn(account)
    const third = await harness.signIn(account)
    const current = await harness.signIn(account)
    const response = await harness.request(
      "POST",
      "/api/me/sessions/revoke-others",
      { cookie: current },
    )
    expect(response.status).toBe(200)
    expect(
      await harness.json(response, revokeOtherSessionsResponseSchema),
    ).toEqual({ revoked: 2 })
    for (const cookie of [other, third]) {
      expect((await harness.request("GET", "/api/me", { cookie })).status).toBe(
        401,
      )
    }
    expect(
      (await harness.request("GET", "/api/me", { cookie: current })).status,
    ).toBe(200)
  })
})

describe("M4: staff roles and step-up", () => {
  async function staffContext() {
    const harness = createHarness()
    const owner = await harness.account("owner@example.com")
    const organization = await harness.organization(owner)
    const { app, live } = await harness.appWithEnvironments(organization.id)
    const review = await harness.store.createReview({
      environmentId: live.id,
      requestedScopes: ["openid", "discord:id"],
      state: "open",
      submitterId: owner.id,
      submitterNote: null,
      reviewerId: null,
      reviewerNote: null,
      decidedAt: null,
    })
    const reviewer = await harness.account("reviewer@matchbox.local")
    harness.store.seedStaff(reviewer.id, "reviewer")
    const operator = await harness.account("operator@matchbox.local")
    harness.store.seedStaff(operator.id, "operator")
    return { harness, app, live, review, reviewer, operator }
  }

  it("reviewers read without step-up", async () => {
    const { harness, reviewer } = await staffContext()
    const cookie = await harness.signIn(reviewer)
    for (const path of [
      "/api/admin/reviews",
      "/api/admin/apps",
      "/api/admin/audit",
    ]) {
      expect((await harness.request("GET", path, { cookie })).status).toBe(200)
    }
  })

  it("review decisions need step-up", async () => {
    const { harness, reviewer, review } = await staffContext()
    const path = `/api/admin/reviews/${review.id}/decision`
    const body = { decision: "reject" }
    const plain = await harness.request("POST", path, {
      cookie: await harness.signIn(reviewer),
      body,
    })
    expect(plain.status).toBe(403)
    expect(await errorCode(harness, plain)).toBe("step_up_required")
    const stepped = await harness.request("POST", path, {
      cookie: await harness.signIn(reviewer, { steppedUp: true }),
      body,
    })
    expect(stepped.status).toBe(200)
  })

  it("only operators change app status or quota overrides, with step-up", async () => {
    const { harness, reviewer, operator, app, live } = await staffContext()
    const calls = [
      {
        method: "POST",
        path: `/api/admin/apps/${app.id}/status`,
        body: { status: "suspended", reason: "Abuse report" },
      },
      {
        method: "POST",
        path: `/api/admin/environments/${live.id}/quota-overrides`,
        body: {
          endpointClass: "gauge-profiles",
          perMinute: 100,
          perDay: 1000,
          reason: "Launch",
        },
      },
    ]
    const reviewerCookie = await harness.signIn(reviewer, { steppedUp: true })
    const operatorPlain = await harness.signIn(operator)
    const operatorStepped = await harness.signIn(operator, { steppedUp: true })
    for (const call of calls) {
      const denied = await harness.request(call.method, call.path, {
        cookie: reviewerCookie,
        body: call.body,
      })
      expect(denied.status).toBe(403)
      expect(await errorCode(harness, denied)).toBe("forbidden")
      const plain = await harness.request(call.method, call.path, {
        cookie: operatorPlain,
        body: call.body,
      })
      expect(plain.status).toBe(403)
      expect(await errorCode(harness, plain)).toBe("step_up_required")
      const allowed = await harness.request(call.method, call.path, {
        cookie: operatorStepped,
        body: call.body,
      })
      expect(allowed.status).toBeLessThan(300)
    }
    const [override] = await harness.store.listQuotaOverrides(live.id)
    const remove = await harness.request(
      "DELETE",
      `/api/admin/quota-overrides/${override?.id ?? ""}`,
      { cookie: reviewerCookie },
    )
    expect(remove.status).toBe(403)
  })
})

describe("low-severity hardening", () => {
  it("caps sessions at 7 days even while active", async () => {
    const harness = createHarness()
    const account = await harness.account("dev@example.com")
    const cookie = await harness.signIn(account)
    for (let hour = 0; hour < 165; hour += 11) {
      harness.advance(11 * 3_600_000)
      expect((await harness.request("GET", "/api/me", { cookie })).status).toBe(
        200,
      )
    }
    harness.advance(2 * 3_600_000)
    const lastTouch = await harness.request("GET", "/api/me", { cookie })
    expect(lastTouch.status).toBe(200)
    expect(setCookieHeaders(lastTouch).join("\n")).toMatch(/Max-Age=3600\b/)
    harness.advance(2 * 3_600_000)
    expect((await harness.request("GET", "/api/me", { cookie })).status).toBe(
      401,
    )
  })

  it("secret-key CIDR changes and expiry extensions need step-up", async () => {
    const harness = createHarness()
    const owner = await harness.account("owner@example.com")
    const organization = await harness.organization(owner)
    const { test } = await harness.appWithEnvironments(organization.id)
    const expiresAt = new Date(harness.now().getTime() + 24 * 3_600_000)
    const key = await harness.store.createApiKey({
      environmentId: test.id,
      kind: "secret",
      name: "Server",
      prefix: "AbCdEfGhIjKl",
      secretHash: "0".repeat(64),
      allowedCidrs: ["10.0.0.0/8"],
      createdBy: owner.id,
      expiresAt: expiresAt.toISOString(),
      rotatedFrom: null,
    })
    const cookie = await harness.signIn(owner)
    const path = `/api/api-keys/${key.id}`

    const rename = await harness.request("PATCH", path, {
      cookie,
      body: { name: "Backend", allowedCidrs: ["10.0.0.0/8"] },
    })
    expect(rename.status).toBe(200)
    const widen = await harness.request("PATCH", path, {
      cookie,
      body: { allowedCidrs: [] },
    })
    expect(widen.status).toBe(403)
    expect(await errorCode(harness, widen)).toBe("step_up_required")

    const extend = await harness.request("POST", `${path}/expire`, {
      cookie,
      body: {
        expiresAt: new Date(expiresAt.getTime() + 3_600_000).toISOString(),
      },
    })
    expect(extend.status).toBe(403)
    expect(await errorCode(harness, extend)).toBe("step_up_required")
    const shorten = await harness.request("POST", `${path}/expire`, {
      cookie,
      body: {
        expiresAt: new Date(harness.now().getTime() + 3_600_000).toISOString(),
      },
    })
    expect(shorten.status).toBe(200)

    const stepped = await harness.signIn(owner, { steppedUp: true })
    const widenStepped = await harness.request("PATCH", path, {
      cookie: stepped,
      body: { allowedCidrs: [] },
    })
    expect(widenStepped.status).toBe(200)
  })

  it("invitation emails render names inert and name the sender domain", async () => {
    const bell = String.fromCharCode(0x07)
    const rightToLeft = String.fromCharCode(0x202e)
    const harness = createHarness()
    const owner = await harness.account(
      "owner@example.com",
      "Support team: visit evil.example/reset",
    )
    const organization = await harness.organization(owner)
    await harness.store.updateOrganization(organization.id, {
      name: `Acme${bell} https://evil.example/login${rightToLeft} urgent`,
    })
    const cookie = await harness.signIn(owner, { steppedUp: true })
    const response = await harness.request(
      "POST",
      `/api/orgs/${organization.id}/invitations`,
      { cookie, body: { email: "new@example.com", role: "developer" } },
    )
    expect(response.status).toBe(201)
    const [message] = mailTo(harness, "new@example.com")
    const rendered = `${message?.subject}\n${message?.text}\n${message?.html}`
    expect(rendered).not.toMatch(/evil/)
    expect(rendered).not.toContain(bell)
    expect(rendered).not.toContain(rightToLeft)
    expect(message?.subject).toBe("Invitation to Acme urgent on Matchbox")
    expect(message?.text).toContain(
      "Sent by Matchbox (developer.matchbox.markets).",
    )
  })

  it("caps inert text and falls back when nothing is left", () => {
    expect(inertText("x".repeat(100), "fallback")).toHaveLength(60)
    expect(inertText("https://evil.example", "fallback")).toBe("fallback")
    const email = invitationEmail({
      organizationName: "www.evil.example",
      inviterName: "",
      role: "admin",
      link: "https://developer.matchbox.markets/invite/token",
    })
    expect(email.text).toContain("A teammate invited you to an organization")
  })
})
