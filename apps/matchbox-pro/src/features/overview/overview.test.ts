import type { WalletEarnings } from "@/features/history/useHistory"
import { LAUNCH_EPOCH_START, epochLabel, epochNumberFor } from "@/lib/epoch"
import { describe, expect, it } from "vitest"
import {
  earningsBars,
  earningsEmptyState,
  formatTick,
  walletChartEpochs,
} from "./earnings"
import { claimableValue, liveUsd, projectedValue } from "./heroValues"

const WEEK = 604_800n

describe("epochNumberFor", () => {
  it("numbers epochs from the launch cohort", () => {
    expect(epochNumberFor(LAUNCH_EPOCH_START)).toBe(0)
    expect(epochNumberFor(LAUNCH_EPOCH_START + WEEK)).toBe(1)
    expect(epochNumberFor(LAUNCH_EPOCH_START + 7n * WEEK)).toBe(7)
  })

  it("has no number before launch or before the boundary loads", () => {
    expect(epochNumberFor(LAUNCH_EPOCH_START - WEEK)).toBeNull()
    expect(epochNumberFor(undefined)).toBeNull()
    expect(epochLabel(undefined)).toBe("Epoch")
    expect(epochLabel(LAUNCH_EPOCH_START + 2n * WEEK)).toBe("Epoch 2")
  })
})

describe("earningsBars", () => {
  const epochStart = LAUNCH_EPOCH_START + 7n * WEEK

  it("draws dashed history stubs when history is unavailable", () => {
    const bars = earningsBars({
      history: {
        status: "unavailable",
        data: undefined,
        lagSeconds: undefined,
      },
      epochStart,
      current: { status: "ready", usdMicro: 1_049_900_000n },
      next: { status: "ready", usdMicro: 24_400_000n },
    })
    expect(bars.map((bar) => bar.label)).toEqual([
      "2",
      "3",
      "4",
      "5",
      "6",
      "7",
      "Next",
    ])
    expect(bars.slice(0, 5).every((bar) => bar.tone === "unavailable")).toBe(
      true,
    )
    expect(bars.slice(0, 5).every((bar) => bar.value === null)).toBe(true)
    expect(bars[5]).toMatchObject({
      tone: "current",
      display: "$1,050",
      value: 1049.9,
    })
    expect(bars[6]).toMatchObject({ tone: "projected", display: "$24" })
  })

  it("keeps realized epochs before the current one, newest last", () => {
    const bars = earningsBars({
      history: {
        status: "ready",
        lagSeconds: 10,
        data: [5n, 6n, 7n].map((n) => ({
          epoch: Number(n),
          startsAt: Number(LAUNCH_EPOCH_START + n * WEEK),
          usdMicro: n === 6n ? null : n * 100_000_000n,
        })),
      },
      epochStart,
      current: { status: "loading" },
      next: { status: "unavailable" },
    })
    expect(bars.map((bar) => [bar.label, bar.tone, bar.display])).toEqual([
      ["5", "past", "$500"],
      ["6", "unavailable", "Unpriced"],
      ["7", "unavailable", "—"],
      ["Next", "unavailable", "—"],
    ])
  })
})

describe("earningsBars for wallet earnings (no claimable bar)", () => {
  const epochStart = LAUNCH_EPOCH_START + 7n * WEEK

  it("highlights the newest sealed epoch and never draws claimable twice", () => {
    const bars = earningsBars({
      history: {
        status: "ready",
        lagSeconds: 0,
        data: [
          ...[4n, 5n, 6n].map((n) => ({
            epoch: Number(n),
            startsAt: Number(LAUNCH_EPOCH_START + n * WEEK),
            usdMicro: n * 1_000_000n,
          })),
          {
            epoch: 7,
            startsAt: Number(epochStart),
            usdMicro: 500_000n,
            projected: true,
          },
        ],
      },
      epochStart,
      next: { status: "ready", usdMicro: 400_000n },
      historyEpochs: 6,
    })
    expect(
      bars.map((bar) => [bar.key, bar.label, bar.tone, bar.display]),
    ).toEqual([
      [`epoch-${LAUNCH_EPOCH_START + 4n * WEEK}`, "4", "past", "$4"],
      [`epoch-${LAUNCH_EPOCH_START + 5n * WEEK}`, "5", "past", "$5"],
      [`epoch-${LAUNCH_EPOCH_START + 6n * WEEK}`, "6", "current", "$6"],
      ["next", "Next", "projected", "<$1"],
    ])
    expect(bars.some((bar) => bar.key === "current")).toBe(false)
  })

  it("draws six dashed stubs plus Next when history is unavailable", () => {
    const bars = earningsBars({
      history: {
        status: "unavailable",
        data: undefined,
        lagSeconds: undefined,
      },
      epochStart,
      next: { status: "loading" },
      historyEpochs: 6,
    })
    expect(bars.map((bar) => bar.label)).toEqual([
      "1",
      "2",
      "3",
      "4",
      "5",
      "6",
      "Next",
    ])
    expect(bars.every((bar) => bar.tone === "unavailable")).toBe(true)
  })
})

describe("earningsBars with an accruing epoch", () => {
  it("never counts the projected entry as realized; it backs up Next", () => {
    const epochStart = LAUNCH_EPOCH_START + 7n * WEEK
    const bars = earningsBars({
      history: {
        status: "ready",
        lagSeconds: 0,
        data: [
          {
            epoch: 1,
            startsAt: Number(epochStart - WEEK),
            usdMicro: null,
          },
          {
            epoch: 2,
            startsAt: Number(epochStart),
            usdMicro: 24_400_000n,
            projected: true,
          },
        ],
      },
      epochStart,
      current: { status: "ready", usdMicro: 1_000_000_000n },
      next: { status: "unavailable" },
    })
    expect(bars.map((bar) => [bar.label, bar.tone, bar.display])).toEqual([
      ["6", "unavailable", "Unpriced"],
      ["7", "current", "$1,000"],
      ["Next", "projected", "$24"],
    ])
  })

  it("labels pre-launch epochs by date", () => {
    const start = LAUNCH_EPOCH_START - 2n * WEEK
    const bars = earningsBars({
      history: {
        status: "unavailable",
        data: undefined,
        lagSeconds: undefined,
      },
      epochStart: start,
      current: { status: "loading" },
      next: { status: "none" },
      historyEpochs: 1,
    })
    expect(bars.map((bar) => bar.label)).toEqual(["Aug 13", "Aug 20", "Next"])
  })
})

describe("formatTick", () => {
  it("compacts axis values", () => {
    expect(formatTick(0)).toBe("$0")
    expect(formatTick(500)).toBe("$500")
    expect(formatTick(1000)).toBe("$1k")
    expect(formatTick(2500)).toBe("$2.5k")
    expect(formatTick(0.25)).toBe("$0.25")
    expect(formatTick(2_000_000)).toBe("$2M")
  })
})

describe("no-lock wallets", () => {
  const sources = { status: "ready" as const, usdMicro: 0n }

  it("reads $0.00 claimable and projected once lock reads settle", () => {
    const claimable = claimableValue({ locksState: "empty", sources })
    const projected = projectedValue({
      locksState: "empty",
      veMezoLocks: 0,
      isLoading: true,
      failed: false,
      usdMicro: 0n,
    })
    expect(claimable).toEqual({ status: "none" })
    expect(projected).toEqual({ status: "none" })
    expect(liveUsd(claimable, (micro) => `$${micro}`)).toBe("$0")
  })

  it("stays loading, or unknown, until the lock reads settle", () => {
    expect(claimableValue({ locksState: "loading", sources })).toEqual({
      status: "loading",
    })
    expect(claimableValue({ locksState: "error", sources })).toEqual({
      status: "unavailable",
    })
    expect(liveUsd({ status: "loading" }, String)).toBeNull()
    expect(
      projectedValue({
        locksState: "ready",
        veMezoLocks: 1,
        isLoading: false,
        failed: true,
        usdMicro: 5n,
      }),
    ).toEqual({ status: "unavailable" })
  })

  it("shows the chart empty state instead of dashes", () => {
    const epochStart = LAUNCH_EPOCH_START + 7n * WEEK
    const pending = earningsBars({
      history: { status: "loading", data: undefined, lagSeconds: undefined },
      epochStart,
      next: { status: "none" },
    })
    expect(
      earningsEmptyState(pending, { hasLocks: false, historyReady: false }),
    ).toBe("No locks")
    expect(
      earningsEmptyState(pending, { hasLocks: true, historyReady: false }),
    ).toBeNull()

    const zeros = earningsBars({
      history: {
        status: "ready",
        lagSeconds: 0,
        data: [6n, 7n].map((n) => ({
          epoch: Number(n),
          startsAt: Number(LAUNCH_EPOCH_START + n * WEEK),
          usdMicro: 0n,
          projected: n === 7n,
        })),
      },
      epochStart,
      next: { status: "ready", usdMicro: 0n },
    })
    expect(
      earningsEmptyState(zeros, { hasLocks: true, historyReady: true }),
    ).toBe("No earnings yet")
  })
})

describe("walletChartEpochs", () => {
  const window = (n: bigint) => ({
    epochStart: Number(LAUNCH_EPOCH_START + n * WEEK),
    epochEnd: Number(LAUNCH_EPOCH_START + (n + 1n) * WEEK),
  })
  const token = {
    token: "0x7b7c000000000000000000000000000000000001",
    symbol: "MEZO",
    decimals: 18,
    amount: 10n ** 18n,
    usdAtEarnMicro: null,
    usdNowMicro: null,
  }
  const totals = {
    tokens: [],
    usdAtEarnMicro: 0n,
    usdNowMicro: 0n,
    unpriced: 0,
  }
  function earnings(): WalletEarnings {
    return {
      tokenIds: [],
      current: {
        ...window(7n),
        status: "projected",
        tokens: [],
        usdNowMicro: 0n,
      },
      epochs: [
        {
          ...window(4n),
          status: "sealed",
          tokens: [],
          usdAtEarnMicro: null,
          usdNowMicro: null,
          unpriced: 0,
        },
        {
          ...window(5n),
          status: "sealed",
          tokens: [token, token],
          usdAtEarnMicro: 1_500_000n,
          usdNowMicro: 1_500_000n,
          unpriced: 1,
        },
        {
          ...window(6n),
          status: "sealed",
          tokens: [token],
          usdAtEarnMicro: null,
          usdNowMicro: null,
          unpriced: 1,
        },
      ],
      totals: {
        realized: totals,
        claimed: totals,
        claimable: totals,
        projected: totals,
      },
      verified: true,
      partial: true,
    }
  }

  it("treats empty epochs as $0 and shows priced lines as a lower bound", () => {
    expect(
      walletChartEpochs(earnings()).map((epoch) => [
        epoch.usdMicro,
        epoch.lowerBound ?? false,
        epoch.projected ?? false,
      ]),
    ).toEqual([
      [0n, false, false],
      [1_500_000n, true, false],
      [null, false, false],
      [0n, false, true],
    ])
  })

  it("labels lower-bound bars with ≥", () => {
    const bars = earningsBars({
      history: {
        status: "ready",
        lagSeconds: 0,
        data: walletChartEpochs(earnings()),
      },
      epochStart: LAUNCH_EPOCH_START + 7n * WEEK,
      historyEpochs: 3,
    })
    expect(bars.map((bar) => bar.display)).toEqual(["$0", "≥$2", "Unpriced"])
  })
})
