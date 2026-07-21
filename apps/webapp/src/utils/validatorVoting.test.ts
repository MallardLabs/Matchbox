import assert from "node:assert/strict"
import test from "node:test"
import {
  allocationTotalBasisPoints,
  basisPointsToPercentage,
  equalVoteBasisPoints,
  percentageToBasisPoints,
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
