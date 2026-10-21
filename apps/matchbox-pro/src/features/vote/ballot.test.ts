import { describe, expect, it } from "vitest"
import {
  FULL_BALLOT_BPS,
  addToBallot,
  ballotFromAllocations,
  ballotTotal,
  formatBps,
  isBallotComplete,
  largestRemainder,
  removeFromBallot,
  stepEntry,
} from "./ballot"

describe("ballot", () => {
  it("gives the first entry the whole ballot and later ones the remainder", () => {
    const one = addToBallot([], "a")
    expect(one).toEqual([{ id: "a", bps: FULL_BALLOT_BPS }])
    const two = addToBallot(one, "b")
    expect(two).toEqual([
      { id: "a", bps: 10_000 },
      { id: "b", bps: 0 },
    ])
    expect(isBallotComplete(two)).toBe(true)
  })

  it("takes the unallocated share when one is free", () => {
    const ballot = addToBallot([{ id: "a", bps: 6_000 }], "b")
    expect(ballot.at(-1)).toEqual({ id: "b", bps: 4_000 })
  })

  it("is complete only at exactly 100% (integer basis points, no float drift)", () => {
    const thirds = [
      { id: "a", bps: 3_334 },
      { id: "b", bps: 3_333 },
      { id: "c", bps: 3_333 },
    ]
    expect(ballotTotal(thirds)).toBe(10_000)
    expect(isBallotComplete(thirds)).toBe(true)
    expect(isBallotComplete(thirds.slice(1))).toBe(false)
    expect(isBallotComplete([{ id: "a", bps: 0 }])).toBe(false)
  })

  it("steps to the next 5% mark and clamps to 0-100%", () => {
    const ballot = [{ id: "a", bps: 3_700 }]
    expect(stepEntry(ballot, "a", 1)).toEqual([{ id: "a", bps: 4_000 }])
    expect(stepEntry(ballot, "a", -1)).toEqual([{ id: "a", bps: 3_500 }])
    expect(stepEntry([{ id: "a", bps: 0 }], "a", -1)).toEqual([
      { id: "a", bps: 0 },
    ])
    expect(stepEntry([{ id: "a", bps: 10_000 }], "a", 1)).toEqual([
      { id: "a", bps: 10_000 },
    ])
  })

  it("matches ids case-insensitively", () => {
    const ballot = addToBallot([], "0xAbC")
    expect(addToBallot(ballot, "0xabc")).toBe(ballot)
    expect(removeFromBallot(ballot, "0xABC")).toEqual([])
  })

  it("splits with largest remainder so parts always sum to the total", () => {
    expect(largestRemainder([1n, 1n, 1n], 10_000, 100)).toEqual([
      3_400, 3_300, 3_300,
    ])
    expect(largestRemainder([0n, 0n], 10_000, 100)).toEqual([0, 0])
  })

  it("rounds optimizer output to whole percents summing to 100%", () => {
    const ballot = ballotFromAllocations([
      { id: "a", basisPoints: 4_537n },
      { id: "b", basisPoints: 3_449n },
      { id: "c", basisPoints: 1_974n },
      { id: "d", basisPoints: 40n },
    ])
    expect(ballot).toEqual([
      { id: "a", bps: 4_500 },
      { id: "b", bps: 3_500 },
      { id: "c", bps: 2_000 },
    ])
    expect(ballotTotal(ballot)).toBe(10_000)
  })

  it("formats basis points without trailing zeros", () => {
    expect(formatBps(4_500)).toBe("45%")
    expect(formatBps(4_550)).toBe("45.5%")
    expect(formatBps(4_537)).toBe("45.37%")
    expect(formatBps(5)).toBe("0.05%")
  })
})
