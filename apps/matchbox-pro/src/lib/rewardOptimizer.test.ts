import { describe, expect, it } from "vitest"
import {
  calculateAnnualizedReturnBasisPoints,
  optimizeRewardAllocations,
} from "./rewardOptimizer"

function totalBasisPoints(
  allocations: readonly { basisPoints: bigint }[],
): bigint {
  return allocations.reduce(
    (total, allocation) => total + allocation.basisPoints,
    0n,
  )
}

describe("optimizeRewardAllocations", () => {
  it("allocates the full ballot to a single eligible gauge", () => {
    const result = optimizeRewardAllocations({
      gauges: [
        {
          id: "gauge-a",
          existingWeight: 1_000n,
          incentiveValueMicroUsd: 1_000_000n,
        },
      ],
      votingPowers: [500n],
    })

    expect(result?.allocations).toEqual([
      {
        id: "gauge-a",
        basisPoints: 10_000n,
        voteWeight: 500n,
        projectedRewardMicroUsd: 333_333n,
      },
    ])
  })

  it("balances identical gauges after accounting for self-dilution", () => {
    const result = optimizeRewardAllocations({
      gauges: [
        {
          id: "gauge-a",
          existingWeight: 1_000_000n,
          incentiveValueMicroUsd: 1_000_000n,
        },
        {
          id: "gauge-b",
          existingWeight: 1_000_000n,
          incentiveValueMicroUsd: 1_000_000n,
        },
      ],
      votingPowers: [1_000_000n],
    })

    expect(
      result?.allocations.map(({ id, basisPoints }) => ({ id, basisPoints })),
    ).toEqual([
      { id: "gauge-a", basisPoints: 5_000n },
      { id: "gauge-b", basisPoints: 5_000n },
    ])
  })

  it("prices an unvoted gauge against one ballot unit of competing weight", () => {
    const result = optimizeRewardAllocations({
      gauges: [
        {
          id: "unvoted",
          existingWeight: 0n,
          incentiveValueMicroUsd: 10_000_000_000n,
        },
        {
          id: "crowded",
          existingWeight: 10n ** 21n,
          incentiveValueMicroUsd: 10_000_000_000n,
        },
      ],
      votingPowers: [10n ** 21n],
    })

    expect(
      result?.allocations.map(({ id, basisPoints }) => ({ id, basisPoints })),
    ).toEqual([
      { id: "crowded", basisPoints: 9_803n },
      { id: "unvoted", basisPoints: 197n },
    ])
    expect(result?.projectedRewardMicroUsd).toBe(14_899_755_010n)
  })

  it("skips gauges whose incentives cannot outbid their competing weight", () => {
    const result = optimizeRewardAllocations({
      gauges: [
        {
          id: "rich",
          existingWeight: 10n ** 20n,
          incentiveValueMicroUsd: 5_000_000_000n,
        },
        {
          id: "thin",
          existingWeight: 10n ** 22n,
          incentiveValueMicroUsd: 1_000n,
        },
      ],
      votingPowers: [10n ** 18n],
    })

    expect(result?.allocations.map((allocation) => allocation.id)).toEqual([
      "rich",
    ])
    expect(result?.evaluatedGaugeCount).toBe(2)
  })

  it("applies one ballot to every selected voting position", () => {
    const result = optimizeRewardAllocations({
      gauges: [
        {
          id: "gauge-a",
          existingWeight: 1_000n,
          incentiveValueMicroUsd: 1_000n,
        },
      ],
      votingPowers: [333n, 667n],
    })

    expect(result?.allocations[0]?.voteWeight).toBe(1_000n)
  })

  it("spends the whole ballot across a large candidate set", () => {
    const gauges = Array.from({ length: 40 }, (_, index) => ({
      id: `gauge-${index.toString().padStart(2, "0")}`,
      existingWeight: BigInt(index + 1) * 10n ** 20n,
      incentiveValueMicroUsd: BigInt(40 - index) * 1_000_000n,
    }))
    const result = optimizeRewardAllocations({
      gauges,
      votingPowers: [10n ** 21n],
    })

    expect(result).toBeTruthy()
    if (!result) return
    expect(totalBasisPoints(result.allocations)).toBe(10_000n)
    expect(result.evaluatedGaugeCount).toBe(40)
    expect(result.allocations.length).toBeLessThan(gauges.length)
  })

  it("beats a naive split proportional to incentive value", () => {
    const gauges = [
      { id: "a", existingWeight: 3_119_000n, incentiveValueMicroUsd: 8n },
      {
        id: "b",
        existingWeight: 2_585_584_000n,
        incentiveValueMicroUsd: 30_327n,
      },
      { id: "c", existingWeight: 65_712_000n, incentiveValueMicroUsd: 2_944n },
      { id: "d", existingWeight: 17_137_000n, incentiveValueMicroUsd: 2n },
      { id: "e", existingWeight: 3_378_000n, incentiveValueMicroUsd: 2_399n },
      { id: "f", existingWeight: 4_766_707_000n, incentiveValueMicroUsd: 104n },
      { id: "g", existingWeight: 460_217_000n, incentiveValueMicroUsd: 44n },
    ]
    const votingPowers = [898_000_000n]
    const result = optimizeRewardAllocations({ gauges, votingPowers })
    expect(result).toBeTruthy()
    if (!result) return

    const totalIncentives = gauges.reduce(
      (total, gauge) => total + gauge.incentiveValueMicroUsd,
      0n,
    )
    const naiveReward = gauges.reduce((total, gauge) => {
      const basisPoints =
        (gauge.incentiveValueMicroUsd * 10_000n) / totalIncentives
      const voteWeight = (898_000_000n * basisPoints) / 10_000n
      if (voteWeight === 0n) return total
      return (
        total +
        (gauge.incentiveValueMicroUsd * voteWeight) /
          (gauge.existingWeight + voteWeight)
      )
    }, 0n)

    expect(totalBasisPoints(result.allocations)).toBe(10_000n)
    expect(result.projectedRewardMicroUsd > naiveReward).toBe(true)
  })

  it("returns nothing without priced incentives or eligible voting power", () => {
    expect(
      optimizeRewardAllocations({
        gauges: [{ id: "a", existingWeight: 10n, incentiveValueMicroUsd: 0n }],
        votingPowers: [10n],
      }),
    ).toBeNull()
    expect(
      optimizeRewardAllocations({
        gauges: [{ id: "a", existingWeight: 10n, incentiveValueMicroUsd: 10n }],
        votingPowers: [0n],
      }),
    ).toBeNull()
  })

  it("annualizes projected epoch rewards with integer precision", () => {
    expect(
      calculateAnnualizedReturnBasisPoints({
        epochRewardMicroUsd: 1_000_000n,
        votingPowers: [10n ** 18n],
        assetPriceMicroUsd: 10_000_000n,
      }),
    ).toBe(52_000n)
  })

  it("keeps sub-dollar principals out of the annualized divisor", () => {
    expect(
      calculateAnnualizedReturnBasisPoints({
        epochRewardMicroUsd: 1_000_000n,
        votingPowers: [10n ** 12n],
        assetPriceMicroUsd: 1n,
      }),
    ).toBe(520_000_000_000_000_000n)
  })
})
