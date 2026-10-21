import { describe, expect, it } from "vitest"
import { ballotTotal } from "./ballot"
import { optimizeBallot, snapshotBallot, toOptimizerTargets } from "./optimize"
import {
  competingWeight,
  projectTarget,
  sumNative,
  voteWeightForBps,
} from "./projection"

const E18 = 10n ** 18n
const USD = 1_000_000n

function gauge(id: string, totalWeight: bigint, incentiveUsd: bigint) {
  return {
    id,
    isAlive: true,
    totalWeight,
    incentiveMicroUsd: incentiveUsd * USD,
    rewards: [
      {
        tokenAddress: "0xmezo",
        symbol: "MEZO",
        decimals: 18,
        amount: incentiveUsd * E18,
        microUsd: incentiveUsd * USD,
      },
    ],
  }
}

describe("projection", () => {
  it("weights each lock like the contract (power * share / total, per lock)", () => {
    expect(voteWeightForBps([3n, 3n], 5_000)).toBe(2n)
    expect(voteWeightForBps([100n * E18], 2_500)).toBe(25n * E18)
  })

  it("never lets own votes push competing weight below zero", () => {
    expect(competingWeight(10n, 4n)).toBe(6n)
    expect(competingWeight(10n, 12n)).toBe(0n)
  })

  it("projects a pro-rata share and keeps native amounts", () => {
    const projection = projectTarget(
      {
        competingWeight: 300n * E18,
        rewards: [
          {
            tokenAddress: "0xmezo",
            symbol: "MEZO",
            decimals: 18,
            amount: 1_000n * E18,
            microUsd: 400n * USD,
          },
          {
            tokenAddress: "0xodd",
            symbol: "ODD",
            decimals: 18,
            amount: 8n * E18,
            microUsd: null,
          },
        ],
      },
      100n * E18,
    )
    expect(projection.microUsd).toBe(100n * USD)
    expect(projection.hasUnpriced).toBe(true)
    expect(projection.native).toEqual([
      expect.objectContaining({ symbol: "MEZO", amount: 250n * E18 }),
      expect.objectContaining({ symbol: "ODD", amount: 2n * E18 }),
    ])
    expect(
      sumNative([projection.native, projection.native]).map((n) => n.amount),
    ).toEqual([500n * E18, 4n * E18])
  })
})

describe("optimizeBallot", () => {
  it("does not count the wallet's own votes as competing weight", () => {
    // Gauge A carries 900 of our own votes; without them it is nearly empty.
    const gauges = [
      gauge("A", 1_000n * E18, 100n),
      gauge("B", 400n * E18, 100n),
    ]
    const power = [1_000n * E18]

    const truth = toOptimizerTargets(gauges, new Map([["a", 900n * E18]]))
    expect(truth.map((target) => target.competingWeight)).toEqual([
      100n * E18,
      400n * E18,
    ])

    const fixed = optimizeBallot(truth, power)
    const naive = optimizeBallot(toOptimizerTargets(gauges, new Map()), power)
    // Closed form on the true competition (100 vs 400): 40% / 60%.
    expect(fixed?.ballot).toEqual([
      { id: "B", bps: 6_000 },
      { id: "A", bps: 4_000 },
    ])
    expect(naive?.ballot).not.toEqual(fixed?.ballot)

    // Scored against what the chain will actually pay, the fixed ballot wins.
    const naiveActual = snapshotBallot(naive?.ballot ?? [], truth, power)
    expect(fixed?.snapshot.projectedMicroUsd).toBeGreaterThan(
      naiveActual.projectedMicroUsd,
    )
  })

  it("returns a whole-percent ballot that sums to exactly 100%", () => {
    const result = optimizeBallot(
      toOptimizerTargets(
        [
          gauge("A", 5_000n * E18, 300n),
          gauge("B", 2_000n * E18, 90n),
          gauge("C", 9_000n * E18, 40n),
        ],
        new Map(),
      ),
      [700n * E18, 1_300n * E18],
    )
    expect(result).not.toBeNull()
    expect(ballotTotal(result?.ballot ?? [])).toBe(10_000)
    for (const entry of result?.ballot ?? []) {
      expect(entry.bps % 100).toBe(0)
    }
  })

  it("caps the ballot at the voter's target limit", () => {
    const many = Array.from({ length: 12 }, (_, index) =>
      gauge(`G${index}`, 1_000n * E18, 100n + BigInt(index)),
    )
    const power = [1_000_000n * E18]
    const uncapped = optimizeBallot(
      toOptimizerTargets(many, new Map()),
      power,
      30,
    )
    expect(uncapped?.ballot.length).toBe(12)
    const capped = optimizeBallot(toOptimizerTargets(many, new Map()), power, 5)
    expect(capped?.ballot.length).toBe(5)
    expect(ballotTotal(capped?.ballot ?? [])).toBe(10_000)
    // The densest (best-funded) gauges are kept.
    expect(capped?.ballot.map((entry) => entry.id).sort()).toEqual([
      "G10",
      "G11",
      "G7",
      "G8",
      "G9",
    ])
  })

  it("skips dead and unincentivised gauges", () => {
    const dead = { ...gauge("D", 10n * E18, 500n), isAlive: false }
    const result = optimizeBallot(
      toOptimizerTargets([dead, gauge("E", 10n * E18, 0n)], new Map()),
      [E18],
    )
    expect(result).toBeNull()
  })

  it("snapshots any ballot against the same targets", () => {
    const targets = toOptimizerTargets(
      [gauge("A", 300n * E18, 400n)],
      new Map(),
    )
    const snapshot = snapshotBallot([{ id: "a", bps: 10_000 }], targets, [
      100n * E18,
    ])
    expect(snapshot.projectedMicroUsd).toBe(100n * USD)
  })
})
