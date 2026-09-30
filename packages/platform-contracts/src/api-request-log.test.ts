import { describe, expect, it } from "vitest"
import {
  API_REQUEST_LOG_LAYOUT,
  apiRequestLogDataPoint,
  apiRequestLogSchema,
} from "./api-request-log"

describe("apiRequestLogDataPoint", () => {
  it("places every field in its documented column", () => {
    const record = apiRequestLogSchema.parse({
      environmentId: "env-1",
      requestId: "req_1",
      keyId: "key-1",
      routeTemplate: "/v1/networks",
      method: "GET",
      statusCode: 200,
      cacheStatus: "full",
      colo: "LHR",
      country: "GB",
      environmentKind: "test",
      latencyMs: 12.5,
    })
    const point = apiRequestLogDataPoint(record)
    expect(point).toEqual({
      indexes: ["env-1"],
      blobs: [
        "req_1",
        "key-1",
        "/v1/networks",
        "GET",
        "200",
        "full",
        "LHR",
        "GB",
        "test",
      ],
      doubles: [12.5, 200],
    })
    const blobColumns = Object.values(API_REQUEST_LOG_LAYOUT).filter((column) =>
      column.startsWith("blob"),
    )
    expect(blobColumns).toHaveLength(point.blobs.length)
  })

  it("uses the anonymous index and empty blobs for unknown values", () => {
    const point = apiRequestLogDataPoint({
      environmentId: null,
      requestId: "req_2",
      keyId: null,
      routeTemplate: "unmatched",
      method: "GET",
      statusCode: 401,
      cacheStatus: "none",
      colo: null,
      country: null,
      environmentKind: null,
      latencyMs: 1,
    })
    expect(point.indexes).toEqual(["anonymous"])
    expect(point.blobs[1]).toBe("")
    expect(point.blobs[8]).toBe("")
  })
})
