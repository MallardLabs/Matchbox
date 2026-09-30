import type { UsageBucket } from "@repo/platform-contracts/console"
import { usageBucketSeconds } from "@repo/platform-contracts/console"
import { parseJson } from "@repo/platform-contracts/encoding"
import { z } from "zod"
import {
  aeNumberSchema,
  aeResponseSchema,
  buildByKeySql,
  buildRequestLogSql,
  buildRequestLookupSql,
  buildSeriesSql,
  buildTopRoutesSql,
  buildTotalsSql,
} from "./sql"

/** Usage data as routes consume it; the AE and synthetic sources produce it. */

export type UsagePoint = {
  /** Unix seconds at the start of the bucket. */
  start: number
  requests: number
  errors: number
  p50LatencyMs: number | null
  p95LatencyMs: number | null
}

export type UsageData = {
  totals: {
    requests: number
    errors: number
    p50LatencyMs: number | null
    p95LatencyMs: number | null
  }
  series: UsagePoint[]
  topRoutes: {
    route: string
    method: string
    requests: number
    errors: number
    p95LatencyMs: number | null
  }[]
  byKey: { keyId: string | null; requests: number; errors: number }[]
}

export type RequestLogRow = {
  requestId: string
  timestamp: string
  apiKeyId: string | null
  route: string
  method: string
  status: number
  cacheStatus: string | null
  colo: string | null
  country: string | null
  latencyMs: number
}

export type UsageInput = {
  environmentId: string
  from: Date
  to: Date
  bucket: UsageBucket
  apiKeyId: string | null
  /** The environment's key ids (synthetic data uses them for `byKey`). */
  knownKeyIds: string[]
}

export type RequestLogInput = {
  environmentId: string
  from: Date
  to: Date
  statusClass: "success" | "client-error" | "server-error" | null
  apiKeyId: string | null
  limit: number
  knownKeyIds: string[]
}

export type UsageAnalytics = {
  usage(input: UsageInput): Promise<UsageData>
  requests(input: RequestLogInput): Promise<RequestLogRow[]>
  request(input: {
    environmentId: string
    requestId: string
    now: Date
  }): Promise<RequestLogRow | null>
}

export class AnalyticsUnavailableError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = "AnalyticsUnavailableError"
  }
}

// ---------------------------------------------------------------------------
// Analytics Engine SQL API
// ---------------------------------------------------------------------------

export type AnalyticsEngineClient = {
  query(sql: string): Promise<Record<string, unknown>[]>
}

export function createAnalyticsEngineClient(input: {
  accountId: string
  token: string
  fetch?: typeof fetch
}): AnalyticsEngineClient {
  const fetcher = input.fetch ?? fetch
  const url = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(input.accountId)}/analytics_engine/sql`
  return {
    async query(sql) {
      const response = await fetcher(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${input.token}`,
          "Content-Type": "text/plain",
        },
        body: sql,
      })
      const text = await response.text()
      if (!response.ok) {
        throw new AnalyticsUnavailableError("Analytics Engine query failed", {
          cause: { status: response.status, body: text.slice(0, 500) },
        })
      }
      const json = parseJson(text)
      const parsed = json.ok ? aeResponseSchema.safeParse(json.value) : null
      if (parsed === null || !parsed.success) {
        throw new AnalyticsUnavailableError("Unexpected Analytics Engine body")
      }
      return parsed.data.data
    },
  }
}

const countSchema = aeNumberSchema.transform((value) =>
  value === null ? 0 : Math.max(Math.round(value), 0),
)

const latencySchema = aeNumberSchema.transform((value) =>
  value === null || value < 0 ? null : Math.round(value * 100) / 100,
)

const optionalBlob = z
  .string()
  .nullable()
  .transform((value) => (value === null || value.length === 0 ? null : value))

const totalsRow = z.object({
  requests: countSchema,
  errors: countSchema,
  p50: latencySchema,
  p95: latencySchema,
})

const seriesRow = z.object({
  bucket: countSchema,
  requests: countSchema,
  errors: countSchema,
  p50: latencySchema,
  p95: latencySchema,
})

const routeRow = z.object({
  route: z.string(),
  method: z.string(),
  requests: countSchema,
  errors: countSchema,
  p95: latencySchema,
})

const keyRow = z.object({
  key_id: optionalBlob,
  requests: countSchema,
  errors: countSchema,
})

const requestRow = z
  .object({
    request_id: z.string(),
    ts: countSchema,
    key_id: optionalBlob,
    route: z.string(),
    method: z.string(),
    status: countSchema,
    cache_status: optionalBlob,
    colo: optionalBlob,
    country: optionalBlob,
    latency_ms: latencySchema,
  })
  .transform(
    (row): RequestLogRow => ({
      requestId: row.request_id,
      timestamp: new Date(row.ts * 1000).toISOString(),
      apiKeyId: row.key_id,
      route: row.route,
      method: row.method,
      status: row.status,
      cacheStatus: row.cache_status,
      colo: row.colo,
      country: row.country,
      latencyMs: row.latency_ms ?? 0,
    }),
  )

function parseRows<Schema extends z.ZodType>(
  schema: Schema,
  rows: Record<string, unknown>[],
): z.output<Schema>[] {
  const parsed = z.array(schema).safeParse(rows)
  if (!parsed.success) {
    throw new AnalyticsUnavailableError("Unexpected Analytics Engine rows", {
      cause: parsed.error,
    })
  }
  return parsed.data
}

export function createAnalyticsEngineUsage(
  client: AnalyticsEngineClient,
): UsageAnalytics {
  return {
    async usage(input) {
      const filter = {
        environmentId: input.environmentId,
        from: input.from,
        to: input.to,
        apiKeyId: input.apiKeyId,
      }
      const [totals, series, routes, keys] = await Promise.all([
        client.query(buildTotalsSql(filter)),
        client.query(buildSeriesSql({ ...filter, bucket: input.bucket })),
        client.query(buildTopRoutesSql(filter)),
        client.query(buildByKeySql(filter)),
      ])
      const total = parseRows(totalsRow, totals)[0]
      return {
        totals: {
          requests: total?.requests ?? 0,
          errors: total?.errors ?? 0,
          p50LatencyMs: total?.p50 ?? null,
          p95LatencyMs: total?.p95 ?? null,
        },
        series: parseRows(seriesRow, series).map((row) => ({
          start: row.bucket,
          requests: row.requests,
          errors: row.errors,
          p50LatencyMs: row.p50,
          p95LatencyMs: row.p95,
        })),
        topRoutes: parseRows(routeRow, routes).map((row) => ({
          route: row.route,
          method: row.method,
          requests: row.requests,
          errors: row.errors,
          p95LatencyMs: row.p95,
        })),
        byKey: parseRows(keyRow, keys).map((row) => ({
          keyId: row.key_id,
          requests: row.requests,
          errors: row.errors,
        })),
      }
    },
    async requests(input) {
      const rows = await client.query(
        buildRequestLogSql({
          environmentId: input.environmentId,
          from: input.from,
          to: input.to,
          apiKeyId: input.apiKeyId,
          statusClass: input.statusClass,
          limit: input.limit,
        }),
      )
      return parseRows(requestRow, rows)
    },
    async request(input) {
      const rows = await client.query(buildRequestLookupSql(input))
      return parseRows(requestRow, rows)[0] ?? null
    },
  }
}

// ---------------------------------------------------------------------------
// Deterministic synthetic data (memory mode)
// ---------------------------------------------------------------------------

function hashSeed(value: string): number {
  let hash = 2166136261
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function random(seed: number): number {
  let state = (seed + 0x6d2b79f5) >>> 0
  state = Math.imul(state ^ (state >>> 15), state | 1)
  state ^= state + Math.imul(state ^ (state >>> 7), state | 61)
  return ((state ^ (state >>> 14)) >>> 0) / 4294967296
}

const syntheticRoutes = [
  { route: "/v1/gauge-profiles", method: "GET", weight: 0.62 },
  {
    route: "/v1/gauge-profiles/{network}/{gaugeAddress}",
    method: "GET",
    weight: 0.28,
  },
  { route: "/v1/networks", method: "GET", weight: 0.07 },
  {
    route: "/v1/vebtc/{network}/{tokenId}/gauge-profile",
    method: "GET",
    weight: 0.03,
  },
] as const

function syntheticPoint(
  environmentId: string,
  start: number,
  bucketSeconds: number,
): UsagePoint {
  const seed = hashSeed(`${environmentId}:${start}`)
  const hourOfDay = new Date(start * 1000).getUTCHours()
  const diurnal = 0.6 + 0.4 * Math.sin(((hourOfDay - 6) / 24) * 2 * Math.PI)
  const perMinute = 4 + 20 * diurnal * random(seed)
  const requests = Math.round((perMinute * bucketSeconds) / 60)
  const errors = Math.round(requests * 0.015 * random(seed + 1))
  const p50 = Math.round((18 + 12 * random(seed + 2)) * 100) / 100
  return {
    start,
    requests,
    errors,
    p50LatencyMs: requests === 0 ? null : p50,
    p95LatencyMs:
      requests === 0
        ? null
        : Math.round(p50 * (2.2 + random(seed + 3)) * 100) / 100,
  }
}

function syntheticSeries(input: UsageInput): UsagePoint[] {
  const size = usageBucketSeconds[input.bucket]
  const first = Math.floor(input.from.getTime() / 1000 / size) * size
  const end = Math.ceil(input.to.getTime() / 1000)
  const points: UsagePoint[] = []
  for (let start = first; start < end; start += size) {
    const point = syntheticPoint(input.environmentId, start, size)
    points.push(
      input.apiKeyId === null
        ? point
        : {
            ...point,
            requests: Math.round(point.requests / 2),
            errors: Math.round(point.errors / 2),
          },
    )
  }
  return points
}

/** Stable fake traffic so the console renders without Analytics Engine. */
export function createSyntheticUsage(): UsageAnalytics {
  const synthetic: UsageAnalytics = {
    async usage(input) {
      const series = syntheticSeries(input)
      const requests = series.reduce((sum, point) => sum + point.requests, 0)
      const errors = series.reduce((sum, point) => sum + point.errors, 0)
      const latencies = series.flatMap((point) =>
        point.p50LatencyMs === null ? [] : [point.p50LatencyMs],
      )
      const p95s = series.flatMap((point) =>
        point.p95LatencyMs === null ? [] : [point.p95LatencyMs],
      )
      const median = (values: number[]) => {
        const sorted = [...values].sort((a, b) => a - b)
        return sorted[Math.floor(sorted.length / 2)] ?? null
      }
      const keys =
        input.apiKeyId !== null ? [input.apiKeyId] : input.knownKeyIds
      return {
        totals: {
          requests,
          errors,
          p50LatencyMs: median(latencies),
          p95LatencyMs: median(p95s),
        },
        series,
        topRoutes: syntheticRoutes.map((route) => ({
          route: route.route,
          method: route.method,
          requests: Math.round(requests * route.weight),
          errors: Math.round(errors * route.weight),
          p95LatencyMs: median(p95s),
        })),
        byKey: keys.map((keyId, index) => {
          const share = 1 / 2 ** (index + 1)
          return {
            keyId,
            requests: Math.round(requests * share),
            errors: Math.round(errors * share),
          }
        }),
      }
    },
    async requests(input) {
      const rows: RequestLogRow[] = []
      const span = input.to.getTime() - input.from.getTime()
      for (let index = 0; rows.length < input.limit && index < 500; index++) {
        const seed = hashSeed(`${input.environmentId}:req:${index}`)
        const route =
          syntheticRoutes[Math.floor(random(seed) * syntheticRoutes.length)] ??
          syntheticRoutes[0]
        const roll = random(seed + 1)
        const status = roll < 0.02 ? 500 : roll < 0.06 ? 404 : 200
        const statusClass =
          status >= 500
            ? "server-error"
            : status >= 400
              ? "client-error"
              : "success"
        if (input.statusClass !== null && input.statusClass !== statusClass) {
          continue
        }
        const keyId =
          input.apiKeyId ??
          input.knownKeyIds[seed % Math.max(input.knownKeyIds.length, 1)] ??
          null
        rows.push({
          requestId: syntheticRequestId(seed),
          timestamp: new Date(
            input.to.getTime() - Math.floor((span * index) / 500),
          ).toISOString(),
          apiKeyId: keyId,
          route: route.route,
          method: route.method,
          status,
          cacheStatus: status === 200 ? "full" : "none",
          colo: "AMS",
          country: "NL",
          latencyMs: Math.round((12 + 40 * random(seed + 2)) * 100) / 100,
        })
      }
      return rows
    },
    async request(input) {
      const rows = await synthetic.requests({
        environmentId: input.environmentId,
        from: new Date(input.now.getTime() - 86_400_000),
        to: input.now,
        statusClass: null,
        apiKeyId: null,
        limit: 200,
        knownKeyIds: [],
      })
      return rows.find((row) => row.requestId === input.requestId) ?? null
    },
  }
  return synthetic
}

const base62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"

function syntheticRequestId(seed: number): string {
  let id = ""
  for (let index = 0; index < 24; index++) {
    id += base62[Math.floor(random(seed + index * 7919) * 62)] ?? "0"
  }
  return `req_${id}`
}
