import { mezoGaugeVenueLookups } from "@/lib/mezoGauges"
import {
  type RemotePoolStat,
  dexScreenerPairRequestPath,
  emptyRemotePoolStat,
  geckoPoolRequestPath,
  mergeRemotePoolStats,
  parseCurveFactoryTvl,
  parseCurveVolume,
  parseDexScreenerResponse,
  parseGeckoPoolResponse,
} from "@/lib/remoteMezoPools"

export { handler as GET, handler as OPTIONS }

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
} as const

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

const GECKOTERMINAL_API_BASE = "https://api.geckoterminal.com/api/v2"
const DEXSCREENER_API_BASE = "https://api.dexscreener.com"
const CURVE_VOLUMES_URL = "https://api.curve.finance/v1/getVolumes/ethereum"
const CURVE_FACTORY_URL =
  "https://api.curve.finance/v1/getPools/ethereum/factory-stable-ng"

function json(data: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...CORS_HEADERS,
      ...init?.headers,
    },
  })
}

async function fetchJson(
  url: string,
  headers: Record<string, string>,
): Promise<unknown | null> {
  try {
    const response = await fetch(url, { headers })
    if (!response.ok) return null
    const contentType = response.headers.get("content-type") ?? ""
    if (!contentType.toLowerCase().includes("json")) return null
    return await response.json()
  } catch {
    return null
  }
}

async function fetchDexScreenerStat(
  chain: "base" | "ethereum",
  pairId: string,
): Promise<RemotePoolStat> {
  const payload = await fetchJson(
    `${DEXSCREENER_API_BASE}${dexScreenerPairRequestPath(chain, pairId)}`,
    { Accept: "application/json", "User-Agent": BROWSER_UA },
  )
  return payload ? parseDexScreenerResponse(payload) : emptyRemotePoolStat()
}

async function fetchGeckoStat(
  network: "base" | "eth",
  poolId: string,
): Promise<RemotePoolStat> {
  const payload = await fetchJson(
    `${GECKOTERMINAL_API_BASE}${geckoPoolRequestPath(network, poolId)}`,
    {
      Accept: "application/json;version=20230203",
      "User-Agent": BROWSER_UA,
    },
  )
  return payload ? parseGeckoPoolResponse(payload) : emptyRemotePoolStat()
}

async function fetchCurveStat(poolId: string): Promise<RemotePoolStat> {
  const [volumes, factory] = await Promise.all([
    fetchJson(CURVE_VOLUMES_URL, {
      Accept: "application/json",
      "User-Agent": BROWSER_UA,
    }),
    fetchJson(CURVE_FACTORY_URL, {
      Accept: "application/json",
      "User-Agent": BROWSER_UA,
    }),
  ])
  return mergeRemotePoolStats([
    volumes ? parseCurveVolume(volumes, poolId) : emptyRemotePoolStat(),
    factory ? parseCurveFactoryTvl(factory, poolId) : emptyRemotePoolStat(),
  ])
}

function jsonHeaders(): HeadersInit {
  return {
    "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
  }
}

async function handler(request: Request) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS })
  }

  if (request.method !== "GET") {
    return json({ error: "method-not-allowed" }, { status: 405 })
  }

  const lookups = mezoGaugeVenueLookups()
  const pools = await Promise.all(
    lookups.map(async (lookup) => {
      const [dex, gecko] = await Promise.all([
        fetchDexScreenerStat(lookup.dexScreenerChain, lookup.geckoPoolId),
        fetchGeckoStat(lookup.geckoNetwork, lookup.geckoPoolId),
      ])
      let stats = mergeRemotePoolStats([dex, gecko])
      if (
        lookup.protocol === "Curve" &&
        (stats.reserveUsd == null || stats.volume24hUsd == null)
      ) {
        stats = mergeRemotePoolStats([
          stats,
          await fetchCurveStat(lookup.geckoPoolId),
        ])
      }
      return {
        gauge: lookup.gauge,
        geckoNetwork: lookup.geckoNetwork,
        geckoPoolId: lookup.geckoPoolId,
        ...stats,
      }
    }),
  )

  return json({ pools, timestamp: Date.now() }, { headers: jsonHeaders() })
}
