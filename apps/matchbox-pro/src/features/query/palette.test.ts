import { describe, expect, it } from "vitest"
import {
  type PaletteItem,
  defaultActiveIndex,
  isStuartQuestion,
  questionText,
  rankPalette,
  stepActive,
  stuartRows,
} from "./palette"

const gauge = (id: string, label: string, detail?: string): PaletteItem => ({
  id,
  group: "Gauges",
  label,
  detail,
  icon: "gauge",
  to: `/gauges/${id}`,
})

const catalog: PaletteItem[] = [
  {
    id: "overview",
    group: "Go to",
    label: "Overview",
    icon: "overview",
    to: "/",
  },
  { id: "vote", group: "Go to", label: "Vote", icon: "vote", to: "/vote" },
  gauge("0xabc", "Stackbridge", "#221"),
  gauge("0xdef", "tBTC / WBTC", "#305"),
  gauge("0x123", "Acre", "#188"),
  gauge("0x456", "Lombard", "#418"),
  {
    id: "lock-1",
    group: "Locks",
    label: "#4821 · veMEZO",
    icon: "lock",
    to: "/",
  },
  {
    id: "connect",
    group: "Actions",
    label: "Connect wallet",
    icon: "connect",
    action: "connect",
  },
]

const suggestions = [
  "Why did Stackbridge APY change?",
  "What should I vote this epoch?",
  "How healthy is my mUSD trove?",
]

function ids(rows: readonly PaletteItem[]): string[] {
  return rows.map((row) => row.id)
}

describe("palette", () => {
  it("orders idle results by group and caps gauges and Stuart rows", () => {
    const ask = stuartRows({ query: "", suggestions })
    const rows = rankPalette("", catalog, ask)
    expect(rows.map((row) => row.group)).toEqual([
      "Go to",
      "Go to",
      "Gauges",
      "Gauges",
      "Gauges",
      "Locks",
      "Actions",
      "Ask Stuart",
      "Ask Stuart",
    ])
    expect(ask.map((row) => row.label)).toEqual(suggestions.slice(0, 2))
  })

  it("matches gauge names, token ids and lock ids", () => {
    expect(ids(rankPalette("stack", catalog, []))).toEqual(["0xabc"])
    expect(ids(rankPalette("#221", catalog, []))).toEqual(["0xabc"])
    expect(ids(rankPalette("4821", catalog, []))).toEqual(["lock-1"])
  })

  it("keeps the gauges a question names and lands on the Stuart row", () => {
    const query = "why is stackbridge apy down"
    const ask = stuartRows({ query, suggestions })
    const rows = rankPalette(query, catalog, ask)
    expect(ids(rows.filter((row) => row.group === "Gauges"))).toEqual(["0xabc"])
    expect(ask[0]?.label).toBe("Why is stackbridge apy down?")
    expect(ask[1]?.label).toBe("Why did Stackbridge APY change?")
    expect(rows[defaultActiveIndex(rows, query)]?.group).toBe("Ask Stuart")
  })

  it("uses the matching suggestion's wording for an exact match", () => {
    const ask = stuartRows({
      query: "what should i vote this epoch",
      suggestions,
    })
    expect(ask[0]?.question).toBe("What should I vote this epoch?")
  })

  it("lands on the first hit for a lookup", () => {
    const rows = rankPalette("lombard", catalog, [])
    expect(rows[defaultActiveIndex(rows, "lombard")]?.id).toBe("0x456")
  })

  it("skips disabled rows with the keyboard", () => {
    const ask = stuartRows({ query: "", suggestions }).map((row) => ({
      ...row,
      disabled: true,
    }))
    const rows = [...rankPalette("", catalog.slice(0, 2), []), ...ask]
    expect(stepActive(rows, 1, 1)).toBe(0)
    expect(stepActive(rows, 0, -1)).toBe(1)
    const question = "what should i vote this epoch?"
    expect(rows[defaultActiveIndex(rows, question)]?.disabled).not.toBe(true)
  })

  it("detects natural-language questions", () => {
    expect(isStuartQuestion("why is stackbridge apy down")).toBe(true)
    expect(isStuartQuestion("apy?")).toBe(true)
    expect(isStuartQuestion("stackbridge")).toBe(false)
    expect(isStuartQuestion("tBTC / WBTC")).toBe(false)
  })

  it("turns a typed question into a sentence", () => {
    expect(questionText("  why is   stackbridge apy down ")).toBe(
      "Why is stackbridge apy down?",
    )
    expect(questionText("stackbridge")).toBe("Stackbridge")
    expect(questionText("what now!")).toBe("What now!")
  })
})
