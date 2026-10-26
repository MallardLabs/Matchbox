import { describe, expect, it, vi } from "vitest"
import {
  type CurrentEpochResponse,
  type Epoch,
  type FetchLike,
  type Gauge,
  type GaugeEpochList,
  type GaugeIncentives,
  type GaugeProfile,
  type MarketMeta,
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

const epochStart = 1_761_782_400

const epoch: Epoch = {
  start: epochStart,
  end: epochStart + 604_800,
  voteStart: epochStart + 3_600,
  voteEnd: epochStart + 604_800 - 3_600,
  status: "current",
}

const marketMeta: MarketMeta = {
  source: "matchbox-market",
  network: "mezo",
  epoch,
  blockNumber: "4200000",
  asOf: "2025-10-31T12:00:00.000Z",
  totalWeights: {
    boost: "1000000000000000000000",
    pools: null,
    validators: null,
    "third-party": null,
  },
  prices: {
    btcUsd: { usd: "110000", source: "skip-oracle" },
    mezoUsd: null,
  },
}

const boostGauge: Gauge = {
  voter: "boost",
  network: "mezo",
  gaugeAddress: "0x8f3cf7ad23cd3cadbd9735aff958023239c6a063",
  isAlive: true,
  weight: "1000000000000000000",
  bribeContract: null,
  vebtcTokenId: "42",
  beneficiary: null,
  boostMultiplier: "1.25",
}

const incentives: GaugeIncentives = {
  network: "mezo",
  voter: "boost",
  gaugeAddress: boostGauge.gaugeAddress,
  epochStart,
  isAlive: true,
  weight: "1000000000000000000",
  rewards: [
    {
      kind: "bribe",
      contract: "0x3c6f9e2d5a8b1c4f7e0d3a6b9c2f5e8d1a4b7c0e",
      token: "0x1a4b7c0e3c6f9e2d5a8b1c4f7e0d3a6b9c2f5e8d",
      symbol: "MUSD",
      decimals: 18,
      amount: "5000000000000000000",
      usd: "5",
    },
  ],
  totalUsd: "5",
  unpricedRewards: 0,
  aprPercent: "12.5",
}

describe("market endpoints", () => {
  it("reads the current epoch", async () => {
    const body: CurrentEpochResponse = {
      data: { current: epoch, next: { ...epoch, status: "upcoming" } },
    }
    const { fetch, calls } = mockFetch([json(body)])
    const client = createMatchboxClient({ apiKey, fetch })
    await expect(client.epochs.current()).resolves.toEqual(body)
    expect(calls[0]?.url).toBe("https://api.matchbox.markets/v1/epochs/current")
  })

  it("serialises gauge list filters", async () => {
    const { fetch, calls } = mockFetch([
      json({ data: [boostGauge], meta: marketMeta }),
      json({ data: [], meta: marketMeta }),
    ])
    const client = createMatchboxClient({ apiKey, fetch })
    const list = await client.gauges.list({
      network: "mezo",
      voter: "pools",
      alive: false,
      gauge: ["0x01", "0x02"],
    })
    expect(list.data[0]?.voter).toBe("boost")
    await client.gauges.list({ network: "mezo-testnet" })
    expect(calls.map((call) => call.url)).toEqual([
      "https://api.matchbox.markets/v1/gauges?network=mezo&voter=pools&alive=false&gauge=0x01&gauge=0x02",
      "https://api.matchbox.markets/v1/gauges?network=mezo-testnet",
    ])
  })

  it("narrows gauge details on voter", async () => {
    const { fetch, calls } = mockFetch([
      json({ data: boostGauge, meta: marketMeta }),
      json({ data: boostGauge, meta: marketMeta }),
    ])
    const client = createMatchboxClient({ apiKey, fetch })
    const detail = await client.gauges.get("mezo", "0x8F3C")
    if (detail.data.voter !== "boost") throw new Error("expected a boost gauge")
    expect(detail.data.boostMultiplier).toBe("1.25")
    await client.gauges.byVebtc("mezo", 42n)
    expect(calls.map((call) => new URL(call.url).pathname)).toEqual([
      "/v1/gauges/mezo/0x8F3C",
      "/v1/vebtc/mezo/42/gauge",
    ])
  })

  it("lists a gauge's epochs with an optional limit", async () => {
    const body: GaugeEpochList = {
      data: [
        {
          epoch,
          incentives,
          totalWeight: "1000000000000000000000",
          blockNumber: "4200000",
          asOf: "2025-10-31T12:00:00.000Z",
          prices: marketMeta.prices,
        },
      ],
      meta: {
        source: "matchbox-market",
        network: "mezo",
        gaugeAddress: boostGauge.gaugeAddress,
      },
    }
    const { fetch, calls } = mockFetch([json(body), json(body)])
    const client = createMatchboxClient({ apiKey, fetch })
    const history = await client.gauges.epochs("mezo", "0xabc")
    expect(history.data[0]?.incentives.aprPercent).toBe("12.5")
    await client.gauges.epochs("mezo", "0xabc", { limit: 52 })
    expect(calls.map((call) => call.url)).toEqual([
      "https://api.matchbox.markets/v1/gauges/mezo/0xabc/epochs",
      "https://api.matchbox.markets/v1/gauges/mezo/0xabc/epochs?limit=52",
    ])
  })

  it("selects incentive epochs by name or start", async () => {
    const { fetch, calls } = mockFetch([
      json({ data: [incentives], meta: marketMeta }),
      json({ data: [], meta: marketMeta }),
      json({ data: [], meta: marketMeta }),
    ])
    const client = createMatchboxClient({ apiKey, fetch })
    const current = await client.incentives.list({ network: "mezo" })
    expect(current.data[0]?.rewards[0]?.usd).toBe("5")
    await client.incentives.list({
      network: "mezo",
      epoch: "next",
      voter: "third-party",
    })
    await client.incentives.list({
      network: "mezo",
      epoch: epochStart,
      gauge: ["0x01"],
    })
    expect(calls.map((call) => new URL(call.url).search)).toEqual([
      "?network=mezo",
      "?network=mezo&epoch=next&voter=third-party",
      `?network=mezo&epoch=${epochStart}&gauge=0x01`,
    ])
  })

  it("rejects bodies of the wrong shape", async () => {
    const { fetch } = mockFetch([
      json({ data: profile("0xabc"), meta }),
      json({ data: {} }),
    ])
    const client = createMatchboxClient({ apiKey, fetch })
    await expect(client.gauges.get("mezo", "0xabc")).rejects.toMatchObject({
      code: "invalid_response",
    })
    await expect(client.epochs.current()).rejects.toMatchObject({
      code: "invalid_response",
    })
  })

  it("surfaces a missing epoch snapshot as not_found", async () => {
    const { fetch } = mockFetch([errorJson("not_found", 404)])
    const client = createMatchboxClient({ apiKey, fetch })
    await expect(
      client.incentives.list({ network: "mezo", epoch: 0 }),
    ).rejects.toMatchObject({ status: 404, code: "not_found" })
    expect(fetch).toHaveBeenCalledTimes(1)
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
