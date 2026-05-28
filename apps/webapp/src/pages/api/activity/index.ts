import { getExplorerTransactionUrl } from "@/config/explorer"
import { fetchMezoActivity } from "@/lib/mezoActivity/dataSources"
import { serializeActivityItem } from "@/lib/mezoActivity/normalize"
import { CHAIN_ID, type SupportedChainId } from "@repo/shared/contracts"

export const config = {
  runtime: "edge",
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
} as const

function parsePage(raw: string | null): number {
  if (!raw) return 0
  const n = Number.parseInt(raw, 10)
  if (!Number.isFinite(n) || n < 0) return 0
  return n
}

function parseChainId(network: string | null): SupportedChainId {
  return network === "testnet" || network === "mezo-testnet"
    ? CHAIN_ID.testnet
    : CHAIN_ID.mainnet
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS })
  }

  const url = new URL(request.url)
  const chainId = parseChainId(url.searchParams.get("network"))
  const limit = Math.min(
    Math.max(Number(url.searchParams.get("limit") ?? "50"), 1),
    1000,
  )
  const page = parsePage(url.searchParams.get("page"))
  const now = Math.floor(Date.now() / 1000)
  const fromTimestamp = Math.max(
    Number(url.searchParams.get("from") ?? now - 30 * 86_400),
    0,
  )
  const toTimestamp = Math.max(Number(url.searchParams.get("to") ?? now), 0)
  const rawActionTypes = url.searchParams.get("actionTypes")
  const actionTypes = rawActionTypes
    ? rawActionTypes
        .split(",")
        .map((t) => t.trim())
        .filter((t) => /^[A-Z_]+$/.test(t))
    : undefined
  const rawOrder = url.searchParams.get("order")
  const orderDirection: "asc" | "desc" = rawOrder === "asc" ? "asc" : "desc"

  const result = await fetchMezoActivity({
    chainId,
    fromTimestamp,
    toTimestamp,
    limit,
    page,
    orderDirection,
    actor: url.searchParams.get("actor") ?? undefined,
    ...(actionTypes && actionTypes.length > 0 ? { actionTypes } : {}),
  })

  const response = {
    success: true,
    data: result.data.map((item) => ({
      ...serializeActivityItem(item),
      ...(item.txHash
        ? { explorerUrl: getExplorerTransactionUrl(chainId, item.txHash) }
        : {}),
    })),
    page: result.page,
    hasMore: result.hasMore,
    meta: {
      coverage: {
        locks: "indexed",
        boosts: "indexed",
        extensions: "indexed",
        incentives: "indexed",
      },
      range: {
        fromTimestamp,
        toTimestamp,
      },
    },
  }

  return new Response(JSON.stringify(response), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store, max-age=0",
      ...CORS_HEADERS,
    },
  })
}
