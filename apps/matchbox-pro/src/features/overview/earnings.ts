import type { EpochEarning, HistoryResult } from "@/features/history/useHistory"
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
  history: HistoryResult<EpochEarning[]>
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
        display: item.usdMicro === null ? "Unpriced" : barUsd(item.usdMicro),
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
