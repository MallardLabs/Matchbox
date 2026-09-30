import { describe, expect, it } from "vitest"
import {
  apiKeyScopesOf,
  claimsForScopes,
  diffScopes,
  enabledOidcScopes,
  formatScopeString,
  normalizeScopes,
  oidcScopesOf,
  parseOidcScopeString,
  platformScopeSchema,
  scopeDefinitions,
  scopeRequiresReview,
  scopesCovered,
} from "./scopes"

describe("scope definitions", () => {
  it("defines every platform scope with terse copy", () => {
    for (const scope of platformScopeSchema.options) {
      const definition = scopeDefinitions[scope]
      expect(definition.scope).toBe(scope)
      expect(definition.label.length).toBeGreaterThan(0)
      expect(definition.label.length).toBeLessThanOrEqual(24)
      expect(definition.consentDescription.length).toBeLessThanOrEqual(48)
      expect(definition.consentDescription.endsWith(".")).toBe(false)
    }
  })

  it("requires review only for discord scopes", () => {
    expect(scopeRequiresReview("discord:id")).toBe(true)
    expect(scopeRequiresReview("discord:profile")).toBe(true)
    expect(scopeRequiresReview("wallet")).toBe(false)
    expect(scopeRequiresReview("gauge-profiles:read")).toBe(false)
  })
})

describe("enabledOidcScopes", () => {
  it("drops discord scopes behind the kill switch", () => {
    expect(enabledOidcScopes({ discordClaimsEnabled: false })).toEqual([
      "openid",
      "wallet",
    ])
    expect(enabledOidcScopes({ discordClaimsEnabled: true })).toEqual([
      "openid",
      "wallet",
      "discord:id",
      "discord:profile",
    ])
  })
})

describe("claimsForScopes", () => {
  it("returns unique claims in canonical order", () => {
    expect(claimsForScopes(["discord:profile", "openid", "wallet"])).toEqual([
      "sub",
      "wallet_address",
      "wallet_network",
      "discord_username",
      "discord_display_name",
      "discord_avatar_url",
    ])
    expect(claimsForScopes(["gauge-profiles:read"])).toEqual([])
  })
})

describe("scope strings", () => {
  it("parses, de-duplicates and orders", () => {
    expect(parseOidcScopeString("wallet  openid wallet")).toEqual({
      ok: true,
      scopes: ["openid", "wallet"],
    })
  })

  it("reports unknown scopes", () => {
    expect(parseOidcScopeString("openid email gauge-profiles:read")).toEqual({
      ok: false,
      unknownScopes: ["email", "gauge-profiles:read"],
    })
  })

  it("formats canonically", () => {
    expect(formatScopeString(["discord:id", "openid", "openid"])).toBe(
      "openid discord:id",
    )
    expect(normalizeScopes([])).toEqual([])
  })
})

describe("diffScopes", () => {
  it("splits added, removed and unchanged", () => {
    expect(
      diffScopes(["openid", "wallet"], ["openid", "discord:id", "openid"]),
    ).toEqual({
      added: ["discord:id"],
      removed: ["wallet"],
      unchanged: ["openid"],
    })
  })

  it("handles empty sets", () => {
    expect(diffScopes([], ["openid"])).toEqual({
      added: ["openid"],
      removed: [],
      unchanged: [],
    })
  })
})

describe("scope helpers", () => {
  it("checks coverage", () => {
    expect(scopesCovered(["openid", "wallet"], ["wallet"])).toBe(true)
    expect(scopesCovered(["openid"], ["openid", "wallet"])).toBe(false)
    expect(scopesCovered([], [])).toBe(true)
  })

  it("splits api key and oidc scopes", () => {
    const mixed = ["wallet", "gauge-profiles:read", "openid"] as const
    expect(apiKeyScopesOf(mixed)).toEqual(["gauge-profiles:read"])
    expect(oidcScopesOf(mixed)).toEqual(["openid", "wallet"])
  })
})
