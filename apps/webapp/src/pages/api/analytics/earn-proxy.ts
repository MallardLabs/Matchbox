export const config = {
  runtime: "edge",
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
} as const

const EARN_API_BASE = "https://api.mezo.org"
const EARN_API_TESTNET_BASE = "https://api.testnet.mezo.org"

// Whitelist of allowed upstream endpoints. Prevents the proxy from being
// used as an open relay.
const ALLOWED_ENDPOINTS = new Set([
  "pools",
  "locks/stats",
  "tokens",
  "votes/votables",
])

const ALLOWED_QUERY_KEYS = new Set([
  "type",
  "timeframe",
  "filter",
  "isVotable",
  "endpoint",
  "network",
])

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

export default async function handler(request: Request) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS })
  }

  const url = new URL(request.url)
  const endpoint = url.searchParams.get("endpoint")
  const network = url.searchParams.get("network") ?? "mainnet"

  if (!endpoint || !ALLOWED_ENDPOINTS.has(endpoint)) {
    return json(
      {
        data: null,
        error: "invalid-endpoint",
        message: `endpoint must be one of: ${Array.from(ALLOWED_ENDPOINTS).join(", ")}`,
      },
      { status: 400 },
    )
  }

  const base = network === "testnet" ? EARN_API_TESTNET_BASE : EARN_API_BASE
  const upstreamUrl = new URL(`${base}/${endpoint}`)

  // Forward whitelisted query params.
  for (const [key, value] of url.searchParams.entries()) {
    if (
      ALLOWED_QUERY_KEYS.has(key) &&
      key !== "endpoint" &&
      key !== "network"
    ) {
      upstreamUrl.searchParams.set(key, value)
    }
  }

  try {
    const response = await fetch(upstreamUrl.toString(), {
      method: "GET",
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    })

    if (!response.ok) {
      return json(
        {
          data: null,
          error: "upstream-unavailable",
          status: response.status,
          endpoint,
          timestamp: Date.now(),
        },
        {
          status: 200,
          headers: {
            "Cache-Control": "public, s-maxage=10, stale-while-revalidate=30",
          },
        },
      )
    }

    const body = await response.json()

    return json(
      {
        data: body,
        error: null,
        endpoint,
        timestamp: Date.now(),
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120",
        },
      },
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error"
    return json(
      {
        data: null,
        error: "upstream-unavailable",
        message,
        endpoint,
        timestamp: Date.now(),
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "public, s-maxage=10, stale-while-revalidate=30",
        },
      },
    )
  }
}
