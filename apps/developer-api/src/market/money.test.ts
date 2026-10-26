import { describe, expect, it } from "vitest"
import {
  aprPercent,
  boostMultiplier,
  formatUnits,
  parseFixed,
  sumUsd,
  tokenUsd,
} from "./money"

const wad = 10n ** 18n
const maxUint256 = 2n ** 256n - 1n
const maxUint256Wad =
  "115792089237316195423570985008687907853269984665640564039457.584007913129639935"
const invalidDecimals = [
  "",
  ".5",
  "1.",
  "-1",
  "+1",
  "1e5",
  " 1",
  "1 ",
  "1,000",
  "0x10",
  "1.2.3",
  "NaN",
  "Infinity",
]

describe("formatUnits", () => {
  it("formats base units without trailing zeros", () => {
    expect(formatUnits(0n, 18)).toBe("0")
    expect(formatUnits(1_500_000n, 6)).toBe("1.5")
    expect(formatUnits(1n, 18)).toBe("0.000000000000000001")
    expect(formatUnits(100_000_000n, 8)).toBe("1")
    expect(formatUnits(12_345_678n, 8)).toBe("0.12345678")
    expect(formatUnits(1_000_000_100n, 8)).toBe("10.000001")
    expect(formatUnits(wad * 1_000_000_000_000n, 18)).toBe("1000000000000")
  })

  it("passes integers through with 0 decimals", () => {
    expect(formatUnits(0n, 0)).toBe("0")
    expect(formatUnits(1_230n, 0)).toBe("1230")
  })

  it("is exact for uint256-sized values", () => {
    expect(formatUnits(maxUint256, 18)).toBe(maxUint256Wad)
    expect(formatUnits(maxUint256, 0)).toBe(maxUint256.toString())
  })

  it("rejects negative amounts and bad decimals", () => {
    expect(() => formatUnits(-1n, 18)).toThrow(RangeError)
    expect(() => formatUnits(1n, -1)).toThrow(RangeError)
    expect(() => formatUnits(1n, 1.5)).toThrow(RangeError)
    expect(() => formatUnits(1n, Number.NaN)).toThrow(RangeError)
    expect(() => formatUnits(1n, 256)).toThrow(RangeError)
  })
})

describe("parseFixed", () => {
  it("scales decimal strings", () => {
    expect(parseFixed("1.234", 3)).toBe(1_234n)
    expect(parseFixed("1", 18)).toBe(wad)
    expect(parseFixed("0", 18)).toBe(0n)
    expect(parseFixed("0.5", 6)).toBe(500_000n)
    expect(parseFixed("0.000000000000000001", 18)).toBe(1n)
    expect(parseFixed("65000.12345678", 8)).toBe(6_500_012_345_678n)
  })

  it("truncates digits beyond the scale instead of rounding", () => {
    expect(parseFixed("1.234", 2)).toBe(123n)
    expect(parseFixed("1.239", 2)).toBe(123n)
    expect(parseFixed("0.0000000000000000019", 18)).toBe(1n)
    expect(parseFixed("12.99", 0)).toBe(12n)
    expect(parseFixed("0.999999", 0)).toBe(0n)
  })

  it("accepts leading zeros", () => {
    expect(parseFixed("007.50", 2)).toBe(750n)
  })

  it("round-trips with formatUnits at uint256 size", () => {
    expect(parseFixed(maxUint256Wad, 18)).toBe(maxUint256)
    expect(formatUnits(parseFixed("123.000456", 6), 6)).toBe("123.000456")
  })

  it("throws on anything but a plain non-negative decimal", () => {
    for (const value of invalidDecimals) {
      expect(() => parseFixed(value, 18), value).toThrow(RangeError)
    }
    expect(() => parseFixed("1", -1)).toThrow(RangeError)
  })
})

describe("tokenUsd", () => {
  it("multiplies base units by the price", () => {
    expect(tokenUsd(15n * 10n ** 17n, 18, "2")).toBe("3")
    expect(tokenUsd(2n * wad, 18, "1.25")).toBe("2.5")
    expect(tokenUsd(1_000_000n, 6, "1")).toBe("1")
    expect(tokenUsd(5n, 0, "0.1234567")).toBe("0.617283")
  })

  it("is exact for 8-decimal BTC", () => {
    // 0.12345678 BTC × 65000.5 = 8024.75242839
    expect(tokenUsd(12_345_678n, 8, "65000.5")).toBe("8024.752428")
  })

  it("truncates to six decimals", () => {
    expect(tokenUsd(1n, 18, "1")).toBe("0")
    expect(tokenUsd(999_999_999_999n, 18, "1")).toBe("0")
    expect(tokenUsd(1_000_000_000_000n, 18, "1")).toBe("0.000001")
    expect(tokenUsd(wad, 18, "0.123456789012345678901")).toBe("0.123456")
    expect(tokenUsd(2n, 6, "0.4999999")).toBe("0")
  })

  it("keeps every digit of large amounts and long prices", () => {
    expect(tokenUsd(maxUint256, 18, "100000")).toBe(
      "11579208923731619542357098500868790785326998466564056403945758400.791312",
    )
    expect(tokenUsd(wad, 18, "0.000000000000000000000000000001")).toBe("0")
  })

  it("is zero for a zero amount or price", () => {
    expect(tokenUsd(0n, 18, "65000")).toBe("0")
    expect(tokenUsd(wad, 18, "0")).toBe("0")
  })

  it("rejects invalid input", () => {
    expect(() => tokenUsd(-1n, 18, "1")).toThrow(RangeError)
    expect(() => tokenUsd(1n, 18, "-1")).toThrow(RangeError)
    expect(() => tokenUsd(1n, 18, "1e3")).toThrow(RangeError)
    expect(() => tokenUsd(1n, -1, "1")).toThrow(RangeError)
  })
})

describe("sumUsd", () => {
  it("sums exactly", () => {
    expect(sumUsd([])).toBe("0")
    expect(sumUsd(["0.1", "0.2"])).toBe("0.3")
    expect(sumUsd(["1.5", "2.25", "0.000001"])).toBe("3.750001")
    expect(sumUsd(["1.10", "2.90"])).toBe("4")
    expect(sumUsd(["7"])).toBe("7")
    expect(sumUsd(["0", "0.0"])).toBe("0")
  })

  it("carries across large values", () => {
    expect(sumUsd(["99999999999999999999.999999", "0.000001"])).toBe(
      "100000000000000000000",
    )
  })

  it("throws on an invalid value", () => {
    expect(() => sumUsd(["1", "abc"])).toThrow(RangeError)
    expect(() => sumUsd(["-1"])).toThrow(RangeError)
  })
})

describe("aprPercent", () => {
  it("annualizes weekly rewards against the voting power's value", () => {
    // 100 * 52 / (1000 * 1) * 100
    expect(
      aprPercent({
        totalUsd: "100",
        weight: 1_000n * wad,
        votingTokenUsd: "1",
      }),
    ).toBe("520")
    expect(
      aprPercent({ totalUsd: "1", weight: 416n * wad, votingTokenUsd: "1" }),
    ).toBe("12.5")
    expect(
      aprPercent({ totalUsd: "0", weight: wad, votingTokenUsd: "65000" }),
    ).toBe("0")
  })

  it("truncates to two decimals", () => {
    // 5200 / 3 = 1733.333…
    expect(
      aprPercent({ totalUsd: "1", weight: 3n * wad, votingTokenUsd: "1" }),
    ).toBe("1733.33")
    // 5200 / 7800 = 0.6666…
    expect(
      aprPercent({ totalUsd: "1", weight: 7_800n * wad, votingTokenUsd: "1" }),
    ).toBe("0.66")
    // 5200 / 520001 = 0.0099…
    expect(
      aprPercent({
        totalUsd: "1",
        weight: 520_001n * wad,
        votingTokenUsd: "1",
      }),
    ).toBe("0")
  })

  it("matches a decimal reference for veBTC and veMEZO gauges", () => {
    // 1234.567891 * 52 / (12.5 * 65000.12) * 100 = 7.9012…
    expect(
      aprPercent({
        totalUsd: "1234.567891",
        weight: 12_500_000_000_000_000_000n,
        votingTokenUsd: "65000.12",
      }),
    ).toBe("7.9")
    // 98765.4321 * 52 / (123456.789123456789123456 * 0.0823) * 100
    expect(
      aprPercent({
        totalUsd: "98765.4321",
        weight: 123_456_789_123_456_789_123_456n,
        votingTokenUsd: "0.0823",
      }),
    ).toBe("50546.78")
  })

  it("handles dust weight without overflow", () => {
    expect(aprPercent({ totalUsd: "1", weight: 1n, votingTokenUsd: "1" })).toBe(
      "5200000000000000000000",
    )
  })

  it("is null for zero weight or a zero voting-token price", () => {
    expect(
      aprPercent({ totalUsd: "100", weight: 0n, votingTokenUsd: "1" }),
    ).toBeNull()
    expect(
      aprPercent({ totalUsd: "100", weight: wad, votingTokenUsd: "0" }),
    ).toBeNull()
    expect(
      aprPercent({ totalUsd: "100", weight: wad, votingTokenUsd: "0.000" }),
    ).toBeNull()
  })

  it("rejects invalid input", () => {
    expect(() =>
      aprPercent({ totalUsd: "1", weight: -1n, votingTokenUsd: "1" }),
    ).toThrow(RangeError)
    expect(() =>
      aprPercent({ totalUsd: "x", weight: wad, votingTokenUsd: "1" }),
    ).toThrow(RangeError)
    expect(() =>
      aprPercent({ totalUsd: "1", weight: wad, votingTokenUsd: "-1" }),
    ).toThrow(RangeError)
  })
})

describe("boostMultiplier", () => {
  it("formats 1e18 = 1x with up to four decimals", () => {
    expect(boostMultiplier(wad)).toBe("1")
    expect(boostMultiplier(5n * wad)).toBe("5")
    expect(boostMultiplier(1_250_000_000_000_000_000n)).toBe("1.25")
    expect(boostMultiplier(2_000_100_000_000_000_000n)).toBe("2.0001")
  })

  it("truncates past four decimals", () => {
    expect(boostMultiplier(1_234_567_890_000_000_000n)).toBe("1.2345")
    expect(boostMultiplier(1_999_999_999_999_999_999n)).toBe("1.9999")
    expect(boostMultiplier(99_999_999_999_999n)).toBe("0")
    expect(boostMultiplier(0n)).toBe("0")
  })

  it("rejects a negative boost", () => {
    expect(() => boostMultiplier(-1n)).toThrow(RangeError)
  })
})
