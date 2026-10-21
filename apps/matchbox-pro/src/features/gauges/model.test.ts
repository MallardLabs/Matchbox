import { describe, expect, it } from "vitest"
import {
  type EpochTableRow,
  amountInputValue,
  checkAmount,
  epochDateLabel,
  epochIncentives,
  formatBoostWad,
  formatNative,
  gaugeApyBps,
  optimalFraction,
  recentEpochRows,
  usdLabel,
} from "./model"
import {
  applyStepEvent,
  failedStep,
  isComplete,
  needsApproval,
  planIncentiveSteps,
} from "./signing"

const E18 = 10n ** 18n
const MEZO = "0x7B7c000000000000000000000000000000000001"
const BTC = "0x7b7C000000000000000000000000000000000000"

describe("formatNative", () => {
  it("keeps six significant digits and the full whole part", () => {
    expect(formatNative(143_800n * E18, 18)).toBe("143,800")
    expect(formatNative(24_810_123_456n * 10n ** 12n, 18)).toBe("24,810.1")
    expect(formatNative(3_865_882_996n * 10n ** 16n, 18)).toBe("38,658,829")
    expect(formatNative(74_772n * 10n ** 16n, 18)).toBe("747.72")
  })

  it("counts significant digits after leading zeros", () => {
    expect(formatNative(562n * 10n ** 14n, 18)).toBe("0.0562")
    expect(formatNative(123_456_789n * 10n ** 9n, 18)).toBe("0.123456")
  })

  it("rounds down and renders zero plainly", () => {
    expect(formatNative(999_999_9n * 10n ** 11n, 18)).toBe("0.999999")
    expect(formatNative(0n, 18)).toBe("0")
  })
})

describe("epochIncentives", () => {
  const prices = { btcPriceUsd: "100000", mezoPriceUsd: "0.5" }

  it("prices known tokens and drops empty ones", () => {
    const result = epochIncentives(
      [
        {
          tokenAddress: MEZO,
          symbol: "MEZO",
          decimals: 18,
          epochAmount: (1000n * E18).toString(),
        },
        { tokenAddress: BTC, symbol: "BTC", decimals: 18, epochAmount: "0" },
      ],
      prices,
    )
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0]?.usdMicro).toBe(500_000_000n)
    expect(result.totalUsdMicro).toBe(500_000_000n)
    expect(result.unpricedCount).toBe(0)
  })

  it("marks unknown tokens unpriced instead of $0", () => {
    const result = epochIncentives(
      [
        {
          tokenAddress: "0x0000000000000000000000000000000000000abc",
          symbol: "SATS",
          decimals: 18,
          epochAmount: E18.toString(),
        },
      ],
      prices,
    )
    expect(result.rows[0]?.usdMicro).toBeNull()
    expect(result.totalUsdMicro).toBeNull()
    expect(result.unpricedCount).toBe(1)
  })

  it("leaves MEZO unpriced when its price is missing", () => {
    const result = epochIncentives(
      [
        {
          tokenAddress: MEZO,
          symbol: "MEZO",
          decimals: 18,
          epochAmount: E18.toString(),
        },
      ],
      { btcPriceUsd: "100000", mezoPriceUsd: null },
    )
    expect(result.totalUsdMicro).toBeNull()
  })
})

describe("gaugeApyBps", () => {
  it("annualises incentives over the gauge's veMEZO", () => {
    // $10 a week on 1,000 veMEZO at $1 → 52%.
    expect(
      gaugeApyBps({
        incentivesUsdMicro: 10_000_000n,
        veMezo: 1000n * E18,
        mezoPriceUsd: "1",
      }),
    ).toBe(5200n)
  })

  it("is unavailable without a price or incentives", () => {
    expect(
      gaugeApyBps({ incentivesUsdMicro: null, veMezo: E18, mezoPriceUsd: "1" }),
    ).toBeNull()
    expect(
      gaugeApyBps({ incentivesUsdMicro: 1n, veMezo: E18, mezoPriceUsd: null }),
    ).toBeNull()
  })
})

describe("optimalFraction", () => {
  it("clamps to 0–1", () => {
    expect(optimalFraction(50n, 200n)).toBe(0.25)
    expect(optimalFraction(300n, 200n)).toBe(1)
    expect(optimalFraction(1n, undefined)).toBe(0)
  })
})

describe("checkAmount", () => {
  const mezo = { decimals: 18, symbol: "MEZO" }

  it("parses grouped decimals", () => {
    expect(checkAmount("12,000.5", mezo, undefined)).toEqual({
      kind: "ok",
      atomic: 12_000n * E18 + E18 / 2n,
    })
  })

  it("flags empty, malformed, over-precise and zero amounts", () => {
    expect(checkAmount("  ", mezo, undefined)).toEqual({ kind: "empty" })
    expect(checkAmount("1e6", mezo, undefined).kind).toBe("invalid")
    expect(
      checkAmount("0.1234567", { decimals: 6, symbol: "X" }, undefined),
    ).toEqual({
      kind: "invalid",
      message: "Max 6 decimals",
    })
    expect(checkAmount("0", mezo, undefined).kind).toBe("invalid")
  })

  it("reports an insufficient balance", () => {
    expect(checkAmount("2", mezo, E18)).toEqual({
      kind: "insufficient",
      atomic: 2n * E18,
      message: "Insufficient MEZO balance",
    })
  })

  it("round-trips MAX through the input value", () => {
    const balance = 24_810_123_456_789n * 10n ** 9n
    const value = amountInputValue(balance, 18)
    expect(value).toBe("24810.123456789")
    expect(checkAmount(value, mezo, balance)).toEqual({
      kind: "ok",
      atomic: balance,
    })
  })
})

describe("incentive signing steps", () => {
  it("skips approval when the allowance covers the deposit", () => {
    expect(needsApproval(10n, 10n)).toBe(false)
    expect(needsApproval(9n, 10n)).toBe(true)
    expect(needsApproval(undefined, 10n)).toBe(true)
    expect(
      planIncentiveSteps({
        symbol: "MEZO",
        amountLabel: "12,000",
        approve: false,
      }).map((item) => item.label),
    ).toEqual(["Add 12,000 MEZO"])
  })

  it("walks approve then deposit to completion", () => {
    let steps = planIncentiveSteps({
      symbol: "MEZO",
      amountLabel: "12,000",
      approve: true,
    })
    expect(steps.map((item) => item.status)).toEqual(["active", "pending"])
    steps = applyStepEvent(steps, {
      type: "submitted",
      id: "approve",
      hash: "0xaa",
    })
    expect(steps[0]?.phase).toBe("confirming")
    steps = applyStepEvent(steps, { type: "done", id: "approve" })
    steps = applyStepEvent(steps, { type: "signing", id: "deposit" })
    steps = applyStepEvent(steps, {
      type: "submitted",
      id: "deposit",
      hash: "0xbb",
    })
    steps = applyStepEvent(steps, { type: "done", id: "deposit" })
    expect(isComplete(steps)).toBe(true)
    expect(steps[1]?.hash).toBe("0xbb")
  })

  it("keeps a reverted hash for the explorer and clears it on retry", () => {
    let steps = planIncentiveSteps({
      symbol: "BTC",
      amountLabel: "0.1",
      approve: false,
    })
    steps = applyStepEvent(steps, {
      type: "submitted",
      id: "deposit",
      hash: "0xcc",
    })
    steps = applyStepEvent(steps, {
      type: "failed",
      id: "deposit",
      error: "Reverted",
    })
    expect(failedStep(steps)?.hash).toBe("0xcc")
    expect(isComplete(steps)).toBe(false)
    steps = applyStepEvent(steps, { type: "retry", id: "deposit" })
    expect(failedStep(steps)).toBeUndefined()
    expect(steps[0]).toMatchObject({
      status: "active",
      phase: "wallet",
      hash: undefined,
    })
  })
})

describe("recent epochs", () => {
  const sealed = {
    epochEnd: 1_791_417_600 + 604_800,
    status: "sealed" as const,
    veMezo: 7110n * E18,
    boostWad: 36n * 10n ** 17n,
    incentives: [
      {
        token: MEZO,
        symbol: "MEZO",
        decimals: 18,
        amount: E18,
        usdAtEarnMicro: 14_880_000_000n,
        usdNowMicro: null,
      },
    ],
    incentivesUsdMicro: 14_880_000_000n,
    apyBps: 1210n,
  }
  const live: EpochTableRow = {
    key: "live",
    label: "Oct 15",
    current: true,
    veMezo: "8,420",
    boost: "4.2×",
    incentives: "$18,204.00",
    apy: "14.80%",
    apyKnown: true,
  }

  it("labels epochs by UTC start date", () => {
    expect(epochDateLabel(1_792_022_400)).toBe("Oct 15")
    expect(epochDateLabel(undefined)).toBe("Current")
  })

  it("formats boost wads like the live multiplier", () => {
    expect(formatBoostWad(42n * 10n ** 17n)).toBe("4.2×")
    expect(formatBoostWad(10n ** 18n)).toBe("1.0×")
    expect(formatBoostWad(5n * 10n ** 18n)).toBe("5×")
  })

  it("puts the live row first, then sealed history", () => {
    const rows = recentEpochRows(
      [
        { ...sealed, epochStart: 1_792_022_400, status: "current" as const },
        { ...sealed, epochStart: 1_791_417_600 },
      ],
      live,
    )
    expect(rows.map((row) => row.key)).toEqual(["live", "1791417600"])
    expect(rows[1]).toMatchObject({
      label: "Oct 8",
      current: false,
      veMezo: "7,110",
      boost: "3.6×",
      incentives: "$14,880.00",
      apy: "12.10%",
    })
  })

  it("falls back to the history's current row, and marks unpriced lines", () => {
    const rows = recentEpochRows(
      [
        {
          ...sealed,
          epochStart: 1_792_022_400,
          status: "current" as const,
          boostWad: null,
          incentives: [
            ...sealed.incentives,
            {
              token: "0x0000000000000000000000000000000000000abc",
              symbol: "SATS",
              decimals: 18,
              amount: E18,
              usdAtEarnMicro: null,
              usdNowMicro: null,
            },
          ],
        },
      ],
      undefined,
    )
    expect(rows[0]).toMatchObject({
      current: true,
      boost: "—",
      incentives: "$14,880.00+",
    })
    expect(usdLabel(null)).toBe("Unpriced")
  })
})
