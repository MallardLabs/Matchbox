import { topologyChainId } from "../../lib/topology"
import { type ApiRoute, cached, json } from "../router"
import { computePoolMarket, computeValidatorMarket } from "../vote/chain"

// Vote data for validator and pool ballots, read once on the server instead
// of fanning out from every browser. Per-wallet reads (locks, own votes) stay
// in the browser.

const MARKET_TTL_MS = 30_000
const BROWSER_MAX_AGE_SECONDS = 15

export const voteRoutes: ApiRoute[] = [
  {
    method: "GET",
    path: "/api/vote/validators",
    handler: async ({ url }) => {
      const chainId = topologyChainId(
        Number(url.searchParams.get("chainId") ?? Number.NaN),
      )
      return json(
        await cached(`vote:validators:${chainId}`, MARKET_TTL_MS, () =>
          computeValidatorMarket(chainId),
        ),
        BROWSER_MAX_AGE_SECONDS,
      )
    },
  },
  {
    method: "GET",
    path: "/api/vote/pools",
    handler: async ({ url }) => {
      const chainId = topologyChainId(
        Number(url.searchParams.get("chainId") ?? Number.NaN),
      )
      return json(
        await cached(`vote:pools:${chainId}`, MARKET_TTL_MS, () =>
          computePoolMarket(chainId),
        ),
        BROWSER_MAX_AGE_SECONDS,
      )
    },
  },
]
