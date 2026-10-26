import { issuesFromZodError } from "@repo/platform-contracts/errors"
import {
  type EpochSelector,
  type GaugeDetail,
  type GaugeEpochList,
  type GaugeList,
  type IncentiveList,
  type MarketMeta,
  currentEpochResponse,
  describeEpoch,
  epochSeconds,
  epochStartOf,
  gaugeDetailParamsSchema,
  parseGaugeEpochsQuery,
  parseGaugeListQuery,
  parseIncentiveListQuery,
  vebtcGaugeParamsSchema,
} from "@repo/platform-contracts/market"
import type { NetworkSlug } from "@repo/platform-contracts/network"
import { PlatformError } from "@repo/platform-server"
import type { Hono } from "hono"
import type { z } from "zod"
import type { ApiEnv } from "../context"
import { allowedNetwork, requireAuth } from "../guards"
import { found, respondJson } from "../http"
import type { StoredEpoch } from "./snapshot"
import type { MarketStore } from "./store"

export type MarketRouteDeps = {
  /** null when the Worker has no market database bound. */
  market: MarketStore | null
  now: () => Date
}

function invalidQuery(error: z.ZodError): PlatformError {
  return new PlatformError("invalid_request", {
    issues: issuesFromZodError(error),
  })
}

function metaFor(epoch: StoredEpoch, nowSeconds: number): MarketMeta {
  return {
    source: "matchbox-market",
    network: epoch.network,
    epoch: describeEpoch(epoch.epochStart, nowSeconds),
    blockNumber: epoch.blockNumber,
    asOf: epoch.asOf,
    totalWeights: epoch.totalWeights,
    prices: epoch.prices,
  }
}

/** Gauge, incentive and epoch routes under `/v1`, after auth and limits. */
export default function registerMarketRoutes(
  app: Hono<ApiEnv>,
  deps: MarketRouteDeps,
): void {
  const nowSeconds = (): number => Math.floor(deps.now().getTime() / 1000)

  function store(): MarketStore {
    if (deps.market === null) {
      throw new PlatformError("service_disabled", {
        message: "Market data is not available.",
      })
    }
    return deps.market
  }

  /** The newest snapshot at or before the current epoch; 503 if none yet. */
  async function latestSnapshot(network: NetworkSlug): Promise<StoredEpoch> {
    const epoch = await store().latestEpoch(network, epochStartOf(nowSeconds()))
    if (epoch === null) {
      throw new PlatformError("service_disabled", {
        message: "Market data for this network is not available yet.",
      })
    }
    return epoch
  }

  /** The stored epoch an `epoch` selector names; 404 when never captured. */
  async function selectedEpoch(
    network: NetworkSlug,
    selector: EpochSelector,
  ): Promise<StoredEpoch> {
    if (selector.kind === "current") return latestSnapshot(network)
    const start =
      selector.kind === "next"
        ? epochStartOf(nowSeconds()) + epochSeconds
        : selector.start
    return found(await store().getEpoch(network, start))
  }

  app.get("/v1/epochs/current", (c) => {
    c.set("routeTemplate", "/v1/epochs/current")
    requireAuth(c)
    return respondJson(c, currentEpochResponse(nowSeconds()))
  })

  app.get("/v1/gauges", async (c) => {
    c.set("routeTemplate", "/v1/gauges")
    requireAuth(c)
    const parsed = parseGaugeListQuery(new URL(c.req.url).searchParams)
    if (!parsed.ok) throw invalidQuery(parsed.error)
    const { query } = parsed
    const network = allowedNetwork(query.network)
    const epoch = await latestSnapshot(network)
    const gauges = await store().listGauges(network, epoch.epochStart, {
      voter: query.voter ?? null,
      gauges: query.gauge ?? null,
    })
    const alive = query.alive
    const body: GaugeList = {
      data:
        alive === undefined
          ? gauges
          : gauges.filter((gauge) => gauge.isAlive === (alive === "true")),
      meta: metaFor(epoch, nowSeconds()),
    }
    return respondJson(c, body)
  })

  app.get("/v1/gauges/:network/:gaugeAddress", async (c) => {
    c.set("routeTemplate", "/v1/gauges/{network}/{gaugeAddress}")
    requireAuth(c)
    const network = allowedNetwork(c.req.param("network"))
    const params = gaugeDetailParamsSchema.safeParse({
      network,
      gaugeAddress: c.req.param("gaugeAddress"),
    })
    if (!params.success) throw new PlatformError("not_found")
    const epoch = await latestSnapshot(network)
    const row = found(
      await store().getGauge(
        network,
        epoch.epochStart,
        params.data.gaugeAddress,
      ),
    )
    const body: GaugeDetail = {
      data: row.gauge,
      meta: metaFor(epoch, nowSeconds()),
    }
    return respondJson(c, body)
  })

  app.get("/v1/gauges/:network/:gaugeAddress/epochs", async (c) => {
    c.set("routeTemplate", "/v1/gauges/{network}/{gaugeAddress}/epochs")
    requireAuth(c)
    const network = allowedNetwork(c.req.param("network"))
    const params = gaugeDetailParamsSchema.safeParse({
      network,
      gaugeAddress: c.req.param("gaugeAddress"),
    })
    if (!params.success) throw new PlatformError("not_found")
    const parsed = parseGaugeEpochsQuery(new URL(c.req.url).searchParams)
    if (!parsed.ok) throw invalidQuery(parsed.error)
    const gaugeAddress = params.data.gaugeAddress
    const now = nowSeconds()
    const entries = await store().listGaugeHistory(
      network,
      gaugeAddress,
      epochStartOf(now),
      parsed.query.limit,
    )
    if (entries.length === 0) {
      // 503 before any snapshot, 404 for a gauge no snapshot has seen.
      const latest = await latestSnapshot(network)
      found(await store().getGauge(network, latest.epochStart, gaugeAddress))
    }
    const body: GaugeEpochList = {
      data: entries.map((entry) => ({
        epoch: describeEpoch(entry.epoch.epochStart, now),
        incentives: entry.incentives,
        totalWeight: entry.epoch.totalWeights[entry.incentives.voter],
        blockNumber: entry.epoch.blockNumber,
        asOf: entry.epoch.asOf,
        prices: entry.epoch.prices,
      })),
      meta: { source: "matchbox-market", network, gaugeAddress },
    }
    return respondJson(c, body)
  })

  app.get("/v1/incentives", async (c) => {
    c.set("routeTemplate", "/v1/incentives")
    requireAuth(c)
    const parsed = parseIncentiveListQuery(new URL(c.req.url).searchParams)
    if (!parsed.ok) throw invalidQuery(parsed.error)
    const { query } = parsed
    const network = allowedNetwork(query.network)
    const epoch = await selectedEpoch(network, query.epoch)
    const body: IncentiveList = {
      data: await store().listIncentives(network, epoch.epochStart, {
        voter: query.voter ?? null,
        gauges: query.gauge ?? null,
      }),
      meta: metaFor(epoch, nowSeconds()),
    }
    return respondJson(c, body)
  })

  app.get("/v1/vebtc/:network/:tokenId/gauge", async (c) => {
    c.set("routeTemplate", "/v1/vebtc/{network}/{tokenId}/gauge")
    requireAuth(c)
    const network = allowedNetwork(c.req.param("network"))
    const params = vebtcGaugeParamsSchema.safeParse({
      network,
      tokenId: c.req.param("tokenId"),
    })
    if (!params.success) throw new PlatformError("not_found")
    const epoch = await latestSnapshot(network)
    const row = found(
      await store().getGaugeByVebtc(
        network,
        epoch.epochStart,
        params.data.tokenId,
      ),
    )
    const body: GaugeDetail = {
      data: row.gauge,
      meta: metaFor(epoch, nowSeconds()),
    }
    return respondJson(c, body)
  })
}
