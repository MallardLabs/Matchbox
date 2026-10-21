import {
  type UsageQuery,
  consolePaths,
  orgUsageQuerySchema,
  orgUsageResponseSchema,
  requestLogEntrySchema,
  requestLogQuerySchema,
  requestLogResponseSchema,
  usageBucketSeconds,
  usageErrorRate,
  usageQuerySchema,
  usageResponseSchema,
} from "@repo/platform-contracts/console"
import { apiKeyDisplayPrefix } from "@repo/platform-contracts/credentials"
import { PlatformError, pathParams, queryParams } from "@repo/platform-server"
import { environmentAccess, organizationAccess } from "../access"
import { type ConsoleApp, type ConsoleContext, deps } from "../context"
import { respond } from "../mappers"
import type {
  ApiKeyRow,
  AppRecord,
  EnvironmentRecord,
} from "../store/console-store"
import {
  AnalyticsUnavailableError,
  type UsageData,
  type UsagePoint,
  type UsageTotalsData,
} from "../usage/analytics"
import { UnsafeSqlInputError, isRequestId } from "../usage/sql"

/** Runs an analytics call; upstream failures become a generic 503. */
export async function analyticsCall<Result>(
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

function emptyPoint(start: number): UsagePoint {
  return {
    start,
    requests: 0,
    errors: 0,
    clientErrors: 0,
    rateLimited: 0,
    serverErrors: 0,
    p50LatencyMs: null,
    p95LatencyMs: null,
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
    filled.push(byStart.get(start) ?? emptyPoint(start))
  }
  return filled
}

/** One point per UTC day of the range; missing days are real zeros. */
export function fillDaily(
  points: { start: number; requests: number }[],
  from: Date,
  to: Date,
): { start: number; requests: number }[] {
  return fillSeries(
    points.map((point) => ({ ...emptyPoint(point.start), ...point })),
    from,
    to,
    usageBucketSeconds.day,
  ).map((point) => ({ start: point.start, requests: point.requests }))
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

function iso(seconds: number): string {
  return new Date(seconds * 1000).toISOString()
}

function seriesPoint(point: UsagePoint) {
  return {
    start: iso(point.start),
    requests: point.requests,
    errors: point.errors,
    clientErrors: point.clientErrors,
    rateLimited: point.rateLimited,
    serverErrors: point.serverErrors,
    p50LatencyMs: point.p50LatencyMs,
    p95LatencyMs: point.p95LatencyMs,
  }
}

function summary(totals: UsageTotalsData) {
  return {
    requests: totals.requests,
    errors: totals.errors,
    clientErrors: totals.clientErrors,
    rateLimited: totals.rateLimited,
    serverErrors: totals.serverErrors,
    errorRate: usageErrorRate(totals),
    p50LatencyMs: totals.p50LatencyMs,
    p95LatencyMs: totals.p95LatencyMs,
  }
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

/** New columns are appended so older parsers keep working. */
const csvHeader =
  "start,requests,errors,p50_latency_ms,p95_latency_ms,client_errors,rate_limited,server_errors"

function csvLines(series: UsagePoint[]): string[] {
  return [
    csvHeader,
    ...series.map((point) =>
      [
        iso(point.start),
        point.requests,
        point.errors,
        point.p50LatencyMs,
        point.p95LatencyMs,
        point.clientErrors,
        point.rateLimited,
        point.serverErrors,
      ]
        .map(csvField)
        .join(","),
    ),
  ]
}

function csvResponse(
  c: ConsoleContext,
  lines: string[],
  filename: string,
): Response {
  return c.body(`${lines.join("\n")}\n`, 200, {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="${filename}"`,
    "Cache-Control": "no-store",
  })
}

type ScopedEnvironment = {
  environment: EnvironmentRecord
  app: AppRecord
  keys: ApiKeyRow[]
}

/** Org usage across the environments the filters select (C06). */
async function loadOrgUsage(c: ConsoleContext, orgId: string) {
  await organizationAccess(c, orgId, "developer")
  const query = queryParams(c, orgUsageQuerySchema)
  const { store, analytics } = deps(c)
  const apps = await store.listApps(orgId)
  if (
    query.appId !== undefined &&
    !apps.some((app) => app.id === query.appId)
  ) {
    throw new PlatformError("not_found")
  }
  const appsById = new Map(apps.map((app) => [app.id, app]))
  const environments = (
    await store.listEnvironmentsForApps(apps.map((app) => app.id))
  ).filter(
    (environment) =>
      (query.environmentKind === "both" ||
        environment.kind === query.environmentKind) &&
      (query.appId === undefined || environment.appId === query.appId),
  )
  const scoped: ScopedEnvironment[] = await Promise.all(
    environments.flatMap((environment) => {
      const app = appsById.get(environment.appId)
      return app === undefined
        ? []
        : [
            store
              .listApiKeys(environment.id)
              .then((keys) => ({ environment, app, keys })),
          ]
    }),
  )
  const allKeys = scoped.flatMap((entry) => entry.keys)
  if (
    query.apiKeyId !== undefined &&
    !allKeys.some((key) => key.id === query.apiKeyId)
  ) {
    throw new PlatformError("not_found")
  }
  const from = new Date(query.from)
  const to = new Date(query.to)
  const data =
    scoped.length === 0
      ? null
      : await analyticsCall(() =>
          analytics.orgUsage({
            environmentIds: scoped.map((entry) => entry.environment.id),
            from,
            to,
            bucket: query.bucket,
            apiKeyId: query.apiKeyId ?? null,
            knownKeyIds: allKeys.map((key) => key.id),
          }),
        )
  const series = fillSeries(
    data?.series ?? [],
    from,
    to,
    usageBucketSeconds[query.bucket],
  )
  return { query, from, to, scoped, data, series }
}

const emptyTotals: UsageTotalsData = {
  requests: 0,
  errors: 0,
  clientErrors: 0,
  rateLimited: 0,
  serverErrors: 0,
  p50LatencyMs: null,
  p95LatencyMs: null,
}

export default function registerUsageRoutes(app: ConsoleApp): void {
  app.get("/api/environments/:environmentId/usage", async (c) => {
    const { environmentId } = pathParams(c, consolePaths.environmentId)
    const { query, data, environment, keys } = await loadUsage(c, environmentId)
    const prefixes = keyPrefixes(environment, keys)
    return respond(c, usageResponseSchema, {
      from: new Date(query.from).toISOString(),
      to: new Date(query.to).toISOString(),
      bucket: query.bucket,
      totals: summary(data.totals),
      series: data.series.map(seriesPoint),
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
    return csvResponse(
      c,
      csvLines(data.series),
      `usage-${environmentId}-${query.bucket}.csv`,
    )
  })

  app.get("/api/orgs/:orgId/usage", async (c) => {
    const { orgId } = pathParams(c, consolePaths.orgId)
    const { query, from, to, scoped, data, series } = await loadOrgUsage(
      c,
      orgId,
    )
    const keyOwners = new Map(
      scoped.flatMap((entry) => {
        const prefixes = keyPrefixes(entry.environment, entry.keys)
        return entry.keys.map(
          (key) =>
            [
              key.id,
              {
                entry,
                displayPrefix: prefixes.get(key.id) ?? null,
              },
            ] as const,
        )
      }),
    )
    return respond(c, orgUsageResponseSchema, {
      from: from.toISOString(),
      to: to.toISOString(),
      bucket: query.bucket,
      environmentKind: query.environmentKind,
      totals: summary(data?.totals ?? emptyTotals),
      series: series.map(seriesPoint),
      byEnvironment: scoped.map((entry) => {
        const usage = data?.byEnvironment.get(entry.environment.id)
        return {
          app: {
            id: entry.app.id,
            name: entry.app.name,
            status: entry.app.status,
          },
          environmentId: entry.environment.id,
          environmentKind: entry.environment.kind,
          network: entry.environment.network,
          summary: summary(usage?.totals ?? emptyTotals),
          daily: fillDaily(usage?.daily ?? [], from, to).map((point) => ({
            start: iso(point.start),
            requests: point.requests,
          })),
        }
      }),
      topRoutes: data?.topRoutes ?? [],
      byKey: (data?.byKey ?? []).map((row) => {
        const owner = row.keyId === null ? undefined : keyOwners.get(row.keyId)
        return {
          apiKeyId: owner === undefined ? null : row.keyId,
          displayPrefix: owner?.displayPrefix ?? null,
          app:
            owner === undefined
              ? null
              : { id: owner.entry.app.id, name: owner.entry.app.name },
          environmentKind: owner?.entry.environment.kind ?? null,
          requests: row.requests,
          errors: row.errors,
        }
      }),
    })
  })

  app.get("/api/orgs/:orgId/usage.csv", async (c) => {
    const { orgId } = pathParams(c, consolePaths.orgId)
    const { query, series } = await loadOrgUsage(c, orgId)
    return csvResponse(
      c,
      csvLines(series),
      `usage-${orgId}-${query.environmentKind}-${query.bucket}.csv`,
    )
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
