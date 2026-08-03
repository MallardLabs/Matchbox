import assert from "node:assert/strict"
import test from "node:test"
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

test("allocates the full ballot to a single eligible gauge", () => {
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

  assert.deepEqual(result?.allocations, [
    {
      id: "gauge-a",
      basisPoints: 10_000n,
      voteWeight: 500n,
      projectedRewardMicroUsd: 333_333n,
    },
  ])
})

test("balances identical gauges after accounting for self-dilution", () => {
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

  assert.deepEqual(
    result?.allocations.map(({ id, basisPoints }) => ({ id, basisPoints })),
    [
      { id: "gauge-a", basisPoints: 5_000n },
      { id: "gauge-b", basisPoints: 5_000n },
    ],
  )
})

test("prices an unvoted gauge against one ballot unit of competing weight", () => {
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

  // A vote small enough to be free is also small enough to be diluted away, so
  // the unvoted gauge earns a real slice rather than a single basis point.
  assert.deepEqual(
    result?.allocations.map(({ id, basisPoints }) => ({ id, basisPoints })),
    [
      { id: "crowded", basisPoints: 9_803n },
      { id: "unvoted", basisPoints: 197n },
    ],
  )
  assert.equal(result?.projectedRewardMicroUsd, 14_899_755_010n)
})

test("skips gauges whose incentives cannot outbid their competing weight", () => {
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

  assert.deepEqual(
    result?.allocations.map((allocation) => allocation.id),
    ["rich"],
  )
  assert.equal(result?.evaluatedGaugeCount, 2)
})

test("applies one ballot to every selected voting position", () => {
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

  assert.equal(result?.allocations[0]?.voteWeight, 1_000n)
})

test("spends the whole ballot across a large candidate set", () => {
  const gauges = Array.from({ length: 40 }, (_, index) => ({
    id: `gauge-${index.toString().padStart(2, "0")}`,
    existingWeight: BigInt(index + 1) * 10n ** 20n,
    incentiveValueMicroUsd: BigInt(40 - index) * 1_000_000n,
  }))
  const result = optimizeRewardAllocations({
    gauges,
    votingPowers: [10n ** 21n],
  })

  assert.ok(result)
  assert.equal(totalBasisPoints(result.allocations), 10_000n)
  assert.equal(result.evaluatedGaugeCount, 40)
  // Concentration is the optimum, not a configured cap: a diluting vote stops
  // paying long before the candidate list runs out.
  assert.ok(result.allocations.length < gauges.length)
})

test("beats a naive split proportional to incentive value", () => {
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
  assert.ok(result)

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

  assert.equal(totalBasisPoints(result.allocations), 10_000n)
  assert.ok(result.projectedRewardMicroUsd > naiveReward)
})

test("returns nothing without priced incentives or eligible voting power", () => {
  assert.equal(
    optimizeRewardAllocations({
      gauges: [{ id: "a", existingWeight: 10n, incentiveValueMicroUsd: 0n }],
      votingPowers: [10n],
    }),
    null,
  )
  assert.equal(
    optimizeRewardAllocations({
      gauges: [{ id: "a", existingWeight: 10n, incentiveValueMicroUsd: 10n }],
      votingPowers: [0n],
    }),
    null,
  )
})

test("annualizes projected epoch rewards with integer precision", () => {
  assert.equal(
    calculateAnnualizedReturnBasisPoints({
      epochRewardMicroUsd: 1_000_000n,
      votingPowers: [10n ** 18n],
      assetPriceMicroUsd: 10_000_000n,
    }),
    52_000n,
  )
})

test("keeps sub-dollar principals out of the annualized divisor", () => {
  // The principal here truncates to zero micro-USD, which used to report no
  // return at all instead of a very large one.
  assert.equal(
    calculateAnnualizedReturnBasisPoints({
      epochRewardMicroUsd: 1_000_000n,
      votingPowers: [10n ** 12n],
      assetPriceMicroUsd: 1n,
    }),
    520_000_000_000_000_000n,
  )
})
