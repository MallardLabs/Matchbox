import { describe, expect, it } from "vitest"
import {
  stuartErrorSchema,
  stuartStatusSchema,
} from "../../features/query/contract"
import { handleApiRequest } from "../index"
import { TokenBuckets } from "./rateLimit"

const BODY = JSON.stringify({
  version: 1,
  query: "which gauges are best?",
  sessionId: "6f1c1b8e-3c55-4a3f-9b8a-1d2e3f4a5b6c",
  turn: 0,
  surface: "palette",
  chainId: 31_612,
})

function post(
  path: string,
  init: { body?: string; headers?: Record<string, string> } = {},
): Request {
  return new Request(`http://matchbox-pro.local${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...init.headers },
    body: init.body ?? BODY,
  })
}

async function errorCode(response: Response | null): Promise<string> {
  if (!response) throw new Error("expected a response")
  return stuartErrorSchema.parse(await response.json()).error.code
}

describe("Stuart routes", () => {
  it("answers same-origin queries without a CORS wildcard", async () => {
    const response = await handleApiRequest(
      post("/api/query", {
        headers: {
          origin: "http://matchbox-pro.local",
          "cf-connecting-ip": "10.0.0.1",
        },
      }),
    )
    expect(response?.status).toBe(200)
    expect(response?.headers.get("access-control-allow-origin")).toBeNull()
    expect(response?.headers.get("cache-control")).toBe("no-store")
  })

  it("rejects cross-site origins and fetch metadata", async () => {
    const foreign = await handleApiRequest(
      post("/api/query", {
        headers: {
          origin: "https://evil.example",
          "cf-connecting-ip": "10.0.0.2",
        },
      }),
    )
    expect(foreign?.status).toBe(403)
    expect(await errorCode(foreign)).toBe("forbidden_origin")
    const crossSite = await handleApiRequest(
      post("/api/query", {
        headers: {
          "sec-fetch-site": "cross-site",
          "cf-connecting-ip": "10.0.0.3",
        },
      }),
    )
    expect(crossSite?.status).toBe(403)
  })

  it("requires JSON and caps the body size", async () => {
    const form = await handleApiRequest(
      post("/api/query", {
        headers: {
          "content-type": "text/plain",
          "cf-connecting-ip": "10.0.0.4",
        },
      }),
    )
    expect(form?.status).toBe(415)
    expect(await errorCode(form)).toBe("unsupported_media_type")
    const huge = await handleApiRequest(
      post("/api/query", {
        body: JSON.stringify({ padding: "x".repeat(20_000) }),
        headers: { "cf-connecting-ip": "10.0.0.5" },
      }),
    )
    expect(huge?.status).toBe(413)
    const invalid = await handleApiRequest(
      post("/api/query", {
        body: JSON.stringify({ version: 2 }),
        headers: { "cf-connecting-ip": "10.0.0.6" },
      }),
    )
    expect(invalid?.status).toBe(400)
    expect(await errorCode(invalid)).toBe("invalid_request")
  })

  it("rate limits with retry-after", async () => {
    let limited: Response | null = null
    for (let index = 0; index < 25 && !limited; index += 1) {
      const response = await handleApiRequest(
        post("/api/query", { headers: { "cf-connecting-ip": "10.0.0.7" } }),
      )
      if (response?.status === 429) limited = response
    }
    expect(limited).not.toBeNull()
    expect(Number(limited?.headers.get("retry-after"))).toBeGreaterThan(0)
    expect(await errorCode(limited)).toBe("rate_limited")
  })

  it("uses the Workers rate-limit binding when configured", async () => {
    // Bindings and secrets ride on the Worker env beyond the shared type.
    const env = {
      BASE_RPC_URL: undefined,
      STUART_QUERY_LIMITER: { limit: async () => ({ success: false }) },
    }
    const response = await handleApiRequest(
      post("/api/query", { headers: { "cf-connecting-ip": "10.0.0.8" } }),
      env,
    )
    expect(response?.status).toBe(429)
  })

  it("reports deterministic mode and never echoes the key", async () => {
    const env = {
      BASE_RPC_URL: undefined,
      ANTHROPIC_API_KEY: "sk-ant-secret-value",
      STUART_CLAUDE_ENABLED: "false",
    }
    const status = await handleApiRequest(
      new Request("http://matchbox-pro.local/api/query/status"),
      env,
    )
    const text = await status?.text()
    expect(text).not.toContain("sk-ant")
    expect(stuartStatusSchema.parse(JSON.parse(text ?? "{}"))).toEqual({
      stuart: "deterministic",
      model: null,
      supportReports: false,
    })
  })

  it("refuses a forged proposal refresh", async () => {
    const response = await handleApiRequest(
      post("/api/proposal/refresh", {
        body: JSON.stringify({ version: 1 }),
        headers: { "cf-connecting-ip": "10.0.0.9" },
      }),
    )
    expect(response?.status).toBe(400)
  })
})

describe("in-isolate token bucket", () => {
  it("refills over the period", () => {
    const buckets = new TokenBuckets()
    const policy = { name: "t", limit: 2, periodSeconds: 60 }
    expect(buckets.take("k", policy, 0)).toBeNull()
    expect(buckets.take("k", policy, 0)).toBeNull()
    expect(buckets.take("k", policy, 0)).toBe(30)
    expect(buckets.take("k", policy, 30_000)).toBeNull()
  })
})
