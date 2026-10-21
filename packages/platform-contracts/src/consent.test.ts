import { describe, expect, it } from "vitest"
import {
  grantCoversRequest,
  mergeGrantScopes,
  pickGrantedClaims,
  resolveConsentDecision,
} from "./consent"
import {
  scopeMayBeOptional,
  scopeRequirement,
  validateOptionalScopes,
} from "./scopes"

describe("optional scope metadata", () => {
  it("keeps openid and API key scopes required", () => {
    expect(scopeMayBeOptional("openid")).toBe(false)
    expect(scopeMayBeOptional("gauge-profiles:read")).toBe(false)
    expect(scopeMayBeOptional("wallet")).toBe(true)
    expect(scopeMayBeOptional("discord:profile")).toBe(true)
    expect(scopeRequirement("openid", ["openid"])).toBe("required")
    expect(scopeRequirement("discord:id", ["discord:id"])).toBe("optional")
    expect(scopeRequirement("discord:id", [])).toBe("required")
  })

  it("validates an environment's optional subset", () => {
    expect(
      validateOptionalScopes({
        requested: ["openid", "wallet", "discord:id"],
        optional: ["discord:id"],
      }),
    ).toEqual([])
    expect(
      validateOptionalScopes({
        requested: ["openid", "wallet"],
        optional: ["openid", "discord:profile"],
      }),
    ).toEqual([
      { scope: "openid", reason: "always-required" },
      { scope: "discord:profile", reason: "not-requested" },
    ])
  })
})

describe("resolveConsentDecision", () => {
  const requested = [
    "openid",
    "wallet",
    "discord:id",
    "discord:profile",
  ] as const
  const optionalScopes = ["discord:id", "discord:profile"] as const

  it("grants everything when nothing is declined", () => {
    expect(
      resolveConsentDecision({
        requested,
        optionalScopes,
        unavailable: [],
        declined: [],
      }),
    ).toEqual({ ok: true, granted: [...requested], declined: [], skipped: [] })
  })

  it("drops declined optional scopes and skips unavailable ones", () => {
    expect(
      resolveConsentDecision({
        requested,
        optionalScopes,
        unavailable: ["discord:id"],
        declined: ["discord:profile", "discord:id"],
      }),
    ).toEqual({
      ok: true,
      granted: ["openid", "wallet"],
      declined: ["discord:profile"],
      skipped: ["discord:id"],
    })
  })

  it("ignores declined scopes that were not requested", () => {
    const result = resolveConsentDecision({
      requested: ["openid", "wallet"],
      optionalScopes: ["wallet"],
      unavailable: [],
      declined: ["discord:id"],
    })
    expect(result).toEqual({
      ok: true,
      granted: ["openid", "wallet"],
      declined: [],
      skipped: [],
    })
  })

  it("refuses a declined or unavailable required scope", () => {
    expect(
      resolveConsentDecision({
        requested,
        optionalScopes: ["discord:profile"],
        unavailable: ["discord:id"],
        declined: [],
      }),
    ).toEqual({
      ok: false,
      reason: "required-scope-unavailable",
      scopes: ["discord:id"],
    })
    expect(
      resolveConsentDecision({
        requested,
        optionalScopes,
        unavailable: [],
        declined: ["wallet"],
      }),
    ).toEqual({
      ok: false,
      reason: "required-scope-declined",
      scopes: ["wallet"],
    })
  })
})

describe("mergeGrantScopes", () => {
  it("lets a new decision switch an optional scope off", () => {
    expect(
      mergeGrantScopes({
        existing: {
          scopes: ["openid", "wallet", "discord:profile"],
          declinedScopes: [],
        },
        requested: ["openid", "wallet", "discord:profile"],
        granted: ["openid", "wallet"],
        declined: ["discord:profile"],
      }),
    ).toEqual({
      scopes: ["openid", "wallet"],
      declinedScopes: ["discord:profile"],
    })
  })

  it("keeps scopes outside the request and skipped scopes as they were", () => {
    expect(
      mergeGrantScopes({
        existing: {
          scopes: ["openid", "wallet"],
          declinedScopes: ["discord:id"],
        },
        requested: ["openid", "discord:id", "discord:profile"],
        granted: ["openid", "discord:profile"],
        declined: [],
      }),
    ).toEqual({
      scopes: ["openid", "wallet", "discord:profile"],
      declinedScopes: ["discord:id"],
    })
  })

  it("re-granting a declined scope clears the decline", () => {
    expect(
      mergeGrantScopes({
        existing: { scopes: ["openid"], declinedScopes: ["wallet"] },
        requested: ["openid", "wallet"],
        granted: ["openid", "wallet"],
        declined: [],
      }),
    ).toEqual({ scopes: ["openid", "wallet"], declinedScopes: [] })
  })
})

describe("grantCoversRequest", () => {
  const grant = {
    scopes: ["openid", "wallet"] as const,
    declinedScopes: ["discord:profile"] as const,
    scopeVersion: 3,
  }

  it("covers decided optional scopes at the same version", () => {
    expect(
      grantCoversRequest({
        grant: {
          scopes: [...grant.scopes],
          declinedScopes: [...grant.declinedScopes],
          scopeVersion: 3,
        },
        scopeVersion: 3,
        requested: ["openid", "wallet", "discord:profile"],
        optionalScopes: ["discord:profile"],
      }),
    ).toBe(true)
  })

  it("asks again after a scope version bump or for undecided scopes", () => {
    const base = {
      grant: {
        scopes: [...grant.scopes],
        declinedScopes: [...grant.declinedScopes],
        scopeVersion: 3,
      },
      optionalScopes: ["discord:profile", "discord:id"] as const,
    }
    expect(
      grantCoversRequest({
        ...base,
        optionalScopes: [...base.optionalScopes],
        scopeVersion: 4,
        requested: ["openid"],
      }),
    ).toBe(false)
    expect(
      grantCoversRequest({
        ...base,
        optionalScopes: [...base.optionalScopes],
        scopeVersion: 3,
        requested: ["openid", "discord:id"],
      }),
    ).toBe(false)
    expect(
      grantCoversRequest({
        ...base,
        optionalScopes: [...base.optionalScopes],
        scopeVersion: 3,
        requested: ["openid", "discord:id"],
        unavailable: ["discord:id"],
      }),
    ).toBe(true)
  })

  it("never treats a declined required scope as covered", () => {
    expect(
      grantCoversRequest({
        grant: {
          scopes: ["openid"],
          declinedScopes: ["discord:profile"],
          scopeVersion: 1,
        },
        scopeVersion: 1,
        requested: ["openid", "discord:profile"],
        optionalScopes: [],
      }),
    ).toBe(false)
  })
})

describe("pickGrantedClaims", () => {
  it("keeps only claims released by the granted scopes", () => {
    const claims = {
      wallet_address: "0x3d41000000000000000000000000000000009dc3",
      wallet_network: "mezo",
      discord_id: "914862054377218049",
      discord_username: "mezo_alex",
      discord_display_name: "Alex",
      discord_avatar_url: null,
    }
    expect(pickGrantedClaims(claims, ["openid", "discord:id"])).toEqual({
      discord_id: "914862054377218049",
    })
    expect(pickGrantedClaims(claims, ["openid", "wallet"])).toEqual({
      wallet_address: "0x3d41000000000000000000000000000000009dc3",
      wallet_network: "mezo",
    })
    expect(claims.discord_username).toBe("mezo_alex")
  })
})
