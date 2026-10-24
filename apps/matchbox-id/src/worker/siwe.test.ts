import { describe, expect, it } from "vitest"
import { z } from "zod"
import {
  url,
  apiHeaders,
  createHarness,
  devAccount,
  otherAccount,
  sessionCookieFrom,
  siweMessage,
  verifySiwe,
} from "./test-harness"

const errorSchema = z.object({
  error: z.object({ code: z.string(), message: z.string() }),
})

async function errorMessage(response: Response): Promise<string> {
  return errorSchema.parse(await response.json()).error.message
}

describe("SIWE sign-in", () => {
  it("signs in and sets a Lax __Host- session cookie", async () => {
    const harness = await createHarness()
    const message = await siweMessage(harness, devAccount)
    const response = await verifySiwe(harness, message, devAccount)
    expect(response.status).toBe(200)
    const cookie = response.headers.get("Set-Cookie") ?? ""
    expect(cookie).toMatch(/^__Host-mbx_id=/)
    expect(cookie).toContain("HttpOnly")
    expect(cookie).toContain("Secure")
    expect(cookie).toContain("SameSite=Lax")
    const session = await harness.app.request(url("/api/session"), {
      headers: { Cookie: sessionCookieFrom(response) },
    })
    expect(await session.json()).toMatchObject({
      account: {
        walletAddress: devAccount.address.toLowerCase(),
        signedInNetwork: "mezo",
        discord: { id: "100000000000000001", username: "matchbox-dev" },
      },
    })
    expect(
      harness.store.admin
        .auditEvents()
        .some((event) => event.action === "wallet-signed-in"),
    ).toBe(true)
  })

  it("rejects a foreign domain", async () => {
    const harness = await createHarness()
    const message = await siweMessage(harness, devAccount, {
      domain: "evil.example",
    })
    const response = await verifySiwe(harness, message, devAccount)
    expect(response.status).toBe(401)
    expect(await errorMessage(response)).toContain("domain-mismatch")
    expect(harness.verifySpy.calls).toBe(0)
  })

  it("rejects a foreign URI", async () => {
    const harness = await createHarness()
    const message = await siweMessage(harness, devAccount, {
      uri: "https://evil.example/login",
    })
    const response = await verifySiwe(harness, message, devAccount)
    expect(await errorMessage(response)).toContain("uri-mismatch")
  })

  it("rejects chains other than Mezo", async () => {
    const harness = await createHarness()
    const message = await siweMessage(harness, devAccount, { chainId: 1 })
    const response = await verifySiwe(harness, message, devAccount)
    expect(await errorMessage(response)).toContain("unsupported-chain")
  })

  it("rejects unknown nonces and replays", async () => {
    const harness = await createHarness()
    const forged = await siweMessage(harness, devAccount, {
      nonce: "abcdefgh12345678",
    })
    const unknown = await verifySiwe(harness, forged, devAccount)
    expect(await errorMessage(unknown)).toContain("nonce")

    const message = await siweMessage(harness, devAccount)
    expect((await verifySiwe(harness, message, devAccount)).status).toBe(200)
    const replay = await verifySiwe(harness, message, devAccount)
    expect(replay.status).toBe(401)
    expect(await errorMessage(replay)).toContain("nonce")
  })

  it("rejects stale messages and long expirations", async () => {
    const harness = await createHarness()
    const stale = await siweMessage(harness, devAccount, {
      issuedAt: new Date(harness.clock.now.getTime() - 11 * 60_000),
    })
    expect(
      await errorMessage(await verifySiwe(harness, stale, devAccount)),
    ).toContain("stale")

    const longLived = await siweMessage(harness, devAccount, {
      expirationTime: new Date(harness.clock.now.getTime() + 60 * 60_000),
    })
    expect(
      await errorMessage(await verifySiwe(harness, longLived, devAccount)),
    ).toContain("expiry-invalid")

    const message = await siweMessage(harness, devAccount)
    harness.clock.advance(11 * 60_000)
    expect((await verifySiwe(harness, message, devAccount)).status).toBe(401)
  })

  it("rejects a signature from another wallet", async () => {
    const harness = await createHarness()
    const message = await siweMessage(harness, devAccount)
    const signature = await otherAccount.signMessage({ message })
    const response = await harness.app.request(url("/api/siwe/verify"), {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({ message, signature }),
    })
    expect(response.status).toBe(401)
    expect(await errorMessage(response)).toContain("signature")
  })

  it("ends the previous session when switching wallets", async () => {
    const harness = await createHarness()
    const first = sessionCookieFrom(
      await verifySiwe(
        harness,
        await siweMessage(harness, devAccount),
        devAccount,
      ),
    )
    const switched = await verifySiwe(
      harness,
      await siweMessage(harness, otherAccount),
      otherAccount,
      first,
    )
    expect(switched.status).toBe(200)
    const old = await harness.app.request(url("/api/session"), {
      headers: { Cookie: first },
    })
    expect(await old.json()).toEqual({ account: null })
  })

  it("rate limits nonce requests per IP prefix", async () => {
    const harness = await createHarness()
    let last: Response | null = null
    for (let index = 0; index < 21; index++) {
      last = await harness.app.request(url("/api/siwe/nonce"), {
        method: "POST",
        headers: { ...apiHeaders(), "CF-Connecting-IP": "203.0.113.7" },
      })
    }
    expect(last?.status).toBe(429)
    expect(last?.headers.get("Retry-After")).not.toBeNull()
  })
})
