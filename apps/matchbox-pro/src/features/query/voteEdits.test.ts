import { describe, expect, it } from "vitest"
import { ballotFixture } from "./fixtures"
import { editsFromDraft, sharedAllocation } from "./voteEdits"

const ballots = [ballotFixture("4821"), ballotFixture("4966")]

describe("vote edits", () => {
  it("sums projections across selected locks for the shared vector", () => {
    const rows = sharedAllocation(ballots, null)
    expect(rows.map((row) => [row.name, row.bps, row.projectedMicro])).toEqual([
      ["Stackbridge", 4200, 36_200_000n],
      ["tBTC / WBTC", 3300, 28_100_000n],
      ["Lombard", 2500, 22_100_000n],
    ])
  })

  it("leaves a projection unpriced when any lock's share is unpriced", () => {
    const [first, second] = ballots
    if (!first || !second) throw new Error("fixture")
    const unpriced = {
      ...second,
      allocations: second.allocations.map((allocation) => ({
        ...allocation,
        projectedUsd: null,
      })),
    }
    const rows = sharedAllocation([first, unpriced], null)
    expect(rows.every((row) => row.projectedMicro === null)).toBe(true)
  })

  it("applies one vector to every lock and drops zero rows", () => {
    const edits = editsFromDraft(ballots, new Set(["boost:4821"]), [
      { targetId: "g0", bps: 6000 },
      { targetId: "g1", bps: 4000 },
      { targetId: "g2", bps: 0 },
    ])
    expect(edits.map((edit) => [edit.ballotKey, edit.selected])).toEqual([
      ["boost:4821", true],
      ["boost:4966", false],
    ])
    expect(edits[0]?.allocations).toEqual([
      { targetId: "g0", bps: 6000 },
      { targetId: "g1", bps: 4000 },
    ])
    const rows = sharedAllocation(ballots, edits)
    expect(rows.map((row) => [row.name, row.bps, row.projectedMicro])).toEqual([
      ["Stackbridge", 6000, null],
      ["tBTC / WBTC", 4000, null],
    ])
  })
})
