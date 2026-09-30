import { errorBodySchema } from "@repo/platform-contracts/errors"
import {
  gaugeProfileDetailSchema,
  gaugeProfileListSchema,
  healthResponseSchema,
  networkListSchema,
} from "@repo/platform-contracts/gauge-profiles"
import { describe, expect, it } from "vitest"
import {
  createHarness,
  ids,
  keys,
  liveOrigin,
  testOrigin,
  testSeed,
} from "./testing"

async function errorBody(response: Response) {
  return errorBodySchema.parse(await response.json()).error
}

describe("health and OpenAPI", () => {
  it("serves health without auth and without leaking config", async () => {
    const harness = await createHarness({ gaugeProfileApi: false })
    const response = await harness.app.request("/v1/health", {
      headers: { Origin: "https://anywhere.example" },
    })
    expect(response.status).toBe(200)
    const body = healthResponseSchema.parse(await response.json())
    expect(body).toEqual({
      status: "ok",
      version: "2.0.0-test",
      flags: { gaugeProfileApi: false },
    })
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*")
    expect(response.headers.get("X-Request-Id")).toMatch(/^req_/)
  })

  it("serves the OpenAPI document even when the API flag is off", async () => {
    const harness = await createHarness({ gaugeProfileApi: false })
    const response = await harness.app.request("/openapi.json")
    expect(response.status).toBe(200)
    const body: unknown = await response.json()
    expect(body).toMatchObject({ openapi: "3.1.0" })
  })

  it("returns 503 service_disabled for /v1 routes when the flag is off", async () => {
    const harness = await createHarness({ gaugeProfileApi: false })
    const response = await harness.get("/v1/networks", { origin: testOrigin })
    expect(response.status).toBe(503)
    expect((await errorBody(response)).code).toBe("service_disabled")
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(testOrigin)
  })
})

describe("networks", () => {
  it("lists only the network the key's environment reads", async () => {
    const harness = await createHarness()
    const test = networkListSchema.parse(
      await (await harness.get("/v1/networks")).json(),
    )
    expect(test.data.map((network) => network.slug)).toEqual(["mezo-testnet"])
    const live = networkListSchema.parse(
      await (await harness.get("/v1/networks", { key: keys.skLive })).json(),
    )
    expect(live.data).toEqual([
      {
        slug: "mezo",
        chainId: 31612,
        name: "Mezo",
        environmentKind: "live",
      },
    ])
  })
})

describe("rate limits", () => {
  it("returns a 429 with RateLimit headers, Retry-After and CORS", async () => {
    const harness = await createHarness()
    const path = "/v1/networks"
    // Publishable keys get half the test environment's 60/min.
    for (let index = 0; index < 30; index++) {
      const response = await harness.get(path, {
        key: keys.pkTest,
        origin: testOrigin,
      })
      expect(response.status).toBe(200)
    }
    const limited = await harness.get(path, {
      key: keys.pkTest,
      origin: testOrigin,
    })
    expect(limited.status).toBe(429)
    const error = await errorBody(limited)
    expect(error.code).toBe("rate_limited")
    expect(error.requestId).toBe(limited.headers.get("X-Request-Id"))
    expect(limited.headers.get("RateLimit-Limit")).toBe("30")
    expect(limited.headers.get("RateLimit-Remaining")).toBe("0")
    expect(Number(limited.headers.get("Retry-After"))).toBeGreaterThan(0)
    expect(limited.headers.get("Access-Control-Allow-Origin")).toBe(testOrigin)
    harness.clock.advance(60_000)
    const recovered = await harness.get(path, {
      key: keys.pkTest,
      origin: testOrigin,
    })
    expect(recovered.status).toBe(200)
  })

  it("keeps publishable traffic from draining the secret-key quota", async () => {
    const harness = await createHarness()
    const browser = (ip: string) =>
      harness.get("/v1/networks", { key: keys.pkTest, origin: testOrigin, ip })
    // Spread over many client IPs so only the environment bucket applies.
    for (let index = 0; index < 30; index++) {
      expect((await browser(`198.51.${index}.7`)).status).toBe(200)
    }
    expect((await browser("203.0.113.1")).status).toBe(429)

    const server = await harness.get("/v1/networks", { key: keys.skTest })
    expect(server.status).toBe(200)
    expect(server.headers.get("RateLimit-Limit")).toBe("60")
    expect(server.headers.get("RateLimit-Remaining")).toBe("59")
  })

  it("sizes the publishable bucket from PUBLISHABLE_QUOTA_SHARE", async () => {
    const harness = await createHarness({ publishableQuotaShare: 0.1 })
    const browser = () =>
      harness.get("/v1/networks", { key: keys.pkTest, origin: testOrigin })
    for (let index = 0; index < 6; index++) {
      expect((await browser()).status).toBe(200)
    }
    const limited = await browser()
    expect(limited.status).toBe(429)
    expect(limited.headers.get("RateLimit-Limit")).toBe("6")
  })

  it("limits publishable keys per client IP prefix", async () => {
    const harness = await createHarness()
    const request = (ip: string) =>
      harness.get("/v1/networks", { key: keys.pkLive, origin: liveOrigin, ip })
    for (let index = 0; index < 60; index++) {
      expect((await request("203.0.113.9")).status).toBe(200)
    }
    expect((await request("203.0.113.200")).status).toBe(429)
    expect((await request("192.0.2.1")).status).toBe(200)
  })

  it("applies quota overrides", async () => {
    const harness = await createHarness({
      seed: {
        ...testSeed,
        quotaOverrides: [
          {
            environmentId: ids.testEnv,
            endpointClass: "gauge-profiles",
            perMinute: 2,
            perDay: 100,
            expiresAt: null,
          },
        ],
      },
    })
    expect(
      (await harness.get("/v1/networks")).headers.get("RateLimit-Limit"),
    ).toBe("2")
    await harness.get("/v1/networks")
    expect((await harness.get("/v1/networks")).status).toBe(429)
  })

  it("limits malformed requests per IP prefix", async () => {
    const harness = await createHarness()
    let last = new Response()
    for (let index = 0; index < 31; index++) {
      last = await harness.get("/v1/networks", { key: "not-a-key" })
    }
    expect(last.status).toBe(429)
  })
})

describe("CORS", () => {
  it("answers preflight for any origin", async () => {
    const harness = await createHarness()
    const response = await harness.app.request("/v1/gauge-profiles", {
      method: "OPTIONS",
      headers: {
        Origin: "https://unknown.example",
        "Access-Control-Request-Method": "GET",
        "Access-Control-Request-Headers": "authorization",
      },
    })
    expect(response.status).toBe(204)
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://unknown.example",
    )
    expect(response.headers.get("Access-Control-Allow-Headers")).toContain(
      "Authorization",
    )
    expect(response.headers.get("Vary")).toBe("Origin, Authorization")
  })

  it("adds CORS to error responses for registered origins", async () => {
    const harness = await createHarness()
    const response = await harness.get(
      "/v1/gauge-profiles/mezo-testnet/0x0000000000000000000000000000000000000001",
      { key: keys.pkTest, origin: testOrigin },
    )
    expect(response.status).toBe(404)
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(testOrigin)
    expect(response.headers.get("Access-Control-Expose-Headers")).toContain(
      "X-Request-Id",
    )
  })

  it("lets browsers read anonymous 401s", async () => {
    const harness = await createHarness()
    const response = await harness.get("/v1/networks", {
      key: null,
      origin: "https://site.example",
    })
    expect(response.status).toBe(401)
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://site.example",
    )
  })
})

describe("ETag", () => {
  it("returns 304 for a matching If-None-Match", async () => {
    const harness = await createHarness()
    const first = await harness.get("/v1/gauge-profiles?network=mezo-testnet")
    const etag = first.headers.get("ETag")
    expect(etag).toMatch(/^W\/"[A-Za-z0-9_-]{43}"$/)
    expect(first.headers.get("Cache-Control")).toBe("private, max-age=30")
    const second = await harness.get(
      "/v1/gauge-profiles?network=mezo-testnet",
      {
        headers: { "If-None-Match": `"other", ${etag ?? ""}` },
      },
    )
    expect(second.status).toBe(304)
    expect(await second.text()).toBe("")
    expect(second.headers.get("ETag")).toBe(etag)
    expect(second.headers.get("RateLimit-Remaining")).not.toBeNull()
    expect(harness.dataPoints.at(-1)?.blobs[5]).toBe("not-modified")
  })
})

describe("gauge profiles", () => {
  it("round-trips the pagination cursor in keyset order", async () => {
    const harness = await createHarness()
    const seen: string[] = []
    let cursor: string | null = null
    let pages = 0
    do {
      const query: string =
        cursor === null ? "" : `&cursor=${encodeURIComponent(cursor)}`
      const response = await harness.get(
        `/v1/gauge-profiles?network=mezo&limit=2${query}`,
        { key: keys.skLive },
      )
      expect(response.status).toBe(200)
      const page = gaugeProfileListSchema.parse(await response.json())
      seen.push(...page.data.map((profile) => profile.gaugeAddress))
      cursor = page.nextCursor
      pages += 1
    } while (cursor !== null)
    expect(pages).toBe(2)
    const expected = testSeed.profiles
      .filter((profile) => profile.network === "mezo")
      .sort(
        (left, right) =>
          Date.parse(right.updatedAt) - Date.parse(left.updatedAt),
      )
      .map((profile) => profile.gaugeAddress)
    expect(seen).toEqual(expected)
  })

  it("applies filters", async () => {
    const harness = await createHarness()
    async function list(query: string) {
      const response = await harness.get(
        `/v1/gauge-profiles?network=mezo${query}`,
        {
          key: keys.skLive,
        },
      )
      expect(response.status).toBe(200)
      return gaugeProfileListSchema.parse(await response.json())
    }
    expect((await list("&profileType=validator-gauge")).data).toHaveLength(1)
    expect((await list("&tag=treasury")).data).toHaveLength(1)
    expect(
      (await list("&address=0x7E3D2C1B0A9F8E7D6C5B4A3F2E1D0C9B8A7F6E5D")).data,
    ).toHaveLength(1)
    expect(
      (await list("&updatedSince=2026-09-28T00:00:00Z")).data.map(
        (profile) => profile.displayName,
      ),
    ).toEqual(["Satoshi Street Capital", "Boar Validator"])
    const empty = await list("&tag=none")
    expect(empty).toMatchObject({
      data: [],
      nextCursor: null,
      meta: { source: "matchbox-profiles", profileUpdatedAt: null },
    })
  })

  it("validates query parameters", async () => {
    const harness = await createHarness()
    for (const query of [
      "",
      "?network=mezo-testnet&limit=101",
      "?network=mezo-testnet&profileType=pool",
      "?network=mezo-testnet&cursor=%21%21",
      "?network=mezo-testnet&tag=a,b",
      "?network=mezo-testnet&tag=%7D",
    ]) {
      const response = await harness.get(`/v1/gauge-profiles${query}`)
      expect(response.status).toBe(400)
      expect((await errorBody(response)).code).toBe("invalid_request")
    }
    const issues = await errorBody(
      await harness.get("/v1/gauge-profiles?network=mezo-testnet&limit=0"),
    )
    expect(issues.issues?.[0]?.path).toBe("limit")
  })

  it("discriminates profile types in detail responses", async () => {
    const harness = await createHarness()
    const validator = gaugeProfileDetailSchema.parse(
      await (
        await harness.get(
          "/v1/gauge-profiles/mezo/0x2B5E8D1A4C7F0E3B6D9A2C5F8E1B4D7A0C3F6E9B",
          { key: keys.skLive },
        )
      ).json(),
    )
    expect(validator.data.profileType).toBe("validator-gauge")
    if (validator.data.profileType === "validator-gauge") {
      expect(validator.data.operatorAddress).toBe(
        "0x3c6f9e2d5a8b1c4f7e0d3a6b9c2f5e8d1a4b7c0e",
      )
    }
    expect(validator.data).not.toHaveProperty("vebtcTokenId")
    expect(validator.meta.chainBlock).toBe("4815162")

    const boost = gaugeProfileDetailSchema.parse(
      await (
        await harness.get("/v1/vebtc/mezo/1042/gauge-profile", {
          key: keys.skLive,
        })
      ).json(),
    )
    expect(boost.data.profileType).toBe("boost-gauge")
    expect(boost.data).not.toHaveProperty("operatorAddress")
  })

  it("returns 404 for unknown gauges and tokens", async () => {
    const harness = await createHarness()
    for (const path of [
      "/v1/gauge-profiles/mezo/0x0000000000000000000000000000000000000001",
      "/v1/gauge-profiles/mezo/not-an-address",
      "/v1/vebtc/mezo/999999/gauge-profile",
      "/v1/vebtc/mezo/abc/gauge-profile",
      "/v1/unknown",
    ]) {
      const response = await harness.get(path, { key: keys.skLive })
      expect(response.status).toBe(404)
      expect((await errorBody(response)).code).toBe("not_found")
    }
  })

  it("finds a boost gauge by veBTC token from the profile when unreconciled", async () => {
    const harness = await createHarness()
    const response = await harness.get("/v1/vebtc/mezo/2077/gauge-profile", {
      key: keys.skLive,
    })
    const body = gaugeProfileDetailSchema.parse(await response.json())
    expect(body.data.displayName).toBe("Orange Pill Treasury")
  })

  it("treats path networks outside the key's environment as not allowed", async () => {
    const harness = await createHarness()
    const response = await harness.get(
      "/v1/gauge-profiles/ethereum/0x2B5E8D1A4C7F0E3B6D9A2C5F8E1B4D7A0C3F6E9B",
      { key: keys.skLive },
    )
    expect(response.status).toBe(403)
    expect((await errorBody(response)).code).toBe("network_not_allowed")
    expect(ids.liveEnv).toBeDefined()
  })
})
