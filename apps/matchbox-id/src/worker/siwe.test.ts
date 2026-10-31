import { describe, expect, it } from "vitest"
import { z } from "zod"
import { signInMessage } from "../shared/siwe-message"
import { checkSiweMessage } from "./siwe"
import {
  url,
  type Harness,
  apiHeaders,
  createHarness,
  devAccount,
  host,
  origin,
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

const nonceSchema = z.object({ nonce: z.string() })

async function nonceFrom(harness: Harness, ip: string): Promise<string> {
  const response = await harness.app.request(url("/api/siwe/nonce"), {
    method: "POST",
    headers: { ...apiHeaders(), "CF-Connecting-IP": ip },
  })
  return nonceSchema.parse(await response.json()).nonce
}

async function verifyFrom(
  harness: Harness,
  ip: string,
  message: string,
  signature: string,
): Promise<Response> {
  return await harness.app.request(url("/api/siwe/verify"), {
    method: "POST",
    headers: { ...apiHeaders(), "CF-Connecting-IP": ip },
    body: JSON.stringify({ message, signature }),
  })
}

/** A sign-in message for `address` that its owner never signed. */
function messageFor(
  harness: Harness,
  address: `0x${string}`,
  nonce: string,
): string {
  return signInMessage({
    host,
    origin,
    address,
    chainId: 31612,
    nonce,
    issuedAt: harness.clock.now,
  })
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

  it("accepts the SPA's message on both networks", () => {
    const now = new Date("2026-09-30T12:00:00.000Z")
    for (const chainId of [31612, 31611]) {
      const message = signInMessage({
        host,
        origin,
        address: devAccount.address,
        chainId,
        nonce: "abcdefgh12345678",
        issuedAt: now,
      })
      expect(checkSiweMessage(message, { host, origin, now })).toMatchObject({
        ok: true,
        chainId,
      })
    }
  })

  // ID-07: wallets skip their SIWE domain warning for text that is not
  // EIP-4361, so only the SPA's canonical form may sign in.
  it("rejects messages that are not the canonical EIP-4361 form", async () => {
    const variants: Array<[string, (message: string) => string, string]> = [
      [
        "trailing text",
        (message) => `${message}\n\nReward claim ref #48213.`,
        "non-canonical",
      ],
      [
        "a line before URI",
        (message) =>
          message.replace("\nURI:", "\nThis does not move funds.\nURI:"),
        "non-canonical",
      ],
      [
        "a foreign statement",
        (message) =>
          message.replace("Sign in to Matchbox ID.", "Claim your rewards."),
        "non-canonical",
      ],
      [
        "a lowercase address",
        (message) =>
          message.replace(
            otherAccount.address,
            otherAccount.address.toLowerCase(),
          ),
        "non-canonical",
      ],
      ["a scheme", (message) => `https://${message}`, "non-canonical"],
      [
        "resources",
        (message) => `${message}\nResources:\n- https://evil.example`,
        "non-canonical",
      ],
      [
        "a non-ISO date",
        (message) => message.replace(/(Issued At: \S+)\.000Z/, "$1Z"),
        "non-canonical",
      ],
      [
        "an unparseable Issued At",
        (message) => message.replace(/Issued At: \S+/, "Issued At: today"),
        "malformed",
      ],
      [
        "an unparseable Expiration Time",
        (message) =>
          message.replace(/Expiration Time: \S+/, "Expiration Time: never"),
        "malformed",
      ],
    ]
    const harness = await createHarness()
    for (const [name, mutate, reason] of variants) {
      const message = mutate(await siweMessage(harness, otherAccount))
      const response = await verifySiwe(harness, message, otherAccount)
      expect({ name, status: response.status }).toEqual({ name, status: 401 })
      expect(await errorMessage(response)).toContain(reason)
    }
    expect(harness.verifySpy.calls).toBe(0)
    expect(harness.store.admin.sessions()).toHaveLength(0)
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

  // ID-01: the per-wallet bucket used to be charged before the nonce and
  // signature checks, so anyone could lock a wallet out for the UTC day.
  it("never charges a wallet's bucket for failed sign-ins", async () => {
    const harness = await createHarness()
    const victim = devAccount.address
    // 500 messages naming the victim with never-issued nonces and a junk
    // signature, 20 a minute from two prefixes (the old daily cap).
    for (let index = 0; index < 500; index++) {
      if (index > 0 && index % 20 === 0) harness.clock.advance(60_000)
      const response = await verifyFrom(
        harness,
        index % 2 === 0 ? "198.51.100.7" : "192.0.2.7",
        messageFor(harness, victim, `forged${String(index).padStart(8, "0")}`),
        "0x00",
      )
      expect(response.status).toBe(401)
    }
    // 21 within one minute (over the per-minute cap) with real nonces and
    // another wallet's signature.
    for (let index = 0; index < 21; index++) {
      const ip = `203.0.${113 + (index % 3)}.9`
      const message = messageFor(harness, victim, await nonceFrom(harness, ip))
      const response = await verifyFrom(
        harness,
        ip,
        message,
        await otherAccount.signMessage({ message }),
      )
      expect(await errorMessage(response)).toContain("signature")
    }
    const genuine = await verifySiwe(
      harness,
      await siweMessage(harness, devAccount),
      devAccount,
    )
    expect(genuine.status).toBe(200)
  })

  it("rate limits verified sign-ins per wallet", async () => {
    const harness = await createHarness()
    const statuses: number[] = []
    for (let index = 0; index < 21; index++) {
      const ip = `198.51.${index}.7`
      const message = messageFor(
        harness,
        devAccount.address,
        await nonceFrom(harness, ip),
      )
      const response = await verifyFrom(
        harness,
        ip,
        message,
        await devAccount.signMessage({ message }),
      )
      statuses.push(response.status)
    }
    expect(statuses.slice(0, 20).every((status) => status === 200)).toBe(true)
    expect(statuses[20]).toBe(429)
  })
})
