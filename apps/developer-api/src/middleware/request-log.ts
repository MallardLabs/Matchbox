import type { Logger } from "@repo/logger"
import {
  type ApiRequestLog,
  apiRequestLogDataPoint,
} from "@repo/platform-contracts/api-request-log"
import { z } from "zod"
import type { ApiContext, ApiMiddleware } from "../context"

/**
 * One Analytics Engine data point per request (dataset `mbx_api_requests`).
 * The column layout lives in `@repo/platform-contracts/api-request-log`
 * (`API_REQUEST_LOG_LAYOUT`): index1 environmentId|"anonymous"; blobs
 * requestId, keyId, routeTemplate, method, status, cacheStatus, colo,
 * country, environmentKind; doubles latencyMs, statusCode.
 * `writeDataPoint` is non-blocking, so it runs inline.
 */
export type RequestLogSink = {
  writeDataPoint(point: {
    indexes: string[]
    blobs: string[]
    doubles: number[]
  }): void
}

const cfSchema = z.object({
  colo: z.string().optional(),
  country: z.string().optional(),
})

function cfLocation(c: ApiContext): {
  colo: string | null
  country: string | null
} {
  const parsed = cfSchema.safeParse(Reflect.get(c.req.raw, "cf"))
  if (!parsed.success) return { colo: null, country: null }
  return {
    colo: parsed.data.colo ?? null,
    country: parsed.data.country ?? null,
  }
}

export function buildRequestLog(
  c: ApiContext,
  latencyMs: number,
): ApiRequestLog {
  const identity = c.get("identity")
  const status = c.res.status
  const location = cfLocation(c)
  return {
    environmentId: identity?.environmentId ?? null,
    requestId: c.get("requestId") ?? "",
    keyId: identity?.keyId ?? null,
    routeTemplate: c.get("routeTemplate") ?? "unmatched",
    method: c.req.method,
    statusCode: status >= 100 && status <= 599 ? status : 500,
    cacheStatus: c.get("cacheStatus") ?? "none",
    colo: location.colo,
    country: location.country,
    environmentKind: identity?.environmentKind ?? null,
    latencyMs: Math.max(latencyMs, 0),
  }
}

export function requestLog(options: {
  sink: RequestLogSink | null
  now: () => Date
  logger: Logger
}): ApiMiddleware {
  return async function requestLogMiddleware(c, next) {
    const startedAt = options.now().getTime()
    try {
      await next()
    } finally {
      if (options.sink !== null) {
        try {
          const record = buildRequestLog(c, options.now().getTime() - startedAt)
          options.sink.writeDataPoint(apiRequestLogDataPoint(record))
        } catch (error) {
          options.logger.warn({
            message: "Request log write failed",
            error,
          })
        }
      }
    }
  }
}
