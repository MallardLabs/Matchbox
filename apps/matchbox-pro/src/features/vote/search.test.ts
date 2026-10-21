import { getAddress } from "viem"
import { describe, expect, it } from "vitest"
import {
  DEFAULT_VIEW,
  parseStoredSearch,
  parseVoteSearch,
  searchFromView,
  viewFromSearch,
} from "./search"

describe("vote search params", () => {
  it("parses valid params and drops bad ones instead of failing", () => {
    expect(
      parseVoteSearch({
        type: "pools",
        optimize: 1,
        q: "  btc ",
        status: "watching",
        boost: "true",
        sort: "incentives",
        density: "compact",
        page: "3",
      }),
    ).toEqual({
      type: "pools",
      optimize: true,
      q: "btc",
      status: "watching",
      boost: true,
      sort: "incentives",
      density: "compact",
      page: 3,
    })
    expect(
      parseVoteSearch({ type: "gauges", sort: 7, page: -2, optimize: "yes" }),
    ).toEqual({})
  })

  it("checksums the add-to-ballot address and rejects junk", () => {
    const lower = "0x449b06b9b6c9b649b610105d1a5e337e1d6d3d1e"
    expect(parseVoteSearch({ add: lower })).toEqual({ add: getAddress(lower) })
    expect(parseVoteSearch({ add: "0x123" })).toEqual({})
  })

  it("round-trips a view, leaving defaults out of the URL", () => {
    expect(searchFromView(DEFAULT_VIEW)).toEqual({})
    const view = {
      ...DEFAULT_VIEW,
      type: "validators" as const,
      query: "chorus",
      page: 2,
    }
    const search = searchFromView(view)
    expect(search).toEqual({ type: "validators", q: "chorus", page: 3 })
    expect(viewFromSearch(search)).toEqual(view)
  })
})

describe("stored search", () => {
  it("reads saved filters and ignores anything unreadable", () => {
    expect(parseStoredSearch('{"type":"pools","q":"btc"}')).toEqual({
      type: "pools",
      q: "btc",
    })
    expect(parseStoredSearch("{not json")).toEqual({})
    expect(parseStoredSearch("[1,2]")).toEqual({})
    expect(parseStoredSearch("null")).toEqual({})
    expect(parseStoredSearch(null)).toEqual({})
  })
})
