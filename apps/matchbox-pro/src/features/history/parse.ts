import { priceToMicroUsd } from "@/lib/money"
import type {
  ActivityKind,
  WireActivityItem,
  WireActivityPage,
  WireActivityTx,
  WireEarnings,
  WireFreshness,
  WireGaugeEpochs,
  WireIncentiveEpochs,
  WireLedger,
  WireLedgerRow,
  WirePricingEpochs,
  WireTokenAmount,
  WireTotals,
} from "./schema"

// Wire → client: decimal strings become bigints (wei, micro-USD) and epoch
// timestamps become plain seconds. Validation already happened in the schema.

export type Freshness = {
  source: WireFreshness["source"]
  indexedThroughBlock: bigint | null
  indexedAt: string | null
  headBlock: bigint | null
  lagBlocks: bigint | null
  lagSeconds: number | null
  state: WireFreshness["state"]
}

export type TokenAmount = {
  token: string
  symbol: string
  decimals: number
  amount: bigint
  /** micro-USD at the epoch-end price; null when unpriced. */
  usdAtEarnMicro: bigint | null
  /** micro-USD at the current price; null when unpriced. */
  usdNowMicro: bigint | null
  /**
   * In aggregates: this token's lines left out of the USD sums. Always set
   * by the parser; optional so hand-built amounts stay valid.
   */
  unpriced?: number | undefined
}

export type Totals = {
  tokens: TokenAmount[]
  /** Sum over priced lines; null when nothing is priced. */
  usdAtEarnMicro: bigint | null
  usdNowMicro: bigint | null
  /** Token lines with no price at earn (partial USD when > 0). */
  unpriced: number
}

export type EpochWindow = {
  /** Unix seconds. */
  epochStart: number
  epochEnd: number
}

export type SealedEpochEarnings = EpochWindow & {
  status: "sealed"
  tokens: TokenAmount[]
  usdAtEarnMicro: bigint | null
  usdNowMicro: bigint | null
  unpriced: number
}

export type ProjectedEpochEarnings = EpochWindow & {
  status: "projected"
  tokens: TokenAmount[]
  usdNowMicro: bigint | null
}

export type WalletEarnings = {
  tokenIds: bigint[]
  current: ProjectedEpochEarnings
  /** Oldest first. */
  epochs: SealedEpochEarnings[]
  totals: {
    realized: Totals
    claimed: Totals
    claimable: Totals
    projected: Totals
  }
  verified: boolean
  /** Some USD is a lower bound while a price read retries; refetch soon. */
  partial: boolean
}

export type LedgerStatus = WireLedgerRow["status"]

export type LedgerRow = EpochWindow & {
  id: string
  date: string
  tokenId: bigint
  escrow: WireLedgerRow["escrow"]
  voter: WireLedgerRow["voter"]
  gauge: string
  rewardContract: string
  rewardType: WireLedgerRow["rewardType"]
  token: string
  symbol: string
  decimals: number
  amount: bigint
  balance: bigint
  supply: bigint
  deposited: bigint
  usdAtEarnMicro: bigint | null
  usdNowMicro: bigint | null
  status: LedgerStatus
  claim: {
    txHash: string
    blockNumber: bigint
    timestamp: number
    confidence: "exact" | "wallet"
  } | null
  method: WireLedgerRow["method"]
}

export type WalletLedger = {
  rows: LedgerRow[]
  nextCursor: string | null
  partial: boolean
}

export type ActivityLock = {
  prevAmount: bigint | null
  prevDuration: bigint | null
  prevIsPermanent: boolean | null
  postAmount: bigint | null
  postDuration: bigint | null
  postIsPermanent: boolean | null
  mergeSourceTokenId: bigint | null
  mergeDestTokenId: bigint | null
}

export type ActivityItem = {
  id: string
  kind: ActivityKind
  actionType: string
  source: string
  /** 0n when the source row has no block (vote rows from earn-votes). */
  blockNumber: bigint
  logIndex: number | null
  txHash: string | null
  txFrom: string | null
  /** Unix seconds. */
  timestamp: number
  epochStart: number
  status: "final" | "signed"
  actor: string | null
  recipient: string | null
  tokenId: bigint | null
  gauge: string | null
  pool: string | null
  rewardContract: string | null
  rewardType: string | null
  token: string | null
  amount: bigint | null
  weight: bigint | null
  totalWeight: bigint | null
  /** Boost wad, 1e18 = 1×. */
  boost: bigint | null
  boostableTokenId: bigint | null
  escrow: "veMEZO" | "veBTC" | null
  /** Token of `amount`; null when unknown. */
  symbol: string | null
  decimals: number | null
  lock: ActivityLock | undefined
}

export type ActivityPage = {
  items: ActivityItem[]
  nextCursor: string | null
  truncated: boolean
}

export type ActivityTx = {
  index: WireActivityTx["index"]
  tx: {
    hash: string
    blockNumber: bigint
    timestamp: number
    from: string | null
    epochStart: number
  } | null
  items: ActivityItem[]
}

export type GaugeEpochRow = EpochWindow & {
  status: "sealed" | "current"
  veMezo: bigint
  boostWad: bigint | null
  incentives: TokenAmount[]
  incentivesUsdMicro: bigint | null
  apyBps: bigint | null
}

export type IncentiveEpochRow = EpochWindow & {
  status: "sealed" | "current"
  gauges: number
  deposits: number | null
  tokens: TokenAmount[]
  usdAtDepositMicro: bigint | null
}

export type PricingEpochRow = EpochWindow & {
  btcUsd: string | null
  mezoUsd: string | null
  mezoBlock: bigint | null
  baseBlock: bigint | null
  sources: WirePricingEpochs["rows"][number]["sources"]
}

function big(value: string): bigint {
  return BigInt(value)
}

function bigOrNull(value: string | null): bigint | null {
  return value === null ? null : BigInt(value)
}

function usdMicro(value: string | null): bigint | null {
  return value === null ? null : priceToMicroUsd(value)
}

function seconds(value: string): number {
  return Number(value)
}

function epochWindow(row: {
  epochStart: string
  epochEnd: string
}): EpochWindow {
  return {
    epochStart: seconds(row.epochStart),
    epochEnd: seconds(row.epochEnd),
  }
}

export function parseFreshness(wire: WireFreshness): Freshness {
  return {
    source: wire.source,
    indexedThroughBlock: bigOrNull(wire.indexedThroughBlock),
    indexedAt: wire.indexedAt,
    headBlock: bigOrNull(wire.headBlock),
    lagBlocks: bigOrNull(wire.lagBlocks),
    lagSeconds: wire.lagSeconds,
    state: wire.state,
  }
}

export function parseTokenAmount(wire: WireTokenAmount): TokenAmount {
  return {
    token: wire.token,
    symbol: wire.symbol,
    decimals: wire.decimals,
    amount: big(wire.amount),
    usdAtEarnMicro: usdMicro(wire.usdAtEarn),
    usdNowMicro: usdMicro(wire.usdNow),
    unpriced: wire.unpriced ?? 0,
  }
}

function parseTotals(wire: WireTotals): Totals {
  return {
    tokens: wire.tokens.map(parseTokenAmount),
    usdAtEarnMicro: usdMicro(wire.usdAtEarn),
    usdNowMicro: usdMicro(wire.usdNow),
    unpriced: wire.unpriced,
  }
}

export function parseEarnings(wire: WireEarnings): WalletEarnings {
  return {
    tokenIds: wire.tokenIds.map(big),
    current: {
      ...epochWindow(wire.current),
      status: "projected",
      tokens: wire.current.tokens.map(parseTokenAmount),
      usdNowMicro: usdMicro(wire.current.usdNow),
    },
    epochs: wire.epochs.map((epoch) => ({
      ...epochWindow(epoch),
      status: "sealed",
      tokens: epoch.tokens.map(parseTokenAmount),
      usdAtEarnMicro: usdMicro(epoch.usdAtEarn),
      usdNowMicro: usdMicro(epoch.usdNow),
      unpriced: epoch.unpriced,
    })),
    totals: {
      realized: parseTotals(wire.totals.realized),
      claimed: parseTotals(wire.totals.claimed),
      claimable: parseTotals(wire.totals.claimable),
      projected: parseTotals(wire.totals.projected),
    },
    verified: wire.verified,
    partial: wire.partial,
  }
}

export function parseLedgerRow(wire: WireLedgerRow): LedgerRow {
  return {
    ...epochWindow(wire),
    id: wire.id,
    date: wire.date,
    tokenId: big(wire.tokenId),
    escrow: wire.escrow,
    voter: wire.voter,
    gauge: wire.gauge,
    rewardContract: wire.rewardContract,
    rewardType: wire.rewardType,
    token: wire.token,
    symbol: wire.symbol,
    decimals: wire.decimals,
    amount: big(wire.amount),
    balance: big(wire.balance),
    supply: big(wire.supply),
    deposited: big(wire.deposited),
    usdAtEarnMicro: usdMicro(wire.usdAtEarn),
    usdNowMicro: usdMicro(wire.usdNow),
    status: wire.status,
    claim: wire.claim
      ? {
          txHash: wire.claim.txHash,
          blockNumber: big(wire.claim.blockNumber),
          timestamp: seconds(wire.claim.timestamp),
          confidence: wire.claim.confidence,
        }
      : null,
    method: wire.method,
  }
}

export function parseLedger(wire: WireLedger): WalletLedger {
  return {
    rows: wire.rows.map(parseLedgerRow),
    nextCursor: wire.nextCursor,
    partial: wire.partial,
  }
}

export function parseActivityItem(wire: WireActivityItem): ActivityItem {
  return {
    id: wire.id,
    kind: wire.kind,
    actionType: wire.actionType,
    source: wire.source,
    blockNumber: big(wire.blockNumber),
    logIndex: wire.logIndex,
    txHash: wire.txHash,
    txFrom: wire.txFrom,
    timestamp: seconds(wire.timestamp),
    epochStart: seconds(wire.epochStart),
    status: wire.status,
    actor: wire.actor,
    recipient: wire.recipient,
    tokenId: bigOrNull(wire.tokenId),
    gauge: wire.gauge,
    pool: wire.pool,
    rewardContract: wire.rewardContract,
    rewardType: wire.rewardType,
    token: wire.token,
    amount: bigOrNull(wire.amount),
    weight: bigOrNull(wire.weight),
    totalWeight: bigOrNull(wire.totalWeight),
    boost: bigOrNull(wire.boost),
    boostableTokenId: bigOrNull(wire.boostableTokenId),
    escrow: wire.escrow,
    symbol: wire.symbol,
    decimals: wire.decimals,
    lock: wire.lock
      ? {
          prevAmount: bigOrNull(wire.lock.prevAmount),
          prevDuration: bigOrNull(wire.lock.prevDuration),
          prevIsPermanent: wire.lock.prevIsPermanent,
          postAmount: bigOrNull(wire.lock.postAmount),
          postDuration: bigOrNull(wire.lock.postDuration),
          postIsPermanent: wire.lock.postIsPermanent,
          mergeSourceTokenId: bigOrNull(wire.lock.mergeSourceTokenId),
          mergeDestTokenId: bigOrNull(wire.lock.mergeDestTokenId),
        }
      : undefined,
  }
}

export function parseActivityPage(wire: WireActivityPage): ActivityPage {
  return {
    items: wire.items.map(parseActivityItem),
    nextCursor: wire.nextCursor,
    truncated: wire.truncated ?? false,
  }
}

export function parseActivityTx(wire: WireActivityTx): ActivityTx {
  return {
    index: wire.index,
    tx: wire.tx
      ? {
          hash: wire.tx.hash,
          blockNumber: big(wire.tx.blockNumber),
          timestamp: seconds(wire.tx.timestamp),
          from: wire.tx.from,
          epochStart: seconds(wire.tx.epochStart),
        }
      : null,
    items: wire.items.map(parseActivityItem),
  }
}

export function parseGaugeEpochs(wire: WireGaugeEpochs): GaugeEpochRow[] {
  return wire.rows.map((row) => ({
    ...epochWindow(row),
    status: row.status,
    veMezo: big(row.veMezo),
    boostWad: bigOrNull(row.boostWad),
    incentives: row.incentives.map(parseTokenAmount),
    incentivesUsdMicro: usdMicro(row.incentivesUsd),
    apyBps: bigOrNull(row.apyBps),
  }))
}

export function parseIncentiveEpochs(
  wire: WireIncentiveEpochs,
): IncentiveEpochRow[] {
  return wire.rows.map((row) => ({
    ...epochWindow(row),
    status: row.status,
    gauges: row.gauges,
    deposits: row.deposits,
    tokens: row.tokens.map(parseTokenAmount),
    usdAtDepositMicro: usdMicro(row.usdAtDeposit),
  }))
}

export function parsePricingEpochs(wire: WirePricingEpochs): PricingEpochRow[] {
  return wire.rows.map((row) => ({
    ...epochWindow(row),
    btcUsd: row.btcUsd,
    mezoUsd: row.mezoUsd,
    mezoBlock: bigOrNull(row.mezoBlock),
    baseBlock: bigOrNull(row.baseBlock),
    sources: row.sources,
  }))
}
