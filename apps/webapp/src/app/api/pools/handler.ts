// Per-network, per-filter edge proxy for the Mezo pools API.
//
// Filter lives in the path (`/api/pools/mainnet/none`) rather than a query
// string. Netlify/CDN caches have collapsed `?filter=` on this route before,
// so Known and All were served the same Known payload.

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
} as const

const UPSTREAM: Record<string, string> = {
  mainnet: "https://api.mezo.org",
  testnet: "https://api.testnet.mezo.org",
}

const SPOOF_ORIGIN: Record<string, string> = {
  mainnet: "https://mezo.org",
  testnet: "https://testnet.mezo.org",
}

const ALLOWED_FILTERS = new Set(["known", "none", "tvl", "institutional"])

function parsePoolProxy(url: URL): { network: string; filter: string } {
  const parts = url.pathname.split("/").filter(Boolean)
  const poolsIdx = parts.indexOf("pools")
  const networkSeg = parts[poolsIdx + 1]
  const filterSeg = parts[poolsIdx + 2]
  const network = networkSeg === "testnet" ? "testnet" : "mainnet"
  const rawFilter = filterSeg ?? url.searchParams.get("filter") ?? "known"
  const filter = rawFilter === "all" ? "none" : rawFilter
  return { network, filter }
}

export async function handler(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS })
  }

  const { network, filter } = parsePoolProxy(new URL(request.url))

  if (!ALLOWED_FILTERS.has(filter)) {
    return new Response(
      JSON.stringify({ success: false, error: `Invalid filter: ${filter}` }),
      {
        status: 400,
        headers: { "Content-Type": "application/json", ...CORS_HEADERS },
      },
    )
  }

  const upstream = `${UPSTREAM[network]}/pools?filter=${encodeURIComponent(filter)}`
  const origin = SPOOF_ORIGIN[network] ?? "https://mezo.org"

  try {
    const response = await fetch(upstream, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Origin: origin,
        Referer: `${origin}/`,
        "User-Agent":
          "Mozilla/5.0 (compatible; MatchboxProxy/1.0; +https://mezo.org)",
      },
    })

    const body = await response.text()
    return new Response(body, {
      status: response.status,
      headers: {
        "Content-Type":
          response.headers.get("Content-Type") ?? "application/json",
        "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
        ...CORS_HEADERS,
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown"
    return new Response(JSON.stringify({ success: false, error: message }), {
      status: 502,
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    })
  }
}
