import { topologyChainId } from "../lib/topology"
import { fetchBtcUsdPrice } from "./btcPrice"
import { fetchMezoUsdPrice } from "./mezoPrice"
import { computeGaugeTopology } from "./topology"

type WorkerEnv = {
  ASSETS?: {
    fetch: typeof fetch
  }
  BASE_RPC_URL?: string | undefined
}

// Per-isolate memo so back-to-back requests reuse one set of RPC reads. Only
// settled values are kept: Workers can't share in-flight I/O across requests.
const memo = new Map<string, { expires: number; value: unknown }>()

async function cached<T>(
  key: string,
  ttlMs: number,
  load: () => Promise<T>,
): Promise<T> {
  const hit = memo.get(key)
  if (hit && hit.expires > Date.now()) return hit.value as T
  const value = await load()
  memo.set(key, { expires: Date.now() + ttlMs, value })
  return value
}

function json(data: unknown, maxAgeSeconds?: number) {
  return new Response(JSON.stringify(data), {
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
      ...(maxAgeSeconds
        ? { "cache-control": `public, max-age=${maxAgeSeconds}` }
        : {}),
    },
  })
}

export async function handleApiRequest(
  request: Request,
  env?: WorkerEnv,
): Promise<Response | null> {
  const url = new URL(request.url)
  switch (url.pathname) {
    case "/api/health":
      return json({ service: "matchbox-pro", ok: true })
    case "/api/topology": {
      const chainId = topologyChainId(
        Number(url.searchParams.get("chainId") ?? Number.NaN),
      )
      return json(
        await cached(`topology:${chainId}`, 30_000, () =>
          computeGaugeTopology(chainId),
        ),
        15,
      )
    }
    case "/api/pricing/btc":
      return json(await cached("btc", 15_000, fetchBtcUsdPrice), 15)
    case "/api/pricing/mezo":
      if (request.method === "OPTIONS") {
        return new Response(null, {
          status: 204,
          headers: {
            "access-control-allow-origin": "*",
            "access-control-allow-methods": "GET, OPTIONS",
          },
        })
      }
      return json(
        await cached("mezo", 15_000, () =>
          fetchMezoUsdPrice(env?.BASE_RPC_URL),
        ),
        15,
      )
    default:
      return null
  }
}

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    const api = await handleApiRequest(request, env)
    if (api) return api
    if (!env.ASSETS) {
      return new Response("Not found", { status: 404 })
    }
    return env.ASSETS.fetch(request)
  },
}
