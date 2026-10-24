import type { UsageBucket } from "@repo/platform-contracts/console"
import type { Bar } from "@repo/ui/bar-chart"
import { formatCompact } from "./format"

/** A usage series point; the error split is absent on older servers. */
export type SeriesPoint = {
  start: string
  requests: number
  errors: number
  clientErrors?: number | undefined
  rateLimited?: number | undefined
  serverErrors?: number | undefined
}

export type ErrorSplit = {
  clientErrors: number
  rateLimited: number
  serverErrors: number
}

export type UsageGroup = {
  start: string
  requests: number
  errors: number
  /** Null when any merged point lacks the split. */
  split: ErrorSplit | null
}

function splitOf(point: SeriesPoint): ErrorSplit | null {
  if (
    point.clientErrors === undefined ||
    point.rateLimited === undefined ||
    point.serverErrors === undefined
  ) {
    return null
  }
  return {
    clientErrors: point.clientErrors,
    rateLimited: point.rateLimited,
    serverErrors: point.serverErrors,
  }
}

/**
 * Merges `perBar` consecutive buckets into one bar, counting from the end
 * so the last bar always holds the current bucket.
 */
export function groupSeries(
  points: readonly SeriesPoint[],
  perBar: number,
): UsageGroup[] {
  const size = Math.max(1, Math.floor(perBar))
  const groups: UsageGroup[] = []
  for (let end = points.length; end > 0; end -= size) {
    const slice = points.slice(Math.max(0, end - size), end)
    const first = slice[0]
    if (first === undefined) continue
    let split: ErrorSplit | null = {
      clientErrors: 0,
      rateLimited: 0,
      serverErrors: 0,
    }
    let requests = 0
    let errors = 0
    for (const point of slice) {
      requests += point.requests
      errors += point.errors
      const part = splitOf(point)
      split =
        split === null || part === null
          ? null
          : {
              clientErrors: split.clientErrors + part.clientErrors,
              rateLimited: split.rateLimited + part.rateLimited,
              serverErrors: split.serverErrors + part.serverErrors,
            }
    }
    groups.unshift({ start: first.start, requests, errors, split })
  }
  return groups
}

const timeFormat = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
})

/** Day buckets are UTC days ("10/21"); hours and minutes are local "14:00". */
export function barLabel(start: string, bucket: UsageBucket): string {
  const date = new Date(start)
  if (bucket === "day") {
    return `${date.getUTCMonth() + 1}/${date.getUTCDate()}`
  }
  return timeFormat.format(date)
}

/** Requests per bar; the last (current) bar is highlighted. */
export function requestBars(
  groups: readonly UsageGroup[],
  bucket: UsageBucket,
): Bar[] {
  return groups.map((group, index) => ({
    key: group.start,
    label: barLabel(group.start, bucket),
    value: group.requests,
    display: formatCompact(group.requests),
    tone: index === groups.length - 1 ? "current" : "past",
  }))
}

export type ErrorStack = {
  key: string
  label: string
  total: number
  split: ErrorSplit | null
  current: boolean
}

export function errorStacks(
  groups: readonly UsageGroup[],
  bucket: UsageBucket,
): ErrorStack[] {
  return groups.map((group, index) => ({
    key: group.start,
    label: barLabel(group.start, bucket),
    total: group.errors,
    split: group.split,
    current: index === groups.length - 1,
  }))
}

/** "30K" / "12.5K" / "0" axis ticks. */
export function compactTick(value: number): string {
  return formatCompact(value)
}
