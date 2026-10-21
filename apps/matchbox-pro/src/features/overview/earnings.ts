import {
  EPOCH_SECONDS,
  type HistoryResult,
  type WalletEarnings,
} from "@/features/history/useHistory"
import { epochNumberFor } from "@/lib/epoch"
import { formatWholeUsd } from "@/lib/overview"
import type { Bar } from "@repo/ui/bar-chart"

const WEEK_SECONDS = 604_800n

/**
 * Live value for one bar: loading, failed, not applicable (no eligible
 * locks), or a micro-USD amount.
 */
export type LiveValue =
  | { status: "loading" }
  | { status: "unavailable" }
  | { status: "none" }
  | { status: "ready"; usdMicro: bigint }

/** One epoch on the chart (realized history, or the accruing `projected`). */
export type ChartEpoch = {
  epoch: number
  /** Unix seconds the epoch started. */
  startsAt: number
  /** Null: earned tokens but none priced yet ("Unpriced"). */
  usdMicro: bigint | null
  projected?: boolean
  /** Some lines still unpriced: USD is at least this and will grow. */
  lowerBound?: boolean
}

function epochUsd(
  tokenCount: number,
  usdMicro: bigint | null,
  unpriced: number,
): Pick<ChartEpoch, "usdMicro" | "lowerBound"> {
  // Nothing earned is a real $0, not a missing price.
  if (tokenCount === 0) return { usdMicro: 0n, lowerBound: false }
  if (usdMicro === null) return { usdMicro: null, lowerBound: false }
  return { usdMicro, lowerBound: unpriced > 0 }
}

/**
 * Wallet earnings to chart epochs, oldest first, the accruing epoch last.
 * Priced lines show as soon as they arrive (a lower bound while other
 * prices retry) instead of the whole epoch reading "Unpriced".
 */
export function walletChartEpochs(earnings: WalletEarnings): ChartEpoch[] {
  const { current } = earnings
  return [
    ...earnings.epochs.map((epoch) => ({
      epoch: epoch.epochStart / EPOCH_SECONDS,
      startsAt: epoch.epochStart,
      ...epochUsd(epoch.tokens.length, epoch.usdAtEarnMicro, epoch.unpriced),
    })),
    {
      epoch: current.epochStart / EPOCH_SECONDS,
      startsAt: current.epochStart,
      ...epochUsd(current.tokens.length, current.usdNowMicro, 0),
      projected: true,
    },
  ]
}

/** Whole dollars; sub-dollar amounts read "<$1" rather than "$0". */
function barUsd(usdMicro: bigint): string {
  return usdMicro > 0n && usdMicro < 500_000n ? "<$1" : formatWholeUsd(usdMicro)
}

// Chart geometry only; displayed figures come from the bigint value.
function geometry(usdMicro: bigint): number {
  return Number(usdMicro) / 1_000_000
}

const dayLabel = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
})

/** Protocol epoch number when known, else the epoch's start date. */
function epochAxisLabel(epochStart: bigint): string {
  const number = epochNumberFor(epochStart)
  return number === null
    ? dayLabel.format(new Date(Number(epochStart) * 1000))
    : String(number)
}

/**
 * Epoch bar chart on one scale. History bars are the sealed epochs before
 * `epochStart`; history that hasn't loaded or isn't served draws dashed
 * stubs, never zeros.
 *
 * - `current`: a live value for the in-progress epoch (public deposits so
 *   far). Omit it for earnings: claimable money is already inside the
 *   realized bars, so the newest sealed epoch is highlighted instead.
 * - `next`: the in-progress epoch's projection ("Next"). The history's own
 *   projected entry backs it up and never counts as realized.
 */
export function earningsBars({
  history,
  epochStart,
  current,
  next,
  historyEpochs = 5,
}: {
  history: HistoryResult<ChartEpoch[]>
  epochStart: bigint | undefined
  current?: LiveValue | undefined
  next?: LiveValue | undefined
  historyEpochs?: number
}): Bar[] {
  const bars: Bar[] = []
  const entries = history.status === "ready" ? (history.data ?? []) : []
  const realized = entries.filter(
    (item) =>
      item.projected !== true &&
      (epochStart === undefined || BigInt(item.startsAt) < epochStart),
  )
  const accruing = entries.find((item) => item.projected === true)

  if (realized.length > 0) {
    const shown = realized.slice(-historyEpochs)
    shown.forEach((item, index) => {
      const start = BigInt(item.startsAt)
      const latest = current === undefined && index === shown.length - 1
      bars.push({
        key: `epoch-${item.startsAt}`,
        label: epochAxisLabel(start),
        value: item.usdMicro === null ? null : geometry(item.usdMicro),
        display:
          item.usdMicro === null
            ? "Unpriced"
            : `${item.lowerBound ? "≥" : ""}${barUsd(item.usdMicro)}`,
        tone:
          item.usdMicro === null ? "unavailable" : latest ? "current" : "past",
      })
    })
  } else if (epochStart !== undefined) {
    for (let back = historyEpochs; back >= 1; back -= 1) {
      const start = epochStart - WEEK_SECONDS * BigInt(back)
      bars.push({
        key: `epoch-${start}`,
        label: epochAxisLabel(start),
        value: null,
        display: "—",
        tone: "unavailable",
      })
    }
  }

  if (current !== undefined) bars.push(liveBar("current", current, epochStart))
  if (next !== undefined) {
    // The live projection drives the hero's Projected figure too, so it wins;
    // the history's accruing entry fills in when the live read can't.
    bars.push(
      liveBar(
        "next",
        next.status === "ready" || !accruing
          ? next
          : accruing.usdMicro === null
            ? { status: "unavailable" }
            : { status: "ready", usdMicro: accruing.usdMicro },
        epochStart,
      ),
    )
  }
  return bars
}

function liveBar(
  key: "current" | "next",
  value: LiveValue,
  epochStart: bigint | undefined,
): Bar {
  const label =
    key === "next"
      ? "Next"
      : epochStart === undefined
        ? "Now"
        : epochAxisLabel(epochStart)
  if (value.status !== "ready") {
    return { key, label, value: null, display: "—", tone: "unavailable" }
  }
  return {
    key,
    label,
    value: geometry(value.usdMicro),
    display: barUsd(value.usdMicro),
    tone: key === "current" ? "current" : "projected",
  }
}

/** Axis ticks: "$0", "$500", "$1k", "$2.5k". */
export function formatTick(value: number): string {
  if (value >= 1_000_000) return `$${trim(value / 1_000_000)}M`
  if (value >= 1_000) return `$${trim(value / 1_000)}k`
  return `$${trim(value)}`
}

function trim(value: number): string {
  return String(Math.round(value * 100) / 100)
}

/**
 * The chart's empty state, or null to draw bars: no earnings in any shown
 * epoch, or no locks while history is still out (nothing new can accrue).
 */
export function earningsEmptyState(
  bars: Bar[],
  { hasLocks, historyReady }: { hasLocks: boolean; historyReady: boolean },
): string | null {
  const earned = bars.some((bar) => bar.value !== null && bar.value > 0)
  if (earned) return null
  if (historyReady && bars.every((bar) => bar.value !== null)) {
    return "No earnings yet"
  }
  return hasLocks ? null : "No locks"
}
