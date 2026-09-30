import { z } from "zod"
import { environmentKindSchema } from "./network"

/**
 * Analytics Engine layout for Gauge Profile API request logs. The
 * developer-api writes exactly one data point per request; the developer
 * console reads them back with the Analytics Engine SQL API. This file is the
 * single source of truth for the column positions — never reorder, only
 * append new blobs/doubles at the end.
 *
 * | Column    | Field             | Notes                                          |
 * | --------- | ----------------- | ---------------------------------------------- |
 * | `index1`  | `environmentId`   | `"anonymous"` when no key was verified         |
 * | `blob1`   | `requestId`       | `req_…`, also sent as `X-Request-Id`           |
 * | `blob2`   | `keyId`           | `mbx_dev_api_keys.id`, `""` when unknown        |
 * | `blob3`   | `routeTemplate`   | e.g. `/v1/gauge-profiles/{network}/{gaugeAddress}` |
 * | `blob4`   | `method`          | `GET`, `OPTIONS`, …                            |
 * | `blob5`   | `status`          | HTTP status as a string, e.g. `"200"`          |
 * | `blob6`   | `cacheStatus`     | `not-modified` (304), `full` (2xx body), `none` |
 * | `blob7`   | `colo`            | Cloudflare colo (`request.cf.colo`), `""` if absent |
 * | `blob8`   | `country`         | ISO country (`request.cf.country`), `""` if absent |
 * | `blob9`   | `environmentKind` | `test` / `live`, `""` when unknown              |
 * | `double1` | `latencyMs`       | Worker wall time for the request               |
 * | `double2` | `statusCode`      | HTTP status as a number                        |
 *
 * Example (requests per route over the last day):
 *
 *   SELECT blob3 AS route, SUM(_sample_interval) AS requests
 *   FROM mbx_api_requests
 *   WHERE index1 = '<environment id>' AND timestamp > NOW() - INTERVAL '1' DAY
 *   GROUP BY route
 */

export const apiRequestLogDataset = "mbx_api_requests"

/** `index1` value for requests that never resolved to an environment. */
export const apiRequestLogAnonymousIndex = "anonymous"

export const apiRequestCacheStatusSchema = z.enum([
  "not-modified",
  "full",
  "none",
])

export type ApiRequestCacheStatus = z.infer<typeof apiRequestCacheStatusSchema>

/** Logical request log record, before it is flattened into columns. */
export const apiRequestLogSchema = z.object({
  environmentId: z.string().nullable(),
  requestId: z.string(),
  keyId: z.string().nullable(),
  routeTemplate: z.string(),
  method: z.string(),
  statusCode: z.number().int().min(100).max(599),
  cacheStatus: apiRequestCacheStatusSchema,
  colo: z.string().nullable(),
  country: z.string().nullable(),
  environmentKind: environmentKindSchema.nullable(),
  latencyMs: z.number().nonnegative(),
})

export type ApiRequestLog = z.infer<typeof apiRequestLogSchema>

/** Analytics Engine column for each logical field. */
export const API_REQUEST_LOG_LAYOUT = {
  environmentId: "index1",
  requestId: "blob1",
  keyId: "blob2",
  routeTemplate: "blob3",
  method: "blob4",
  status: "blob5",
  cacheStatus: "blob6",
  colo: "blob7",
  country: "blob8",
  environmentKind: "blob9",
  latencyMs: "double1",
  statusCode: "double2",
} as const

export type ApiRequestLogColumn =
  (typeof API_REQUEST_LOG_LAYOUT)[keyof typeof API_REQUEST_LOG_LAYOUT]

export type ApiRequestLogDataPoint = {
  indexes: [string]
  blobs: [
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
  ]
  doubles: [number, number]
}

/** Flattens a record into the `writeDataPoint` payload (layout above). */
export function apiRequestLogDataPoint(
  record: ApiRequestLog,
): ApiRequestLogDataPoint {
  return {
    indexes: [record.environmentId ?? apiRequestLogAnonymousIndex],
    blobs: [
      record.requestId,
      record.keyId ?? "",
      record.routeTemplate,
      record.method,
      String(record.statusCode),
      record.cacheStatus,
      record.colo ?? "",
      record.country ?? "",
      record.environmentKind ?? "",
    ],
    doubles: [record.latencyMs, record.statusCode],
  }
}
