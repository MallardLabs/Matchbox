import assert from "node:assert/strict"
import test from "node:test"
import {
  calculateValidatorApyBasisPoints,
  decimalToScaledBigInt,
  formatMicroUsd,
  formatValidatorApy,
  tokenUsdMicroValue,
} from "./validatorApy"

test("converts decimal prices without floating point arithmetic", () => {
  assert.equal(decimalToScaledBigInt("123.456789", 6), 123_456_789n)
  assert.equal(decimalToScaledBigInt("1e-3", 6), 1000n)
  assert.equal(tokenUsdMicroValue(2_500_000n, 6, "1.25"), 3_125_000n)
})

test("formats micro-dollar values and preserves unavailable pricing", () => {
  assert.equal(formatMicroUsd(1_234_560_000n), "~$1,234.56")
  assert.equal(formatMicroUsd(null), "Price unavailable")
})

test("annualizes weekly incentives over validator veBTC weight", () => {
  const incentives = 100n * 1_000_000n
  const weight = 2n * 10n ** 18n
  const apy = calculateValidatorApyBasisPoints(incentives, weight, "50000")
  assert.equal(apy, 520n)
  assert.equal(formatValidatorApy(apy), "5.20%")
})

test("represents unavailable pricing and funded zero-weight gauges", () => {
  assert.equal(calculateValidatorApyBasisPoints(0n, 0n, "50000"), null)
  assert.equal(calculateValidatorApyBasisPoints(1_000_000n, 0n, "50000"), -1n)
  assert.equal(calculateValidatorApyBasisPoints(1_000_000n, 1n, "0"), null)
  assert.equal(formatValidatorApy(null), "—")
  assert.equal(formatValidatorApy(-1n), "∞")
})

test("a new vote moves a funded gauge from infinite to finite APY", () => {
  const incentives = 50n * 1_000_000n
  assert.equal(calculateValidatorApyBasisPoints(incentives, 0n, "50000"), -1n)
  assert.equal(
    calculateValidatorApyBasisPoints(incentives, 10_000n * 10n ** 18n, "50000"),
    0n,
  )
})
