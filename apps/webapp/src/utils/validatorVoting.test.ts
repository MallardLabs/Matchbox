import assert from "node:assert/strict"
import test from "node:test"
import {
  allocationTotalBasisPoints,
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
