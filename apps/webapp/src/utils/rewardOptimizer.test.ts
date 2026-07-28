import assert from "node:assert/strict"
import test from "node:test"
import {
  calculateAnnualizedReturnBasisPoints,
  optimizeRewardAllocations,
} from "./rewardOptimizer"

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
    result?.allocations.map(({ id, basisPoints }) => ({
      id,
      basisPoints,
    })),
    [
      { id: "gauge-a", basisPoints: 5_000n },
      { id: "gauge-b", basisPoints: 5_000n },
    ],
  )
})

test("uses the minimum ballot unit to capture a zero-weight incentive pool", () => {
  const result = optimizeRewardAllocations({
    gauges: [
      {
        id: "first-voter",
        existingWeight: 0n,
        incentiveValueMicroUsd: 100_000_000n,
      },
      {
        id: "competitive",
        existingWeight: 10_000n,
        incentiveValueMicroUsd: 100_000_000n,
      },
    ],
    votingPowers: [10_000n],
  })

  assert.deepEqual(
    result?.allocations.map(({ id, basisPoints }) => ({
      id,
      basisPoints,
    })),
    [
      { id: "competitive", basisPoints: 9_999n },
      { id: "first-voter", basisPoints: 1n },
    ],
  )
  assert.equal(result?.projectedRewardMicroUsd, 149_997_499n)
})

test("honors the configured gauge cap", () => {
  const result = optimizeRewardAllocations({
    gauges: [
      {
        id: "gauge-a",
        existingWeight: 100n,
        incentiveValueMicroUsd: 500n,
      },
      {
        id: "gauge-b",
        existingWeight: 100n,
        incentiveValueMicroUsd: 400n,
      },
    ],
    votingPowers: [100n],
    maxGaugeCount: 1,
  })

  assert.equal(result?.allocations.length, 1)
  assert.equal(result?.allocations[0]?.id, "gauge-a")
  assert.equal(result?.allocations[0]?.basisPoints, 10_000n)
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

test("keeps a larger candidate set within the configured ballot cap", () => {
  const gauges = Array.from({ length: 24 }, (_, index) => ({
    id: `gauge-${index.toString().padStart(2, "0")}`,
    existingWeight: BigInt(index + 1) * 10n ** 18n,
    incentiveValueMicroUsd: BigInt(24 - index) * 1_000_000n,
  }))
  const result = optimizeRewardAllocations({
    gauges,
    votingPowers: [10n ** 20n],
    maxGaugeCount: 8,
  })

  assert.ok(result)
  assert.ok(result.allocations.length <= 8)
  assert.equal(
    result.allocations.reduce(
      (total, allocation) => total + allocation.basisPoints,
      0n,
    ),
    10_000n,
  )
})

test("considers a complementary gauge outside the initial capped seed", () => {
  const result = optimizeRewardAllocations({
    votingPowers: [898_000_000n],
    maxGaugeCount: 2,
    gauges: [
      { id: "a", existingWeight: 3_119_000n, incentiveValueMicroUsd: 8n },
      {
        id: "b",
        existingWeight: 2_585_584_000n,
        incentiveValueMicroUsd: 30_327n,
      },
      {
        id: "c",
        existingWeight: 65_712_000n,
        incentiveValueMicroUsd: 2_944n,
      },
      { id: "d", existingWeight: 17_137_000n, incentiveValueMicroUsd: 2n },
      {
        id: "e",
        existingWeight: 3_378_000n,
        incentiveValueMicroUsd: 2_399n,
      },
      {
        id: "f",
        existingWeight: 4_766_707_000n,
        incentiveValueMicroUsd: 104n,
      },
      { id: "g", existingWeight: 460_217_000n, incentiveValueMicroUsd: 44n },
    ],
  })

  assert.deepEqual(
    result?.allocations.map((allocation) => allocation.id).sort(),
    ["b", "e"],
  )
  assert.equal(result?.projectedRewardMicroUsd, 9_778n)
})
