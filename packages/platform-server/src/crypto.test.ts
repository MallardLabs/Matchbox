import {
  parseApiKey,
  parseClientId,
  parseClientSecret,
} from "@repo/platform-contracts/credentials"
import { describe, expect, it } from "vitest"
import {
  base64UrlDecode,
  base64UrlEncode,
  generateApiKey,
  generateClientId,
  generateClientSecret,
  generateEmailCode,
  generatePairwiseSubject,
  generateRequestId,
  generateSiweNonce,
  hmacHex,
  randomBase62,
  randomDigits,
  randomToken,
  sha256Base64Url,
  sha256Hex,
  timingSafeEqualHex,
  timingSafeEqualString,
  verifyPkceS256,
} from "./crypto"

const pepper = "test-pepper-0123456789"

describe("random helpers", () => {
  it("produces base64url tokens of the right length", () => {
    expect(randomToken()).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(randomToken(24)).toMatch(/^[A-Za-z0-9_-]{32}$/)
    expect(randomToken()).not.toBe(randomToken())
  })

  it("produces base62 and digit strings", () => {
    expect(randomBase62(12)).toMatch(/^[0-9A-Za-z]{12}$/)
    expect(randomBase62(100)).toHaveLength(100)
    expect(randomDigits(6)).toMatch(/^[0-9]{6}$/)
  })

  it("covers the whole base62 alphabet", () => {
    const seen = new Set(randomBase62(5_000))
    expect(seen.size).toBe(62)
  })
})

describe("hmacHex", () => {
  it("is deterministic and pepper-dependent", async () => {
    const digest = await hmacHex(pepper, "value")
    expect(digest).toMatch(/^[0-9a-f]{64}$/)
    expect(await hmacHex(pepper, "value")).toBe(digest)
    expect(await hmacHex(`${pepper}x`, "value")).not.toBe(digest)
  })

  it("matches a known answer computed with node:crypto", async () => {
    expect(await hmacHex(pepper, "mbx_sk")).toBe(
      "382b29caf346dcb57b1c540998a705bdd63273493356fbf85789d9ded958b9cf",
    )
  })

  it("rejects short peppers", async () => {
    await expect(hmacHex("short", "value")).rejects.toThrow()
  })
})

describe("sha256", () => {
  it("hashes to hex and base64url", async () => {
    expect(await sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    )
    expect(await sha256Base64Url("abc")).toBe(
      "ungWv48Bz-pBQUDeXa4iI7ADYaOWF3qctBD_YfIAFa0",
    )
  })
})

describe("PKCE", () => {
  it("verifies the RFC 7636 appendix B example", async () => {
    const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"
    const challenge = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
    expect(await verifyPkceS256(verifier, challenge)).toBe(true)
    expect(await verifyPkceS256(`${verifier}x`, challenge)).toBe(false)
  })
})

describe("timing-safe comparisons", () => {
  it("compares hex digests", () => {
    expect(timingSafeEqualHex("abcdef", "ABCDEF")).toBe(true)
    expect(timingSafeEqualHex("abcdef", "abcdee")).toBe(false)
    expect(timingSafeEqualHex("abcdef", "abcde")).toBe(false)
    expect(timingSafeEqualHex("", "")).toBe(false)
    expect(timingSafeEqualHex("zz", "zz")).toBe(false)
  })

  it("compares arbitrary strings", () => {
    expect(timingSafeEqualString("héllo", "héllo")).toBe(true)
    expect(timingSafeEqualString("hello", "hellp")).toBe(false)
    expect(timingSafeEqualString("hello", "hell")).toBe(false)
  })
})

describe("base64url re-exports", () => {
  it("round-trips", () => {
    const bytes = new Uint8Array([1, 2, 3, 255])
    expect(base64UrlDecode(base64UrlEncode(bytes))).toEqual(bytes)
  })
})

describe("credential generation", () => {
  it("generates parseable API keys", () => {
    const key = generateApiKey("publishable", "test")
    const parsed = parseApiKey(key.value)
    expect(parsed).toMatchObject({
      kind: "publishable",
      environmentKind: "test",
      prefix: key.prefix,
    })
    expect(key.displayPrefix).toBe(`mbx_pk_test_${key.prefix}`)
    expect(key.value.startsWith(key.displayPrefix)).toBe(true)
  })

  it("generates client ids and secrets", () => {
    expect(parseClientId(generateClientId("live"))).toEqual({
      environmentKind: "live",
    })
    const secret = generateClientSecret()
    expect(parseClientSecret(secret.value)?.prefix).toBe(secret.prefix)
    expect(secret.displayPrefix).toBe(`mbx_cs_${secret.prefix}`)
  })

  it("generates identifiers in the documented formats", () => {
    expect(generatePairwiseSubject()).toMatch(/^mbx_[A-Za-z0-9_-]{32}$/)
    expect(generateSiweNonce()).toMatch(/^[0-9A-Za-z]{24}$/)
    expect(generateEmailCode()).toMatch(/^[0-9]{6}$/)
    expect(generateRequestId()).toMatch(/^req_[0-9A-Za-z]{24}$/)
  })
})
