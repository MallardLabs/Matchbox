import type { Address } from "viem"
import type {
  WireEarnings,
  WireLedgerRow,
  WirePricingEpochs,
} from "../../features/history/schema"
import { type WaitUntil, type WorkerEnv, cached, cachedStale } from "../router"
import { linkClaims, walletClaims } from "./claims"
import {
  BOOST_FIRST_EPOCH,
  MAX_LOCKS,
  type WalletEarningsModel,
  computeWalletEarnings,
  sealedEpochsSince,
  walletLockIds,
} from "./earnings"
import { EPOCH, epochStartOf } from "./math"
import { type PricingEnv, currentPrices, epochClosePrices } from "./pricing"
import { sourceConfig } from "./sources"
import {
  type PriceBook,
  earningsView,
  isPartial,
  ledgerRows,
  pricedEpochs,
} from "./views"

// Composes a wallet's earnings model with its prices. One memo serves the
// earnings, ledger and CSV routes for the same wallet, so they can't
// disagree. Only complete histories are memoized: one with a transient price
// gap is returned marked `partial` and recomputed on the next request (the
// prices that did settle are reused from the per-epoch price memo.)

export type WalletHistory = {
  model: WalletEarningsModel
  book: PriceBook
  partial: boolean
}

const HISTORY_TTL = { freshMs: 30_000, staleMs: 120_000 }

class PartialHistory extends Error {
  readonly history: WalletHistory

  constructor(history: WalletHistory) {
    super("Wallet history has transient price gaps")
    this.history = history
  }
}

export function nowSeconds(): bigint {
  return BigInt(Math.floor(Date.now() / 1000))
}

async function computeHistory(
  wallet: Address,
  tokenIds: readonly bigint[],
  env: PricingEnv,
): Promise<WalletHistory> {
  const now = nowSeconds()
  // Close prices are global and memoized forever, so fetch every boost
  // epoch's alongside the wallet reads instead of after them.
  const allCloses = epochClosePrices(
    sealedEpochsSince(BOOST_FIRST_EPOCH, epochStartOf(now)),
    env,
    now,
  )
  const prices = currentPrices(env)
  const ids = tokenIds.length > 0 ? tokenIds : await walletLockIds(wallet)
  const model = await computeWalletEarnings({
    tokenIds: ids.slice(0, MAX_LOCKS),
    now,
  })
  const needed = new Set(pricedEpochs(model))
  const closes = new Map(
    [...(await allCloses).entries()].filter(([epoch]) => needed.has(epoch)),
  )
  const book = { now: await prices, closes }
  return { model, book, partial: isPartial(model, book) }
}

export async function walletHistory(
  wallet: Address,
  tokenIds: readonly bigint[],
  env: PricingEnv,
  waitUntil: WaitUntil,
): Promise<WalletHistory> {
  const key = `history:wallet:${wallet}:${tokenIds.join(",")}`
  try {
    return await cachedStale(
      key,
      HISTORY_TTL,
      async () => {
        const history = await computeHistory(wallet, tokenIds, env)
        if (history.partial) throw new PartialHistory(history)
        return history
      },
      waitUntil,
    )
  } catch (error) {
    if (error instanceof PartialHistory) return error.history
    throw error
  }
}

export async function walletEarnings(
  wallet: Address,
  tokenIds: readonly bigint[],
  epochs: number,
  env: PricingEnv,
  waitUntil: WaitUntil,
): Promise<WireEarnings> {
  const { model, book } = await walletHistory(wallet, tokenIds, env, waitUntil)
  return earningsView(model, book, epochs)
}

export function emptyEarnings(now: bigint): WireEarnings {
  const current = epochStartOf(now)
  const empty = { tokens: [], usdAtEarn: null, usdNow: null, unpriced: 0 }
  return {
    tokenIds: [],
    current: {
      epochStart: current.toString(),
      epochEnd: (current + EPOCH).toString(),
      status: "projected",
      tokens: [],
      usdNow: null,
    },
    epochs: [],
    totals: {
      realized: empty,
      claimed: empty,
      claimable: empty,
      projected: empty,
    },
    verified: false,
    partial: false,
  }
}

export type LedgerQuery = {
  from: bigint | undefined
  to: bigint | undefined
  statuses: readonly WireLedgerRow["status"][]
  gauge: Address | undefined
  tokenId: bigint | undefined
}

/** Claim tx links from the warehouse, when it's configured and reachable. */
async function withClaimLinks(
  wallet: Address,
  rows: WireLedgerRow[],
  env: WorkerEnv,
): Promise<WireLedgerRow[]> {
  const config = sourceConfig(env)
  if (!config.warehouseUrl || !rows.some((row) => row.status === "claimed")) {
    return rows
  }
  const contracts = [...new Set(rows.map((row) => row.rewardContract))].sort()
  const claims = await cached(
    `history:claims:${wallet}:${contracts.join(",")}`,
    30_000,
    async () => {
      const found = await walletClaims(config, wallet, contracts)
      // Don't memo an outage; the next request retries.
      if (found === null) throw new Error("claims unavailable")
      return found
    },
  ).catch(() => null)
  return claims ? linkClaims(rows, claims) : rows
}

export async function walletLedger(
  wallet: Address,
  query: LedgerQuery,
  env: WorkerEnv,
  waitUntil: WaitUntil,
): Promise<{ rows: WireLedgerRow[]; partial: boolean }> {
  const { model, book, partial } = await walletHistory(
    wallet,
    [],
    env,
    waitUntil,
  )
  const rows = ledgerRows(model, book).filter((row) => {
    const epoch = BigInt(row.epochStart)
    if (query.from !== undefined && epoch < query.from) return false
    if (query.to !== undefined && epoch > query.to) return false
    if (query.statuses.length > 0 && !query.statuses.includes(row.status)) {
      return false
    }
    if (query.gauge && row.gauge !== query.gauge) return false
    if (query.tokenId !== undefined && BigInt(row.tokenId) !== query.tokenId) {
      return false
    }
    return true
  })
  return { rows: await withClaimLinks(wallet, rows, env), partial }
}

/** BTC / MEZO at each of the last `count` epoch closes, oldest first. */
export async function pricingEpochs(
  count: number,
  env: PricingEnv,
): Promise<WirePricingEpochs> {
  const now = nowSeconds()
  const current = epochStartOf(now)
  const epochs = Array.from(
    { length: count },
    (_, index) => current - BigInt(count - index) * EPOCH,
  )
  const closes = await epochClosePrices(epochs, env, now)
  return {
    rows: epochs.map((epoch) => {
      const close = closes.get(epoch)
      return {
        epochStart: epoch.toString(),
        epochEnd: (epoch + EPOCH).toString(),
        btcUsd: close?.btcUsd ?? null,
        mezoUsd: close?.mezoUsd ?? null,
        mezoBlock: close?.mezoBlock?.toString() ?? null,
        baseBlock: close?.baseBlock?.toString() ?? null,
        sources: {
          btc: close?.btcUsd ? "skip-oracle" : null,
          mezo: close?.mezoUsd ? "aerodrome-cl" : null,
        },
      }
    }),
  }
}
