import { describe, expect, it } from "vitest"
import {
  apiKeyDisplayPrefix,
  bearerToken,
  clientIdSchema,
  clientSecretDisplayPrefix,
  formatApiKey,
  formatClientId,
  formatClientSecret,
  pairwiseSubjectSchema,
  parseApiKey,
  parseClientId,
  parseClientSecret,
} from "./credentials"

const prefix = "Ab12Cd34Ef56"
const secret = `${"A".repeat(20)}-_${"z".repeat(21)}`

describe("API keys", () => {
  it("formats and parses round-trip", () => {
    const key = formatApiKey({
      kind: "secret",
      environmentKind: "live",
      prefix,
      secret,
    })
    expect(key).toBe(`mbx_sk_live_${prefix}_${secret}`)
    expect(parseApiKey(key)).toEqual({
      kind: "secret",
      environmentKind: "live",
      prefix,
      secret,
    })
    expect(parseApiKey(`mbx_pk_test_${prefix}_${secret}`)?.kind).toBe(
      "publishable",
    )
  })

  it("rejects malformed keys", () => {
    for (const value of [
      "",
      `mbx_xk_test_${prefix}_${secret}`,
      `mbx_pk_prod_${prefix}_${secret}`,
      `mbx_pk_test_${prefix.slice(1)}_${secret}`,
      `mbx_pk_test_${prefix}_${secret}x`,
      `mbx_pk_test_${prefix}_${secret.slice(1)}`,
      `mbx_pk_test_Ab12Cd34Ef5-_${secret}`,
      ` mbx_pk_test_${prefix}_${secret}`,
    ]) {
      expect(parseApiKey(value)).toBeNull()
    }
  })

  it("refuses to format invalid parts", () => {
    expect(() =>
      formatApiKey({
        kind: "secret",
        environmentKind: "test",
        prefix: "short",
        secret,
      }),
    ).toThrow()
  })

  it("builds display prefixes", () => {
    expect(
      apiKeyDisplayPrefix({
        kind: "publishable",
        environmentKind: "test",
        prefix,
      }),
    ).toBe(`mbx_pk_test_${prefix}`)
  })
})

describe("bearerToken", () => {
  it("extracts bearer credentials", () => {
    expect(bearerToken("Bearer abc")).toBe("abc")
    expect(bearerToken("bearer   abc ")).toBe("abc")
    expect(bearerToken("Basic abc")).toBeNull()
    expect(bearerToken("Bearer a b")).toBeNull()
    expect(bearerToken(null)).toBeNull()
  })
})

describe("client ids", () => {
  it("formats and parses", () => {
    const id = formatClientId("test", "a".repeat(24))
    expect(id).toBe(`mbx_test_${"a".repeat(24)}`)
    expect(parseClientId(id)).toEqual({ environmentKind: "test" })
    expect(clientIdSchema.safeParse(id).success).toBe(true)
    expect(parseClientId(`mbx_live_${"a".repeat(23)}`)).toBeNull()
    expect(() => formatClientId("live", "bad")).toThrow()
  })
})

describe("client secrets", () => {
  it("formats and parses", () => {
    const value = formatClientSecret({ prefix, secret })
    expect(value).toBe(`mbx_cs_${prefix}_${secret}`)
    expect(parseClientSecret(value)).toEqual({ prefix, secret })
    expect(parseClientSecret(`mbx_cs_${prefix}`)).toBeNull()
    expect(clientSecretDisplayPrefix(prefix)).toBe(`mbx_cs_${prefix}`)
  })
})

describe("pairwise subjects", () => {
  it("validates the mbx_ format", () => {
    expect(
      pairwiseSubjectSchema.safeParse(`mbx_${"x".repeat(32)}`).success,
    ).toBe(true)
    expect(
      pairwiseSubjectSchema.safeParse(`mbx_${"x".repeat(31)}`).success,
    ).toBe(false)
  })
})
