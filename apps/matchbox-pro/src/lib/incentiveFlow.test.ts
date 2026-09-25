import { describe, expect, it } from "vitest"
import { formatInputAmount, parseIncentiveAmount } from "./incentiveFlow"

describe("incentive amount", () => {
  it("parses a valid decimal amount", () => {
    expect(parseIncentiveAmount("12,000", 18)).toEqual({
      valid: true,
      atomic: 12_000n * 10n ** 18n,
    })
  })

  it("rejects empty, zero, malformed, and over-balance amounts", () => {
    expect(parseIncentiveAmount("", 18)).toEqual({
      valid: false,
      message: "Enter an amount.",
    })
    expect(parseIncentiveAmount("0", 18).valid).toBe(false)
    expect(parseIncentiveAmount("1e6", 18).valid).toBe(false)
    expect(parseIncentiveAmount("2", 18, 1n * 10n ** 18n)).toEqual({
      valid: false,
      message: "Amount exceeds your MEZO balance.",
    })
  })

  it("formats the review label without losing a fractional amount", () => {
    expect(formatInputAmount("12000")).toBe("12,000")
    expect(formatInputAmount("12000.25")).toBe("12,000.25")
  })
})
