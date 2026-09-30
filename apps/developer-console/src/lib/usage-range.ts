import type { UsageBucket } from "@repo/platform-contracts/console"

export type UsageRange = "24h" | "7d" | "30d"

export const usageRanges: Record<
  UsageRange,
  { label: string; seconds: number; bucket: UsageBucket }
> = {
  "24h": { label: "24 h", seconds: 86_400, bucket: "hour" },
  "7d": { label: "7 d", seconds: 7 * 86_400, bucket: "hour" },
  "30d": { label: "30 d", seconds: 30 * 86_400, bucket: "day" },
}

export function isUsageRange(value: unknown): value is UsageRange {
  return value === "24h" || value === "7d" || value === "30d"
}

/** Window ending at the current minute, so query keys stay stable. */
export function rangeWindow(
  range: UsageRange,
  now: number = Date.now(),
): { from: string; to: string; bucket: UsageBucket } {
  const end = Math.floor(now / 60_000) * 60_000
  const { seconds, bucket } = usageRanges[range]
  return {
    from: new Date(end - seconds * 1000).toISOString(),
    to: new Date(end).toISOString(),
    bucket,
  }
}
