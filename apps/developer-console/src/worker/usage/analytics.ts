import type { UsageBucket } from "@repo/platform-contracts/console"
import { usageBucketSeconds } from "@repo/platform-contracts/console"
import { parseJson } from "@repo/platform-contracts/encoding"
import { z } from "zod"
import {
  aeNumberSchema,
  aeResponseSchema,
  buildByKeySql,
  buildEnvironmentDailySql,
  buildEnvironmentTotalsSql,
  buildRateLimitedSql,
  buildRequestLogSql,
  buildRequestLookupSql,
  buildSeriesSql,
  buildTopRoutesSql,
  buildTotalsSql,
} from "./sql"

/** Usage data as routes consume it; the AE and synthetic sources produce it. */

/** errors = clientErrors (4xx excl. 429) + rateLimited (429) + serverErrors. */
export type ErrorSplit = {
  clientErrors: number
  rateLimited: number
  serverErrors: number
}

export type UsagePoint = ErrorSplit & {
  /** Unix seconds at the start of the bucket. */
  start: number
  requests: number
  errors: number
  p50LatencyMs: number | null
  p95LatencyMs: number | null
}

export type UsageTotalsData = ErrorSplit & {
  requests: number
  errors: number
  p50LatencyMs: number | null
  p95LatencyMs: number | null
}

export type UsageData = {
  totals: UsageTotalsData
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
  /** Platform error code; null for successes and older rows. */
  errorCode: string | null
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

export type OrgUsageInput = Omit<UsageInput, "environmentId"> & {
  environmentIds: string[]
}

export type EnvironmentUsageData = {
  totals: UsageTotalsData
  /** Requests per UTC day (unix seconds), sparse. */
  daily: { start: number; requests: number }[]
}

export type OrgUsageData = UsageData & {
  byEnvironment: Map<string, EnvironmentUsageData>
}

export type UsageAnalytics = {
  usage(input: UsageInput): Promise<UsageData>
  /** Several environments at once, plus a per-environment breakdown. */
  orgUsage(input: OrgUsageInput): Promise<OrgUsageData>
  /** 429 counts per environment in [from, to). */
  rateLimited(input: {
    environmentIds: string[]
    from: Date
    to: Date
  }): Promise<Map<string, number>>
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

const splitFields = {
  client_errors: countSchema.optional(),
  rate_limited: countSchema.optional(),
  server_errors: countSchema.optional(),
}

const totalsRow = z.object({
  requests: countSchema,
  errors: countSchema,
  ...splitFields,
  p50: latencySchema,
  p95: latencySchema,
})

const seriesRow = z.object({
  bucket: countSchema,
  requests: countSchema,
  errors: countSchema,
  ...splitFields,
  p50: latencySchema,
  p95: latencySchema,
})

const environmentTotalsRow = totalsRow.extend({ environment_id: z.string() })

const environmentDailyRow = z.object({
  environment_id: z.string(),
  bucket: countSchema,
  requests: countSchema,
})

const rateLimitedRow = z.object({
  environment_id: z.string(),
  rate_limited: countSchema,
})

function splitOf(row: {
  client_errors?: number | undefined
  rate_limited?: number | undefined
  server_errors?: number | undefined
}): ErrorSplit {
  return {
    clientErrors: row.client_errors ?? 0,
    rateLimited: row.rate_limited ?? 0,
    serverErrors: row.server_errors ?? 0,
  }
}

function toTotals(
  row: z.output<typeof totalsRow> | undefined,
): UsageTotalsData {
  return {
    requests: row?.requests ?? 0,
    errors: row?.errors ?? 0,
    ...splitOf(row ?? {}),
    p50LatencyMs: row?.p50 ?? null,
    p95LatencyMs: row?.p95 ?? null,
  }
}

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
    error_code: optionalBlob.optional(),
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
      errorCode: row.error_code ?? null,
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
      return {
        totals: toTotals(parseRows(totalsRow, totals)[0]),
        series: parseRows(seriesRow, series).map((row) => ({
          start: row.bucket,
          requests: row.requests,
          errors: row.errors,
          ...splitOf(row),
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
    async orgUsage(input) {
      const filter = {
        environmentIds: input.environmentIds,
        from: input.from,
        to: input.to,
        apiKeyId: input.apiKeyId,
      }
      const [totals, series, routes, keys, environments, daily] =
        await Promise.all([
          client.query(buildTotalsSql(filter)),
          client.query(buildSeriesSql({ ...filter, bucket: input.bucket })),
          client.query(buildTopRoutesSql(filter)),
          client.query(buildByKeySql(filter)),
          client.query(buildEnvironmentTotalsSql(filter)),
          client.query(buildEnvironmentDailySql(filter)),
        ])
      const byEnvironment = new Map<string, EnvironmentUsageData>()
      for (const row of parseRows(environmentTotalsRow, environments)) {
        byEnvironment.set(row.environment_id, {
          totals: toTotals(row),
          daily: [],
        })
      }
      for (const row of parseRows(environmentDailyRow, daily)) {
        byEnvironment
          .get(row.environment_id)
          ?.daily.push({ start: row.bucket, requests: row.requests })
      }
      return {
        totals: toTotals(parseRows(totalsRow, totals)[0]),
        series: parseRows(seriesRow, series).map((row) => ({
          start: row.bucket,
          requests: row.requests,
          errors: row.errors,
          ...splitOf(row),
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
        byEnvironment,
      }
    },
    async rateLimited(input) {
      if (input.environmentIds.length === 0) return new Map()
      const rows = await client.query(
        buildRateLimitedSql({ ...input, apiKeyId: null }),
      )
      return new Map(
        parseRows(rateLimitedRow, rows).map((row) => [
          row.environment_id,
          row.rate_limited,
        ]),
      )
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
  const rateLimited = Math.round(errors * 0.3 * random(seed + 4))
  const serverErrors = Math.round((errors - rateLimited) * 0.25)
  const p50 = Math.round((18 + 12 * random(seed + 2)) * 100) / 100
  return {
    start,
    requests,
    errors,
    clientErrors: errors - rateLimited - serverErrors,
    rateLimited,
    serverErrors,
    p50LatencyMs: requests === 0 ? null : p50,
    p95LatencyMs:
      requests === 0
        ? null
        : Math.round(p50 * (2.2 + random(seed + 3)) * 100) / 100,
  }
}

function halve(point: UsagePoint): UsagePoint {
  const clientErrors = Math.round(point.clientErrors / 2)
  const rateLimited = Math.round(point.rateLimited / 2)
  const serverErrors = Math.round(point.serverErrors / 2)
  return {
    ...point,
    requests: Math.round(point.requests / 2),
    errors: clientErrors + rateLimited + serverErrors,
    clientErrors,
    rateLimited,
    serverErrors,
  }
}

function syntheticSeries(
  environmentId: string,
  input: Pick<UsageInput, "from" | "to" | "bucket" | "apiKeyId">,
): UsagePoint[] {
  const size = usageBucketSeconds[input.bucket]
  const first = Math.floor(input.from.getTime() / 1000 / size) * size
  const end = Math.ceil(input.to.getTime() / 1000)
  const points: UsagePoint[] = []
  for (let start = first; start < end; start += size) {
    const point = syntheticPoint(environmentId, start, size)
    points.push(input.apiKeyId === null ? point : halve(point))
  }
  return points
}

function median(values: number[]): number | null {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)] ?? null
}

function summarize(series: UsagePoint[]): UsageTotalsData {
  const sum = (pick: (point: UsagePoint) => number) =>
    series.reduce((total, point) => total + pick(point), 0)
  return {
    requests: sum((point) => point.requests),
    errors: sum((point) => point.errors),
    clientErrors: sum((point) => point.clientErrors),
    rateLimited: sum((point) => point.rateLimited),
    serverErrors: sum((point) => point.serverErrors),
    p50LatencyMs: median(
      series.flatMap((point) =>
        point.p50LatencyMs === null ? [] : [point.p50LatencyMs],
      ),
    ),
    p95LatencyMs: median(
      series.flatMap((point) =>
        point.p95LatencyMs === null ? [] : [point.p95LatencyMs],
      ),
    ),
  }
}

/** Adds bucket by bucket; latency keeps the worse environment's value. */
function mergeSeries(all: UsagePoint[][]): UsagePoint[] {
  const merged = new Map<number, UsagePoint>()
  for (const series of all) {
    for (const point of series) {
      const current = merged.get(point.start)
      if (current === undefined) {
        merged.set(point.start, { ...point })
        continue
      }
      current.requests += point.requests
      current.errors += point.errors
      current.clientErrors += point.clientErrors
      current.rateLimited += point.rateLimited
      current.serverErrors += point.serverErrors
      current.p50LatencyMs = maxLatency(
        current.p50LatencyMs,
        point.p50LatencyMs,
      )
      current.p95LatencyMs = maxLatency(
        current.p95LatencyMs,
        point.p95LatencyMs,
      )
    }
  }
  return [...merged.values()].sort((a, b) => a.start - b.start)
}

function maxLatency(left: number | null, right: number | null): number | null {
  if (left === null) return right
  if (right === null) return left
  return Math.max(left, right)
}

function syntheticUsage(
  series: UsagePoint[],
  keyIds: readonly string[],
): UsageData {
  const totals = summarize(series)
  return {
    totals,
    series,
    topRoutes: syntheticRoutes.map((route) => ({
      route: route.route,
      method: route.method,
      requests: Math.round(totals.requests * route.weight),
      errors: Math.round(totals.errors * route.weight),
      p95LatencyMs: totals.p95LatencyMs,
    })),
    byKey: keyIds.map((keyId, index) => {
      const share = 1 / 2 ** (index + 1)
      return {
        keyId,
        requests: Math.round(totals.requests * share),
        errors: Math.round(totals.errors * share),
      }
    }),
  }
}

/** Stable fake traffic so the console renders without Analytics Engine. */
export function createSyntheticUsage(): UsageAnalytics {
  const synthetic: UsageAnalytics = {
    async usage(input) {
      return syntheticUsage(
        syntheticSeries(input.environmentId, input),
        input.apiKeyId !== null ? [input.apiKeyId] : input.knownKeyIds,
      )
    },
    async orgUsage(input) {
      const perEnvironment = input.environmentIds.map((environmentId) => ({
        environmentId,
        series: syntheticSeries(environmentId, input),
        daily: syntheticSeries(environmentId, { ...input, bucket: "day" }),
      }))
      const usage = syntheticUsage(
        mergeSeries(perEnvironment.map((entry) => entry.series)),
        input.apiKeyId !== null ? [input.apiKeyId] : input.knownKeyIds,
      )
      return {
        ...usage,
        byEnvironment: new Map(
          perEnvironment.map((entry) => [
            entry.environmentId,
            {
              totals: summarize(entry.series),
              daily: entry.daily.map((point) => ({
                start: point.start,
                requests: point.requests,
              })),
            },
          ]),
        ),
      }
    },
    async rateLimited(input) {
      return new Map(
        input.environmentIds.map((environmentId) => [
          environmentId,
          summarize(
            syntheticSeries(environmentId, {
              from: input.from,
              to: input.to,
              bucket: "hour",
              apiKeyId: null,
            }),
          ).rateLimited,
        ]),
      )
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
        const status =
          roll < 0.02 ? 500 : roll < 0.05 ? 404 : roll < 0.08 ? 429 : 200
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
          errorCode: syntheticErrorCodes[status] ?? null,
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

const syntheticErrorCodes: Partial<Record<number, string>> = {
  404: "not_found",
  429: "rate_limited",
  500: "internal_error",
}

const base62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"

function syntheticRequestId(seed: number): string {
  let id = ""
  for (let index = 0; index < 24; index++) {
    id += base62[Math.floor(random(seed + index * 7919) * 62)] ?? "0"
  }
  return `req_${id}`
}
