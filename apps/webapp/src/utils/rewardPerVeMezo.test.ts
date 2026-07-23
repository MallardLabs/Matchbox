import assert from "node:assert/strict"
import test from "node:test"
import {
  calculateRewardPer10kVeMezo,
  formatRewardPer10kVeMezo,
} from "./rewardPerVeMezo"

test("estimates the marginal reward for a new 10k veMEZO vote", () => {
  const reward = calculateRewardPer10kVeMezo("1500", 20_000n * 10n ** 18n)
  assert.equal(reward, 500_000_000n)
  assert.equal(formatRewardPer10kVeMezo(reward), "$500.00 / 10k veMEZO")
})

test("returns the entire pot for a zero-weight gauge", () => {
  assert.equal(calculateRewardPer10kVeMezo("123.45", 0n), 123_450_000n)
})

test("handles missing and empty incentive data", () => {
  assert.equal(calculateRewardPer10kVeMezo("100", undefined), null)
  assert.equal(calculateRewardPer10kVeMezo("0", 10n ** 18n), 0n)
  assert.equal(formatRewardPer10kVeMezo(null), "— / 10k veMEZO")
})

test("the marginal estimate never exceeds the incentive pot", () => {
  const weights = [0n, 1n, 10_000n * 10n ** 18n, 10n ** 30n]
  for (const weight of weights) {
    const reward = calculateRewardPer10kVeMezo("999.999999", weight)
    assert.ok(reward !== null && reward <= 999_999_999n)
  }
})
