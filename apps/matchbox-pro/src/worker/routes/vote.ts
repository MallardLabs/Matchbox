import type { WireTokenPrices } from "../../features/vote/contract"
import { topologyChainId } from "../../lib/topology"
import { type ApiRoute, cachedStale, json } from "../router"
import {
  MARKET_TTL,
  computePoolMarket,
  computeValidatorMarket,
  fetchPoolsApiPrices,
} from "../vote/chain"

// Vote data for validator and pool ballots, read once on the server instead
// of fanning out from every browser. Per-wallet reads (locks, own votes) stay
// in the browser.

const BROWSER_MAX_AGE_SECONDS = 15

export const voteRoutes: ApiRoute[] = [
  {
    // Market prices for tokens without a reference price (pool fee tokens).
    // Separate so the slow third-party API never holds up the markets.
    method: "GET",
    path: "/api/vote/prices",
    handler: async ({ url, waitUntil }) => {
      const chainId = topologyChainId(
        Number(url.searchParams.get("chainId") ?? Number.NaN),
      )
      const prices = await fetchPoolsApiPrices(chainId, waitUntil)
      const body: WireTokenPrices = {
        chainId,
        prices: Object.fromEntries(prices),
      }
      return json(body, prices.size > 0 ? 60 : undefined)
    },
  },
  {
    method: "GET",
    path: "/api/vote/validators",
    handler: async ({ url, waitUntil }) => {
      const chainId = topologyChainId(
        Number(url.searchParams.get("chainId") ?? Number.NaN),
      )
      return json(
        await cachedStale(
          `vote:validators:${chainId}`,
          MARKET_TTL,
          () => computeValidatorMarket(chainId, waitUntil),
          waitUntil,
        ),
        BROWSER_MAX_AGE_SECONDS,
      )
    },
  },
  {
    method: "GET",
    path: "/api/vote/pools",
    handler: async ({ url, waitUntil }) => {
      const chainId = topologyChainId(
        Number(url.searchParams.get("chainId") ?? Number.NaN),
      )
      return json(
        await cachedStale(
          `vote:pools:${chainId}`,
          MARKET_TTL,
          () => computePoolMarket(chainId, waitUntil),
          waitUntil,
        ),
        BROWSER_MAX_AGE_SECONDS,
      )
    },
  },
]
