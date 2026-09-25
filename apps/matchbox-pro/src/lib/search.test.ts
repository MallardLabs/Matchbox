import { describe, expect, it } from "vitest"
import {
  type SearchHit,
  activateSearchHit,
  filterSearchHits,
  isStuartQuestion,
  rankSearchHits,
} from "./search"

const gauge = (id: string, label: string): SearchHit => ({
  id,
  group: "Gauges",
  label,
  to: `/gauges/${id}`,
})

const catalog: SearchHit[] = [
  { id: "connect", group: "Actions", label: "Connect wallet" },
  { id: "overview", group: "Go to", label: "Overview", to: "/" },
  { id: "vote", group: "Go to", label: "Vote", to: "/vote" },
  { ...gauge("0xabc", "Stackbridge"), detail: "#221" },
  gauge("0xdef", "tBTC / WBTC"),
  gauge("0x123", "Acre"),
  gauge("0x456", "Lombard"),
]

describe("search", () => {
  it("returns the full catalog when the query is empty", () => {
    expect(filterSearchHits("", catalog)).toEqual(catalog)
  })

  it("matches gauge name and token id", () => {
    expect(filterSearchHits("stack", catalog).map((hit) => hit.id)).toEqual([
      "0xabc",
    ])
    expect(filterSearchHits("#221", catalog).map((hit) => hit.id)).toEqual([
      "0xabc",
    ])
  })

  it("surfaces pages and gauges named inside a question", () => {
    expect(
      filterSearchHits("why is stackbridge apy down", catalog).map(
        (hit) => hit.id,
      ),
    ).toEqual(["0xabc"])
  })

  it("orders hits by group and caps idle gauges at three", () => {
    expect(rankSearchHits("", catalog).map((hit) => hit.id)).toEqual([
      "overview",
      "vote",
      "0xabc",
      "0xdef",
      "0x123",
      "connect",
    ])
  })

  it("detects natural-language questions", () => {
    expect(isStuartQuestion("why is stackbridge apy down")).toBe(true)
    expect(isStuartQuestion("apy?")).toBe(true)
    expect(isStuartQuestion("stackbridge")).toBe(false)
    expect(isStuartQuestion("tBTC / WBTC")).toBe(false)
  })

  it("activates navigation and connect from the shipped catalog", () => {
    const vote = catalog.find((hit) => hit.id === "vote")
    const connect = catalog.find((hit) => hit.id === "connect")
    if (!vote || !connect) throw new Error("catalog missing fixtures")
    expect(activateSearchHit(vote)).toEqual({ to: "/vote" })
    expect(activateSearchHit(connect)).toEqual({ action: "connect" })
  })
})
