import { decimalStringSchema } from "@repo/platform-contracts/common"
import {
  type NetworkSlug,
  networkSlugSchema,
} from "@repo/platform-contracts/network"
import {
  type ChainSyncHealth,
  type HealthProbeTarget,
  PLATFORM_HEALTH_LAYOUT,
  type PlatformHealthResponse,
  type ProductHealth,
  chainSyncTarget,
  healthProbeErrorCodeSchema,
  healthProbeOutcomeSchema,
  healthProbeTargetSchema,
  healthProbeThresholds,
  healthStatusFromProbes,
  platformHealthDataset,
  platformProductNames,
  platformProductSchema,
} from "@repo/platform-contracts/platform-health"
import { z } from "zod"

/**
 * Read side of platform health: Analytics Engine SQL over
 * `mbx_platform_health` (written by the developer-api 1-minute cron) and
 * the summary the console serves at `GET /api/platform/health`. Every value
 * that reaches SQL text is validated (deployment slug, integer timestamps);
 * column positions come from `PLATFORM_HEALTH_LAYOUT` only.
 */

/** Shape of the console's Analytics Engine SQL client. */
export type AnalyticsSqlClient = {
  query(sql: string): Promise<Record<string, unknown>[]>
}

export class PlatformHealthDataError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = "PlatformHealthDataError"
  }
}

const column = PLATFORM_HEALTH_LAYOUT
const deploymentPattern = /^[a-z0-9][a-z0-9-]{0,31}$/

function deploymentLiteral(value: string): string {
  if (!deploymentPattern.test(value)) {
    throw new PlatformHealthDataError("Invalid deployment name")
  }
  return `'${value}'`
}

function unixSeconds(value: Date): number {
  const time = value.getTime()
  if (!Number.isFinite(time) || time < 0) {
    throw new PlatformHealthDataError("Invalid timestamp")
  }
  return Math.floor(time / 1000)
}

export type HealthQueryInput = { deployment: string; now: Date }

const daySeconds = 86_400
const available = `${column.outcome} != 'down'`

/** Probe counts per target over 7 days and 24 hours, plus the last probe. */
export function buildHealthUptimeSql(input: HealthQueryInput): string {
  const now = unixSeconds(input.now)
  const dayAgo = now - daySeconds
  return [
    `SELECT ${column.target} AS target,`,
    "SUM(_sample_interval) AS checks_7d,",
    `sumIf(_sample_interval, ${available}) AS available_7d,`,
    `sumIf(_sample_interval, timestamp >= toDateTime(${dayAgo})) AS checks_24h,`,
    `sumIf(_sample_interval, ${available} AND timestamp >= toDateTime(${dayAgo})) AS available_24h,`,
    "MAX(toUnixTimestamp(timestamp)) AS last_ts",
    `FROM ${platformHealthDataset}`,
    `WHERE ${column.deployment} = ${deploymentLiteral(input.deployment)}`,
    `AND timestamp >= toDateTime(${now - 7 * daySeconds})`,
    `AND timestamp < toDateTime(${now + 60})`,
    "GROUP BY target FORMAT JSON",
  ].join(" ")
}

/** p50/p95 latency of available probes over 24 hours, per target. */
export function buildHealthLatencySql(input: HealthQueryInput): string {
  const now = unixSeconds(input.now)
  const quantile = (q: "0.5" | "0.95") =>
    `quantileExactWeighted(${q})(${column.latencyMs}, _sample_interval)`
  return [
    `SELECT ${column.target} AS target,`,
    `${quantile("0.5")} AS p50, ${quantile("0.95")} AS p95`,
    `FROM ${platformHealthDataset}`,
    `WHERE ${column.deployment} = ${deploymentLiteral(input.deployment)}`,
    `AND ${available}`,
    `AND timestamp >= toDateTime(${now - daySeconds})`,
    `AND timestamp < toDateTime(${now + 60})`,
    "GROUP BY target FORMAT JSON",
  ].join(" ")
}

/** Probes within the recent-failure window, newest first. */
export function buildHealthRecentSql(input: HealthQueryInput): string {
  const now = unixSeconds(input.now)
  const since = now - healthProbeThresholds.recentFailureSeconds - 60
  return [
    `SELECT ${column.target} AS target, toUnixTimestamp(timestamp) AS ts,`,
    `${column.outcome} AS outcome, ${column.errorCode} AS error_code,`,
    `${column.version} AS version, ${column.blockNumber} AS block_number,`,
    `${column.chainCheckedAt} AS chain_checked_at, ${column.headBlock} AS head_block,`,
    `${column.blocksBehind} AS blocks_behind`,
    `FROM ${platformHealthDataset}`,
    `WHERE ${column.deployment} = ${deploymentLiteral(input.deployment)}`,
    `AND timestamp >= toDateTime(${since})`,
    `AND timestamp < toDateTime(${now + 60})`,
    "ORDER BY timestamp DESC LIMIT 200 FORMAT JSON",
  ].join(" ")
}

/** AE returns numbers as numbers or numeric strings. */
const aeNumber = z
  .union([z.number(), z.string(), z.null()])
  .transform((value) => {
    if (value === null) return null
    const number = typeof value === "number" ? value : Number(value)
    return Number.isFinite(number) ? number : null
  })

const count = aeNumber.transform((value) =>
  value === null ? 0 : Math.max(Math.round(value), 0),
)

const latency = aeNumber.transform((value) =>
  value === null || value < 0 ? null : Math.round(value * 100) / 100,
)

/** Empty blobs mean "unknown". */
const blob = z
  .string()
  .nullable()
  .transform((value) => (value === null || value.length === 0 ? null : value))

const target = z.string().transform((value) => {
  const parsed = healthProbeTargetSchema.safeParse(value)
  return parsed.success ? parsed.data : null
})

const uptimeRow = z.object({
  target,
  checks_7d: count,
  available_7d: count,
  checks_24h: count,
  available_24h: count,
  last_ts: aeNumber,
})

const latencyRow = z.object({ target, p50: latency, p95: latency })

const recentRow = z.object({
  target,
  ts: count,
  outcome: z.string().transform((value) => {
    const parsed = healthProbeOutcomeSchema.safeParse(value)
    return parsed.success ? parsed.data : "down"
  }),
  error_code: blob.transform((value) => {
    const parsed = healthProbeErrorCodeSchema.safeParse(value)
    return parsed.success ? parsed.data : null
  }),
  version: blob,
  block_number: blob.transform((value) => {
    const parsed = decimalStringSchema.safeParse(value)
    return parsed.success ? parsed.data : null
  }),
  chain_checked_at: blob.transform((value) =>
    value === null || Number.isNaN(Date.parse(value))
      ? null
      : new Date(Date.parse(value)).toISOString(),
  ),
  head_block: blob.transform((value) => {
    const parsed = decimalStringSchema.safeParse(value)
    return parsed.success ? parsed.data : null
  }),
  blocks_behind: aeNumber.transform((value) =>
    value === null || value < 0 ? null : Math.round(value),
  ),
})

export type HealthUptimeRow = z.output<typeof uptimeRow>
export type HealthLatencyRow = z.output<typeof latencyRow>
export type HealthRecentRow = z.output<typeof recentRow>

function parseRows<Schema extends z.ZodType>(
  schema: Schema,
  rows: Record<string, unknown>[],
): z.output<Schema>[] {
  const parsed = z.array(schema).safeParse(rows)
  if (!parsed.success) {
    throw new PlatformHealthDataError("Unexpected platform health rows", {
      cause: parsed.error,
    })
  }
  return parsed.data
}

function ratio(availableCount: number, total: number): number | null {
  if (total <= 0) return null
  return Math.min(Math.max(availableCount / total, 0), 1)
}

function isoFromSeconds(seconds: number | null): string | null {
  return seconds === null || seconds <= 0
    ? null
    : new Date(seconds * 1000).toISOString()
}

/** Builds the console response from the three query results. */
export function summarizePlatformHealth(input: {
  uptime: readonly HealthUptimeRow[]
  latency: readonly HealthLatencyRow[]
  recent: readonly HealthRecentRow[]
  now: Date
}): PlatformHealthResponse {
  const recentFor = (wanted: HealthProbeTarget) =>
    input.recent
      .filter((row) => row.target === wanted)
      .sort((a, b) => b.ts - a.ts)
  const uptimeFor = (wanted: HealthProbeTarget) =>
    input.uptime.find((row) => row.target === wanted)
  const statusFor = (rows: readonly HealthRecentRow[]) =>
    healthStatusFromProbes(
      rows.map((row) => ({
        outcome: row.outcome,
        at: new Date(row.ts * 1000),
      })),
      input.now,
    )

  const products = platformProductSchema.options.map(
    (product): ProductHealth => {
      const recent = recentFor(product)
      const latest = recent[0]
      const uptime = uptimeFor(product)
      const latencyRow = input.latency.find((row) => row.target === product)
      return {
        product,
        name: platformProductNames[product],
        status: statusFor(recent),
        version:
          product === "gauge-profile-api"
            ? (recent.find((row) => row.version !== null)?.version ?? null)
            : null,
        uptime24h: ratio(uptime?.available_24h ?? 0, uptime?.checks_24h ?? 0),
        uptime7d: ratio(uptime?.available_7d ?? 0, uptime?.checks_7d ?? 0),
        p50LatencyMs: latencyRow?.p50 ?? null,
        p95LatencyMs: latencyRow?.p95 ?? null,
        checks24h: uptime?.checks_24h ?? 0,
        lastCheckedAt:
          latest === undefined
            ? isoFromSeconds(uptime?.last_ts ?? null)
            : isoFromSeconds(latest.ts),
        lastErrorCode: latest?.error_code ?? null,
      }
    },
  )

  const chainSync = networkSlugSchema.options.map(
    (network: NetworkSlug): ChainSyncHealth => {
      const recent = recentFor(chainSyncTarget(network))
      const latest = recent[0]
      const uptime = uptimeFor(chainSyncTarget(network))
      const checkedAt = latest?.chain_checked_at ?? null
      return {
        network,
        status: statusFor(recent),
        blockNumber: latest?.block_number ?? null,
        checkedAt,
        lagSeconds:
          checkedAt === null
            ? null
            : Math.max(
                Math.floor(
                  (input.now.getTime() - Date.parse(checkedAt)) / 1000,
                ),
                0,
              ),
        headBlock: latest?.head_block ?? null,
        blocksBehind: latest?.blocks_behind ?? null,
        lastCheckedAt:
          latest === undefined
            ? isoFromSeconds(uptime?.last_ts ?? null)
            : isoFromSeconds(latest.ts),
      }
    },
  )

  return {
    source: "probes",
    generatedAt: input.now.toISOString(),
    products,
    chainSync,
  }
}

export type PlatformHealthReader = {
  read(now: Date): Promise<PlatformHealthResponse>
}

/**
 * Reads `mbx_platform_health` for one deployment (the Worker `ENVIRONMENT`
 * the probes were written with). Client errors propagate; unexpected rows
 * throw `PlatformHealthDataError`.
 */
export function createPlatformHealthReader(input: {
  client: AnalyticsSqlClient
  deployment: string
}): PlatformHealthReader {
  return {
    async read(now) {
      const query = { deployment: input.deployment, now }
      const [uptime, latency, recent] = await Promise.all([
        input.client.query(buildHealthUptimeSql(query)),
        input.client.query(buildHealthLatencySql(query)),
        input.client.query(buildHealthRecentSql(query)),
      ])
      return summarizePlatformHealth({
        uptime: parseRows(uptimeRow, uptime),
        latency: parseRows(latencyRow, latency),
        recent: parseRows(recentRow, recent),
        now,
      })
    },
  }
}

/**
 * Memory-mode fixture (`source: "local"`): fixed, round values so every
 * tile renders locally. Never shown for a deployed console.
 */
export function localPlatformHealth(now: Date): PlatformHealthResponse {
  const minute = Math.floor(now.getTime() / 60_000) * 60_000
  const at = (secondsAgo: number) =>
    new Date(minute - secondsAgo * 1000).toISOString()
  const product = (
    name: "gauge-profile-api" | "matchbox-id",
    version: string | null,
  ): ProductHealth => ({
    product: name,
    name: platformProductNames[name],
    status: "operational",
    version,
    uptime24h: 1,
    uptime7d: 1,
    p50LatencyMs: 10,
    p95LatencyMs: 20,
    checks24h: 1_440,
    lastCheckedAt: at(0),
    lastErrorCode: null,
  })
  const chain = (
    network: NetworkSlug,
    blockNumber: string,
    lagSeconds: number,
  ): ChainSyncHealth => ({
    network,
    status: "operational",
    blockNumber,
    checkedAt: at(lagSeconds),
    lagSeconds: Math.max(
      Math.floor((now.getTime() - (minute - lagSeconds * 1000)) / 1000),
      0,
    ),
    headBlock: blockNumber,
    blocksBehind: 0,
    lastCheckedAt: at(0),
  })
  return {
    source: "local",
    generatedAt: now.toISOString(),
    products: [
      product("gauge-profile-api", "local"),
      product("matchbox-id", null),
    ],
    chainSync: [
      chain("mezo", "1000000", 240),
      chain("mezo-testnet", "2000000", 360),
    ],
  }
}
