import { describe, expect, it } from "vitest"
import { parseRewardsSearch } from "../rewards/rewardsSearch"
import { compactActivitySearch, parseActivitySearch } from "./activitySearch"

describe("activity search params", () => {
  it("keeps valid choices and drops defaults", () => {
    expect(
      parseActivitySearch({
        scope: "protocol",
        kind: "votes",
        range: "all",
        size: 100,
      }),
    ).toEqual({ scope: "protocol", kind: "votes", range: "all", size: 100 })
    expect(
      parseActivitySearch({ kind: "all", range: "last-8", size: 50 }),
    ).toEqual({})
  })

  it("tolerates bad or stringly params", () => {
    expect(
      parseActivitySearch({ scope: "mine", kind: 7, range: "", size: "100" }),
    ).toEqual({ size: 100 })
    expect(parseActivitySearch({ size: "12" })).toEqual({})
    expect(parseActivitySearch({})).toEqual({})
  })

  it("compacts a merged update", () => {
    expect(
      compactActivitySearch({ scope: "wallet", kind: "all", range: "epoch" }),
    ).toEqual({ scope: "wallet", range: "epoch" })
  })
})

describe("rewards search params", () => {
  it("keeps a non-default period and ignores junk", () => {
    expect(parseRewardsSearch({ period: "lifetime" })).toEqual({
      period: "lifetime",
    })
    expect(parseRewardsSearch({ period: "last-8" })).toEqual({})
    expect(parseRewardsSearch({ period: "forever" })).toEqual({})
  })
})
