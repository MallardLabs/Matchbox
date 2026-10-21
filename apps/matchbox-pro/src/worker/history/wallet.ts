import type { Address } from "viem"
import type {
  WireEarnings,
  WireLedgerRow,
  WirePricingEpochs,
} from "../../features/history/schema"
import { cached } from "../router"
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
import { type PriceBook, earningsView, ledgerRows, pricedEpochs } from "./views"

// Composes a wallet's earnings model with its prices. One 30s memo serves the
// earnings, ledger and CSV routes for the same wallet.

export type WalletHistory = {
  model: WalletEarningsModel
  book: PriceBook
}

export function nowSeconds(): bigint {
  return BigInt(Math.floor(Date.now() / 1000))
}

export function walletHistory(
  wallet: Address,
  tokenIds: readonly bigint[],
  env: PricingEnv,
): Promise<WalletHistory> {
  const key = `history:wallet:${wallet}:${tokenIds.join(",")}`
  return cached(key, 30_000, async () => {
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
    return { model, book: { now: await prices, closes } }
  })
}

export async function walletEarnings(
  wallet: Address,
  tokenIds: readonly bigint[],
  epochs: number,
  env: PricingEnv,
): Promise<WireEarnings> {
  const { model, book } = await walletHistory(wallet, tokenIds, env)
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
  }
}

export type LedgerQuery = {
  from: bigint | undefined
  to: bigint | undefined
  statuses: readonly WireLedgerRow["status"][]
  gauge: Address | undefined
  tokenId: bigint | undefined
}

export async function walletLedger(
  wallet: Address,
  query: LedgerQuery,
  env: PricingEnv,
): Promise<WireLedgerRow[]> {
  const { model, book } = await walletHistory(wallet, [], env)
  return ledgerRows(model, book).filter((row) => {
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
