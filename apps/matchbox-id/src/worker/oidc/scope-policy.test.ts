import { describe, expect, it } from "vitest"
import {
  grantedForRequest,
  parseRequestedScopes,
  requiredScopesOf,
} from "./scope-policy"

const optional = ["discord:id", "discord:profile"] as const

describe("parseRequestedScopes", () => {
  it("ignores unknown values, duplicates and extra spaces", () => {
    expect(
      parseRequestedScopes("email  wallet openid wallet profile discord:id"),
    ).toEqual(["openid", "wallet", "discord:id"])
    expect(parseRequestedScopes("email")).toEqual([])
  })
})

describe("requiredScopesOf", () => {
  it("keeps openid required even when listed as optional", () => {
    expect(
      requiredScopesOf(
        ["openid", "wallet", "discord:id"],
        ["openid", "wallet", "discord:id"],
      ),
    ).toEqual(["openid"])
    expect(
      requiredScopesOf(["openid", "wallet", "discord:id"], optional),
    ).toEqual(["openid", "wallet"])
  })
})

describe("grantedForRequest", () => {
  it("releases only granted, available, requested scopes", () => {
    expect(
      grantedForRequest({
        grant: { scopes: ["openid", "wallet", "discord:id"] },
        requested: ["openid", "discord:id", "discord:profile"],
        unavailable: ["discord:id"],
      }),
    ).toEqual(["openid"])
  })
})
