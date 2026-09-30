import {
  requestLogResponseSchema,
  usageResponseSchema,
} from "@repo/platform-contracts/console"
import { describe, expect, it } from "vitest"
import { createHarness } from "./test/harness"
import {
  createAnalyticsEngineClient,
  createAnalyticsEngineUsage,
} from "./usage/analytics"
import {
  UnsafeSqlInputError,
  buildByKeySql,
  buildRequestLogSql,
  buildRequestLookupSql,
  buildSeriesSql,
  buildTopRoutesSql,
  buildTotalsSql,
} from "./usage/sql"

const environmentId = "4b9a3b2e-8f25-4a55-9f0e-4f7f2b9a1c3d"
const keyId = "0e7c5b1a-2f3d-4c5b-8a9e-1f2d3c4b5a69"
const from = new Date("2026-09-30T00:00:00Z")
const to = new Date("2026-09-30T06:00:00Z")

describe("Analytics Engine SQL builder", () => {
  it("builds totals with sample-interval weighting", () => {
    expect(buildTotalsSql({ environmentId, from, to, apiKeyId: null })).toBe(
      [
        "SELECT SUM(_sample_interval) AS requests, sumIf(_sample_interval, double2 >= 400) AS errors,",
        "quantileExactWeighted(0.5)(double1, _sample_interval) AS p50,",
        "quantileExactWeighted(0.95)(double1, _sample_interval) AS p95",
        "FROM mbx_api_requests",
        `WHERE index1 = '${environmentId}' AND timestamp >= toDateTime(1790726400) AND timestamp < toDateTime(1790748000)`,
        "FORMAT JSON",
      ].join(" "),
    )
  })

  it("buckets the series and filters by key", () => {
    const sql = buildSeriesSql({
      environmentId,
      from,
      to,
      apiKeyId: keyId,
      bucket: "hour",
    })
    expect(sql).toContain(
      "toUnixTimestamp(toStartOfInterval(timestamp, INTERVAL '1' HOUR)) AS bucket",
    )
    expect(sql).toContain(`AND blob2 = '${keyId}'`)
    expect(sql).toContain("GROUP BY bucket ORDER BY bucket ASC")
  })

  it("builds top routes, by-key and request log queries", () => {
    const filter = { environmentId, from, to, apiKeyId: null }
    expect(buildTopRoutesSql(filter)).toContain(
      "GROUP BY route, method ORDER BY requests DESC LIMIT 10",
    )
    expect(buildByKeySql(filter)).toContain("SELECT blob2 AS key_id")
    const log = buildRequestLogSql({
      ...filter,
      statusClass: "server-error",
      limit: 25,
    })
    expect(log).toContain("AND double2 >= 500")
    expect(log).toContain("ORDER BY timestamp DESC LIMIT 25")
    expect(
      buildRequestLookupSql({
        environmentId,
        requestId: "req_AbCdEfGhIjKlMnOpQrStUvWx",
        now: to,
      }),
    ).toContain("AND blob1 = 'req_AbCdEfGhIjKlMnOpQrStUvWx'")
  })

  it("rejects anything that is not a strict uuid, id, enum or integer", () => {
    const filter = { environmentId, from, to, apiKeyId: null }
    const attempts = [
      () => buildTotalsSql({ ...filter, environmentId: "x' OR '1'='1" }),
      () => buildTotalsSql({ ...filter, apiKeyId: "'; DROP TABLE x; --" }),
      () => buildTotalsSql({ ...filter, from: new Date(Number.NaN) }),
      () => buildTotalsSql({ ...filter, from: to, to: from }),
      () =>
        buildSeriesSql({
          ...filter,
          // @ts-expect-error: runtime guard against unvalidated input
          bucket: "hour') --",
        }),
      () =>
        buildRequestLogSql({
          ...filter,
          // @ts-expect-error: runtime guard against unvalidated input
          statusClass: "success OR 1=1",
          limit: 10,
        }),
      () => buildRequestLogSql({ ...filter, statusClass: null, limit: 10.5 }),
      () => buildRequestLogSql({ ...filter, statusClass: null, limit: 5000 }),
      () =>
        buildRequestLookupSql({
          environmentId,
          requestId: "req_x' OR 'a'='a",
          now: to,
        }),
    ]
    for (const attempt of attempts) {
      expect(attempt).toThrow(UnsafeSqlInputError)
    }
  })
})

describe("Analytics Engine client", () => {
  it("posts SQL with the bearer token and maps rows", async () => {
    const calls: { url: string; init: RequestInit | undefined }[] = []
    const fakeFetch: typeof fetch = async (input, init) => {
      const url = typeof input === "string" ? input : input.toString()
      calls.push({ url, init })
      const sql = typeof init?.body === "string" ? init.body : ""
      const data = sql.includes("AS bucket")
        ? [
            {
              bucket: "1790726400",
              requests: "10",
              errors: "1",
              p50: 12.5,
              p95: 40,
            },
          ]
        : sql.includes("AS route")
          ? [
              {
                route: "/v1/networks",
                method: "GET",
                requests: 10,
                errors: 1,
                p95: 40,
              },
            ]
          : sql.includes("AS key_id")
            ? [{ key_id: "", requests: 10, errors: 1 }]
            : [{ requests: 10, errors: 1, p50: "nan", p95: 40 }]
      return new Response(JSON.stringify({ meta: [], data, rows: data.length }))
    }
    const usage = createAnalyticsEngineUsage(
      createAnalyticsEngineClient({
        accountId: "acc123",
        token: "token-abc",
        fetch: fakeFetch,
      }),
    )
    const result = await usage.usage({
      environmentId,
      from,
      to,
      bucket: "hour",
      apiKeyId: null,
      knownKeyIds: [],
    })
    expect(calls).toHaveLength(4)
    expect(calls[0]?.url).toBe(
      "https://api.cloudflare.com/client/v4/accounts/acc123/analytics_engine/sql",
    )
    expect(new Headers(calls[0]?.init?.headers).get("Authorization")).toBe(
      "Bearer token-abc",
    )
    expect(result.totals).toEqual({
      requests: 10,
      errors: 1,
      p50LatencyMs: null,
      p95LatencyMs: 40,
    })
    expect(result.series[0]).toMatchObject({ start: 1790726400, requests: 10 })
    expect(result.byKey).toEqual([{ keyId: null, requests: 10, errors: 1 }])
  })

  it("surfaces upstream failures as unavailable", async () => {
    const harness = createHarness({
      analytics: createAnalyticsEngineUsage(
        createAnalyticsEngineClient({
          accountId: "acc",
          token: "t",
          fetch: async () => new Response("nope", { status: 500 }),
        }),
      ),
    })
    const owner = await harness.account("owner@example.com")
    const organization = await harness.organization(owner)
    const { test } = await harness.appWithEnvironments(organization.id)
    const cookie = await harness.signIn(owner)
    const response = await harness.request(
      "GET",
      `/api/environments/${test.id}/usage?from=${from.toISOString()}&to=${to.toISOString()}`,
      { cookie },
    )
    expect(response.status).toBe(503)
    expect(await response.text()).not.toContain("nope")
  })
})

describe("usage routes (synthetic data)", () => {
  async function context() {
    const harness = createHarness()
    const owner = await harness.account("owner@example.com")
    const organization = await harness.organization(owner)
    const { test } = await harness.appWithEnvironments(organization.id)
    const cookie = await harness.signIn(owner)
    return { harness, test, cookie }
  }

  it("returns a filled, deterministic series with totals", async () => {
    const { harness, test, cookie } = await context()
    const path = `/api/environments/${test.id}/usage?from=${from.toISOString()}&to=${to.toISOString()}&bucket=hour`
    const first = await harness.json(
      await harness.request("GET", path, { cookie }),
      usageResponseSchema,
    )
    const second = await harness.json(
      await harness.request("GET", path, { cookie }),
      usageResponseSchema,
    )
    expect(first.series).toHaveLength(6)
    expect(first).toEqual(second)
    expect(first.totals.requests).toBe(
      first.series.reduce((sum, point) => sum + point.requests, 0),
    )
    expect(first.totals.errorRate).not.toBeNull()
  })

  it("validates the range for the bucket", async () => {
    const { harness, test, cookie } = await context()
    const tooLong = await harness.request(
      "GET",
      `/api/environments/${test.id}/usage?from=2026-09-01T00:00:00Z&to=2026-09-30T00:00:00Z&bucket=minute`,
      { cookie },
    )
    expect(tooLong.status).toBe(400)
    const badKey = await harness.request(
      "GET",
      `/api/environments/${test.id}/usage?from=${from.toISOString()}&to=${to.toISOString()}&apiKeyId=nope`,
      { cookie },
    )
    expect(badKey.status).toBe(400)
  })

  it("exports CSV", async () => {
    const { harness, test, cookie } = await context()
    const response = await harness.request(
      "GET",
      `/api/environments/${test.id}/usage.csv?from=${from.toISOString()}&to=${to.toISOString()}&bucket=hour`,
      { cookie },
    )
    expect(response.status).toBe(200)
    expect(response.headers.get("Content-Type")).toContain("text/csv")
    const lines = (await response.text()).trim().split("\n")
    expect(lines[0]).toBe("start,requests,errors,p50_latency_ms,p95_latency_ms")
    expect(lines).toHaveLength(7)
  })

  it("lists requests and looks one up by id", async () => {
    const { harness, test, cookie } = await context()
    const list = await harness.json(
      await harness.request(
        "GET",
        `/api/environments/${test.id}/requests?from=${new Date(harness.now().getTime() - 86_400_000).toISOString()}&to=${harness.now().toISOString()}&limit=5`,
        { cookie },
      ),
      requestLogResponseSchema,
    )
    expect(list.data).toHaveLength(5)
    const first = list.data[0]
    const found = await harness.request(
      "GET",
      `/api/environments/${test.id}/requests/${first?.requestId ?? ""}`,
      { cookie },
    )
    expect(found.status).toBe(200)
    const invalid = await harness.request(
      "GET",
      `/api/environments/${test.id}/requests/req_bad'id`,
      { cookie },
    )
    expect(invalid.status).toBe(404)
  })
})
