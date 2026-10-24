import {
  type UsageBucket,
  usageBucketSeconds,
  usageMaxRangeSeconds,
} from "@repo/platform-contracts/console"

export type UsageRange = "1h" | "24h" | "7d" | "30d" | "90d"

export type UsageRangeSpec = {
  label: string
  /** Accessible name for the abbreviated chip label. */
  name: string
  bucket: UsageBucket
  /** Buckets in the window, the current (partial) one included. */
  buckets: number
  /** Buckets merged per chart bar, so every range draws ≤ 13 bars. */
  perBar: number
  /** What one bar covers, for chart titles ("Requests by day"). */
  per: string
}

export const usageRanges: Record<UsageRange, UsageRangeSpec> = {
  "1h": {
    label: "1 h",
    name: "Last hour",
    bucket: "minute",
    buckets: 60,
    perBar: 5,
    per: "5 min",
  },
  "24h": {
    label: "24 h",
    name: "Last 24 hours",
    bucket: "hour",
    buckets: 24,
    perBar: 2,
    per: "2 h",
  },
  "7d": {
    label: "7 d",
    name: "Last 7 days",
    bucket: "day",
    buckets: 7,
    perBar: 1,
    per: "day",
  },
  "30d": {
    label: "30 d",
    name: "Last 30 days",
    bucket: "day",
    buckets: 30,
    perBar: 3,
    per: "3 d",
  },
  "90d": {
    label: "90 d",
    name: "Last 90 days",
    bucket: "day",
    buckets: 90,
    perBar: 7,
    per: "week",
  },
}

export function isUsageRange(value: unknown): value is UsageRange {
  return typeof value === "string" && value in usageRanges
}

export type UsageWindow = { from: string; to: string; bucket: UsageBucket }

/**
 * Window of whole buckets ending with the current one: "7 d" is today and
 * the six UTC days before it. `to` is the next minute boundary, so query
 * keys stay stable within a minute.
 */
export function rangeWindow(
  range: UsageRange,
  now: number = Date.now(),
): UsageWindow {
  const { bucket, buckets } = usageRanges[range]
  const size = usageBucketSeconds[bucket] * 1000
  const currentStart = Math.floor(now / size) * size
  const from = currentStart - (buckets - 1) * size
  const nextMinute = Math.floor(now / 60_000) * 60_000 + 60_000
  const to = Math.min(nextMinute, from + usageMaxRangeSeconds[bucket] * 1000)
  return {
    from: new Date(from).toISOString(),
    to: new Date(to).toISOString(),
    bucket,
  }
}
