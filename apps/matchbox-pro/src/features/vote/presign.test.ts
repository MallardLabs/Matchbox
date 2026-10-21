import { describe, expect, it } from "vitest"
import type { AllocationSnapshot } from "./optimize"
import {
  diffAllocations,
  isMaterialChange,
  projectedChangeBps,
} from "./presign"

const USD = 1_000_000n

function snapshot(
  entries: Array<[string, number, bigint]>,
): AllocationSnapshot {
  return {
    entries: entries.map(([id, bps, usd]) => ({
      id,
      bps,
      projectedMicroUsd: usd * USD,
    })),
    projectedMicroUsd: entries.reduce(
      (total, [, , usd]) => total + usd * USD,
      0n,
    ),
  }
}

describe("pre-sign refresh", () => {
  const was = snapshot([
    ["a", 4_200, 40n],
    ["b", 3_300, 30n],
    ["c", 2_500, 30n],
  ])

  it("flags a one-point move in any target as material", () => {
    const now = snapshot([
      ["a", 4_100, 40n],
      ["b", 3_400, 30n],
      ["c", 2_500, 30n],
    ])
    expect(isMaterialChange(was, now)).toBe(true)
  })

  it("flags a 1% projected change even when shares hold", () => {
    expect(
      isMaterialChange(
        was,
        snapshot([
          ["a", 4_200, 39n],
          ["b", 3_300, 30n],
          ["c", 2_500, 30n],
        ]),
      ),
    ).toBe(true)
  })

  it("treats sub-threshold drift as immaterial", () => {
    const now: AllocationSnapshot = {
      entries: was.entries.map((entry) => ({ ...entry })),
      projectedMicroUsd: was.projectedMicroUsd - 500_000n,
    }
    expect(isMaterialChange(was, now)).toBe(false)
  })

  it("diffs across added and dropped targets", () => {
    const now = snapshot([
      ["a", 6_000, 50n],
      ["d", 4_000, 20n],
    ])
    const rows = diffAllocations(was, now)
    expect(rows.map((row) => row.id)).toEqual(["a", "d", "b", "c"])
    expect(rows.find((row) => row.id === "b")).toEqual({
      id: "b",
      wasBps: 3_300,
      nowBps: 0,
      deltaMicroUsd: -30n * USD,
    })
    expect(projectedChangeBps(was, now)).toBe(-3_000n)
  })
})
