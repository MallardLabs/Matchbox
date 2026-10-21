import { describe, expect, it } from "vitest"
import {
  formatBlock,
  formatBoostWad,
  formatBps,
  formatCountdown,
  formatShortDate,
  formatSignedBps,
  formatSignedUsd,
  formatToken,
  formatUsd,
  microToUsd6,
  percentTextToBps,
  secondsUntil,
  usd6ToMicro,
} from "./format"

describe("query format", () => {
  it("parses usd6 strings into micro-USD without floats", () => {
    expect(usd6ToMicro("86.400000")).toBe(86_400_000n)
    expect(usd6ToMicro("-2.100000")).toBe(-2_100_000n)
    expect(microToUsd6(-2_100_000n)).toBe("-2.100000")
    expect(microToUsd6(usd6ToMicro("123456789.000001"))).toBe(
      "123456789.000001",
    )
  })

  it("formats USD with and without cents, never $0 for null", () => {
    expect(formatUsd("86.400000")).toBe("$86.40")
    expect(formatUsd("142080.000000", { cents: false })).toBe("$142,080")
    expect(formatUsd("0.005000")).toBe("$0.01")
    expect(formatUsd(null)).toBe("—")
    expect(formatSignedUsd("-2.100000")).toBe("−$2.10")
    expect(formatSignedUsd("0.400000")).toBe("+$0.40")
    expect(formatSignedUsd("0.001000")).toBe("$0.00")
  })

  it("formats bps as trimmed percentages", () => {
    expect(formatBps(4200)).toBe("42%")
    expect(formatBps(4250)).toBe("42.5%")
    expect(formatBps(3333)).toBe("33.33%")
    expect(formatBps(21_200)).toBe("212%")
    expect(formatBps(-1000)).toBe("−10%")
    expect(formatSignedBps(-270)).toBe("−2.7%")
    expect(formatSignedBps(150)).toBe("+1.5%")
  })

  it("formats token amounts with BTC at four decimals", () => {
    expect(
      formatToken({
        raw: "1024800000000000000000",
        decimals: 18,
        symbol: "MEZO",
      }),
    ).toBe("1,024.80 MEZO")
    expect(
      formatToken({ raw: "2400000000000000000", decimals: 18, symbol: "BTC" }),
    ).toBe("2.4000 BTC")
    expect(
      formatToken(
        { raw: "48200000000000000000000", decimals: 18, symbol: "mUSD" },
        0,
      ),
    ).toBe("48,200 mUSD")
    expect(formatToken(null)).toBe("—")
  })

  it("parses slippage text into bps", () => {
    expect(percentTextToBps("0.5")).toBe(50)
    expect(percentTextToBps("1%")).toBe(100)
    expect(percentTextToBps("33.33")).toBe(3333)
    expect(percentTextToBps("33.333")).toBeNull()
    expect(percentTextToBps("101")).toBeNull()
    expect(percentTextToBps("abc")).toBeNull()
  })

  it("formats blocks, dates and countdowns", () => {
    expect(formatBlock("4128440")).toBe("4,128,440")
    expect(formatShortDate("2026-08-06T10:00:00.000Z")).toBe("Aug 06")
    const now = Date.parse("2026-10-21T12:00:00.000Z")
    expect(secondsUntil("2026-10-21T12:00:47.000Z", now)).toBe(47)
    expect(secondsUntil("2026-10-21T11:00:00.000Z", now)).toBe(0)
    expect(formatCountdown(47)).toBe("47s")
    expect(formatCountdown(125)).toBe("2m 05s")
  })

  it("formats boost multipliers from 1e18 fixed point", () => {
    expect(formatBoostWad("1000000000000000000")).toBe("1.0×")
    expect(formatBoostWad("4240000000000000000")).toBe("4.2×")
    expect(formatBoostWad("4250000000000000000")).toBe("4.3×")
    expect(formatBoostWad("5000000000000000000")).toBe("5.0×")
    expect(formatBoostWad(null)).toBe("—")
  })
})
