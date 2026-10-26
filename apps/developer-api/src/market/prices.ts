import type { Logger } from "@repo/logger"
import {
  type PriceSource,
  type ReferencePrice,
  fixedDecimalSchema,
} from "@repo/platform-contracts/market"
import { getTokenFromRegistry } from "@repo/shared/pricing"
import { http, BaseError, createPublicClient } from "viem"
import { formatUnits } from "./money"

/**
 * Reference prices for valuing gauge incentives. Read by the market cron
 * only; HTTP requests serve the snapshot and never reach these RPCs.
 */

export type ReferencePrices = {
  btcUsd: ReferencePrice | null
  mezoUsd: ReferencePrice | null
}

type Hex = `0x${string}`

/** Skip Connect BTC/USD oracle (Chainlink aggregator interface), Mezo mainnet. */
export const skipBtcUsdOracle: Hex =
  "0x7b7c000000000000000000000000000000000015"

/** Aerodrome Slipstream MEZO/MUSD pool on Base, and the pair it must hold. */
export const mezoMusdPool: Hex = "0xef458a3263d2a8c7f3ed9e949ae2f9b345d08b1f"
export const baseMezoToken: Hex = "0x8e4cbbcc33db6c0a18561fde1f6ba35906d4848b"
export const baseMusdToken: Hex = "0xdd468a1ddc392dcdbef6db6e34e89aa338f9f186"

/** Tried in order after the configured Base RPC. */
export const publicBaseRpcUrls = [
  "https://mainnet.base.org",
  "https://base-rpc.publicnode.com",
] as const

export const defaultFetchTimeoutMs = 8_000

/** Oracle rounds older than this are stale. */
const maxOracleAgeSeconds = 3_600n
/** A MEZO price at or above this many USD means the pool is broken. */
const maxMezoUsdWhole = 1_000_000n
const maxTokenDecimals = 36
const priceDecimals = 18
const q192 = 2n ** 192n

const decimalsAbi = [
  {
    inputs: [],
    name: "decimals",
    outputs: [{ name: "", type: "uint8" }],
    stateMutability: "view",
    type: "function",
  },
] as const

const aggregatorAbi = [
  ...decimalsAbi,
  {
    inputs: [],
    name: "latestRoundData",
    outputs: [
      { name: "roundId", type: "uint80" },
      { name: "answer", type: "int256" },
      { name: "startedAt", type: "uint256" },
      { name: "updatedAt", type: "uint256" },
      { name: "answeredInRound", type: "uint80" },
    ],
    stateMutability: "view",
    type: "function",
  },
] as const

const slipstreamPoolAbi = [
  {
    inputs: [],
    name: "slot0",
    outputs: [
      { name: "sqrtPriceX96", type: "uint160" },
      { name: "tick", type: "int24" },
      { name: "observationIndex", type: "uint16" },
      { name: "observationCardinality", type: "uint16" },
      { name: "observationCardinalityNext", type: "uint16" },
      { name: "unlocked", type: "bool" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "liquidity",
    outputs: [{ name: "", type: "uint128" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "token0",
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "token1",
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
] as const

/** An on-chain answer we refuse to publish as a price. */
class PriceRejected extends Error {
  override name = "PriceRejected"
}

/** Short, URL-free reason (viem's full messages embed the RPC URL). */
function errorReason(error: unknown): string {
  if (error instanceof BaseError) return error.shortMessage
  if (error instanceof Error) return error.message.slice(0, 200)
  return "Unknown error"
}

function sameAddress(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase()
}

function assertTokenDecimals(decimals: number, what: string): void {
  if (decimals > maxTokenDecimals) {
    throw new PriceRejected(`${what} decimals out of range: ${decimals}`)
  }
}

function nonEmpty(url: string | null): string | null {
  const trimmed = url?.trim() ?? ""
  return trimmed.length > 0 ? trimmed : null
}

function client(rpcUrl: string, timeoutMs: number, retryCount: number) {
  return createPublicClient({
    transport: http(rpcUrl, { timeout: timeoutMs, retryCount }),
  })
}

async function readBtcUsd(
  rpcUrl: string,
  timeoutMs: number,
): Promise<ReferencePrice> {
  const mezo = client(rpcUrl, timeoutMs, 1)
  const [round, decimals] = await Promise.all([
    mezo.readContract({
      address: skipBtcUsdOracle,
      abi: aggregatorAbi,
      functionName: "latestRoundData",
    }),
    mezo.readContract({
      address: skipBtcUsdOracle,
      abi: aggregatorAbi,
      functionName: "decimals",
    }),
  ])
  const [, answer, , updatedAt] = round
  assertTokenDecimals(decimals, "Oracle")
  if (answer <= 0n) {
    throw new PriceRejected(`Oracle answer is not positive: ${answer}`)
  }
  const nowSeconds = BigInt(Math.floor(Date.now() / 1000))
  if (nowSeconds - updatedAt > maxOracleAgeSeconds) {
    throw new PriceRejected(`Oracle round is stale (updatedAt ${updatedAt})`)
  }
  return { usd: formatUnits(answer, decimals), source: "skip-oracle" }
}

/**
 * MEZO in MUSD as 18-decimal fixed point, from the pool's sqrtPriceX96
 * (sqrt(token1 / token0) in base units, Q64.96). Inverted when MEZO is
 * token1. MUSD is taken at $1.
 */
export function mezoUsdFromSqrtPriceX96(
  sqrtPriceX96: bigint,
  pool: { mezoIsToken0: boolean; mezoDecimals: number; musdDecimals: number },
): bigint {
  const ratio = sqrtPriceX96 * sqrtPriceX96
  const mezoScale = 10n ** BigInt(priceDecimals + pool.mezoDecimals)
  const musdScale = 10n ** BigInt(pool.musdDecimals)
  if (pool.mezoIsToken0) return (ratio * mezoScale) / (q192 * musdScale)
  if (ratio === 0n) return 0n
  return (q192 * mezoScale) / (ratio * musdScale)
}

async function readMezoUsdAt(
  rpcUrl: string,
  timeoutMs: number,
): Promise<ReferencePrice> {
  const base = client(rpcUrl, timeoutMs, 0)
  const pool = { address: mezoMusdPool, abi: slipstreamPoolAbi } as const
  const [slot0, liquidity, token0, token1, mezoDecimals, musdDecimals] =
    await Promise.all([
      base.readContract({ ...pool, functionName: "slot0" }),
      base.readContract({ ...pool, functionName: "liquidity" }),
      base.readContract({ ...pool, functionName: "token0" }),
      base.readContract({ ...pool, functionName: "token1" }),
      base.readContract({
        address: baseMezoToken,
        abi: decimalsAbi,
        functionName: "decimals",
      }),
      base.readContract({
        address: baseMusdToken,
        abi: decimalsAbi,
        functionName: "decimals",
      }),
    ])
  const mezoIsToken0 =
    sameAddress(token0, baseMezoToken) && sameAddress(token1, baseMusdToken)
  const mezoIsToken1 =
    sameAddress(token0, baseMusdToken) && sameAddress(token1, baseMezoToken)
  if (!mezoIsToken0 && !mezoIsToken1) {
    throw new PriceRejected(`Pool pair is ${token0}/${token1}, not MEZO/MUSD`)
  }
  assertTokenDecimals(mezoDecimals, "MEZO")
  assertTokenDecimals(musdDecimals, "MUSD")
  const [sqrtPriceX96] = slot0
  if (liquidity === 0n || sqrtPriceX96 === 0n) {
    throw new PriceRejected("Pool has no liquidity")
  }
  const price = mezoUsdFromSqrtPriceX96(sqrtPriceX96, {
    mezoIsToken0,
    mezoDecimals,
    musdDecimals,
  })
  const usd = formatUnits(price, priceDecimals)
  if (price === 0n || price >= maxMezoUsdWhole * 10n ** BigInt(priceDecimals)) {
    throw new PriceRejected(`MEZO price out of range: ${usd}`)
  }
  return { usd, source: "aerodrome-cl" }
}

type PriceInput = {
  mezoMainnetRpcUrl: string | null // Skip oracle lives on Mezo mainnet; used for both networks
  baseRpcUrl: string | null // optional preferred Base RPC; public fallbacks after it
  fetchTimeoutMs?: number
  /** Receives one warning per price that comes back null. */
  logger?: Logger
}

async function btcUsdOrNull(
  input: PriceInput,
  timeoutMs: number,
): Promise<ReferencePrice | null> {
  const rpcUrl = nonEmpty(input.mezoMainnetRpcUrl)
  if (rpcUrl === null) {
    input.logger?.warn({
      message: "BTC/USD price unavailable",
      source: "skip-oracle",
      reason: "No Mezo mainnet RPC URL",
    })
    return null
  }
  try {
    return await readBtcUsd(rpcUrl, timeoutMs)
  } catch (error) {
    input.logger?.warn({
      message: "BTC/USD price unavailable",
      source: "skip-oracle",
      reason: errorReason(error),
    })
    return null
  }
}

/** First Base RPC that yields a valid price wins; any failure tries the next. */
async function mezoUsdOrNull(
  input: PriceInput,
  timeoutMs: number,
): Promise<ReferencePrice | null> {
  const configured = nonEmpty(input.baseRpcUrl)
  const urls = [
    ...new Set([
      ...(configured === null ? [] : [configured]),
      ...publicBaseRpcUrls,
    ]),
  ]
  const attempts: { rpc: string; reason: string }[] = []
  for (const rpcUrl of urls) {
    try {
      return await readMezoUsdAt(rpcUrl, timeoutMs)
    } catch (error) {
      attempts.push({
        // The configured URL may carry an API key.
        rpc: rpcUrl === configured ? "configured" : rpcUrl,
        reason: errorReason(error),
      })
    }
  }
  input.logger?.warn({
    message: "MEZO/USD price unavailable",
    source: "aerodrome-cl",
    attempts,
  })
  return null
}

/** Never throws; a failed source yields null. */
export async function readReferencePrices(
  input: PriceInput,
): Promise<ReferencePrices> {
  const requested = input.fetchTimeoutMs ?? defaultFetchTimeoutMs
  const timeoutMs =
    Number.isFinite(requested) && requested > 0
      ? requested
      : defaultFetchTimeoutMs
  const [btcUsd, mezoUsd] = await Promise.all([
    btcUsdOrNull(input, timeoutMs),
    mezoUsdOrNull(input, timeoutMs),
  ])
  return { btcUsd, mezoUsd }
}

/** The registry's stablecoin price, or "1" when it sets none. */
function stablecoinUsd(fixedPrice: number | undefined): string | null {
  if (fixedPrice === undefined) return "1"
  const parsed = fixedDecimalSchema.safeParse(String(fixedPrice))
  return parsed.success ? parsed.data : null
}

/**
 * USD price of a reward token. Registry ADDRESS lookup only (getTokenFromRegistry):
 * never infer from the symbol, because bribe tokens are permissionless and a token
 * named "FAKEBTC" must not be priced as BTC. stablecoin → "1" (or the registry fixedPrice),
 * btc-pegged → btcUsd, mezo → mezoUsd, unknown/unregistered → null.
 */
export function tokenPrice(
  token: string,
  refs: ReferencePrices,
): { usd: string; source: PriceSource } | null {
  const entry = getTokenFromRegistry(token)
  if (entry === undefined) return null
  switch (entry.priceType) {
    case "stablecoin": {
      const usd = stablecoinUsd(entry.fixedPrice)
      return usd === null ? null : { usd, source: "stablecoin" }
    }
    case "btc-pegged":
      return refs.btcUsd === null
        ? null
        : { usd: refs.btcUsd.usd, source: "btc-pegged" }
    case "mezo":
      return refs.mezoUsd === null
        ? null
        : { usd: refs.mezoUsd.usd, source: "mezo" }
    case "unknown":
      return null
  }
}
