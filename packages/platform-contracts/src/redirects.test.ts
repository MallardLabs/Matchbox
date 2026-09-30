import { describe, expect, it } from "vitest"
import {
  appendRedirectParams,
  originMatches,
  redirectUriMatches,
  validateOrigin,
  validateRedirectUri,
} from "./redirects"

describe("validateRedirectUri", () => {
  it.each([
    ["live", "https://app.example.com/callback"],
    ["live", "https://app.example.com/callback?x=1"],
    ["test", "https://app.example.com/callback"],
    ["test", "http://localhost:5173/callback"],
    ["test", "http://127.0.0.1:8080/cb"],
    ["test", "http://localhost/cb"],
  ] as const)("accepts %s %s", (kind, uri) => {
    expect(validateRedirectUri(uri, kind)).toEqual({ ok: true, value: uri })
  })

  it.each([
    ["live", "http://localhost:5173/callback", "scheme-not-allowed"],
    ["live", "http://app.example.com/callback", "scheme-not-allowed"],
    ["test", "http://example.com/callback", "scheme-not-allowed"],
    ["test", "http://[::1]:3000/cb", "scheme-not-allowed"],
    ["test", "myapp://callback", "scheme-not-allowed"],
    ["test", "javascript:alert(1)", "scheme-not-allowed"],
    ["live", "https://*.example.com/callback", "wildcard-not-allowed"],
    ["live", "https://app.example.com/cb#frag", "fragment-not-allowed"],
    ["live", "https://app.example.com/cb#", "fragment-not-allowed"],
    ["live", "https://user:pw@app.example.com/cb", "credentials-not-allowed"],
    ["live", "not a url", "invalid-url"],
    ["live", `https://example.com/${"a".repeat(2048)}`, "too-long"],
  ] as const)("rejects %s %s", (kind, uri, reason) => {
    const result = validateRedirectUri(uri, kind)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe(reason)
  })

  it("rejects non-canonical input and suggests the canonical form", () => {
    expect(validateRedirectUri("https://Example.com", "live")).toEqual({
      ok: false,
      reason: "not-canonical",
      suggestion: "https://example.com/",
    })
    expect(
      validateRedirectUri("https://example.com:443/cb", "live"),
    ).toMatchObject({
      reason: "not-canonical",
      suggestion: "https://example.com/cb",
    })
  })
})

describe("validateOrigin", () => {
  it("accepts bare origins", () => {
    expect(validateOrigin("https://app.example.com", "live").ok).toBe(true)
    expect(validateOrigin("http://localhost:3000", "test").ok).toBe(true)
    expect(validateOrigin("http://127.0.0.1:3000", "test").ok).toBe(true)
  })

  it("rejects paths, slashes and bad schemes", () => {
    expect(validateOrigin("https://app.example.com/", "live")).toMatchObject({
      ok: false,
      reason: "not-canonical",
      suggestion: "https://app.example.com",
    })
    expect(validateOrigin("https://app.example.com/x", "live")).toMatchObject({
      reason: "path-not-allowed",
    })
    expect(validateOrigin("https://app.example.com?x", "live")).toMatchObject({
      reason: "path-not-allowed",
    })
    expect(validateOrigin("http://localhost:3000", "live")).toMatchObject({
      reason: "scheme-not-allowed",
    })
    expect(validateOrigin("https://*.example.com", "live")).toMatchObject({
      reason: "wildcard-not-allowed",
    })
  })
})

describe("matching", () => {
  const registered = ["https://app.example.com/callback"]

  it("uses exact string comparison", () => {
    expect(
      redirectUriMatches(registered, "https://app.example.com/callback"),
    ).toBe(true)
    for (const candidate of [
      "https://app.example.com/callback/",
      "https://app.example.com/callback?x=1",
      "https://APP.example.com/callback",
      "https://app.example.com/Callback",
      "https://app.example.com:443/callback",
    ]) {
      expect(redirectUriMatches(registered, candidate)).toBe(false)
    }
  })

  it("matches origins exactly", () => {
    expect(originMatches(["https://a.example"], "https://a.example")).toBe(true)
    expect(originMatches(["https://a.example"], "https://a.example/")).toBe(
      false,
    )
    expect(originMatches(["https://a.example"], null)).toBe(false)
  })

  it("appends OAuth params", () => {
    expect(
      appendRedirectParams("https://a.example/cb?keep=1", {
        code: "c",
        state: "s t",
      }),
    ).toBe("https://a.example/cb?keep=1&code=c&state=s+t")
  })
})
