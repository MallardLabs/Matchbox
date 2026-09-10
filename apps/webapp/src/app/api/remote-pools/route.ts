import { mezoGaugeVenueLookups } from "@/lib/mezoGauges"
import {
  geckoPoolRequestPath,
  parseGeckoPoolResponse,
} from "@/lib/remoteMezoPools"

export { handler as GET, handler as OPTIONS }

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
} as const

const GECKOTERMINAL_API_BASE = "https://api.geckoterminal.com/api/v2"

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

async function fetchVenuePool(
  geckoNetwork: "base" | "eth",
  geckoPoolId: string,
): Promise<{
  venueName: string | null
  reserveUsd: number | null
  volume24hUsd: number | null
}> {
  try {
    const response = await fetch(
      `${GECKOTERMINAL_API_BASE}${geckoPoolRequestPath(geckoNetwork, geckoPoolId)}`,
      {
        headers: {
          Accept: "application/json;version=20230203",
          "User-Agent": "Matchbox/1.0 (+https://app.matchbox.markets)",
        },
      },
    )
    if (!response.ok) {
      return { venueName: null, reserveUsd: null, volume24hUsd: null }
    }
    return parseGeckoPoolResponse(await response.json())
  } catch {
    return { venueName: null, reserveUsd: null, volume24hUsd: null }
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
      const stats = await fetchVenuePool(
        lookup.geckoNetwork,
        lookup.geckoPoolId,
      )
      return {
        gauge: lookup.gauge,
        geckoNetwork: lookup.geckoNetwork,
        geckoPoolId: lookup.geckoPoolId,
        ...stats,
      }
    }),
  )

  return json(
    { pools, timestamp: Date.now() },
    {
      headers: {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
      },
    },
  )
}
