import {
  API_REQUEST_LOG_LAYOUT,
  apiRequestLogDataset,
} from "@repo/platform-contracts/api-request-log"
import {
  type UsageBucket,
  requestStatusClassSchema,
  usageBucketSchema,
} from "@repo/platform-contracts/console"
import { z } from "zod"

/**
 * Analytics Engine SQL for `mbx_api_requests`. Every value that reaches the
 * SQL text is re-validated here (uuid, fixed regexes, enums, integers) and
 * timestamps become integer `toDateTime(<unix seconds>)` calls, so nothing
 * user-controlled is interpolated as free text. Column positions come from
 * `API_REQUEST_LOG_LAYOUT` only.
 */

export class UnsafeSqlInputError extends Error {
  constructor(field: string) {
    super(`Rejected analytics SQL input: ${field}`)
    this.name = "UnsafeSqlInputError"
  }
}

const column = {
  environmentId: API_REQUEST_LOG_LAYOUT.environmentId,
  requestId: API_REQUEST_LOG_LAYOUT.requestId,
  keyId: API_REQUEST_LOG_LAYOUT.keyId,
  route: API_REQUEST_LOG_LAYOUT.routeTemplate,
  method: API_REQUEST_LOG_LAYOUT.method,
  cacheStatus: API_REQUEST_LOG_LAYOUT.cacheStatus,
  colo: API_REQUEST_LOG_LAYOUT.colo,
  country: API_REQUEST_LOG_LAYOUT.country,
  latencyMs: API_REQUEST_LOG_LAYOUT.latencyMs,
  statusCode: API_REQUEST_LOG_LAYOUT.statusCode,
} as const

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const requestIdPattern = /^req_[0-9A-Za-z]{24}$/

/** Platform request ids (`req_` + 24 base62), the only ids ever logged. */
export function isRequestId(value: string): boolean {
  return requestIdPattern.test(value)
}

function uuidLiteral(field: string, value: string): string {
  const lower = value.toLowerCase()
  if (!uuidPattern.test(lower)) throw new UnsafeSqlInputError(field)
  return `'${lower}'`
}

function requestIdLiteral(value: string): string {
  if (!requestIdPattern.test(value)) throw new UnsafeSqlInputError("requestId")
  return `'${value}'`
}

function unixSeconds(field: string, value: Date): number {
  const time = value.getTime()
  if (!Number.isFinite(time) || time < 0) throw new UnsafeSqlInputError(field)
  return Math.floor(time / 1000)
}

function integer(field: string, value: number, min: number, max: number) {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new UnsafeSqlInputError(field)
  }
  return value
}

const intervalByBucket = {
  minute: "INTERVAL '1' MINUTE",
  hour: "INTERVAL '1' HOUR",
  day: "INTERVAL '1' DAY",
} as const satisfies Record<UsageBucket, string>

const statusPredicate = {
  success: `${column.statusCode} < 400`,
  "client-error": `${column.statusCode} >= 400 AND ${column.statusCode} < 500`,
  "server-error": `${column.statusCode} >= 500`,
} as const

export type RangeFilter = {
  environmentId: string
  from: Date
  to: Date
  apiKeyId: string | null
}

function whereClause(filter: RangeFilter, extra: string[] = []): string {
  const clauses = [
    `${column.environmentId} = ${uuidLiteral("environmentId", filter.environmentId)}`,
    `timestamp >= toDateTime(${unixSeconds("from", filter.from)})`,
    `timestamp < toDateTime(${unixSeconds("to", filter.to)})`,
  ]
  if (filter.apiKeyId !== null) {
    clauses.push(
      `${column.keyId} = ${uuidLiteral("apiKeyId", filter.apiKeyId)}`,
    )
  }
  if (filter.from.getTime() >= filter.to.getTime()) {
    throw new UnsafeSqlInputError("range")
  }
  return `WHERE ${[...clauses, ...extra].join(" AND ")}`
}

const requests = "SUM(_sample_interval)"
const errors = `sumIf(_sample_interval, ${column.statusCode} >= 400)`

function quantile(q: "0.5" | "0.95"): string {
  return `quantileExactWeighted(${q})(${column.latencyMs}, _sample_interval)`
}

export function buildTotalsSql(filter: RangeFilter): string {
  return [
    `SELECT ${requests} AS requests, ${errors} AS errors,`,
    `${quantile("0.5")} AS p50, ${quantile("0.95")} AS p95`,
    `FROM ${apiRequestLogDataset}`,
    whereClause(filter),
    "FORMAT JSON",
  ].join(" ")
}

export function buildSeriesSql(
  filter: RangeFilter & { bucket: UsageBucket },
): string {
  const bucket = usageBucketSchema.safeParse(filter.bucket)
  if (!bucket.success) throw new UnsafeSqlInputError("bucket")
  return [
    `SELECT toUnixTimestamp(toStartOfInterval(timestamp, ${intervalByBucket[bucket.data]})) AS bucket,`,
    `${requests} AS requests, ${errors} AS errors,`,
    `${quantile("0.5")} AS p50, ${quantile("0.95")} AS p95`,
    `FROM ${apiRequestLogDataset}`,
    whereClause(filter),
    "GROUP BY bucket ORDER BY bucket ASC FORMAT JSON",
  ].join(" ")
}

export function buildTopRoutesSql(filter: RangeFilter, limit = 10): string {
  return [
    `SELECT ${column.route} AS route, ${column.method} AS method,`,
    `${requests} AS requests, ${errors} AS errors, ${quantile("0.95")} AS p95`,
    `FROM ${apiRequestLogDataset}`,
    whereClause(filter),
    `GROUP BY route, method ORDER BY requests DESC LIMIT ${integer("limit", limit, 1, 100)}`,
    "FORMAT JSON",
  ].join(" ")
}

export function buildByKeySql(filter: RangeFilter, limit = 20): string {
  return [
    `SELECT ${column.keyId} AS key_id, ${requests} AS requests, ${errors} AS errors`,
    `FROM ${apiRequestLogDataset}`,
    whereClause(filter),
    `GROUP BY key_id ORDER BY requests DESC LIMIT ${integer("limit", limit, 1, 100)}`,
    "FORMAT JSON",
  ].join(" ")
}

const requestColumns = [
  `${column.requestId} AS request_id`,
  "toUnixTimestamp(timestamp) AS ts",
  `${column.keyId} AS key_id`,
  `${column.route} AS route`,
  `${column.method} AS method`,
  `${column.statusCode} AS status`,
  `${column.cacheStatus} AS cache_status`,
  `${column.colo} AS colo`,
  `${column.country} AS country`,
  `${column.latencyMs} AS latency_ms`,
].join(", ")

export function buildRequestLogSql(
  filter: RangeFilter & {
    statusClass: "success" | "client-error" | "server-error" | null
    limit: number
  },
): string {
  const extra: string[] = []
  if (filter.statusClass !== null) {
    const statusClass = requestStatusClassSchema.safeParse(filter.statusClass)
    if (!statusClass.success) throw new UnsafeSqlInputError("statusClass")
    extra.push(statusPredicate[statusClass.data])
  }
  return [
    `SELECT ${requestColumns}`,
    `FROM ${apiRequestLogDataset}`,
    whereClause(filter, extra),
    `ORDER BY timestamp DESC LIMIT ${integer("limit", filter.limit, 1, 200)}`,
    "FORMAT JSON",
  ].join(" ")
}

/** Analytics Engine keeps three months; the lookup searches that window. */
export const requestLookupWindowSeconds = 92 * 86_400

export function buildRequestLookupSql(input: {
  environmentId: string
  requestId: string
  now: Date
}): string {
  const to = unixSeconds("now", input.now) + 60
  const from = to - requestLookupWindowSeconds
  return [
    `SELECT ${requestColumns}`,
    `FROM ${apiRequestLogDataset}`,
    `WHERE ${column.environmentId} = ${uuidLiteral("environmentId", input.environmentId)}`,
    `AND ${column.requestId} = ${requestIdLiteral(input.requestId)}`,
    `AND timestamp >= toDateTime(${from}) AND timestamp < toDateTime(${to})`,
    "LIMIT 1 FORMAT JSON",
  ].join(" ")
}

/** AE returns counts as numbers or numeric strings; NaN/empty → null. */
export const aeNumberSchema = z
  .union([z.number(), z.string(), z.null()])
  .transform((value) => {
    if (value === null) return null
    const number = typeof value === "number" ? value : Number(value)
    return Number.isFinite(number) ? number : null
  })

export const aeResponseSchema = z.object({
  data: z.array(z.record(z.string(), z.unknown())),
})
