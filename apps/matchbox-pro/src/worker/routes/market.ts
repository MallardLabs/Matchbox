import { topologyChainId } from "../../lib/topology"
import { fetchBtcUsdPrice } from "../btcPrice"
import { fetchMezoUsdPrice } from "../mezoPrice"
import { claudeAvailable, readStuartConfig } from "../query/env"
import { type ApiRoute, cachedStale, json } from "../router"
import { computeGaugeTopology } from "../topology"

// Serve the last value while one background refresh runs, so a cold or
// failing RPC read only ever delays the first request in an isolate.
const TOPOLOGY_TTL = { freshMs: 30_000, staleMs: 10 * 60_000 }
const PRICE_TTL = { freshMs: 15_000, staleMs: 5 * 60_000 }

export const marketRoutes: ApiRoute[] = [
  {
    method: "GET",
    path: "/api/health",
    handler: async ({ env }) =>
      json({
        service: "matchbox-pro",
        ok: true,
        stuart: claudeAvailable(readStuartConfig(env))
          ? "claude"
          : "deterministic",
      }),
  },
  {
    method: "GET",
    path: "/api/topology",
    handler: async ({ url, waitUntil }) => {
      const chainId = topologyChainId(
        Number(url.searchParams.get("chainId") ?? Number.NaN),
      )
      return json(
        await cachedStale(
          `topology:${chainId}`,
          TOPOLOGY_TTL,
          () => computeGaugeTopology(chainId),
          waitUntil,
        ),
        15,
      )
    },
  },
  {
    method: "GET",
    path: "/api/pricing/btc",
    handler: async ({ waitUntil }) =>
      json(
        await cachedStale("btc", PRICE_TTL, fetchBtcUsdPrice, waitUntil),
        15,
      ),
  },
  {
    method: "GET",
    path: "/api/pricing/mezo",
    handler: async ({ env, waitUntil }) =>
      json(
        await cachedStale(
          "mezo",
          PRICE_TTL,
          () => fetchMezoUsdPrice(env.BASE_RPC_URL),
          waitUntil,
        ),
        15,
      ),
  },
]
