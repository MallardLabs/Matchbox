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

const DEFAULT_BLOCK_WINDOW = 60_000n

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
  return network === "testnet" ? CHAIN_ID.testnet : CHAIN_ID.mainnet
}

async function getLatestBlock(rpcUrl: string): Promise<bigint> {
  try {
    const response = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "latest-block",
        method: "eth_blockNumber",
        params: [],
      }),
    })
    const json = (await response.json()) as { result?: string }
    if (!json.result) return 0n
    return BigInt(json.result)
  } catch {
    return 0n
  }
}

function getRpcUrl(chainId: SupportedChainId) {
  if (chainId === CHAIN_ID.mainnet) {
    return (
      process.env.NEXT_PUBLIC_RPC_MAINNET_URL ??
      process.env.NEXT_PUBLIC_RPC_URL ??
      "https://rpc-internal.mezo.org"
    )
  }
  return (
    process.env.NEXT_PUBLIC_RPC_TESTNET_URL ??
    process.env.NEXT_PUBLIC_RPC_URL ??
    "https://rpc.test.mezo.org"
  )
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS })
  }

  const url = new URL(request.url)
  const chainId = parseChainId(url.searchParams.get("network"))
  const limit = Math.min(
    Math.max(Number(url.searchParams.get("limit") ?? "50"), 1),
    200,
  )
  const cursor = parseCursor(url.searchParams.get("cursor"))
  const now = Math.floor(Date.now() / 1000)
  const fromTimestamp = Math.max(
    Number(url.searchParams.get("from") ?? now - 30 * 86_400),
    0,
  )
  const toTimestamp = Math.max(Number(url.searchParams.get("to") ?? now), 0)
  const latestBlock = await getLatestBlock(getRpcUrl(chainId))
  const fromBlock =
    latestBlock > DEFAULT_BLOCK_WINDOW ? latestBlock - DEFAULT_BLOCK_WINDOW : 0n

  const result = await fetchMezoActivity({
    chainId,
    fromBlock,
    toBlock: latestBlock,
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
