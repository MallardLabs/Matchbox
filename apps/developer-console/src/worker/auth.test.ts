import {
  googleNonceResponseSchema,
  meResponseSchema,
  stepUpResponseSchema,
} from "@repo/platform-contracts/console"
import { errorBodySchema } from "@repo/platform-contracts/errors"
import { describe, expect, it } from "vitest"
import { identityFromClaims, isStaffIdentity } from "./auth/google"
import { invitationTokenHash } from "./routes/organizations"
import {
  type Harness,
  cookiesFrom,
  createHarness,
  googleClientId,
  sessionPepper,
  setCookieHeaders,
  staffDomains,
} from "./test/harness"

async function errorCode(harness: Harness, response: Response) {
  return (await harness.json(response, errorBodySchema)).error.code
}

function staffGrants(harness: Harness) {
  return harness.store
    .auditEvents()
    .filter((event) => event.action === "staff-role-granted")
}

describe("Google nonce", () => {
  it("issues a signed single-use nonce cookie with the client id", async () => {
    const harness = createHarness()
    const response = await harness.request("POST", "/api/auth/google/nonce", {
      body: { purpose: "sign-in" },
    })
    expect(response.status).toBe(200)
    const body = await harness.json(response, googleNonceResponseSchema)
    expect(body.clientId).toBe(googleClientId)
    const cookie = setCookieHeaders(response).join("\n")
    expect(cookie).toMatch(/__Host-mbx_dev_google=/)
    expect(cookie).toMatch(/HttpOnly/)
    expect(cookie).toMatch(/SameSite=Strict/)
  })

  it("needs a session for a step-up nonce", async () => {
    const harness = createHarness()
    const response = await harness.request("POST", "/api/auth/google/nonce", {
      body: { purpose: "step-up" },
    })
    expect(response.status).toBe(401)
  })

  it("answers 503 when Google is not configured", async () => {
    const harness = createHarness({ google: false })
    const response = await harness.request("POST", "/api/auth/google/nonce", {
      body: { purpose: "sign-in" },
    })
    expect(response.status).toBe(503)
  })
})

describe("Google sign-in", () => {
  it("creates the account, its first organization and a stepped-up session", async () => {
    const harness = createHarness()
    const { response, cookie } = await harness.googleSignIn({
      sub: "1001",
      email: "New.Dev@Example.com",
      name: "New Dev",
    })
    expect(response.status).toBe(200)
    const me = await harness.json(response, meResponseSchema)
    expect(me.account.email).toBe("new.dev@example.com")
    expect(me.account.displayName).toBe("New Dev")
    expect(me.account.emailVerifiedAt).not.toBeNull()
    expect(me.organizations).toHaveLength(1)
    expect(me.organizations[0]?.role).toBe("owner")
    expect(me.staffRole).toBeNull()
    expect(me.session.steppedUpUntil).not.toBeNull()
    expect((await harness.request("GET", "/api/me", { cookie })).status).toBe(
      200,
    )
    const actions = harness.store.auditEvents().map((event) => event.action)
    expect(actions).toContain("developer-account-created")
    expect(actions).toContain("developer-signed-in")
  })

  it("signs the same Google account back in without a second organization", async () => {
    const harness = createHarness()
    await harness.googleSignIn({ sub: "1001", email: "dev@example.com" })
    const again = await harness.googleSignIn({
      sub: "1001",
      email: "dev@example.com",
    })
    expect(again.response.status).toBe(200)
    const me = await harness.json(again.response, meResponseSchema)
    expect(me.organizations).toHaveLength(1)
  })

  it("links an account without a Google identity by verified email", async () => {
    const harness = createHarness()
    const seeded = await harness.store.createAccount({
      email: "dev@example.com",
      displayName: "Seeded",
      emailVerifiedAt: null,
    })
    const { response } = await harness.googleSignIn({
      sub: "2002",
      email: "dev@example.com",
    })
    expect(response.status).toBe(200)
    const linked = await harness.store.getAccount(seeded.id)
    expect(linked?.googleSub).toBe("2002")
    expect(linked?.emailVerifiedAt).not.toBeNull()
  })

  it("refuses an email held by another Google account", async () => {
    const harness = createHarness()
    await harness.account("dev@example.com")
    const { response } = await harness.googleSignIn({
      sub: "someone-else",
      email: "dev@example.com",
    })
    expect(response.status).toBe(409)
  })

  it("follows a changed Google email", async () => {
    const harness = createHarness()
    await harness.googleSignIn({ sub: "1001", email: "old@example.com" })
    const { response } = await harness.googleSignIn({
      sub: "1001",
      email: "new@example.com",
    })
    const me = await harness.json(response, meResponseSchema)
    expect(me.account.email).toBe("new@example.com")
  })

  it("refuses unverified emails", async () => {
    const harness = createHarness()
    const { response } = await harness.googleSignIn({
      sub: "1001",
      email: "dev@example.com",
      emailVerified: false,
    })
    expect(response.status).toBe(403)
    expect(await harness.store.findAccountByGoogleSub("1001")).toBeNull()
  })

  it("refuses disabled accounts", async () => {
    const harness = createHarness()
    const account = await harness.account("dev@example.com")
    harness.store.disableAccount(account.id, harness.now().toISOString())
    const { response, cookie } = await harness.googleSignIn({
      sub: account.googleSub ?? "",
      email: account.email,
    })
    expect(response.status).toBe(403)
    expect((await harness.request("GET", "/api/me", { cookie })).status).toBe(
      401,
    )
  })

  it("rejects a token without the issued nonce", async () => {
    const harness = createHarness()
    const issued = await harness.googleNonce("sign-in")
    const response = await harness.request("POST", "/api/auth/google", {
      cookie: issued.cookie,
      body: {
        credential: harness.googleToken({
          sub: "1001",
          email: "dev@example.com",
          nonce: "another-nonce",
        }),
      },
    })
    expect(response.status).toBe(401)
    expect(await errorCode(harness, response)).toBe("unauthorized")
  })

  it("rejects a token the verifier does not accept", async () => {
    const harness = createHarness()
    const issued = await harness.googleNonce("sign-in")
    const response = await harness.request("POST", "/api/auth/google", {
      cookie: issued.cookie,
      body: { credential: "not-a-google-token" },
    })
    expect(response.status).toBe(401)
  })

  it("needs the nonce cookie and consumes it once", async () => {
    const harness = createHarness()
    const issued = await harness.googleNonce("sign-in")
    const credential = harness.googleToken({
      sub: "1001",
      email: "dev@example.com",
      nonce: issued.nonce,
    })
    const withoutCookie = await harness.request("POST", "/api/auth/google", {
      body: { credential },
    })
    expect(withoutCookie.status).toBe(400)
    const first = await harness.request("POST", "/api/auth/google", {
      cookie: issued.cookie,
      body: { credential },
    })
    expect(first.status).toBe(200)
    expect(setCookieHeaders(first).join("\n")).toMatch(
      /__Host-mbx_dev_google=; Max-Age=0/,
    )
    const replay = await harness.request("POST", "/api/auth/google", {
      cookie: cookiesFrom(first, issued.cookie),
      body: { credential },
    })
    expect(replay.status).toBe(400)
  })

  it("refuses an expired nonce", async () => {
    const harness = createHarness()
    const issued = await harness.googleNonce("sign-in")
    harness.advance(10 * 60_000 + 1)
    const response = await harness.request("POST", "/api/auth/google", {
      cookie: issued.cookie,
      body: {
        credential: harness.googleToken({
          sub: "1001",
          email: "dev@example.com",
          nonce: issued.nonce,
        }),
      },
    })
    expect(response.status).toBe(400)
  })

  it("refuses a step-up nonce for sign-in", async () => {
    const harness = createHarness()
    const account = await harness.account("dev@example.com")
    const session = await harness.signIn(account)
    const issued = await harness.googleNonce("step-up", session)
    const response = await harness.request("POST", "/api/auth/google", {
      cookie: issued.cookie,
      body: {
        credential: harness.googleToken({
          sub: account.googleSub ?? "",
          email: account.email,
          nonce: issued.nonce,
        }),
      },
    })
    expect(response.status).toBe(400)
  })

  it("accepts an invitation during first sign-in", async () => {
    const harness = createHarness()
    const owner = await harness.account("owner@example.com")
    const organization = await harness.organization(owner)
    const token = "invitation-token-0123456789"
    await harness.store.createInvitation({
      organizationId: organization.id,
      email: "invitee@example.com",
      role: "developer",
      tokenHash: await invitationTokenHash(sessionPepper, token),
      invitedBy: owner.id,
      createdAt: harness.now().toISOString(),
      expiresAt: new Date(
        harness.now().getTime() + 7 * 86_400_000,
      ).toISOString(),
    })
    const { response } = await harness.googleSignIn(
      { sub: "3003", email: "invitee@example.com" },
      { invitationToken: token },
    )
    expect(response.status).toBe(200)
    const me = await harness.json(response, meResponseSchema)
    expect(me.organizations.map((item) => item.id)).toEqual([organization.id])
    expect(me.organizations[0]?.role).toBe("developer")
  })
})

describe("staff domains", () => {
  it("makes Workspace accounts on a staff domain operators", async () => {
    const harness = createHarness()
    for (const [sub, email, domain] of [
      ["4001", "pyke@supernormal.foundation", "supernormal.foundation"],
      ["4002", "ops@thesis.co", "thesis.co"],
    ] as const) {
      const { response } = await harness.googleSignIn({
        sub,
        email,
        hostedDomain: domain,
      })
      expect(response.status).toBe(200)
      const me = await harness.json(response, meResponseSchema)
      expect(me.staffRole).toBe("operator")
    }
    const grants = staffGrants(harness)
    expect(grants).toHaveLength(2)
    expect(grants[0]?.actorType).toBe("system")
  })

  it("audits the grant once across sign-ins", async () => {
    const harness = createHarness()
    const claims = {
      sub: "4001",
      email: "pyke@supernormal.foundation",
      hostedDomain: "supernormal.foundation",
    }
    await harness.googleSignIn(claims)
    await harness.googleSignIn(claims)
    expect(staffGrants(harness)).toHaveLength(1)
  })

  it("upgrades a reviewer on a staff domain to operator", async () => {
    const harness = createHarness()
    const account = await harness.account("rev@thesis.co")
    harness.store.seedStaff(account.id, "reviewer")
    const { response } = await harness.googleSignIn({
      sub: account.googleSub ?? "",
      email: account.email,
      hostedDomain: "thesis.co",
    })
    const me = await harness.json(response, meResponseSchema)
    expect(me.staffRole).toBe("operator")
  })

  it("ignores consumer accounts that use a staff-domain address", async () => {
    const harness = createHarness()
    const { response } = await harness.googleSignIn({
      sub: "5001",
      email: "someone@thesis.co",
      hostedDomain: null,
    })
    const me = await harness.json(response, meResponseSchema)
    expect(me.staffRole).toBeNull()
    expect(staffGrants(harness)).toHaveLength(0)
  })

  it("matches the hosted domain exactly", () => {
    const base = { sub: "1", emailVerified: true, name: null, nonce: null }
    expect(
      isStaffIdentity(
        {
          ...base,
          email: "a@thesis.co.evil.com",
          hostedDomain: "thesis.co.evil.com",
        },
        staffDomains,
      ),
    ).toBe(false)
    expect(
      isStaffIdentity(
        { ...base, email: "a@gmail.com", hostedDomain: "thesis.co" },
        staffDomains,
      ),
    ).toBe(false)
    expect(
      isStaffIdentity(
        {
          ...base,
          email: "a@thesis.co",
          hostedDomain: "thesis.co",
          emailVerified: false,
        },
        staffDomains,
      ),
    ).toBe(false)
    expect(
      isStaffIdentity(
        { ...base, email: "a@thesis.co", hostedDomain: "thesis.co" },
        staffDomains,
      ),
    ).toBe(true)
  })
})

describe("Google step-up", () => {
  it("steps up the session with the signed-in Google account", async () => {
    const harness = createHarness()
    const account = await harness.account("dev@example.com")
    const cookie = await harness.signIn(account)
    const response = await harness.googleStepUp(cookie, account)
    expect(response.status).toBe(200)
    await harness.json(response, stepUpResponseSchema)
    const me = await harness.json(
      await harness.request("GET", "/api/me", { cookie }),
      meResponseSchema,
    )
    expect(me.session.steppedUpUntil).not.toBeNull()
  })

  it("refuses another Google account", async () => {
    const harness = createHarness()
    const account = await harness.account("dev@example.com")
    const cookie = await harness.signIn(account)
    const response = await harness.googleStepUp(cookie, {
      sub: "attacker",
      email: "attacker@example.com",
    })
    expect(response.status).toBe(403)
    const me = await harness.json(
      await harness.request("GET", "/api/me", { cookie }),
      meResponseSchema,
    )
    expect(me.session.steppedUpUntil).toBeNull()
  })

  it("binds the nonce to the session that asked for it", async () => {
    const harness = createHarness()
    const account = await harness.account("dev@example.com")
    const first = await harness.signIn(account)
    const second = await harness.signIn(account)
    const issued = await harness.googleNonce("step-up", first)
    const nonceCookie = issued.cookie
      .split("; ")
      .filter((part) => part.startsWith("__Host-mbx_dev_google="))
      .join("; ")
    const response = await harness.request("POST", "/api/auth/step-up/google", {
      cookie: `${second}; ${nonceCookie}`,
      body: {
        credential: harness.googleToken({
          sub: account.googleSub ?? "",
          email: account.email,
          nonce: issued.nonce,
        }),
      },
    })
    expect(response.status).toBe(400)
  })

  it("refuses a sign-in nonce for step-up", async () => {
    const harness = createHarness()
    const account = await harness.account("dev@example.com")
    const session = await harness.signIn(account)
    const issued = await harness.googleNonce("sign-in", session)
    const response = await harness.request("POST", "/api/auth/step-up/google", {
      cookie: issued.cookie,
      body: {
        credential: harness.googleToken({
          sub: account.googleSub ?? "",
          email: account.email,
          nonce: issued.nonce,
        }),
      },
    })
    expect(response.status).toBe(400)
  })

  it("lasts 10 minutes", async () => {
    const harness = createHarness()
    const account = await harness.account("dev@example.com")
    const cookie = await harness.signIn(account)
    await harness.googleStepUp(cookie, account)
    harness.advance(10 * 60_000 + 1)
    const me = await harness.json(
      await harness.request("GET", "/api/me", { cookie }),
      meResponseSchema,
    )
    expect(me.session.steppedUpUntil).toBeNull()
  })
})

describe("Google claims", () => {
  it("normalizes claims and accepts string booleans", () => {
    expect(
      identityFromClaims({
        sub: "1",
        email: " Dev@Thesis.CO ",
        email_verified: "true",
        hd: "Thesis.co",
        name: " Dev ",
        nonce: "n",
      }),
    ).toEqual({
      sub: "1",
      email: "dev@thesis.co",
      emailVerified: true,
      hostedDomain: "thesis.co",
      name: "Dev",
      nonce: "n",
    })
  })

  it("rejects tokens without the required claims", () => {
    expect(identityFromClaims({ sub: "1" })).toBeNull()
    expect(
      identityFromClaims({ email: "a@b.co", email_verified: true }),
    ).toBeNull()
  })
})

describe("sessions", () => {
  it("signs out and revokes the session", async () => {
    const harness = createHarness()
    const account = await harness.account("dev@example.com")
    const cookie = await harness.signIn(account)
    expect((await harness.request("GET", "/api/me", { cookie })).status).toBe(
      200,
    )
    const out = await harness.request("POST", "/api/auth/sign-out", { cookie })
    expect(out.status).toBe(200)
    expect((await harness.request("GET", "/api/me", { cookie })).status).toBe(
      401,
    )
  })

  it("expires after 12 hours without activity and slides when used", async () => {
    const harness = createHarness()
    const account = await harness.account("dev@example.com")
    const cookie = await harness.signIn(account)
    harness.advance(11 * 3_600_000)
    expect((await harness.request("GET", "/api/me", { cookie })).status).toBe(
      200,
    )
    harness.advance(11 * 3_600_000)
    expect((await harness.request("GET", "/api/me", { cookie })).status).toBe(
      200,
    )
    harness.advance(12 * 3_600_000 + 1)
    expect((await harness.request("GET", "/api/me", { cookie })).status).toBe(
      401,
    )
  })

  it("dev sign-in only exists in memory mode outside production", async () => {
    const disabled = createHarness()
    expect(
      (await disabled.request("POST", "/api/auth/dev-sign-in")).status,
    ).toBe(404)
    const production = createHarness({ devSignIn: true, production: true })
    await production.account("dev@matchbox.local")
    expect(
      (await production.request("POST", "/api/auth/dev-sign-in")).status,
    ).toBe(404)
    const enabled = createHarness({ devSignIn: true })
    await enabled.account("dev@matchbox.local")
    const response = await enabled.request("POST", "/api/auth/dev-sign-in")
    expect(response.status).toBe(200)
    const me = await enabled.json(response, meResponseSchema)
    expect(me.account.email).toBe("dev@matchbox.local")
  })
})

describe("request guards", () => {
  it("rejects cross-origin and origin-less mutations (CSRF)", async () => {
    const harness = createHarness()
    const account = await harness.account("dev@example.com")
    const cookie = await harness.signIn(account)
    const foreign = await harness.request("POST", "/api/orgs", {
      body: { name: "Evil" },
      cookie,
      origin: "https://evil.example",
    })
    expect(foreign.status).toBe(403)
    const missing = await harness.request("POST", "/api/orgs", {
      body: { name: "Evil" },
      cookie,
      origin: null,
    })
    expect(missing.status).toBe(403)
    const allowed = await harness.request("POST", "/api/orgs", {
      body: { name: "Good" },
      cookie,
    })
    expect(allowed.status).toBe(201)
  })

  it("rejects cross-origin Google sign-in", async () => {
    const harness = createHarness()
    const response = await harness.request("POST", "/api/auth/google", {
      body: { credential: "x" },
      origin: "https://evil.example",
    })
    expect(response.status).toBe(403)
  })

  it("returns 503 service_disabled when the flag is off", async () => {
    const harness = createHarness({ consoleEnabled: false })
    const response = await harness.request("GET", "/api/me")
    expect(response.status).toBe(503)
    const body = await harness.json(response, errorBodySchema)
    expect(body.error.code).toBe("service_disabled")
  })

  it("returns 401 for signed-out API calls", async () => {
    const harness = createHarness()
    const response = await harness.request("GET", "/api/orgs")
    expect(response.status).toBe(401)
  })
})
