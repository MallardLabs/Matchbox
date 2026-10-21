import { getTokenPriceType } from "@repo/shared"
import {
  http,
  BaseError,
  ContractFunctionZeroDataError,
  type PublicClient,
  createPublicClient,
  fallback,
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
import { type KvNamespace, cached } from "../router"
import { ORACLE_ABI, mezoHistoryClient } from "./chain"
import { EPOCH } from "./math"
import {
  type Attempt,
  type RetryDeps,
  type RetryPolicy,
  readEach,
} from "./retry"
import {
  persistedGet,
  persistedPut,
  sealedGet,
  sealedSet,
  timedDelete,
  timedGet,
  timedSet,
} from "./store"

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

/**
 * Public Base RPCs rate-limit hard (mainnet.base.org especially from
 * Cloudflare). Reads are spread over the archive endpoints, a few at a time,
 * and retried with backoff on the next endpoint.
 */
export const BASE_POLICY: RetryPolicy = {
  attempts: 4,
  concurrency: 5,
  baseDelayMs: 300,
  jitterMs: 400,
}
const MEZO_POLICY: RetryPolicy = {
  attempts: 3,
  concurrency: 10,
  baseDelayMs: 250,
  jitterMs: 250,
}

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
  /**
   * Both prices are final: read, or permanently absent (MEZO before the
   * pool existed). False means a transient RPC miss; the row is retried on
   * the next request and USD built from it is a lower bound.
   */
  settled: boolean
}

export type PricingEnv = {
  BASE_RPC_URL?: string | undefined
  /** Durable store for settled close prices; absent locally and in tests. */
  HISTORY_KV?: KvNamespace | undefined
}

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
  // The market reader leans on mainnet.base.org, which throttles Workers;
  // fall back to the archive endpoints' head state before giving up.
  const mezoUsd =
    mezo.price ??
    (await cached("history:mezo-live", 15_000, async () => {
      const [outcome] = await readEach(
        [0],
        (item) => {
          const clients = baseClients(env)
          const client = clients[item % clients.length]
          return client
            ? mezoAt(client, undefined)
            : Promise.resolve({ value: null, retry: true })
        },
        { ...BASE_POLICY, attempts: 2 },
      )
      return outcome?.value ?? null
    }).catch(() => null))
  return { btcUsd: btc.price, mezoUsd }
}

type BlockRef = { number: bigint; timestamp: bigint }

async function readBlock(
  rpc: PublicClient,
  blockNumber: bigint,
): Promise<BlockRef | undefined> {
  const [outcome] = await readEach(
    [blockNumber],
    async (number): Promise<Attempt<BlockRef | undefined>> => {
      try {
        const block = await rpc.getBlock({ blockNumber: number })
        return {
          value: { number: block.number, timestamp: block.timestamp },
          retry: false,
        }
      } catch {
        return { value: undefined, retry: true }
      }
    },
    MEZO_POLICY,
  )
  return outcome?.value
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

/**
 * Free public Base endpoints that serve archive state (eth_call at the
 * epoch-close blocks, checked 2026-10-21 back to April 2026 and returning
 * empty data before the pool existed). Others tried (publicnode, llamarpc,
 * 1rpc, meowrpc, ankr, blockpi, omniatech, lava) fail historical calls.
 */
export const BASE_ARCHIVE_RPCS = [
  "https://mainnet.base.org",
  "https://base.drpc.org",
  "https://base-mainnet.public.blastapi.io",
  "https://base.gateway.tenderly.co",
  "https://base-public.nodies.app",
] as const

/** BASE_RPC_URL (when set) first, then the public archive endpoints. */
export function baseEndpoints(env: PricingEnv): string[] {
  const preferred = env.BASE_RPC_URL?.trim()
  return [...new Set([...(preferred ? [preferred] : []), ...BASE_ARCHIVE_RPCS])]
}

/**
 * Which client serves an item's nth attempt. A configured BASE_RPC_URL takes
 * every first attempt; otherwise items start spread across the endpoints.
 * Retries rotate to the next endpoint either way.
 */
export function baseClientIndex(
  item: number,
  attempt: number,
  endpoints: number,
  preferred: boolean,
): number {
  if (endpoints <= 0) return 0
  return preferred ? attempt % endpoints : (item + attempt) % endpoints
}

/**
 * One client per starting endpoint, each a `fallback` over all of them in
 * rotated order: a 429 or timeout moves to the next endpoint at once, and
 * the starting endpoints spread concurrent reads. One call per HTTP request.
 */
function baseClients(env: PricingEnv): PublicClient[] {
  const endpoints = baseEndpoints(env)
  return endpoints.map((_, start) =>
    createPublicClient({
      transport: fallback(
        [...endpoints.slice(start), ...endpoints.slice(0, start)].map((url) =>
          http(url, { retryCount: 0, timeout: 8_000 }),
        ),
        { retryCount: 0 },
      ),
    }),
  )
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
): Promise<Attempt<string | null>> {
  try {
    const round = await rpc.readContract({
      address: SKIP_ORACLE,
      abi: ORACLE_ABI,
      functionName: "latestRoundData",
      blockNumber,
    })
    const answer = round[1]
    return {
      value: answer > 0n ? formatFixedPoint(answer, decimals) : null,
      retry: false,
    }
  } catch {
    return { value: null, retry: true }
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

function isNoCode(error: unknown): boolean {
  return (
    error instanceof BaseError &&
    error.walk((cause) => cause instanceof ContractFunctionZeroDataError) !==
      null
  )
}

/**
 * slot0 + liquidity in one multicall eth_call at a historical Base block.
 * No code at that block means the pool didn't exist yet, which is final;
 * any other failure (429, timeout) is a transient miss.
 */
export async function mezoAt(
  rpc: Pick<PublicClient, "multicall">,
  blockNumber: bigint | undefined,
): Promise<Attempt<string | null>> {
  try {
    const [slot0, liquidity] = await rpc.multicall({
      contracts: [
        { address: MEZO_POOL, abi: POOL_ABI, functionName: "slot0" },
        { address: MEZO_POOL, abi: POOL_ABI, functionName: "liquidity" },
      ],
      allowFailure: true,
      multicallAddress: MULTICALL3,
      ...(blockNumber === undefined ? {} : { blockNumber }),
    })
    if (slot0.status === "success" && liquidity.status === "success") {
      return {
        value: mezoPriceFromPool(slot0.result[0], liquidity.result),
        retry: false,
      }
    }
    return { value: null, retry: !isNoCode(slot0.error) }
  } catch {
    return { value: null, retry: true }
  }
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
  // Only settled rows are ever stored.
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
    settled: true,
  }
}

/** Test seam: stand-in Base clients (one per endpoint) and clock. */
export type CloseReaders = {
  base?: ReadonlyArray<Pick<PublicClient, "multicall">>
  preferred?: boolean
  deps?: RetryDeps
}

const INFLIGHT_MS = 90_000

function inflightKey(epochStart: bigint): string {
  return `pricing:${epochStart}`
}

/** A settled row from KV, or undefined (absent, malformed or KV failing). */
async function kvGetPrice(
  kv: KvNamespace | undefined,
  epochStart: bigint,
): Promise<EpochClosePrice | undefined> {
  if (!kv) return undefined
  try {
    const raw = await kv.get(priceKey(epochStart))
    return raw === null ? undefined : fromStored(JSON.parse(raw))
  } catch {
    return undefined
  }
}

/**
 * Seals a settled row: isolate memo, this colo's Cache API, and KV (durable
 * across colos and evictions). Only ever called with `settled` rows, which
 * never change; KV failures are ignored.
 */
async function seal(
  row: EpochClosePrice,
  kv: KvNamespace | undefined,
): Promise<void> {
  sealedSet(priceKey(row.epochStart), row)
  const stored = toStored(row)
  await Promise.all([
    persistedPut(priceKey(row.epochStart), stored),
    kv?.put(priceKey(row.epochStart), JSON.stringify(stored)).catch(() => {
      // Best effort: the next request that prices this epoch writes it.
    }),
  ])
}

/** Settled close prices already known to this isolate (no I/O). */
export function settledClosePrices(
  epochStarts: readonly bigint[],
): Map<bigint, EpochClosePrice> {
  const result = new Map<bigint, EpochClosePrice>()
  for (const epochStart of epochStarts) {
    const row = sealedGet<EpochClosePrice>(priceKey(epochStart))
    if (row) result.set(epochStart, row)
  }
  return result
}

/**
 * Prices at the close of each sealed epoch. Epochs that haven't ended are
 * skipped (use `currentPrices`). Each epoch is read once per isolate and
 * shared by every endpoint: it seals (memo + Cache API) the moment both its
 * prices are final, so a caller that stops waiting still finds it later.
 * An epoch another request is already pricing is left out (absent = still
 * pricing); a row that missed after all retries comes back unsettled.
 */
export async function epochClosePrices(
  epochStarts: readonly bigint[],
  env: PricingEnv,
  now: bigint,
  readers?: CloseReaders,
): Promise<Map<bigint, EpochClosePrice>> {
  const result = new Map<bigint, EpochClosePrice>()
  const unmemoized: bigint[] = []
  for (const epochStart of new Set(epochStarts)) {
    if (epochStart + EPOCH > now) continue
    const memo = sealedGet<EpochClosePrice>(priceKey(epochStart))
    if (memo) result.set(epochStart, memo)
    else unmemoized.push(epochStart)
  }
  // Read-through: this colo's Cache API, then KV (which also warms the
  // colo cache), then RPC for whatever neither has.
  const persisted = await Promise.all(
    unmemoized.map(async (epochStart) => {
      const local = fromStored(await persistedGet(priceKey(epochStart)))
      if (local) return local
      const durable = await kvGetPrice(env.HISTORY_KV, epochStart)
      if (durable) {
        await persistedPut(priceKey(epochStart), toStored(durable))
      }
      return durable
    }),
  )
  const missing: bigint[] = []
  unmemoized.forEach((epochStart, index) => {
    const row = persisted[index]
    if (row && row.epochStart === epochStart) {
      result.set(epochStart, row)
      sealedSet(priceKey(epochStart), row)
    } else if (!timedGet<boolean>(inflightKey(epochStart))) {
      missing.push(epochStart)
    }
  })
  if (missing.length === 0) return result
  for (const epochStart of missing) {
    timedSet(inflightKey(epochStart), true, INFLIGHT_MS)
  }

  try {
    const rpc = mezoHistoryClient()
    const clients = readers?.base ?? baseClients(env)
    const preferred = readers?.preferred ?? Boolean(env.BASE_RPC_URL?.trim())
    const deps = readers?.deps
    const closeTimestamps = missing.map((epochStart) => epochStart + EPOCH - 1n)
    const btcPrices = (async () => {
      const [blocks, decimals] = await Promise.all([
        mezoBlocksAtOrBefore(closeTimestamps).catch(
          () => new Map<bigint, BlockRef | null>(),
        ),
        skipDecimals(rpc),
      ])
      const prices = await readEach(
        missing,
        (epochStart): Promise<Attempt<string | null>> => {
          const block = blocks.get(epochStart + EPOCH - 1n)
          return block && decimals !== null
            ? btcAt(rpc, block.number, decimals)
            : Promise.resolve({ value: null, retry: true })
        },
        MEZO_POLICY,
        deps,
      )
      return { blocks, prices }
    })()

    const rows = new Map<bigint, EpochClosePrice>()
    const attempts = new Map<number, number>()
    const sealing: Array<Promise<void>> = []
    await readEach(
      missing.map((epochStart, index) => ({ epochStart, index })),
      async ({ epochStart, index }) => {
        const attempt = attempts.get(index) ?? 0
        attempts.set(index, attempt + 1)
        const client =
          clients[baseClientIndex(index, attempt, clients.length, preferred)]
        const block = baseBlockAtOrBefore(epochStart + EPOCH - 1n)
        const mezo = client
          ? await mezoAt(client, block)
          : { value: null, retry: true }
        if (mezo.retry) return mezo
        const btc = await btcPrices
        const btcRead = btc.prices[index] ?? { value: null, retry: true }
        const row: EpochClosePrice = {
          epochStart,
          epochEnd: epochStart + EPOCH,
          btcUsd: btcRead.value,
          mezoUsd: mezo.value,
          mezoBlock: btc.blocks.get(epochStart + EPOCH - 1n)?.number ?? null,
          baseBlock: block,
          settled: btcRead.value !== null && !btcRead.retry,
        }
        rows.set(epochStart, row)
        if (row.settled) sealing.push(seal(row, env.HISTORY_KV))
        return mezo
      },
      BASE_POLICY,
      deps,
    )
    const btc = await btcPrices
    missing.forEach((epochStart, index) => {
      if (rows.has(epochStart)) return
      const btcRead = btc.prices[index] ?? { value: null, retry: true }
      rows.set(epochStart, {
        epochStart,
        epochEnd: epochStart + EPOCH,
        btcUsd: btcRead.value,
        mezoUsd: null,
        mezoBlock: btc.blocks.get(epochStart + EPOCH - 1n)?.number ?? null,
        baseBlock: baseBlockAtOrBefore(epochStart + EPOCH - 1n),
        settled: false,
      })
    })
    await Promise.all(sealing)
    for (const [epochStart, row] of rows) result.set(epochStart, row)
    return result
  } finally {
    for (const epochStart of missing) timedDelete(inflightKey(epochStart))
  }
}

/** How long a request waits for prices before answering with what's settled. */
export const PRICE_BUDGET_MS = 6_000

/**
 * Resolves with `promise`'s value, or `undefined` once `deadline` (epoch ms)
 * passes; the work then continues under `waitUntil` so the next request
 * finds it done. Never holds a request open past the deadline.
 */
export async function withinDeadline<T>(
  promise: Promise<T>,
  deadline: number,
  waitUntil: (promise: Promise<unknown>) => void,
  nowMs: () => number = Date.now,
): Promise<T | undefined> {
  const remaining = deadline - nowMs()
  let timer: ReturnType<typeof setTimeout> | undefined
  const expired = new Promise<undefined>((resolve) => {
    timer = setTimeout(() => resolve(undefined), Math.max(0, remaining))
  })
  const settled = promise.then(
    (value) => ({ done: true as const, value }),
    () => ({ done: true as const, value: undefined }),
  )
  const outcome = await Promise.race([settled, expired])
  if (timer !== undefined) clearTimeout(timer)
  if (outcome === undefined) {
    waitUntil(settled)
    return undefined
  }
  return outcome.value
}

/**
 * Close prices for `epochStarts` within the request's budget: everything if
 * it settles in time, else whatever has settled so far (the rest keeps
 * pricing in the background).
 */
export async function closePricesWithin(
  epochStarts: readonly bigint[],
  env: PricingEnv,
  now: bigint,
  deadline: number,
  waitUntil: (promise: Promise<unknown>) => void,
  readers?: CloseReaders,
): Promise<Map<bigint, EpochClosePrice>> {
  const all = await withinDeadline(
    epochClosePrices(epochStarts, env, now, readers),
    deadline,
    waitUntil,
  )
  return all ?? settledClosePrices(epochStarts)
}
