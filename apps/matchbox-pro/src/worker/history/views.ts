import type {
  WireEarnings,
  WireLedgerRow,
  WireTokenAmount,
  WireTotals,
} from "../../features/history/schema"
import type { PairTokenShares, WalletEarningsModel } from "./earnings"
import { EPOCH, type EarnStatus } from "./math"
import {
  type EpochClosePrice,
  type PriceRefs,
  tokenPrice,
  usdMicro,
  usdString,
} from "./pricing"

// Wallet earnings model → wire shapes. USD at earn uses the epoch-close
// price; a token line without one is counted in `unpriced` and left out of
// USD sums (null when nothing is priced) — never shown as $0.

type TokenMeta = { token: string; symbol: string; decimals: number }

type Line = TokenMeta & {
  epochStart: bigint
  amount: bigint
  status: EarnStatus
}

function flatten(model: WalletEarningsModel): Line[] {
  return model.lines.flatMap((line) =>
    line.shares
      .filter((share) => share.amount > 0n)
      .map((share) => ({
        token: line.token.token,
        symbol: line.token.symbol,
        decimals: line.token.decimals,
        epochStart: share.epochStart,
        amount: share.amount,
        status: share.status,
      })),
  )
}

export type PriceBook = {
  now: PriceRefs
  closes: Map<bigint, EpochClosePrice>
}

function closeRefs(book: PriceBook, epochStart: bigint): PriceRefs | null {
  return book.closes.get(epochStart) ?? null
}

/** Sealed epochs that have a non-zero line and need a close price. */
export function pricedEpochs(model: WalletEarningsModel): bigint[] {
  return [
    ...new Set(
      flatten(model)
        .filter((line) => line.status !== "pending")
        .map((line) => line.epochStart),
    ),
  ]
}

type Accumulator = {
  meta: TokenMeta
  amount: bigint
  usdAtEarn: bigint | null
  usdNow: bigint | null
}

function addMicro(sum: bigint | null, value: bigint | null): bigint | null {
  if (value === null) return sum
  return (sum ?? 0n) + value
}

/** Aggregates lines per token, pricing each at its own epoch close. */
export function summarize(
  lines: readonly Line[],
  book: PriceBook,
  atEarn: boolean,
): WireTotals {
  const byToken = new Map<string, Accumulator>()
  let unpriced = 0
  let usdAtEarn: bigint | null = null
  let usdNow: bigint | null = null
  for (const line of lines) {
    const acc = byToken.get(line.token) ?? {
      meta: { token: line.token, symbol: line.symbol, decimals: line.decimals },
      amount: 0n,
      usdAtEarn: null,
      usdNow: null,
    }
    acc.amount += line.amount
    if (atEarn) {
      const refs = closeRefs(book, line.epochStart)
      const value = refs
        ? usdMicro(
            line.amount,
            line.decimals,
            tokenPrice(line.token, line.symbol, refs),
          )
        : null
      if (value === null) unpriced += 1
      acc.usdAtEarn = addMicro(acc.usdAtEarn, value)
      usdAtEarn = addMicro(usdAtEarn, value)
    }
    byToken.set(line.token, acc)
  }
  const tokens: WireTokenAmount[] = [...byToken.values()]
    .sort((a, b) => a.meta.symbol.localeCompare(b.meta.symbol))
    .map((acc) => {
      const now = usdMicro(
        acc.amount,
        acc.meta.decimals,
        tokenPrice(acc.meta.token, acc.meta.symbol, book.now),
      )
      if (now === null && !atEarn) unpriced += 1
      usdNow = addMicro(usdNow, now)
      return {
        ...acc.meta,
        amount: acc.amount.toString(),
        usdAtEarn: atEarn ? usdString(acc.usdAtEarn) : null,
        usdNow: usdString(now),
      }
    })
  const empty = lines.length === 0
  return {
    tokens,
    usdAtEarn: atEarn ? usdString(empty ? 0n : usdAtEarn) : null,
    usdNow: usdString(empty ? 0n : usdNow),
    unpriced,
  }
}

export function earningsView(
  model: WalletEarningsModel,
  book: PriceBook,
  windowEpochs: number,
): WireEarnings {
  const lines = flatten(model)
  const sealed = lines.filter((line) => line.status !== "pending")
  const current = model.currentEpoch
  const epochs: WireEarnings["epochs"] = []
  for (let index = windowEpochs; index >= 1; index -= 1) {
    const epochStart = current - BigInt(index) * EPOCH
    const totals = summarize(
      sealed.filter((line) => line.epochStart === epochStart),
      book,
      true,
    )
    epochs.push({
      epochStart: epochStart.toString(),
      epochEnd: (epochStart + EPOCH).toString(),
      status: "sealed",
      tokens: totals.tokens,
      usdAtEarn: totals.usdAtEarn,
      usdNow: totals.usdNow,
      unpriced: totals.unpriced,
    })
  }
  const projected = summarize(
    lines.filter((line) => line.status === "pending"),
    book,
    false,
  )
  return {
    tokenIds: model.tokenIds.map(String),
    current: {
      epochStart: current.toString(),
      epochEnd: (current + EPOCH).toString(),
      status: "projected",
      tokens: projected.tokens,
      usdNow: projected.usdNow,
    },
    epochs,
    totals: {
      realized: summarize(sealed, book, true),
      claimed: summarize(
        sealed.filter((line) => line.status === "claimed"),
        book,
        true,
      ),
      claimable: summarize(
        sealed.filter((line) => line.status === "claimable"),
        book,
        true,
      ),
      projected,
    },
    verified: model.verified,
  }
}

function ledgerStatus(status: EarnStatus): WireLedgerRow["status"] {
  return status
}

function rowsFor(line: PairTokenShares, book: PriceBook): WireLedgerRow[] {
  return line.shares
    .filter((share) => share.amount > 0n)
    .map((share) => {
      const epochEnd = share.epochStart + EPOCH
      const refs =
        share.status === "pending" ? null : closeRefs(book, share.epochStart)
      const { token, symbol, decimals } = line.token
      return {
        id: `${share.epochStart}-${line.tokenId}-${line.bribe}-${token}`,
        epochStart: share.epochStart.toString(),
        epochEnd: epochEnd.toString(),
        date: new Date(Number(epochEnd) * 1000).toISOString(),
        tokenId: line.tokenId.toString(),
        escrow: "veMEZO",
        voter: "boost",
        gauge: line.gauge,
        rewardContract: line.bribe,
        rewardType: "Bribe",
        token,
        symbol,
        decimals,
        amount: share.amount.toString(),
        balance: share.balance.toString(),
        supply: share.supply.toString(),
        deposited: share.deposited.toString(),
        usdAtEarn: refs
          ? usdString(
              usdMicro(share.amount, decimals, tokenPrice(token, symbol, refs)),
            )
          : null,
        usdNow: usdString(
          usdMicro(share.amount, decimals, tokenPrice(token, symbol, book.now)),
        ),
        status: ledgerStatus(share.status),
        claim: null,
        method: "rpc-checkpoints-v1",
      }
    })
}

/** Every non-zero row, newest epoch first, then lock, gauge and token. */
export function ledgerRows(
  model: WalletEarningsModel,
  book: PriceBook,
): WireLedgerRow[] {
  return model.lines
    .flatMap((line) => rowsFor(line, book))
    .sort((a, b) => {
      const epoch = BigInt(b.epochStart) - BigInt(a.epochStart)
      if (epoch !== 0n) return epoch > 0n ? 1 : -1
      const lock = BigInt(a.tokenId) - BigInt(b.tokenId)
      if (lock !== 0n) return lock > 0n ? 1 : -1
      return `${a.gauge}${a.token}`.localeCompare(`${b.gauge}${b.token}`)
    })
}

const CSV_COLUMNS = [
  "epoch_start",
  "epoch_end",
  "date",
  "lock",
  "escrow",
  "voter",
  "gauge",
  "reward_contract",
  "reward_type",
  "token",
  "symbol",
  "amount",
  "amount_wei",
  "usd_at_earn",
  "usd_now",
  "status",
  "lock_balance",
  "gauge_supply",
  "epoch_deposit_wei",
] as const

function decimalAmount(wei: string, decimals: number): string {
  const value = BigInt(wei)
  const base = 10n ** BigInt(decimals)
  const fraction = (value % base).toString().padStart(decimals, "0")
  const trimmed = fraction.replace(/0+$/, "")
  return trimmed ? `${value / base}.${trimmed}` : `${value / base}`
}

function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

export function ledgerCsv(rows: readonly WireLedgerRow[]): string {
  const lines = rows.map((row) =>
    [
      new Date(Number(row.epochStart) * 1000).toISOString(),
      new Date(Number(row.epochEnd) * 1000).toISOString(),
      row.date.slice(0, 10),
      row.tokenId,
      row.escrow,
      row.voter,
      row.gauge,
      row.rewardContract,
      row.rewardType,
      row.token,
      row.symbol,
      decimalAmount(row.amount, row.decimals),
      row.amount,
      row.usdAtEarn ?? "",
      row.usdNow ?? "",
      row.status,
      row.balance,
      row.supply,
      row.deposited,
    ]
      .map(csvCell)
      .join(","),
  )
  return `${[CSV_COLUMNS.join(","), ...lines].join("\n")}\n`
}
