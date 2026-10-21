import { z } from "zod"
import { decimalStringSchema, isoDateTimeSchema } from "./common"
import { type NetworkSlug, networkSlugSchema } from "./network"

/**
 * Platform health: the developer-api runs a 1-minute cron that probes the
 * Gauge Profile API (`GET /v1/health` over the public front door), Matchbox
 * ID (`GET /.well-known/openid-configuration`) and chain-state freshness
 * (`mbx_api_gauge_chain_state`, one row per network), and writes one
 * Analytics Engine data point per probe to `mbx_platform_health`. The
 * developer console reads the dataset with the Analytics Engine SQL API and
 * answers `GET /api/platform/health` with `platformHealthResponseSchema`.
 *
 * | Column    | Field          | Notes                                                    |
 * | --------- | -------------- | -------------------------------------------------------- |
 * | `index1`  | `target`       | `gauge-profile-api`, `matchbox-id`, `chain-sync:<network>` |
 * | `blob1`   | `deployment`   | Worker `ENVIRONMENT` (`production`, `preview`, …)          |
 * | `blob2`   | `outcome`      | `up` / `degraded` / `down`                                 |
 * | `blob3`   | `errorCode`    | `healthProbeErrorCodeSchema`, `""` when up                 |
 * | `blob4`   | `network`      | chain-sync only, `""` otherwise                            |
 * | `blob5`   | `version`      | `/v1/health` version, `""` otherwise                       |
 * | `blob6`   | `blockNumber`  | chain-sync stored block (decimal), `""` when unknown       |
 * | `blob7`   | `chainCheckedAt` | chain-sync `checked_at` ISO, `""` when unknown           |
 * | `blob8`   | `headBlock`    | chain-sync RPC head (decimal), `""` when unknown           |
 * | `double1` | `latencyMs`    | probe wall time (HTTP probes), 0 for chain-sync            |
 * | `double2` | `httpStatus`   | 0 when no response                                         |
 * | `double3` | `lagSeconds`   | chain-sync `now - checked_at`, -1 when unknown             |
 * | `double4` | `blocksBehind` | chain-sync `head - block`, -1 when unknown                 |
 *
 * Never reorder columns; only append.
 */

export const platformHealthDataset = "mbx_platform_health"

export const platformProductSchema = z.enum([
  "gauge-profile-api",
  "matchbox-id",
])

export type PlatformProduct = z.infer<typeof platformProductSchema>

export const platformProductNames = {
  "gauge-profile-api": "Gauge Profile API",
  "matchbox-id": "Matchbox ID",
} as const satisfies Record<PlatformProduct, string>

export const healthProbeTargetSchema = z.enum([
  "gauge-profile-api",
  "matchbox-id",
  "chain-sync:mezo",
  "chain-sync:mezo-testnet",
])

export type HealthProbeTarget = z.infer<typeof healthProbeTargetSchema>

export function chainSyncTarget(network: NetworkSlug): HealthProbeTarget {
  return network === "mezo" ? "chain-sync:mezo" : "chain-sync:mezo-testnet"
}

/** One probe's verdict. `degraded` still counts as available for uptime. */
export const healthProbeOutcomeSchema = z.enum(["up", "degraded", "down"])

export type HealthProbeOutcome = z.infer<typeof healthProbeOutcomeSchema>

export const healthProbeErrorCodeSchema = z.enum([
  "timeout",
  "network-error",
  "http-error",
  "invalid-body",
  "service-disabled",
  "slow",
  "stale",
  "no-data",
  "rpc-unavailable",
])

export type HealthProbeErrorCode = z.infer<typeof healthProbeErrorCodeSchema>

/** Probe thresholds shared by the writer (cron) and the reader (console). */
export const healthProbeThresholds = {
  /** HTTP probes abort after this long (outcome `down`, `timeout`). */
  timeoutMs: 5_000,
  /** Slower successful HTTP probes are `degraded` (`slow`). */
  degradedLatencyMs: 1_500,
  /** Chain state older than this is `degraded` (`stale`); the reconcile
   * cron runs every 10 minutes. */
  chainStaleSeconds: 20 * 60,
  /** Chain state older than this (or missing) is `down`. */
  chainDownSeconds: 60 * 60,
  /** No probe for a target within this window → status `unknown`. */
  freshnessSeconds: 5 * 60,
  /** A `down` probe within this window makes an `up` target `degraded`. */
  recentFailureSeconds: 10 * 60,
} as const

export const healthProbeSchema = z.object({
  target: healthProbeTargetSchema,
  deployment: z.string().min(1),
  outcome: healthProbeOutcomeSchema,
  errorCode: healthProbeErrorCodeSchema.nullable(),
  network: networkSlugSchema.nullable(),
  version: z.string().nullable(),
  blockNumber: decimalStringSchema.nullable(),
  chainCheckedAt: isoDateTimeSchema.nullable(),
  headBlock: decimalStringSchema.nullable(),
  latencyMs: z.number().nonnegative(),
  httpStatus: z.number().int().min(0).max(599),
  lagSeconds: z.number().int().min(-1),
  blocksBehind: z.number().int().min(-1),
})

export type HealthProbe = z.infer<typeof healthProbeSchema>

export const PLATFORM_HEALTH_LAYOUT = {
  target: "index1",
  deployment: "blob1",
  outcome: "blob2",
  errorCode: "blob3",
  network: "blob4",
  version: "blob5",
  blockNumber: "blob6",
  chainCheckedAt: "blob7",
  headBlock: "blob8",
  latencyMs: "double1",
  httpStatus: "double2",
  lagSeconds: "double3",
  blocksBehind: "double4",
} as const

export type HealthProbeDataPoint = {
  indexes: [string]
  blobs: [string, string, string, string, string, string, string, string]
  doubles: [number, number, number, number]
}

/** Flattens a probe into the `writeDataPoint` payload (layout above). */
export function healthProbeDataPoint(probe: HealthProbe): HealthProbeDataPoint {
  return {
    indexes: [probe.target],
    blobs: [
      probe.deployment,
      probe.outcome,
      probe.errorCode ?? "",
      probe.network ?? "",
      probe.version ?? "",
      probe.blockNumber ?? "",
      probe.chainCheckedAt ?? "",
      probe.headBlock ?? "",
    ],
    doubles: [
      probe.latencyMs,
      probe.httpStatus,
      probe.lagSeconds,
      probe.blocksBehind,
    ],
  }
}

// ---------------------------------------------------------------------------
// Console read model: GET /api/platform/health
// ---------------------------------------------------------------------------

/** `unknown` = no probe within `freshnessSeconds` (render "—", not green). */
export const healthStatusSchema = z.enum([
  "operational",
  "degraded",
  "down",
  "unknown",
])

export type HealthStatus = z.infer<typeof healthStatusSchema>

/** `probes` = recorded by the cron; `local` = memory-mode fixture data. */
export const platformHealthSourceSchema = z.enum(["probes", "local"])

export type PlatformHealthSource = z.infer<typeof platformHealthSourceSchema>

const ratioSchema = z.number().min(0).max(1).nullable()
const latencyMsSchema = z.number().nonnegative().nullable()

export const productHealthSchema = z.object({
  product: platformProductSchema,
  name: z.string(),
  status: healthStatusSchema,
  /** `/v1/health` version for the Gauge Profile API; null for Matchbox ID. */
  version: z.string().nullable(),
  /** Available probes / all probes, [0, 1]; null when there were none. */
  uptime24h: ratioSchema,
  uptime7d: ratioSchema,
  /** Latency of available probes over 24 h. */
  p50LatencyMs: latencyMsSchema,
  p95LatencyMs: latencyMsSchema,
  checks24h: z.number().int().nonnegative(),
  lastCheckedAt: isoDateTimeSchema.nullable(),
  /** Error code of the latest probe; null when it was `up`. */
  lastErrorCode: healthProbeErrorCodeSchema.nullable(),
})

export type ProductHealth = z.infer<typeof productHealthSchema>

export const chainSyncHealthSchema = z.object({
  network: networkSlugSchema,
  status: healthStatusSchema,
  /** Block the chain-state reconciliation last pinned (decimal). */
  blockNumber: decimalStringSchema.nullable(),
  /** `checked_at` of the newest chain-state row. */
  checkedAt: isoDateTimeSchema.nullable(),
  /** Seconds between `checkedAt` and the response's `generatedAt`. */
  lagSeconds: z.number().int().nonnegative().nullable(),
  /** RPC head at the latest probe and the stored block's distance to it. */
  headBlock: decimalStringSchema.nullable(),
  blocksBehind: z.number().int().nonnegative().nullable(),
  lastCheckedAt: isoDateTimeSchema.nullable(),
})

export type ChainSyncHealth = z.infer<typeof chainSyncHealthSchema>

export const platformHealthResponseSchema = z.object({
  source: platformHealthSourceSchema,
  generatedAt: isoDateTimeSchema,
  products: z.array(productHealthSchema),
  chainSync: z.array(chainSyncHealthSchema),
})

export type PlatformHealthResponse = z.infer<
  typeof platformHealthResponseSchema
>

/** Outcome of an HTTP probe from its status and latency. */
export function httpProbeOutcome(input: {
  ok: boolean
  latencyMs: number
}): { outcome: HealthProbeOutcome; errorCode: HealthProbeErrorCode | null } {
  if (!input.ok) return { outcome: "down", errorCode: "http-error" }
  if (input.latencyMs >= healthProbeThresholds.degradedLatencyMs) {
    return { outcome: "degraded", errorCode: "slow" }
  }
  return { outcome: "up", errorCode: null }
}

/** Outcome of a chain-sync probe from the age of the newest state row. */
export function chainSyncOutcome(lagSeconds: number | null): {
  outcome: HealthProbeOutcome
  errorCode: HealthProbeErrorCode | null
} {
  if (lagSeconds === null) return { outcome: "down", errorCode: "no-data" }
  if (lagSeconds >= healthProbeThresholds.chainDownSeconds) {
    return { outcome: "down", errorCode: "stale" }
  }
  if (lagSeconds >= healthProbeThresholds.chainStaleSeconds) {
    return { outcome: "degraded", errorCode: "stale" }
  }
  return { outcome: "up", errorCode: null }
}

/**
 * Current status from recent probes (newest first): none fresh → `unknown`;
 * latest `down` → `down`; latest `degraded`, or any `down` within
 * `recentFailureSeconds` → `degraded`; otherwise `operational`.
 */
export function healthStatusFromProbes(
  recent: readonly { outcome: HealthProbeOutcome; at: Date }[],
  now: Date,
): HealthStatus {
  const nowMs = now.getTime()
  const sorted = [...recent].sort((a, b) => b.at.getTime() - a.at.getTime())
  const latest = sorted[0]
  if (
    latest === undefined ||
    nowMs - latest.at.getTime() > healthProbeThresholds.freshnessSeconds * 1000
  ) {
    return "unknown"
  }
  if (latest.outcome === "down") return "down"
  if (latest.outcome === "degraded") return "degraded"
  const failedRecently = sorted.some(
    (probe) =>
      probe.outcome === "down" &&
      nowMs - probe.at.getTime() <=
        healthProbeThresholds.recentFailureSeconds * 1000,
  )
  return failedRecently ? "degraded" : "operational"
}
