import {
  type UsageQuery,
  consolePaths,
  requestLogEntrySchema,
  requestLogQuerySchema,
  requestLogResponseSchema,
  usageBucketSeconds,
  usageQuerySchema,
  usageResponseSchema,
} from "@repo/platform-contracts/console"
import { apiKeyDisplayPrefix } from "@repo/platform-contracts/credentials"
import { PlatformError, pathParams, queryParams } from "@repo/platform-server"
import { environmentAccess } from "../access"
import { type ConsoleApp, type ConsoleContext, deps } from "../context"
import { respond } from "../mappers"
import type { ApiKeyRow, EnvironmentRecord } from "../store/console-store"
import {
  AnalyticsUnavailableError,
  type UsageData,
  type UsagePoint,
} from "../usage/analytics"
import { UnsafeSqlInputError, isRequestId } from "../usage/sql"

/** Runs an analytics call; upstream failures become a generic 503. */
async function analyticsCall<Result>(
  call: () => Promise<Result>,
): Promise<Result> {
  try {
    return await call()
  } catch (error) {
    if (error instanceof UnsafeSqlInputError) {
      throw new PlatformError("invalid_request", { cause: error })
    }
    if (error instanceof AnalyticsUnavailableError) {
      // errorHandler logs 5xx PlatformErrors with this cause.
      throw new PlatformError("service_disabled", {
        message: "Usage data is temporarily unavailable.",
        cause: error,
      })
    }
    throw error
  }
}

/** Fills empty buckets so charts get a continuous series. */
export function fillSeries(
  points: UsagePoint[],
  from: Date,
  to: Date,
  bucketSeconds: number,
): UsagePoint[] {
  const byStart = new Map(points.map((point) => [point.start, point]))
  const first =
    Math.floor(from.getTime() / 1000 / bucketSeconds) * bucketSeconds
  const end = to.getTime() / 1000
  const filled: UsagePoint[] = []
  for (let start = first; start < end; start += bucketSeconds) {
    filled.push(
      byStart.get(start) ?? {
        start,
        requests: 0,
        errors: 0,
        p50LatencyMs: null,
        p95LatencyMs: null,
      },
    )
  }
  return filled
}

function keyPrefixes(environment: EnvironmentRecord, keys: ApiKeyRow[]) {
  return new Map(
    keys.map((key) => [
      key.id,
      apiKeyDisplayPrefix({
        kind: key.kind,
        environmentKind: environment.kind,
        prefix: key.prefix,
      }),
    ]),
  )
}

async function loadUsage(
  c: ConsoleContext,
  environmentId: string,
): Promise<{
  query: UsageQuery
  data: UsageData
  environment: EnvironmentRecord
  keys: ApiKeyRow[]
}> {
  const access = await environmentAccess(c, environmentId, "developer")
  const query = queryParams(c, usageQuerySchema)
  const { store, analytics } = deps(c)
  const keys = await store.listApiKeys(environmentId)
  if (
    query.apiKeyId !== undefined &&
    !keys.some((key) => key.id === query.apiKeyId)
  ) {
    throw new PlatformError("not_found")
  }
  const from = new Date(query.from)
  const to = new Date(query.to)
  const data = await analyticsCall(() =>
    analytics.usage({
      environmentId,
      from,
      to,
      bucket: query.bucket,
      apiKeyId: query.apiKeyId ?? null,
      knownKeyIds: keys.map((key) => key.id),
    }),
  )
  return {
    query,
    data: {
      ...data,
      series: fillSeries(
        data.series,
        from,
        to,
        usageBucketSeconds[query.bucket],
      ),
    },
    environment: access.environment,
    keys,
  }
}

function csvField(value: string | number | null): string {
  if (value === null) return ""
  const text = String(value)
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

export default function registerUsageRoutes(app: ConsoleApp): void {
  app.get("/api/environments/:environmentId/usage", async (c) => {
    const { environmentId } = pathParams(c, consolePaths.environmentId)
    const { query, data, environment, keys } = await loadUsage(c, environmentId)
    const prefixes = keyPrefixes(environment, keys)
    const { requests, errors } = data.totals
    return respond(c, usageResponseSchema, {
      from: new Date(query.from).toISOString(),
      to: new Date(query.to).toISOString(),
      bucket: query.bucket,
      totals: {
        ...data.totals,
        errorRate:
          requests === 0 ? null : Math.min(Math.max(errors / requests, 0), 1),
      },
      series: data.series.map((point) => ({
        start: new Date(point.start * 1000).toISOString(),
        requests: point.requests,
        errors: point.errors,
        p50LatencyMs: point.p50LatencyMs,
        p95LatencyMs: point.p95LatencyMs,
      })),
      topRoutes: data.topRoutes,
      byKey: data.byKey.map((row) => ({
        apiKeyId:
          row.keyId !== null && prefixes.has(row.keyId) ? row.keyId : null,
        displayPrefix:
          row.keyId === null ? null : (prefixes.get(row.keyId) ?? null),
        requests: row.requests,
        errors: row.errors,
      })),
    })
  })

  app.get("/api/environments/:environmentId/usage.csv", async (c) => {
    const { environmentId } = pathParams(c, consolePaths.environmentId)
    const { query, data } = await loadUsage(c, environmentId)
    const lines = [
      "start,requests,errors,p50_latency_ms,p95_latency_ms",
      ...data.series.map((point) =>
        [
          new Date(point.start * 1000).toISOString(),
          point.requests,
          point.errors,
          point.p50LatencyMs,
          point.p95LatencyMs,
        ]
          .map(csvField)
          .join(","),
      ),
    ]
    const filename = `usage-${environmentId}-${query.bucket}.csv`
    return c.body(`${lines.join("\n")}\n`, 200, {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    })
  })

  app.get("/api/environments/:environmentId/requests", async (c) => {
    const { environmentId } = pathParams(c, consolePaths.environmentId)
    await environmentAccess(c, environmentId, "developer")
    const query = queryParams(c, requestLogQuerySchema)
    const from = new Date(query.from)
    const to = new Date(query.to)
    if (from.getTime() >= to.getTime()) {
      throw new PlatformError("invalid_request", {
        issues: [{ path: "from", message: "`from` must be before `to`" }],
      })
    }
    const { store, analytics } = deps(c)
    const keys = await store.listApiKeys(environmentId)
    const rows = await analyticsCall(() =>
      analytics.requests({
        environmentId,
        from,
        to,
        statusClass: query.statusClass ?? null,
        apiKeyId: query.apiKeyId ?? null,
        limit: query.limit,
        knownKeyIds: keys.map((key) => key.id),
      }),
    )
    return respond(c, requestLogResponseSchema, { data: rows })
  })

  app.get("/api/environments/:environmentId/requests/:requestId", async (c) => {
    const { environmentId, requestId } = pathParams(c, consolePaths.requestId)
    await environmentAccess(c, environmentId, "developer")
    if (!isRequestId(requestId)) throw new PlatformError("not_found")
    const { analytics, now } = deps(c)
    const row = await analyticsCall(() =>
      analytics.request({ environmentId, requestId, now: now() }),
    )
    if (row === null) throw new PlatformError("not_found")
    return respond(c, requestLogEntrySchema, row)
  })
}
