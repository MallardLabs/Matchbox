import { describe, expect, it } from "vitest"
import {
  formatCompactNumber,
  formatLockRemaining,
  formatRewardAmount,
  mergedLock,
  niceCeiling,
  resolveOverviewState,
} from "./overview"

describe("resolveOverviewState", () => {
  it("keeps disconnected users in the public state", () => {
    expect(
      resolveOverviewState({
        isConnected: false,
        isLoading: true,
        hasError: true,
        hasLocks: true,
      }),
    ).toBe("disconnected")
  })

  it.each([
    [true, false, false, "loading"],
    [false, true, false, "error"],
    [false, false, false, "empty"],
    [false, false, true, "ready"],
  ] as const)(
    "maps loading=%s error=%s locks=%s to %s",
    (isLoading, hasError, hasLocks, expected) => {
      expect(
        resolveOverviewState({
          isConnected: true,
          isLoading,
          hasError,
          hasLocks,
        }),
      ).toBe(expected)
    },
  )
})

describe("formatCompactNumber", () => {
  it.each([
    [48n, "48"],
    [1_000n, "1k"],
    [12_449n, "12.4k"],
    [2_410_000n, "2.41M"],
    [6_184_999n, "6.18M"],
  ] as const)("formats %s as %s", (value, expected) => {
    expect(formatCompactNumber(value)).toBe(expected)
  })
})

describe("niceCeiling", () => {
  it.each([
    [0n, 0n],
    [7n, 10n],
    [1_050n, 2_000n],
    [480n, 500n],
    [100n, 100n],
  ] as const)("rounds %s up to %s", (value, expected) => {
    expect(niceCeiling(value)).toBe(expected)
  })
})

describe("formatLockRemaining", () => {
  const now = 1_700_000_000
  it("uses days under two months", () => {
    expect(formatLockRemaining(BigInt(now + 4 * 86_400), now)).toBe("4 days")
    expect(formatLockRemaining(BigInt(now + 60), now)).toBe("1 day")
  })
  it("switches to months and days", () => {
    expect(formatLockRemaining(BigInt(now + 87 * 86_400), now)).toBe("2mo 27d")
  })
})

describe("formatRewardAmount", () => {
  it("trims trailing zeros", () => {
    expect(formatRewardAmount(8_240_600_000_000_000_000_000n, 18, "MEZO")).toBe(
      "8,240.6",
    )
    expect(formatRewardAmount(4_120_000_000_000_000n, 18, "BTC")).toBe(
      "0.00412",
    )
    expect(formatRewardAmount(1_000n * 10n ** 18n, 18, "MEZO")).toBe("1,000")
  })
})

describe("mergedLock", () => {
  const base = {
    kind: "veBTC" as const,
    votingPower: 0n,
    expired: false,
  }
  it("sums amounts and keeps the longer lock", () => {
    const merged = mergedLock(
      { ...base, id: "1", amount: 2n, end: 200n, isPermanent: false },
      { ...base, id: "2", amount: 3n, end: 100n, isPermanent: false },
    )
    expect(merged).toMatchObject({ id: "2", amount: 5n, end: 200n })
  })
})
