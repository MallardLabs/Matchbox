import { z } from "zod"
import { type BridgeRecord, bridgeRecordSchema } from "../contracts"
import { addUsd, usd, usdDecimal } from "../money"

const MEZO_WORMHOLE_CHAIN_ID = 50
const DEFAULT_API_URL = "https://api.wormholescan.io/api/v1/operations"

const chainNames: Record<number, string> = {
  1: "Solana",
  2: "Ethereum",
  4: "BNB Chain",
  5: "Polygon",
  6: "Avalanche",
  23: "Arbitrum",
  24: "Optimism",
  30: "Base",
  50: "Mezo",
}

const chainRecordSchema = z.object({
  chainId: z.number(),
  timestamp: z.string().optional(),
  status: z.string().optional(),
  feeUSD: z
    .union([z.string(), z.number()])
    .transform((value) => String(value))
    .optional(),
  transaction: z.object({ txHash: z.string() }).optional(),
})

const operationSchema = z.object({
  id: z.string(),
  content: z
    .object({
      standarizedProperties: z
        .object({
          fromChain: z.number().optional(),
          toChain: z.number().optional(),
        })
        .optional(),
    })
    .optional(),
  sourceChain: chainRecordSchema,
  targetChain: chainRecordSchema.optional(),
  data: z
    .object({
      symbol: z.string().optional(),
      tokenAmount: z.union([z.string(), z.number()]).optional(),
      usdAmount: z
        .union([z.string(), z.number()])
        .transform((value) => String(value))
        .optional(),
    })
    .optional(),
})

const responseSchema = z.object({ operations: z.array(operationSchema) })

export type WormholeSearchResult = {
  records: BridgeRecord[]
  fetchedAt: string
  sourceUrl: string
}

function safeUsd(value: string | undefined) {
  if (!value || !/^\d+(?:\.\d+)?$/.test(value)) return usd("0")
  return usd(value)
}

function chainName(id: number): string {
  return chainNames[id] ?? `Wormhole chain ${id}`
}

function assetSymbol(symbol: string | undefined): string {
  if (!symbol) return "Token"
  const normalized = symbol.toUpperCase()
  if (normalized === "MEZO") return "MEZO"
  if (normalized === "MUSD") return "MUSD"
  return normalized
}

function operationStatus(
  sourceStatus: string | undefined,
  targetStatus: string | undefined,
  hasTarget: boolean,
): BridgeRecord["status"] {
  if (sourceStatus === "failed" || targetStatus === "failed") return "failed"
  if (!hasTarget || targetStatus === "pending") return "pending"
  return "completed"
}

export function normalizeWormholeOperation(
  value: z.infer<typeof operationSchema>,
): BridgeRecord | null {
  const fromChain =
    value.content?.standarizedProperties?.fromChain ?? value.sourceChain.chainId
  const toChain =
    value.content?.standarizedProperties?.toChain ?? value.targetChain?.chainId
  if (
    toChain === undefined ||
    (fromChain !== MEZO_WORMHOLE_CHAIN_ID && toChain !== MEZO_WORMHOLE_CHAIN_ID)
  ) {
    return null
  }

  const amount = String(value.data?.tokenAmount ?? "0")
  const symbol = assetSymbol(value.data?.symbol)
  const happenedAt =
    value.sourceChain.timestamp ??
    value.targetChain?.timestamp ??
    new Date(0).toISOString()
  const targetHash = value.targetChain?.transaction?.txHash ?? null

  return bridgeRecordSchema.parse({
    id: value.id,
    provider: "Wormhole",
    direction: fromChain === MEZO_WORMHOLE_CHAIN_ID ? "out" : "in",
    sourceChain: chainName(fromChain),
    destinationChain: chainName(toChain),
    sourceAsset: symbol,
    destinationAsset: symbol,
    sourceAmount: amount,
    destinationAmount: amount,
    usdValue: usdDecimal(safeUsd(value.data?.usdAmount)),
    feeUsd: usdDecimal(
      addUsd([
        safeUsd(value.sourceChain.feeUSD),
        safeUsd(value.targetChain?.feeUSD),
      ]),
    ),
    status: operationStatus(
      value.sourceChain.status,
      value.targetChain?.status,
      Boolean(targetHash),
    ),
    happenedAt,
    sourceHash: value.sourceChain.transaction?.txHash ?? value.id,
    destinationHash: targetHash,
  })
}

export async function searchWormholeOperations(options: {
  address: string
  limit: number
  direction?: "in" | "out"
  fetch?: typeof globalThis.fetch
  apiUrl?: string
  signal?: AbortSignal
}): Promise<WormholeSearchResult> {
  const fetchImplementation = options.fetch ?? globalThis.fetch
  const url = new URL(options.apiUrl ?? DEFAULT_API_URL)
  url.searchParams.set("address", options.address)
  url.searchParams.set(
    "pageSize",
    String(Math.min(Math.max(options.limit * 3, 10), 100)),
  )

  const response = await fetchImplementation(url, {
    headers: { Accept: "application/json" },
    signal: options.signal ?? AbortSignal.timeout(8_000),
  })
  if (!response.ok) {
    throw new Error(`Wormholescan returned HTTP ${response.status}`)
  }

  const body = responseSchema.parse(await response.json())
  const records = body.operations
    .map(normalizeWormholeOperation)
    .filter((record): record is BridgeRecord => record !== null)
    .filter(
      (record) => !options.direction || record.direction === options.direction,
    )
    .sort(
      (left, right) =>
        new Date(right.happenedAt).getTime() -
        new Date(left.happenedAt).getTime(),
    )
    .slice(0, options.limit)

  return {
    records,
    fetchedAt: new Date().toISOString(),
    sourceUrl: url.toString(),
  }
}
