import assert from "node:assert/strict"
import test from "node:test"
import {
  aggregateSelectedVoteBasisPoints,
  allocationTotalBasisPoints,
  basisPointsToPercentage,
  calculateProjectedValidatorWeight,
  compareValidatorSortEntries,
  equalVoteBasisPoints,
  percentageToBasisPoints,
  voteNeedsPoke,
} from "./validatorVoting"

test("encodes two-decimal percentages as integer basis points", () => {
  assert.equal(percentageToBasisPoints("0.01"), 1n)
  assert.equal(percentageToBasisPoints("33.33"), 3333n)
  assert.equal(percentageToBasisPoints("100"), 10_000n)
})

test("rejects malformed, negative, and over-precise percentages", () => {
  assert.equal(percentageToBasisPoints("-1"), null)
  assert.equal(percentageToBasisPoints("100.01"), null)
  assert.equal(percentageToBasisPoints("1.001"), null)
  assert.equal(percentageToBasisPoints("hello"), null)
})

test("requires the shared ballot to total exactly one hundred percent", () => {
  assert.equal(allocationTotalBasisPoints(["33.33", "33.33", "33.34"]), 10_000n)
  assert.equal(allocationTotalBasisPoints(["50", "49.99"]), 9999n)
  assert.equal(allocationTotalBasisPoints(["50", "bad"]), null)
})

test("splits an equal vote across every validator without losing basis points", () => {
  assert.deepEqual(equalVoteBasisPoints(3), [3334n, 3333n, 3333n])
  assert.equal(
    equalVoteBasisPoints(21).reduce((total, value) => total + value, 0n),
    10_000n,
  )
  assert.deepEqual(equalVoteBasisPoints(0), [])
})

test("formats basis points as valid two-decimal percentage input", () => {
  assert.equal(basisPointsToPercentage(3334n), "33.34")
  assert.equal(basisPointsToPercentage(5000n), "50")
})

test("aggregates current allocation across every selected NFT", () => {
  assert.equal(
    aggregateSelectedVoteBasisPoints([
      { vote: 20n, usedWeight: 100n },
      { vote: 60n, usedWeight: 100n },
    ]),
    4000n,
  )
  assert.equal(
    aggregateSelectedVoteBasisPoints([{ vote: 0n, usedWeight: 0n }]),
    0n,
  )
})

test("projects new votes and reallocations without double-counting", () => {
  assert.equal(
    calculateProjectedValidatorWeight(
      1_000n,
      [
        { vote: 200n, usedWeight: 1_000n, votingPower: 1_000n, eligible: true },
        { vote: 100n, usedWeight: 500n, votingPower: 500n, eligible: true },
      ],
      5_000n,
    ),
    1_450n,
  )
  assert.equal(
    calculateProjectedValidatorWeight(
      1_000n,
      [{ vote: 400n, usedWeight: 500n, votingPower: 500n, eligible: false }],
      0n,
    ),
    1_000n,
  )
})

test("requires a poke only when voting power changed after an active vote", () => {
  assert.equal(voteNeedsPoke(200n, 100n), true)
  assert.equal(voteNeedsPoke(100n, 100n), false)
  assert.equal(voteNeedsPoke(100n, 200n), false)
  assert.equal(voteNeedsPoke(200n, undefined), false)
  assert.equal(voteNeedsPoke(undefined, 100n), false)
})

test("sorts validator metrics deterministically", () => {
  const entries = [
    {
      gauge: "0x02",
      name: "Backbone",
      weight: 100n,
      shareBasisPoints: 1_000n,
      incentivesMicroUsd: 10n,
      apyBasisPoints: 20n,
    },
    {
      gauge: "0x01",
      name: "Backbone",
      weight: 100n,
      shareBasisPoints: 1_000n,
      incentivesMicroUsd: 10n,
      apyBasisPoints: 20n,
    },
    {
      gauge: "0x03",
      name: "Millennium",
      weight: 50n,
      shareBasisPoints: 500n,
      incentivesMicroUsd: null,
      apyBasisPoints: null,
    },
  ]
  entries.sort((a, b) =>
    compareValidatorSortEntries(a, b, "incentives", "desc"),
  )
  assert.deepEqual(
    entries.map((entry) => entry.gauge),
    ["0x01", "0x02", "0x03"],
  )
})
