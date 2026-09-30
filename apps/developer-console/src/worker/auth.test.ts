import {
  emailChallengeResponseSchema,
  meResponseSchema,
  passkeyAuthenticationOptionsResponseSchema,
  passkeyRegistrationOptionsResponseSchema,
  stepUpResponseSchema,
} from "@repo/platform-contracts/console"
import { errorBodySchema } from "@repo/platform-contracts/errors"
import {
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { emailCodeHash } from "./auth/email-codes"
import {
  cookiesFrom,
  createHarness,
  lastCode,
  sessionPepper,
  setCookieHeaders,
} from "./test/harness"

vi.mock("@simplewebauthn/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@simplewebauthn/server")>()
  return {
    ...actual,
    verifyRegistrationResponse: vi.fn(),
    verifyAuthenticationResponse: vi.fn(),
  }
})

const registrationCredential = {
  id: "Y3JlZGVudGlhbC0x",
  rawId: "Y3JlZGVudGlhbC0x",
  type: "public-key",
  response: {
    clientDataJSON: "e30",
    attestationObject: "o2NmbXRkbm9uZQ",
    transports: ["internal", "hybrid"],
  },
  clientExtensionResults: {},
} as const

const authenticationCredential = {
  id: "Y3JlZGVudGlhbC0x",
  rawId: "Y3JlZGVudGlhbC0x",
  type: "public-key",
  response: {
    clientDataJSON: "e30",
    authenticatorData: "AAAA",
    signature: "c2lnbmF0dXJl",
  },
  clientExtensionResults: {},
} as const

function mockRegistration(verified: boolean) {
  vi.mocked(verifyRegistrationResponse).mockResolvedValue(
    verified
      ? {
          verified: true,
          registrationInfo: {
            fmt: "none",
            aaguid: "00000000-0000-0000-0000-000000000000",
            credential: {
              id: "Y3JlZGVudGlhbC0x",
              publicKey: new Uint8Array([1, 2, 3, 4]),
              counter: 0,
              transports: ["internal", "hybrid"],
            },
            credentialType: "public-key",
            attestationObject: new Uint8Array([0]),
            userVerified: true,
            credentialDeviceType: "multiDevice",
            credentialBackedUp: true,
            origin: "https://developer.matchbox.markets",
            rpID: "developer.matchbox.markets",
          },
        }
      : { verified: false },
  )
}

function mockAuthentication(verified: boolean, newCounter = 1) {
  vi.mocked(verifyAuthenticationResponse).mockResolvedValue({
    verified,
    authenticationInfo: {
      credentialID: "Y3JlZGVudGlhbC0x",
      newCounter,
      userVerified: true,
      credentialDeviceType: "multiDevice",
      credentialBackedUp: true,
      origin: "https://developer.matchbox.markets",
      rpID: "developer.matchbox.markets",
    },
  })
}

beforeEach(() => {
  vi.mocked(verifyRegistrationResponse).mockReset()
  vi.mocked(verifyAuthenticationResponse).mockReset()
})

/** Runs sign-up start + verify, returning the cookie jar and challenge. */
async function signUpToPasskey(
  harness: ReturnType<typeof createHarness>,
  email = "new@example.com",
) {
  const start = await harness.request("POST", "/api/auth/sign-up/start", {
    body: { email, displayName: "New Dev" },
  })
  expect(start.status).toBe(200)
  const { challengeId } = await harness.json(
    start,
    emailChallengeResponseSchema,
  )
  let cookie = cookiesFrom(start)
  const code = lastCode(harness.email, email)
  expect(code).not.toBeNull()
  const verify = await harness.request("POST", "/api/auth/sign-up/verify", {
    body: { challengeId, code },
    cookie,
  })
  expect(verify.status).toBe(200)
  cookie = cookiesFrom(verify, cookie)
  const registration = await harness.json(
    verify,
    passkeyRegistrationOptionsResponseSchema,
  )
  return { cookie, registration }
}

describe("sign-up email codes", () => {
  it("stores only an HMAC of the code and consumes it once", async () => {
    const harness = createHarness()
    const response = await harness.request("POST", "/api/auth/sign-up/start", {
      body: { email: "Dev@Example.com", displayName: "Dev" },
    })
    expect(response.status).toBe(200)
    const { challengeId } = await harness.json(
      response,
      emailChallengeResponseSchema,
    )
    const code = lastCode(harness.email, "dev@example.com")
    expect(code).toMatch(/^[0-9]{6}$/)
    const [challenge] = harness.store.emailChallenges()
    expect(challenge?.codeHash).toBe(
      await emailCodeHash(sessionPepper, challengeId, code ?? ""),
    )
    expect(JSON.stringify(challenge)).not.toContain(`"${code}"`)

    const cookie = cookiesFrom(response)
    const first = await harness.request("POST", "/api/auth/sign-up/verify", {
      body: { challengeId, code },
      cookie,
    })
    expect(first.status).toBe(200)
    const second = await harness.request("POST", "/api/auth/sign-up/verify", {
      body: { challengeId, code },
      cookie,
    })
    expect(second.status).toBe(400)
    const account = await harness.store.findAccountByEmail("dev@example.com")
    expect(account?.emailVerifiedAt).not.toBeNull()
    expect(account?.displayName).toBe("Dev")
  })

  it("locks the challenge after five wrong attempts", async () => {
    const harness = createHarness()
    const response = await harness.request("POST", "/api/auth/sign-up/start", {
      body: { email: "dev@example.com", displayName: "Dev" },
    })
    const { challengeId } = await harness.json(
      response,
      emailChallengeResponseSchema,
    )
    const code = lastCode(harness.email, "dev@example.com") ?? ""
    const wrong = code === "000000" ? "111111" : "000000"
    for (let attempt = 0; attempt < 5; attempt++) {
      const failed = await harness.request("POST", "/api/auth/sign-up/verify", {
        body: { challengeId, code: wrong },
      })
      expect(failed.status).toBe(400)
    }
    const locked = await harness.request("POST", "/api/auth/sign-up/verify", {
      body: { challengeId, code },
    })
    expect(locked.status).toBe(400)
    const body = await harness.json(locked, errorBodySchema)
    expect(body.error.message).toBe("Invalid or expired code.")
  })

  it("rejects expired codes", async () => {
    const harness = createHarness()
    const response = await harness.request("POST", "/api/auth/sign-up/start", {
      body: { email: "dev@example.com", displayName: "Dev" },
    })
    const { challengeId } = await harness.json(
      response,
      emailChallengeResponseSchema,
    )
    const code = lastCode(harness.email, "dev@example.com")
    harness.advance(15 * 60_000 + 1)
    const verify = await harness.request("POST", "/api/auth/sign-up/verify", {
      body: { challengeId, code },
    })
    expect(verify.status).toBe(400)
  })

  it("answers identically whether or not the email exists", async () => {
    const harness = createHarness()
    const existing = await harness.account("taken@example.com")
    await harness.store.createPasskey({
      accountId: existing.id,
      credentialId: "ZXhpc3Rpbmc",
      publicKey: "AQID",
      counter: 0,
      transports: [],
      deviceType: "single-device",
      backedUp: false,
      name: null,
      lastUsedAt: null,
    })
    for (const path of [
      "/api/auth/sign-up/start",
      "/api/auth/recovery/start",
    ]) {
      const known = await harness.request("POST", path, {
        body: { email: "taken@example.com", displayName: "Someone" },
      })
      const unknown = await harness.request("POST", path, {
        body: { email: "nobody@example.com", displayName: "Someone" },
      })
      expect(known.status).toBe(200)
      expect(unknown.status).toBe(200)
      const knownBody = await harness.json(known, emailChallengeResponseSchema)
      const unknownBody = await harness.json(
        unknown,
        emailChallengeResponseSchema,
      )
      expect(Object.keys(knownBody)).toEqual(Object.keys(unknownBody))
      expect(knownBody.expiresAt).toBe(unknownBody.expiresAt)
    }
    // A registered address never receives a sign-up code.
    const signUpMail = harness.email.sent.filter(
      (message) => message.to === "taken@example.com",
    )
    expect(signUpMail[0]?.text).not.toMatch(/\b[0-9]{6}\b/)
    // Recovery for an unknown address sends nothing.
    expect(
      harness.email.sent.filter(
        (message) =>
          message.to === "nobody@example.com" &&
          message.subject.includes("recovery"),
      ),
    ).toHaveLength(0)
  })

  it("rate limits code sends per email", async () => {
    const harness = createHarness()
    const statuses: number[] = []
    for (let attempt = 0; attempt < 3; attempt++) {
      const response = await harness.request(
        "POST",
        "/api/auth/sign-up/start",
        { body: { email: "dev@example.com", displayName: "Dev" } },
      )
      statuses.push(response.status)
    }
    expect(statuses).toEqual([200, 200, 429])
  })
})

describe("passkey registration and sign-in", () => {
  it("completes sign-up: passkey, first organization, session", async () => {
    const harness = createHarness()
    const { cookie, registration } = await signUpToPasskey(harness)
    expect(registration.options.authenticatorSelection?.residentKey).toBe(
      "required",
    )
    expect(registration.options.authenticatorSelection?.userVerification).toBe(
      "preferred",
    )
    mockRegistration(true)
    const response = await harness.request(
      "POST",
      "/api/auth/passkeys/register",
      {
        body: {
          challengeId: registration.challengeId,
          credential: registrationCredential,
          organizationName: "New Co",
        },
        cookie,
      },
    )
    expect(response.status).toBe(200)
    const me = await harness.json(response, meResponseSchema)
    expect(me.account.email).toBe("new@example.com")
    expect(me.organizations).toEqual([
      expect.objectContaining({ name: "New Co", role: "owner" }),
    ])
    expect(me.session.steppedUpUntil).not.toBeNull()
    const sessionCookie = cookiesFrom(response)
    expect(sessionCookie).toMatch(/__Host-mbx_dev=/)
    const setCookie = setCookieHeaders(response).join("\n")
    expect(setCookie).toMatch(/HttpOnly/)
    expect(setCookie).toMatch(/SameSite=Strict/)
    expect(setCookie).toMatch(/Secure/)

    const session = harness.store.sessions()[0]
    expect(session?.tokenHash).toMatch(/^[0-9a-f]{64}$/)
    expect(sessionCookie).not.toContain(session?.tokenHash ?? "missing")

    const actions = harness.store.auditEvents().map((event) => event.action)
    expect(actions).toEqual(
      expect.arrayContaining([
        "developer-account-created",
        "passkey-registered",
        "organization-created",
        "developer-signed-in",
      ]),
    )

    // The challenge is single use.
    const replay = await harness.request(
      "POST",
      "/api/auth/passkeys/register",
      {
        body: {
          challengeId: registration.challengeId,
          credential: registrationCredential,
        },
        cookie,
      },
    )
    expect(replay.status).toBe(400)
  })

  it("refuses registration without the verified-email cookie", async () => {
    const harness = createHarness()
    const { registration } = await signUpToPasskey(harness)
    mockRegistration(true)
    const response = await harness.request(
      "POST",
      "/api/auth/passkeys/register",
      {
        body: {
          challengeId: registration.challengeId,
          credential: registrationCredential,
        },
      },
    )
    expect(response.status).toBe(401)
    expect(verifyRegistrationResponse).not.toHaveBeenCalled()
  })

  it("rejects an attestation that does not verify", async () => {
    const harness = createHarness()
    const { cookie, registration } = await signUpToPasskey(harness)
    mockRegistration(false)
    const response = await harness.request(
      "POST",
      "/api/auth/passkeys/register",
      {
        body: {
          challengeId: registration.challengeId,
          credential: registrationCredential,
        },
        cookie,
      },
    )
    expect(response.status).toBe(400)
    expect(
      await harness.store.listPasskeys(
        (await harness.store.findAccountByEmail("new@example.com"))?.id ?? "",
      ),
    ).toHaveLength(0)
  })

  it("signs in with a discoverable passkey and updates the counter", async () => {
    const harness = createHarness()
    const account = await harness.account("dev@example.com")
    const passkey = await harness.store.createPasskey({
      accountId: account.id,
      credentialId: "Y3JlZGVudGlhbC0x",
      publicKey: "AQIDBA",
      counter: 3,
      transports: ["internal"],
      deviceType: "multi-device",
      backedUp: true,
      name: "Laptop",
      lastUsedAt: null,
    })
    const optionsResponse = await harness.request(
      "POST",
      "/api/auth/passkeys/authenticate/options",
    )
    const options = await harness.json(
      optionsResponse,
      passkeyAuthenticationOptionsResponseSchema,
    )
    expect(options.options.allowCredentials ?? []).toHaveLength(0)
    mockAuthentication(true, 7)
    const response = await harness.request(
      "POST",
      "/api/auth/passkeys/authenticate",
      {
        body: {
          challengeId: options.challengeId,
          credential: authenticationCredential,
        },
      },
    )
    expect(response.status).toBe(200)
    const me = await harness.json(response, meResponseSchema)
    expect(me.account.id).toBe(account.id)
    const [updated] = await harness.store.listPasskeys(account.id)
    expect(updated?.id).toBe(passkey.id)
    expect(updated?.counter).toBe(7)
    const call = vi.mocked(verifyAuthenticationResponse).mock.calls[0]?.[0]
    expect(call?.expectedRPID).toBe("developer.matchbox.markets")
    expect(call?.expectedOrigin).toBe("https://developer.matchbox.markets")
    expect(call?.credential.counter).toBe(3)
  })

  it("rejects a failed assertion without creating a session", async () => {
    const harness = createHarness()
    const account = await harness.account("dev@example.com")
    await harness.store.createPasskey({
      accountId: account.id,
      credentialId: "Y3JlZGVudGlhbC0x",
      publicKey: "AQIDBA",
      counter: 0,
      transports: [],
      deviceType: "single-device",
      backedUp: false,
      name: null,
      lastUsedAt: null,
    })
    const options = await harness.json(
      await harness.request("POST", "/api/auth/passkeys/authenticate/options"),
      passkeyAuthenticationOptionsResponseSchema,
    )
    mockAuthentication(false)
    const response = await harness.request(
      "POST",
      "/api/auth/passkeys/authenticate",
      {
        body: {
          challengeId: options.challengeId,
          credential: authenticationCredential,
        },
      },
    )
    expect(response.status).toBe(401)
    expect(harness.store.sessions()).toHaveLength(0)
  })

  it("recovers access by registering a new passkey", async () => {
    const harness = createHarness()
    const account = await harness.account("dev@example.com")
    await harness.store.createPasskey({
      accountId: account.id,
      credentialId: "b2xkLWtleQ",
      publicKey: "AQIDBA",
      counter: 0,
      transports: [],
      deviceType: "single-device",
      backedUp: false,
      name: "Old",
      lastUsedAt: null,
    })
    const start = await harness.request("POST", "/api/auth/recovery/start", {
      body: { email: "dev@example.com" },
    })
    const { challengeId } = await harness.json(
      start,
      emailChallengeResponseSchema,
    )
    let cookie = cookiesFrom(start)
    const verify = await harness.request("POST", "/api/auth/recovery/verify", {
      body: { challengeId, code: lastCode(harness.email, "dev@example.com") },
      cookie,
    })
    expect(verify.status).toBe(200)
    cookie = cookiesFrom(verify, cookie)
    const registration = await harness.json(
      verify,
      passkeyRegistrationOptionsResponseSchema,
    )
    expect(registration.options.excludeCredentials?.[0]?.id).toBe("b2xkLWtleQ")
    mockRegistration(true)
    const response = await harness.request(
      "POST",
      "/api/auth/passkeys/register",
      {
        body: {
          challengeId: registration.challengeId,
          credential: registrationCredential,
        },
        cookie,
      },
    )
    expect(response.status).toBe(200)
    expect(await harness.store.listPasskeys(account.id)).toHaveLength(2)
    expect(await harness.store.listOrganizationsForAccount(account.id)).toEqual(
      [],
    )
    expect(harness.store.auditEvents().map((event) => event.action)).toContain(
      "developer-recovery-completed",
    )
  })

  it("steps up the session with a passkey assertion", async () => {
    const harness = createHarness()
    const account = await harness.account("dev@example.com")
    await harness.store.createPasskey({
      accountId: account.id,
      credentialId: "Y3JlZGVudGlhbC0x",
      publicKey: "AQIDBA",
      counter: 0,
      transports: ["internal"],
      deviceType: "single-device",
      backedUp: false,
      name: null,
      lastUsedAt: null,
    })
    const cookie = await harness.signIn(account)
    const options = await harness.json(
      await harness.request("POST", "/api/auth/step-up/options", { cookie }),
      passkeyAuthenticationOptionsResponseSchema,
    )
    expect(options.options.allowCredentials?.[0]?.id).toBe("Y3JlZGVudGlhbC0x")
    mockAuthentication(true)
    const response = await harness.request("POST", "/api/auth/step-up/verify", {
      body: {
        challengeId: options.challengeId,
        credential: authenticationCredential,
      },
      cookie,
    })
    expect(response.status).toBe(200)
    const body = await harness.json(response, stepUpResponseSchema)
    expect(Date.parse(body.steppedUpUntil)).toBe(
      harness.now().getTime() + 10 * 60_000,
    )
    const me = await harness.json(
      await harness.request("GET", "/api/me", { cookie }),
      meResponseSchema,
    )
    expect(me.session.steppedUpUntil).toBe(body.steppedUpUntil)
  })

  it("does not step up with another account's passkey", async () => {
    const harness = createHarness()
    const account = await harness.account("dev@example.com")
    const other = await harness.account("other@example.com")
    await harness.store.createPasskey({
      accountId: account.id,
      credentialId: "b3duLWtleQ",
      publicKey: "AQIDBA",
      counter: 0,
      transports: [],
      deviceType: "single-device",
      backedUp: false,
      name: null,
      lastUsedAt: null,
    })
    await harness.store.createPasskey({
      accountId: other.id,
      credentialId: "Y3JlZGVudGlhbC0x",
      publicKey: "AQIDBA",
      counter: 0,
      transports: [],
      deviceType: "single-device",
      backedUp: false,
      name: null,
      lastUsedAt: null,
    })
    const cookie = await harness.signIn(account)
    const options = await harness.json(
      await harness.request("POST", "/api/auth/step-up/options", { cookie }),
      passkeyAuthenticationOptionsResponseSchema,
    )
    mockAuthentication(true)
    const response = await harness.request("POST", "/api/auth/step-up/verify", {
      body: {
        challengeId: options.challengeId,
        credential: authenticationCredential,
      },
      cookie,
    })
    expect(response.status).toBe(401)
    expect(verifyAuthenticationResponse).not.toHaveBeenCalled()
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
