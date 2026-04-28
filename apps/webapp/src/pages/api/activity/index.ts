import { getExplorerTransactionUrl } from "@/config/explorer"
import { fetchMezoActivity } from "@/lib/mezoActivity/dataSources"
import { serializeActivityItem } from "@/lib/mezoActivity/normalize"
import type { MezoActivityCursor } from "@/types/mezoActivity"
import { CHAIN_ID, type SupportedChainId } from "@repo/shared/contracts"

export const config = {
  runtime: "edge",
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
} as const

function parseCursor(raw: string | null): MezoActivityCursor | undefined {
  if (!raw) return undefined
  try {
    const parsed = JSON.parse(raw) as MezoActivityCursor
    if (!parsed?.id || typeof parsed.timestamp !== "number") return undefined
    return parsed
  } catch {
    return undefined
  }
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
  const cursor = parseCursor(url.searchParams.get("cursor"))
  const now = Math.floor(Date.now() / 1000)
  const fromTimestamp = Math.max(
    Number(url.searchParams.get("from") ?? now - 30 * 86_400),
    0,
  )
  const toTimestamp = Math.max(Number(url.searchParams.get("to") ?? now), 0)

  const result = await fetchMezoActivity({
    chainId,
    fromTimestamp,
    toTimestamp,
    limit,
    ...(cursor ? { cursor } : {}),
  })

  const response = {
    success: true,
    data: result.data.map((item) => ({
      ...serializeActivityItem(item),
      ...(item.txHash
        ? { explorerUrl: getExplorerTransactionUrl(chainId, item.txHash) }
        : {}),
    })),
    nextCursor: result.nextCursor,
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
      "Cache-Control": "public, s-maxage=20, stale-while-revalidate=40",
      ...CORS_HEADERS,
    },
  })
}
