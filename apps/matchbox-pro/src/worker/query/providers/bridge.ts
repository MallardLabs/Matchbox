import { z } from "zod"
import type { BridgeRecord } from "../../../features/query/contract"
import { decimalToScaledBigInt } from "../../../lib/money"
import { usd6 } from "../format"

// Wormholescan operations for an address, kept only when one leg is Mezo
// (provider-linked journeys; no blind multi-chain scanning).

const MEZO_WORMHOLE_CHAIN = 50
const API_URL = "https://api.wormholescan.io/api/v1/operations"

const CHAIN_NAMES: Record<number, string> = {
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

const decimalText = z
  .union([z.string(), z.number()])
  .transform((value) => String(value))

const chainLegSchema = z.object({
  chainId: z.number(),
  timestamp: z.string().optional(),
  status: z.string().optional(),
  feeUSD: decimalText.optional(),
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
  sourceChain: chainLegSchema,
  targetChain: chainLegSchema.optional(),
  data: z
    .object({
      symbol: z.string().optional(),
      tokenAmount: decimalText.optional(),
      usdAmount: decimalText.optional(),
    })
    .optional(),
})

const responseSchema = z.object({ operations: z.array(operationSchema) })

export type BridgeSearch = {
  records: BridgeRecord[]
  fetchedAt: string
  sourceUrl: string
}

function microUsd(value: string | undefined): bigint | null {
  if (!value || !/^\d+(?:\.\d+)?$/.test(value)) return null
  return decimalToScaledBigInt(value, 6)
}

function chainName(id: number): string {
  return CHAIN_NAMES[id] ?? `Wormhole chain ${id}`
}

export function normalizeOperation(
  operation: z.infer<typeof operationSchema>,
): BridgeRecord | null {
  const from =
    operation.content?.standarizedProperties?.fromChain ??
    operation.sourceChain.chainId
  const to =
    operation.content?.standarizedProperties?.toChain ??
    operation.targetChain?.chainId
  if (to === undefined) return null
  if (from !== MEZO_WORMHOLE_CHAIN && to !== MEZO_WORMHOLE_CHAIN) return null
  const symbol = (operation.data?.symbol ?? "TOKEN").toUpperCase().slice(0, 40)
  const amount = (operation.data?.tokenAmount ?? "0").slice(0, 80)
  const targetHash = operation.targetChain?.transaction?.txHash ?? null
  const failed =
    operation.sourceChain.status === "failed" ||
    operation.targetChain?.status === "failed"
  const usdValue = microUsd(operation.data?.usdAmount)
  const sourceFee = microUsd(operation.sourceChain.feeUSD)
  const targetFee = microUsd(operation.targetChain?.feeUSD)
  const fee =
    sourceFee === null && targetFee === null
      ? null
      : (sourceFee ?? 0n) + (targetFee ?? 0n)
  return {
    id: operation.id.slice(0, 120),
    provider: "Wormhole",
    direction: from === MEZO_WORMHOLE_CHAIN ? "out" : "in",
    sourceChain: chainName(from),
    destinationChain: chainName(to),
    sourceAsset: symbol,
    destinationAsset: symbol,
    sourceAmount: amount,
    destinationAmount: amount,
    usdValue: usdValue === null ? null : usd6(usdValue),
    feeUsd: fee === null ? null : usd6(fee),
    status: failed
      ? "failed"
      : !targetHash || operation.targetChain?.status === "pending"
        ? "pending"
        : "completed",
    happenedAt: (
      operation.sourceChain.timestamp ??
      operation.targetChain?.timestamp ??
      new Date(0).toISOString()
    ).slice(0, 40),
    sourceHash: (
      operation.sourceChain.transaction?.txHash ?? operation.id
    ).slice(0, 140),
    destinationHash: targetHash ? targetHash.slice(0, 140) : null,
  }
}

export async function searchBridgeOperations(input: {
  address: string
  limit: number
  direction: "in" | "out" | null
  fetch?: typeof globalThis.fetch
  signal?: AbortSignal
}): Promise<BridgeSearch> {
  const url = new URL(API_URL)
  url.searchParams.set("address", input.address)
  url.searchParams.set(
    "pageSize",
    String(Math.min(Math.max(input.limit * 3, 10), 100)),
  )
  const response = await (input.fetch ?? globalThis.fetch)(url, {
    headers: { accept: "application/json" },
    signal: input.signal ?? AbortSignal.timeout(8_000),
  })
  if (!response.ok) throw new Error(`Wormholescan HTTP ${response.status}`)
  const body = responseSchema.parse(await response.json())
  const records = body.operations
    .map(normalizeOperation)
    .filter((record): record is BridgeRecord => record !== null)
    .filter(
      (record) =>
        input.direction === null || record.direction === input.direction,
    )
    .sort((left, right) => right.happenedAt.localeCompare(left.happenedAt))
    .slice(0, input.limit)
  return {
    records,
    fetchedAt: new Date().toISOString(),
    sourceUrl: url.toString(),
  }
}
