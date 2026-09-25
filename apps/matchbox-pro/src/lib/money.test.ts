import { describe, expect, it } from "vitest"
import {
  decimalToScaledBigInt,
  formatMicroUsd,
  formatTickerUsd,
  formatTokenAmount,
  formatTokenAmountDigits,
  microUsdToTokenAmount,
  sqrtPriceX96ToPriceString,
  tokenUsdMicroValue,
} from "./money"

describe("money", () => {
  it("scales a decimal string without using Number", () => {
    expect(decimalToScaledBigInt("12.34", 6)).toBe(12_340_000n)
    expect(decimalToScaledBigInt("0.0842", 6)).toBe(84_200n)
  })

  it("values a token amount in micro-USD from a price string", () => {
    const amount = 10n ** 18n
    expect(tokenUsdMicroValue(amount, 18, "0.0842")).toBe(84_200n)
  })

  it("formats micro-USD with cent rounding", () => {
    expect(formatMicroUsd(1_049_900_000n)).toBe("$1,049.90")
    expect(formatMicroUsd(0n)).toBe("$0.00")
  })

  it("formats 18-decimal token amounts to two places", () => {
    expect(formatTokenAmount(12_400n * 10n ** 18n, 18)).toBe("12,400.00")
  })

  it("formats lock amounts at a token-specific precision", () => {
    expect(formatTokenAmountDigits(124_300_000_000_000_000n, 18, 4)).toBe(
      "0.1243",
    )
    expect(formatTokenAmountDigits(12_400n * 10n ** 18n, 18, 2)).toBe(
      "12,400.00",
    )
  })

  it("formats ticker USD from a decimal string", () => {
    expect(formatTickerUsd("108420.129", 2)).toBe("$108,420.12")
    expect(formatTickerUsd("0.0842", 4)).toBe("$0.0842")
    expect(formatTickerUsd(null, 2)).toBe("—")
  })

  it("inverts micro-USD back to a 1 MEZO amount at $0.0842", () => {
    expect(microUsdToTokenAmount(84_200n, 18, "0.0842")).toBe(10n ** 18n)
  })

  it("converts Uniswap sqrtPriceX96=2^96 to a price of 1", () => {
    expect(sqrtPriceX96ToPriceString(2n ** 96n)).toBe("1")
  })
})
