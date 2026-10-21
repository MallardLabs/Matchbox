import {
  MEZO_ACCOUNTS_API,
  type MezoIdLookup,
  type MezoIdNetwork,
  parseMezoIdQuery,
  toMezoIdLookup,
} from "@/lib/mezoId"

export { handler as GET, handler as OPTIONS }

// Edge proxy for the Mezo accounts API (`/accounts/{id}`), which resolves a
// Mezo ID, EVM address, or Bitcoin address to the linked account. The
// upstream does not send Access-Control-Allow-Origin, so browsers can't call
// it directly. Network is a path segment for the same cache-isolation reason
// as `/api/pools/[network]`.

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
} as const

// Found accounts rarely change; misses stay short so a freshly claimed Mezo ID
// shows up quickly.
function cacheControl(body: MezoIdLookup | { error: string }): string {
  if (!("status" in body)) return "no-store"
  if (body.status === "found") {
    return "public, s-maxage=300, stale-while-revalidate=600"
  }
  return "public, s-maxage=30"
}

function json(body: MezoIdLookup | { error: string }, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": cacheControl(body),
      ...CORS_HEADERS,
    },
  })
}

async function handler(request: Request) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS })
  }

  const url = new URL(request.url)
  const segments = url.pathname.split("/").filter(Boolean)
  const network: MezoIdNetwork =
    segments[segments.length - 1] === "testnet" ? "testnet" : "mainnet"

  const query = parseMezoIdQuery(url.searchParams.get("q") ?? "")
  if (!query) return json({ status: "invalid" }, 200)

  const upstream = `${MEZO_ACCOUNTS_API[network]}/accounts/${encodeURIComponent(query.value)}`

  try {
    const response = await fetch(upstream, {
      headers: { Accept: "application/json" },
    })
    if (response.status === 404) return json({ status: "not-found" }, 200)
    if (!response.ok) {
      return json({ error: `Mezo API responded ${response.status}` }, 502)
    }
    return json(toMezoIdLookup(await response.json()), 200)
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown"
    return json({ error: message }, 502)
  }
}
