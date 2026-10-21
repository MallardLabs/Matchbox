import { platformHealthResponseSchema } from "@repo/platform-contracts/platform-health"
import { describe, expect, it } from "vitest"
import {
  type AnalyticsSqlClient,
  PlatformHealthDataError,
  buildHealthLatencySql,
  buildHealthRecentSql,
  buildHealthUptimeSql,
  createPlatformHealthReader,
  localPlatformHealth,
} from "./platform-health"

// 2026-10-21T14:02:10.000Z
const now = new Date(Date.UTC(2026, 9, 21, 14, 2, 10))
const nowSeconds = Math.floor(now.getTime() / 1000)

describe("platform health SQL", () => {
  it("filters by deployment and integer time bounds", () => {
    const query = { deployment: "production", now }
    const uptime = buildHealthUptimeSql(query)
    expect(uptime).toContain("FROM mbx_platform_health")
    expect(uptime).toContain("blob1 = 'production'")
    expect(uptime).toContain(`toDateTime(${nowSeconds - 7 * 86_400})`)
    expect(uptime).toContain("sumIf(_sample_interval, blob2 != 'down')")
    expect(uptime).toContain("GROUP BY target")
    const latency = buildHealthLatencySql(query)
    expect(latency).toContain("quantileExactWeighted(0.95)(double1")
    expect(latency).toContain("blob2 != 'down'")
    const recent = buildHealthRecentSql(query)
    expect(recent).toContain("ORDER BY timestamp DESC LIMIT 200")
    expect(recent).toContain(`toDateTime(${nowSeconds - 600 - 60})`)
  })

  it("rejects deployment names that are not slugs", () => {
    expect(() =>
      buildHealthUptimeSql({ deployment: "prod' OR 1=1 --", now }),
    ).toThrow(PlatformHealthDataError)
  })
})

function fakeClient(responses: {
  uptime: Record<string, unknown>[]
  latency: Record<string, unknown>[]
  recent: Record<string, unknown>[]
}): AnalyticsSqlClient {
  return {
    async query(sql) {
      if (sql.includes("checks_7d")) return responses.uptime
      if (sql.includes("quantileExactWeighted")) return responses.latency
      return responses.recent
    },
  }
}

function probeRow(input: {
  target: string
  secondsAgo: number
  outcome: string
  errorCode?: string
  version?: string
  blockNumber?: string
  chainCheckedAt?: string
  headBlock?: string
  blocksBehind?: number
}): Record<string, unknown> {
  return {
    target: input.target,
    ts: String(nowSeconds - input.secondsAgo),
    outcome: input.outcome,
    error_code: input.errorCode ?? "",
    version: input.version ?? "",
    block_number: input.blockNumber ?? "",
    chain_checked_at: input.chainCheckedAt ?? "",
    head_block: input.headBlock ?? "",
    blocks_behind: input.blocksBehind ?? -1,
  }
}

describe("createPlatformHealthReader", () => {
  it("summarizes uptime, latency, status and chain freshness", async () => {
    const reader = createPlatformHealthReader({
      deployment: "production",
      client: fakeClient({
        uptime: [
          {
            target: "gauge-profile-api",
            checks_7d: "10080",
            available_7d: "10070",
            checks_24h: 1440,
            available_24h: 1440,
            last_ts: nowSeconds - 10,
          },
          {
            target: "matchbox-id",
            checks_7d: 10080,
            available_7d: 10080,
            checks_24h: 1440,
            available_24h: 1438,
            last_ts: nowSeconds - 10,
          },
        ],
        latency: [
          { target: "gauge-profile-api", p50: 31.234, p95: "84" },
          { target: "matchbox-id", p50: 40, p95: 120 },
        ],
        recent: [
          probeRow({
            target: "gauge-profile-api",
            secondsAgo: 10,
            outcome: "up",
            version: "2.0.0",
          }),
          probeRow({
            target: "matchbox-id",
            secondsAgo: 10,
            outcome: "up",
          }),
          probeRow({
            target: "matchbox-id",
            secondsAgo: 130,
            outcome: "down",
            errorCode: "timeout",
          }),
          probeRow({
            target: "chain-sync:mezo",
            secondsAgo: 10,
            outcome: "up",
            blockNumber: "4128440",
            chainCheckedAt: new Date(now.getTime() - 240_000).toISOString(),
            headBlock: "4128500",
            blocksBehind: 60,
          }),
        ],
      }),
    })
    const health = await reader.read(now)
    expect(platformHealthResponseSchema.parse(health)).toEqual(health)
    expect(health.source).toBe("probes")
    const [api, id] = health.products
    expect(api).toMatchObject({
      product: "gauge-profile-api",
      name: "Gauge Profile API",
      status: "operational",
      version: "2.0.0",
      uptime24h: 1,
      p50LatencyMs: 31.23,
      p95LatencyMs: 84,
      checks24h: 1440,
      lastErrorCode: null,
    })
    expect(api?.uptime7d).toBeCloseTo(10070 / 10080)
    expect(id).toMatchObject({ product: "matchbox-id", status: "degraded" })
    expect(id?.uptime24h).toBeCloseTo(1438 / 1440)
    const [mainnet, testnet] = health.chainSync
    expect(mainnet).toMatchObject({
      network: "mezo",
      status: "operational",
      blockNumber: "4128440",
      lagSeconds: 240,
      headBlock: "4128500",
      blocksBehind: 60,
    })
    expect(testnet).toMatchObject({
      network: "mezo-testnet",
      status: "unknown",
      blockNumber: null,
      checkedAt: null,
      lagSeconds: null,
      lastCheckedAt: null,
    })
  })

  it("marks a target down when its latest probe failed", async () => {
    const reader = createPlatformHealthReader({
      deployment: "production",
      client: fakeClient({
        uptime: [],
        latency: [],
        recent: [
          probeRow({
            target: "gauge-profile-api",
            secondsAgo: 5,
            outcome: "down",
            errorCode: "service-disabled",
          }),
        ],
      }),
    })
    const health = await reader.read(now)
    expect(health.products[0]).toMatchObject({
      status: "down",
      lastErrorCode: "service-disabled",
      uptime24h: null,
      uptime7d: null,
      checks24h: 0,
    })
  })

  it("reports unknown when the newest probe is older than five minutes", async () => {
    const reader = createPlatformHealthReader({
      deployment: "production",
      client: fakeClient({
        uptime: [],
        latency: [],
        recent: [
          probeRow({
            target: "gauge-profile-api",
            secondsAgo: 400,
            outcome: "up",
          }),
        ],
      }),
    })
    expect((await reader.read(now)).products[0]?.status).toBe("unknown")
  })

  it("throws on rows that do not match the layout", async () => {
    const reader = createPlatformHealthReader({
      deployment: "production",
      client: fakeClient({ uptime: [{ nope: true }], latency: [], recent: [] }),
    })
    await expect(reader.read(now)).rejects.toBeInstanceOf(
      PlatformHealthDataError,
    )
  })
})

describe("localPlatformHealth", () => {
  it("is deterministic, valid and labelled local", () => {
    const first = localPlatformHealth(now)
    expect(platformHealthResponseSchema.parse(first)).toEqual(first)
    expect(first.source).toBe("local")
    expect(localPlatformHealth(now)).toEqual(first)
    expect(first.chainSync.map((chain) => chain.network)).toEqual([
      "mezo",
      "mezo-testnet",
    ])
  })
})
