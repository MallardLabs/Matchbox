export const config = {
  runtime: "edge",
}

// Per-network edge proxy for the Mezo votables API.
//
// See `pages/api/pools/[network].ts` for why we route by path instead of
// query string — prevents the CDN / browser from serving one network's
// cached response to the other network on network toggle.

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

export default async function handler(request: Request) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS })
  }

  const url = new URL(request.url)
  const segments = url.pathname.split("/").filter(Boolean)
  const rawNetwork = segments[segments.length - 1]
  const network = rawNetwork === "testnet" ? "testnet" : "mainnet"

  const upstream = `${UPSTREAM[network]}/votes/votables`
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
