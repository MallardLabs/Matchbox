import { describe, expect, it, vi } from "vitest"
import {
  type FetchLike,
  type GaugeProfile,
  MatchboxApiError,
  createMatchboxClient,
  parseRetryAfter,
} from "./index"

const apiKey = `mbx_sk_test_AbCdEf123456_${"a".repeat(43)}`

function profile(address: string): GaugeProfile {
  return {
    profileType: "validator-gauge",
    operatorAddress: "0x3c6f9e2d5a8b1c4f7e0d3a6b9c2f5e8d1a4b7c0e",
    network: "mezo-testnet",
    gaugeAddress: address,
    displayName: null,
    description: null,
    avatarUrl: null,
    websiteUrl: null,
    socialLinks: {},
    tags: [],
    incentiveStrategy: null,
    votingStrategy: null,
    isFeatured: false,
    chain: {
      isAlive: null,
      nftOwner: null,
      beneficiary: null,
      poolAddress: null,
      checkedAt: null,
      blockNumber: null,
    },
    updatedAt: "2026-09-30T00:00:00Z",
    createdAt: "2026-09-30T00:00:00Z",
  }
}

const meta = {
  source: "matchbox-profiles",
  profileUpdatedAt: null,
  chainCheckedAt: null,
  chainBlock: null,
}

function json(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  })
}

function errorJson(
  code: string,
  status: number,
  headers: Record<string, string> = {},
) {
  return json(
    {
      error: {
        code,
        message: `${code} happened`,
        requestId: "req_body",
        docsUrl: `https://developer.matchbox.markets/docs/errors#${code}`,
      },
    },
    status,
    { "X-Request-Id": "req_header", ...headers },
  )
}

function mockFetch(responses: Response[]) {
  const calls: { url: string; headers: Record<string, string> }[] = []
  const fetch = vi.fn<FetchLike>(async (url, init) => {
    calls.push({ url, headers: init.headers })
    const next = responses.shift()
    if (next === undefined) throw new Error("unexpected request")
    return next
  })
  return { fetch, calls }
}

describe("createMatchboxClient", () => {
  it("rejects values that are not Matchbox keys", () => {
    expect(() => createMatchboxClient({ apiKey: "sk_live_x" })).toThrow(
      TypeError,
    )
  })

  it("sends the bearer key and serialises list parameters", async () => {
    const { fetch, calls } = mockFetch([
      json({ data: [], nextCursor: null, meta }),
    ])
    const client = createMatchboxClient({
      apiKey,
      baseUrl: "https://api.example.test/",
      fetch,
    })
    await client.gaugeProfiles.list({
      network: "mezo-testnet",
      profileType: "validator-gauge",
      address: ["0x01", "0x02"],
      limit: 10,
    })
    expect(calls[0]?.url).toBe(
      "https://api.example.test/v1/gauge-profiles?network=mezo-testnet&profileType=validator-gauge&address=0x01&address=0x02&limit=10",
    )
    expect(calls[0]?.headers.Authorization).toBe(`Bearer ${apiKey}`)
  })

  it("iterates across cursors", async () => {
    const { fetch, calls } = mockFetch([
      json({ data: [profile("0x1"), profile("0x2")], nextCursor: "c1", meta }),
      json({ data: [profile("0x3")], nextCursor: null, meta }),
    ])
    const client = createMatchboxClient({ apiKey, fetch })
    const seen: string[] = []
    for await (const item of client.gaugeProfiles.iterate({
      network: "mezo-testnet",
      limit: 2,
    })) {
      seen.push(item.gaugeAddress)
    }
    expect(seen).toEqual(["0x1", "0x2", "0x3"])
    expect(calls[1]?.url).toContain("cursor=c1")
    expect(calls[0]?.url.startsWith("https://api.matchbox.markets/")).toBe(true)
  })

  it("encodes path parameters for detail lookups", async () => {
    const { fetch, calls } = mockFetch([
      json({ data: profile("0xabc"), meta }),
      json({ data: profile("0xabc"), meta }),
    ])
    const client = createMatchboxClient({ apiKey, fetch })
    const detail = await client.gaugeProfiles.get("mezo-testnet", "0xAbC")
    expect(detail.data.profileType).toBe("validator-gauge")
    await client.gaugeProfiles.byVebtc("mezo-testnet", 42n)
    expect(calls.map((call) => new URL(call.url).pathname)).toEqual([
      "/v1/gauge-profiles/mezo-testnet/0xAbC",
      "/v1/vebtc/mezo-testnet/42/gauge-profile",
    ])
  })

  it("surfaces MatchboxApiError with code and request id", async () => {
    const { fetch } = mockFetch([errorJson("network_not_allowed", 403)])
    const client = createMatchboxClient({ apiKey, fetch })
    const error = await client.networks
      .list()
      .catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(MatchboxApiError)
    if (error instanceof MatchboxApiError) {
      expect(error.status).toBe(403)
      expect(error.code).toBe("network_not_allowed")
      expect(error.requestId).toBe("req_body")
      expect(error.docsUrl).toContain("#network_not_allowed")
    }
  })

  it("maps unreadable error bodies to invalid_response", async () => {
    const { fetch } = mockFetch([
      new Response("<html>", {
        status: 502,
        headers: { "X-Request-Id": "req_x" },
      }),
    ])
    const client = createMatchboxClient({ apiKey, fetch })
    await expect(client.networks.list()).rejects.toMatchObject({
      code: "invalid_response",
      status: 502,
      requestId: "req_x",
    })
  })

  it("retries 429 and 503 honouring Retry-After", async () => {
    const { fetch } = mockFetch([
      errorJson("rate_limited", 429, { "Retry-After": "0" }),
      errorJson("service_disabled", 503, { "Retry-After": "0" }),
      json({ data: [] }),
    ])
    const client = createMatchboxClient({ apiKey, fetch })
    await expect(client.networks.list()).resolves.toEqual({ data: [] })
    expect(fetch).toHaveBeenCalledTimes(3)
  })

  it("gives up after maxRetries", async () => {
    const { fetch } = mockFetch([
      errorJson("rate_limited", 429, { "Retry-After": "0" }),
      errorJson("rate_limited", 429, { "Retry-After": "0" }),
    ])
    const client = createMatchboxClient({ apiKey, fetch, maxRetries: 1 })
    await expect(client.networks.list()).rejects.toMatchObject({
      code: "rate_limited",
      retryAfter: 0,
    })
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it("does not wait longer than maxRetryDelayMs", async () => {
    const { fetch } = mockFetch([
      errorJson("rate_limited", 429, { "Retry-After": "3600" }),
    ])
    const client = createMatchboxClient({ apiKey, fetch })
    await expect(client.networks.list()).rejects.toMatchObject({
      code: "rate_limited",
      retryAfter: 3600,
    })
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it("does not retry other errors", async () => {
    const { fetch } = mockFetch([errorJson("unauthorized", 401)])
    const client = createMatchboxClient({ apiKey, fetch })
    await expect(client.networks.list()).rejects.toMatchObject({
      code: "unauthorized",
    })
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it("wraps transport failures as network_error", async () => {
    const client = createMatchboxClient({
      apiKey,
      fetch: async () => {
        throw new TypeError("fetch failed")
      },
    })
    await expect(client.networks.list()).rejects.toMatchObject({
      code: "network_error",
      status: 0,
    })
  })
})

describe("parseRetryAfter", () => {
  it("reads delta-seconds and HTTP dates", () => {
    const now = Date.parse("2026-09-30T12:00:00Z")
    expect(parseRetryAfter("7", now)).toBe(7)
    expect(parseRetryAfter("Wed, 30 Sep 2026 12:00:30 GMT", now)).toBe(30)
    expect(parseRetryAfter(null, now)).toBeNull()
    expect(parseRetryAfter("soon", now)).toBeNull()
  })
})
