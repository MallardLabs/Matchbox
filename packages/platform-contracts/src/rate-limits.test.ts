import { describe, expect, it } from "vitest"
import {
  endpointClassSchema,
  publishableIpRateLimitPolicy,
  rateLimitPolicies,
  resolveRateLimitPolicy,
} from "./rate-limits"

const now = new Date("2026-09-30T12:00:00.000Z")

describe("rateLimitPolicies", () => {
  it("matches the documented gauge-profile defaults", () => {
    expect(rateLimitPolicies.test["gauge-profiles"]).toEqual({
      perMinute: 60,
      perDay: 5_000,
    })
    expect(rateLimitPolicies.live["gauge-profiles"]).toEqual({
      perMinute: 300,
      perDay: 100_000,
    })
    expect(publishableIpRateLimitPolicy.perMinute).toBe(60)
  })

  it("defines every endpoint class for both kinds", () => {
    for (const kind of ["test", "live"] as const) {
      for (const endpointClass of endpointClassSchema.options) {
        const policy = rateLimitPolicies[kind][endpointClass]
        expect(policy.perMinute).toBeGreaterThan(0)
        expect(policy.perDay).toBeGreaterThanOrEqual(policy.perMinute)
      }
    }
  })
})

describe("resolveRateLimitPolicy", () => {
  const base = {
    environmentKind: "live",
    endpointClass: "gauge-profiles",
    appStatus: "active",
    overrides: [],
    now,
  } as const

  it("uses defaults without overrides", () => {
    expect(resolveRateLimitPolicy(base)).toEqual({
      perMinute: 300,
      perDay: 100_000,
    })
  })

  it("drops restricted apps to development limits", () => {
    expect(
      resolveRateLimitPolicy({ ...base, appStatus: "restricted" }),
    ).toEqual({ perMinute: 60, perDay: 5_000 })
  })

  it("applies unexpired overrides for the same class only", () => {
    const overrides = [
      {
        endpointClass: "userinfo",
        perMinute: 1,
        perDay: 1,
        expiresAt: null,
      },
      {
        endpointClass: "gauge-profiles",
        perMinute: 5,
        perDay: 50,
        expiresAt: "2026-09-30T11:59:59.000Z",
      },
      {
        endpointClass: "gauge-profiles",
        perMinute: 1_000,
        perDay: 1_000_000,
        expiresAt: "2026-10-30T00:00:00.000Z",
      },
    ] as const
    expect(resolveRateLimitPolicy({ ...base, overrides })).toEqual({
      perMinute: 1_000,
      perDay: 1_000_000,
    })
  })
})
