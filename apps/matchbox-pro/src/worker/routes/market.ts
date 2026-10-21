import { topologyChainId } from "../../lib/topology"
import { fetchBtcUsdPrice } from "../btcPrice"
import { fetchMezoUsdPrice } from "../mezoPrice"
import { type ApiRoute, cached, json } from "../router"
import { computeGaugeTopology } from "../topology"

export const marketRoutes: ApiRoute[] = [
  {
    method: "GET",
    path: "/api/health",
    handler: async () => json({ service: "matchbox-pro", ok: true }),
  },
  {
    method: "GET",
    path: "/api/topology",
    handler: async ({ url }) => {
      const chainId = topologyChainId(
        Number(url.searchParams.get("chainId") ?? Number.NaN),
      )
      return json(
        await cached(`topology:${chainId}`, 30_000, () =>
          computeGaugeTopology(chainId),
        ),
        15,
      )
    },
  },
  {
    method: "GET",
    path: "/api/pricing/btc",
    handler: async () =>
      json(await cached("btc", 15_000, fetchBtcUsdPrice), 15),
  },
  {
    method: "GET",
    path: "/api/pricing/mezo",
    handler: async ({ env }) =>
      json(
        await cached("mezo", 15_000, () => fetchMezoUsdPrice(env.BASE_RPC_URL)),
        15,
      ),
  },
]
