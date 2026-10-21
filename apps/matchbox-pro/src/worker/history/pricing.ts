import { getTokenPriceType } from "@repo/shared"
import {
  http,
  BaseError,
  ContractFunctionZeroDataError,
  type PublicClient,
  createPublicClient,
  parseAbi,
} from "viem"
import { z } from "zod"
import {
  formatFixedPoint,
  microUsdToDecimalString,
  sqrtPriceX96ToPriceString,
  tokenUsdMicroValue,
} from "../../lib/money"
import { fetchBtcUsdPrice } from "../btcPrice"
import { fetchMezoUsdPrice } from "../mezoPrice"
import { cached } from "../router"
import { ORACLE_ABI, mezoHistoryClient } from "./chain"
import { EPOCH } from "./math"
import { persistedGet, persistedPut, sealedGet, sealedSet } from "./store"

// USD at earn = the price at epoch close (the last block before epochEnd):
// BTC from the Skip oracle on Mezo (archive eth_call), MEZO from the
// Aerodrome CL MEZO/MUSD pool on Base, stables at $1. A price that can't be
// read stays null so the UI shows "Unpriced", never $0. Sealed epochs are
// memoized forever per isolate.

const SKIP_ORACLE = "0x7b7c000000000000000000000000000000000015"
const MEZO_POOL = "0xef458a3263d2a8c7f3ed9e949ae2f9b345d08b1f"
/** Base mainnet genesis; blocks are exactly 2s apart (OP stack). */
const BASE_GENESIS_TIMESTAMP = 1_686_789_347n
const BASE_BLOCK_SECONDS = 2n
const MEZO_SECONDS_PER_BLOCK = 3.84
/** A close block within this many seconds of the epoch end is good enough. */
const CLOSE_TOLERANCE_SECONDS = 120n
const MAX_SEARCH_ROUNDS = 10
const PRICE_CAP_WHOLE = 1_000_000n
const MULTICALL3 = "0xcA11bde05977b3631167028862bE2a173976CA11"
const BASE_CALLS_PER_WAVE = 15
const BASE_WAVE_MS = 1_100

const POOL_ABI = parseAbi([
  "function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, bool unlocked)",
  "function liquidity() view returns (uint128)",
])

export type PriceRefs = { btcUsd: string | null; mezoUsd: string | null }

export type EpochClosePrice = PriceRefs & {
  epochStart: bigint
  epochEnd: bigint
  mezoBlock: bigint | null
  baseBlock: bigint | null
}

export type PricingEnv = { BASE_RPC_URL?: string | undefined }

/** USD per whole token, or null when the token class has no price. */
export function tokenPrice(
  token: string,
  symbol: string,
  prices: PriceRefs,
): string | null {
  const kind = getTokenPriceType(token, symbol)
  if (kind === "stablecoin") return "1"
  if (kind === "btc-pegged") return prices.btcUsd
  if (kind === "mezo") return prices.mezoUsd
  return null
}

export function usdMicro(
  amount: bigint,
  decimals: number,
  price: string | null,
): bigint | null {
  return price === null ? null : tokenUsdMicroValue(amount, decimals, price)
}

export function usdString(micro: bigint | null): string | null {
  return micro === null ? null : microUsdToDecimalString(micro)
}

/** Live prices, sharing the market routes' 15s memo. */
export async function currentPrices(env: PricingEnv): Promise<PriceRefs> {
  const [btc, mezo] = await Promise.all([
    cached("btc", 15_000, fetchBtcUsdPrice),
    cached("mezo", 15_000, () => fetchMezoUsdPrice(env.BASE_RPC_URL)),
  ])
  return { btcUsd: btc.price, mezoUsd: mezo.price }
}

type BlockRef = { number: bigint; timestamp: bigint }

async function readBlock(
  rpc: PublicClient,
  blockNumber: bigint,
): Promise<BlockRef | undefined> {
  try {
    const block = await rpc.getBlock({ blockNumber })
    return { number: block.number, timestamp: block.timestamp }
  } catch {
    return undefined
  }
}

function blocksFor(seconds: bigint): bigint {
  return BigInt(Math.ceil(Number(seconds) / MEZO_SECONDS_PER_BLOCK))
}

type Search = {
  target: bigint
  guess: bigint
  below: BlockRef | undefined
  above: BlockRef | undefined
  done: boolean
}

/** Next probe from the bracket so far (interpolating when both sides exist). */
export function nextGuess(search: Search, head: BlockRef): bigint {
  const { below, above, target } = search
  let guess: bigint
  if (below && above) {
    const span = above.number - below.number
    const elapsed = above.timestamp - below.timestamp
    guess =
      elapsed > 0n
        ? below.number + ((target - below.timestamp) * span) / elapsed
        : below.number + 1n
    if (guess <= below.number) guess = below.number + 1n
    if (guess >= above.number) guess = above.number - 1n
  } else if (below) {
    guess = below.number + blocksFor(target - below.timestamp) - 1n
  } else if (above) {
    guess = above.number - blocksFor(above.timestamp - target) - 1n
  } else {
    guess = head.number - blocksFor(head.timestamp - target)
  }
  if (guess < 1n) return 1n
  return guess > head.number ? head.number : guess
}

/**
 * For each target timestamp, a Mezo block at or before it and within the
 * tolerance (or the exact last block when blocks are sparse). Every round
 * probes all open searches in one batched request.
 */
export async function mezoBlocksAtOrBefore(
  targets: readonly bigint[],
): Promise<Map<bigint, BlockRef | null>> {
  const rpc = mezoHistoryClient()
  const result = new Map<bigint, BlockRef | null>()
  if (targets.length === 0) return result
  const latest = await rpc.getBlock({ blockTag: "latest" })
  const head = { number: latest.number, timestamp: latest.timestamp }
  const searches: Search[] = []
  for (const target of new Set(targets)) {
    if (target >= head.timestamp) {
      result.set(target, head)
      continue
    }
    const search: Search = {
      target,
      guess: 0n,
      below: undefined,
      above: undefined,
      done: false,
    }
    search.guess = nextGuess(search, head)
    searches.push(search)
  }
  for (let round = 0; round < MAX_SEARCH_ROUNDS; round += 1) {
    const open = searches.filter((search) => !search.done)
    if (open.length === 0) break
    const blocks = await Promise.all(
      open.map((search) => readBlock(rpc, search.guess)),
    )
    open.forEach((search, index) => {
      const block = blocks[index]
      if (!block) {
        search.done = true
        return
      }
      if (block.timestamp <= search.target) {
        if (!search.below || block.number > search.below.number) {
          search.below = block
        }
      } else if (!search.above || block.number < search.above.number) {
        search.above = block
      }
      const { below, above } = search
      if (
        below &&
        (search.target - below.timestamp <= CLOSE_TOLERANCE_SECONDS ||
          (above && above.number - below.number <= 1n))
      ) {
        search.done = true
        return
      }
      search.guess = nextGuess(search, head)
    })
  }
  for (const search of searches) result.set(search.target, search.below ?? null)
  return result
}

function baseClient(env: PricingEnv): PublicClient {
  return createPublicClient({
    transport: http(env.BASE_RPC_URL ?? "https://mainnet.base.org", {
      batch: { batchSize: BASE_CALLS_PER_WAVE },
      retryCount: 0,
      timeout: 20_000,
    }),
  })
}

export function baseBlockAtOrBefore(timestamp: bigint): bigint {
  return (timestamp - BASE_GENESIS_TIMESTAMP) / BASE_BLOCK_SECONDS
}

async function skipDecimals(rpc: PublicClient): Promise<number | null> {
  const memo = sealedGet<number>("skip:decimals")
  if (memo !== undefined) return memo
  try {
    const decimals = await rpc.readContract({
      address: SKIP_ORACLE,
      abi: ORACLE_ABI,
      functionName: "decimals",
    })
    sealedSet("skip:decimals", Number(decimals))
    return Number(decimals)
  } catch {
    return null
  }
}

async function btcAt(
  rpc: PublicClient,
  blockNumber: bigint,
  decimals: number,
): Promise<string | null> {
  try {
    const round = await rpc.readContract({
      address: SKIP_ORACLE,
      abi: ORACLE_ABI,
      functionName: "latestRoundData",
      blockNumber,
    })
    const answer = round[1]
    return answer > 0n ? formatFixedPoint(answer, decimals) : null
  } catch {
    return null
  }
}

/** MEZO/MUSD spot from slot0; null before the pool existed or if empty. */
export function mezoPriceFromPool(
  sqrtPriceX96: bigint,
  liquidity: bigint,
): string | null {
  if (sqrtPriceX96 === 0n || liquidity === 0n) return null
  const price = sqrtPriceX96ToPriceString(sqrtPriceX96)
  const [whole = "0"] = price.split(".")
  return BigInt(whole) >= PRICE_CAP_WHOLE ? null : price
}

type PoolRead = { price: string | null; final: boolean }

function isNoCode(error: unknown): boolean {
  return (
    error instanceof BaseError &&
    error.walk((cause) => cause instanceof ContractFunctionZeroDataError) !==
      null
  )
}

/** slot0 + liquidity in one multicall eth_call at a historical Base block. */
async function mezoAt(
  rpc: PublicClient,
  blockNumber: bigint,
): Promise<PoolRead> {
  try {
    const [slot0, liquidity] = await rpc.multicall({
      contracts: [
        { address: MEZO_POOL, abi: POOL_ABI, functionName: "slot0" },
        { address: MEZO_POOL, abi: POOL_ABI, functionName: "liquidity" },
      ],
      allowFailure: true,
      multicallAddress: MULTICALL3,
      blockNumber,
    })
    if (slot0.status === "success" && liquidity.status === "success") {
      return {
        price: mezoPriceFromPool(slot0.result[0], liquidity.result),
        final: true,
      }
    }
    // No code at that block: the pool didn't exist yet, which never changes.
    return { price: null, final: isNoCode(slot0.error) }
  } catch {
    return { price: null, final: false }
  }
}

function pause(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Public Base RPC allows ~25 calls/s, so historical pool reads go out in
 * paced waves, and transient misses get one more paced try.
 */
async function mezoPricesAt(
  rpc: PublicClient,
  blocks: readonly bigint[],
): Promise<PoolRead[]> {
  const results: PoolRead[] = blocks.map(() => ({ price: null, final: false }))
  let pending = blocks.map((_, index) => index)
  for (let attempt = 0; attempt < 2 && pending.length > 0; attempt += 1) {
    const retry: number[] = []
    for (let start = 0; start < pending.length; start += BASE_CALLS_PER_WAVE) {
      if (start > 0 || attempt > 0) await pause(BASE_WAVE_MS)
      const wave = pending.slice(start, start + BASE_CALLS_PER_WAVE)
      const reads = await Promise.all(
        wave.map((index) => mezoAt(rpc, blocks[index] ?? 0n)),
      )
      wave.forEach((index, offset) => {
        const read = reads[offset] ?? { price: null, final: false }
        results[index] = read
        if (read.price === null && !read.final) retry.push(index)
      })
    }
    pending = retry
  }
  return results
}

function priceKey(epochStart: bigint): string {
  return `price:${epochStart}`
}

const storedPriceSchema = z.object({
  epochStart: z.string().regex(/^\d+$/),
  btcUsd: z.string().nullable(),
  mezoUsd: z.string().nullable(),
  mezoBlock: z.string().regex(/^\d+$/).nullable(),
  baseBlock: z.string().regex(/^\d+$/).nullable(),
})

function toStored(row: EpochClosePrice): z.infer<typeof storedPriceSchema> {
  return {
    epochStart: row.epochStart.toString(),
    btcUsd: row.btcUsd,
    mezoUsd: row.mezoUsd,
    mezoBlock: row.mezoBlock?.toString() ?? null,
    baseBlock: row.baseBlock?.toString() ?? null,
  }
}

function fromStored(value: unknown): EpochClosePrice | undefined {
  const parsed = storedPriceSchema.safeParse(value)
  if (!parsed.success) return undefined
  const epochStart = BigInt(parsed.data.epochStart)
  return {
    epochStart,
    epochEnd: epochStart + EPOCH,
    btcUsd: parsed.data.btcUsd,
    mezoUsd: parsed.data.mezoUsd,
    mezoBlock:
      parsed.data.mezoBlock === null ? null : BigInt(parsed.data.mezoBlock),
    baseBlock:
      parsed.data.baseBlock === null ? null : BigInt(parsed.data.baseBlock),
  }
}

/**
 * Prices at the close of each sealed epoch. Epochs that haven't ended are
 * skipped (use `currentPrices`). Unreadable prices are null and are retried
 * on later requests rather than memoized.
 */
export async function epochClosePrices(
  epochStarts: readonly bigint[],
  env: PricingEnv,
  now: bigint,
): Promise<Map<bigint, EpochClosePrice>> {
  const result = new Map<bigint, EpochClosePrice>()
  const unmemoized: bigint[] = []
  for (const epochStart of new Set(epochStarts)) {
    if (epochStart + EPOCH > now) continue
    const memo = sealedGet<EpochClosePrice>(priceKey(epochStart))
    if (memo) result.set(epochStart, memo)
    else unmemoized.push(epochStart)
  }
  const persisted = await Promise.all(
    unmemoized.map(async (epochStart) =>
      fromStored(await persistedGet(priceKey(epochStart))),
    ),
  )
  const missing: bigint[] = []
  unmemoized.forEach((epochStart, index) => {
    const row = persisted[index]
    if (row && row.epochStart === epochStart) {
      result.set(epochStart, row)
      sealedSet(priceKey(epochStart), row)
    } else {
      missing.push(epochStart)
    }
  })
  if (missing.length === 0) return result

  const rpc = mezoHistoryClient()
  const baseRpc = baseClient(env)
  const closeTimestamps = missing.map((epochStart) => epochStart + EPOCH - 1n)
  const [blocks, decimals] = await Promise.all([
    mezoBlocksAtOrBefore(closeTimestamps).catch(
      () => new Map<bigint, BlockRef | null>(),
    ),
    skipDecimals(rpc),
  ])
  const baseBlocks = missing.map((epochStart) =>
    baseBlockAtOrBefore(epochStart + EPOCH - 1n),
  )
  const [btcPrices, mezoPrices] = await Promise.all([
    Promise.all(
      missing.map((epochStart) => {
        const block = blocks.get(epochStart + EPOCH - 1n)
        return block && decimals !== null
          ? btcAt(rpc, block.number, decimals)
          : Promise.resolve(null)
      }),
    ),
    mezoPricesAt(baseRpc, baseBlocks),
  ])
  const rows = missing.map((epochStart, index): EpochClosePrice => {
    const mezoBlock = blocks.get(epochStart + EPOCH - 1n) ?? null
    const baseBlock = baseBlocks[index] ?? null
    const btcUsd = btcPrices[index] ?? null
    const mezo = mezoPrices[index] ?? { price: null, final: false }
    const row: EpochClosePrice = {
      epochStart,
      epochEnd: epochStart + EPOCH,
      btcUsd,
      mezoUsd: mezo.price,
      mezoBlock: mezoBlock?.number ?? null,
      baseBlock,
    }
    // Transient misses are retried next time; only settled rows seal.
    if (btcUsd !== null && mezo.final) {
      sealedSet(priceKey(epochStart), row)
      void persistedPut(priceKey(epochStart), toStored(row))
    }
    return row
  })
  for (const row of rows) result.set(row.epochStart, row)
  return result
}
