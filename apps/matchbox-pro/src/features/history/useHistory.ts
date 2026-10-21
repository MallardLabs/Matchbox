import { useNetwork } from "@/lib/network"
import { QUERY_PROFILES } from "@/lib/queryProfiles"
import { CHAIN_ID } from "@repo/shared/contracts"
import {
  type InfiniteData,
  type UseInfiniteQueryResult,
  type UseQueryResult,
  useInfiniteQuery,
  useQuery,
} from "@tanstack/react-query"
import { useMemo } from "react"
import {
  type Envelope,
  type HistoryNetwork,
  type QueryValue,
  fetchHistory,
  historyUrl,
  isUnavailableError,
} from "./client"
import {
  type ActivityItem,
  type ActivityPage,
  type ActivityTx,
  type Freshness,
  type GaugeEpochRow,
  type IncentiveEpochRow,
  type LedgerRow,
  type LedgerStatus,
  type PricingEpochRow,
  type WalletEarnings,
  type WalletLedger,
  parseActivityPage,
  parseActivityTx,
  parseEarnings,
  parseGaugeEpochs,
  parseIncentiveEpochs,
  parseLedger,
  parsePricingEpochs,
} from "./parse"
import {
  type ActivityKind,
  EPOCH_SECONDS,
  type WireHistoryStatus,
  activityPageSchema,
  activityTxSchema,
  earningsSchema,
  gaugeEpochsSchema,
  historyStatusSchema,
  incentiveEpochsSchema,
  ledgerSchema,
  pricingEpochsSchema,
} from "./schema"

// Per-epoch history read through the Pro Worker (RPC checkpoint math for
// earnings; the activity warehouse or the frozen explorer for activity).
// Pages code against these hooks. When an endpoint is missing or its source
// is down a hook reports `unavailable`, which pages must render as an
// explicit state (never as zeros). Missing historical prices arrive as null
// ("Unpriced").

export type HistoryStatus = "loading" | "ready" | "unavailable" | "error"

export type HistoryResult<T> = {
  status: HistoryStatus
  data: T | undefined
  /** Index lag behind chain head, when known; drives the "Stale" marker. */
  lagSeconds: number | undefined
  /** Source and index position behind `data`; `state: "stale"` → "Stale". */
  freshness?: Freshness | undefined
  /** Re-runs the request (e.g. a Retry button on the error state). */
  refetch?: () => void
}

export type HistoryPagesResult<T> = HistoryResult<T[]> & {
  hasNextPage: boolean
  isFetchingNextPage: boolean
  fetchNextPage: () => void
  /** Reloads every loaded page. */
  refetch: () => void
  /**
   * Ledger only: some USD at earn is still missing while the Worker retries
   * a price read; the hook refetches until it settles.
   */
  partial?: boolean
  /**
   * Activity only: the source ended before the range did (the frozen
   * explorer serves a limited row window), so older rows are missing.
   */
  truncated?: boolean
}

export type {
  ActivityItem,
  ActivityKind,
  ActivityTx,
  Freshness,
  GaugeEpochRow,
  IncentiveEpochRow,
  LedgerRow,
  LedgerStatus,
  PricingEpochRow,
  WalletEarnings,
}
export type {
  ActivityLock,
  ProjectedEpochEarnings,
  SealedEpochEarnings,
  TokenAmount,
  Totals,
} from "./parse"
export type { HistoryNetwork } from "./client"
export { ACTIVITY_KINDS, EPOCH_SECONDS } from "./schema"

type Params = Record<string, QueryValue>

/** How soon a partial (prices still retrying) result is asked for again. */
const PARTIAL_REFETCH_MS = 5_000

const UNAVAILABLE: HistoryResult<never> = {
  status: "unavailable",
  data: undefined,
  lagSeconds: undefined,
}

/** `network` query param for the app's current chain. */
export function useHistoryNetwork(): HistoryNetwork {
  const { chainId } = useNetwork()
  return chainId === CHAIN_ID.testnet ? "mezo-testnet" : "mezo"
}

function normalizeAddress(address: string | undefined): string | undefined {
  return address && /^0x[0-9a-fA-F]{40}$/.test(address)
    ? address.toLowerCase()
    : undefined
}

function toResult<T>(
  query: UseQueryResult<Envelope<T>>,
  enabled: boolean,
): HistoryResult<T> {
  if (!enabled) return UNAVAILABLE
  const refetch = () => {
    void query.refetch()
  }
  if (query.data) {
    const { freshness } = query.data
    return {
      status: freshness.state === "unavailable" ? "unavailable" : "ready",
      data: query.data.data,
      lagSeconds: freshness.lagSeconds ?? undefined,
      freshness,
      refetch,
    }
  }
  if (query.isPending) {
    return { status: "loading", data: undefined, lagSeconds: undefined }
  }
  return {
    status: isUnavailableError(query.error) ? "unavailable" : "error",
    data: undefined,
    lagSeconds: undefined,
    refetch,
  }
}

function toPagesResult<P, R>(
  query: UseInfiniteQueryResult<InfiniteData<Envelope<P>>>,
  rows: R[] | undefined,
  enabled: boolean,
): HistoryPagesResult<R> {
  const pages = query.data?.pages
  const last = pages?.[pages.length - 1]
  let base: HistoryResult<R[]>
  if (!enabled) {
    base = UNAVAILABLE
  } else if (last) {
    base = {
      status: last.freshness.state === "unavailable" ? "unavailable" : "ready",
      data: rows,
      lagSeconds: last.freshness.lagSeconds ?? undefined,
      freshness: last.freshness,
    }
  } else if (query.isPending) {
    base = { status: "loading", data: undefined, lagSeconds: undefined }
  } else {
    base = {
      status: isUnavailableError(query.error) ? "unavailable" : "error",
      data: undefined,
      lagSeconds: undefined,
    }
  }
  return {
    ...base,
    hasNextPage: enabled && query.hasNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
    fetchNextPage: () => {
      void query.fetchNextPage()
    },
    refetch: () => {
      if (enabled) void query.refetch()
    },
  }
}

// ---------------------------------------------------------------- status

export type HistoryCoverage = WireHistoryStatus["coverage"]

/** Which sources back history right now, and how far the index lags. */
export function useHistoryStatus(): HistoryResult<HistoryCoverage> {
  const network = useHistoryNetwork()
  const query = useQuery({
    queryKey: ["history", "status", network],
    queryFn: ({ signal }) =>
      fetchHistory(
        historyUrl("/api/history/status", { network }),
        historyStatusSchema,
        (wire) => wire.coverage,
        signal,
      ),
    ...QUERY_PROFILES.SHORT_CACHE,
  })
  return toResult(query, true)
}

// -------------------------------------------------------------- earnings

/**
 * A wallet's veMEZO voting-incentive earnings: the last `epochs` sealed epochs
 * (oldest first), the projected current epoch, and lifetime totals split into
 * realized / claimed / claimable / projected. Exact per-epoch math from the
 * bribe contracts' checkpoints; `verified` means claimable matches `earned()`.
 * `tokenIds` limits it to those locks (default: every lock the wallet owns).
 */
export function useWalletEarnings(
  address: string | undefined,
  epochs = 8,
  tokenIds?: readonly bigint[],
): HistoryResult<WalletEarnings> {
  const network = useHistoryNetwork()
  const wallet = normalizeAddress(address)
  const ids = tokenIds?.map(String)
  const query = useQuery({
    queryKey: ["history", "earnings", network, wallet, epochs, ids ?? null],
    queryFn: ({ signal }) =>
      fetchHistory(
        historyUrl(`/api/wallets/${wallet}/earnings`, {
          network,
          epochs,
          tokenIds: ids,
        }),
        earningsSchema,
        parseEarnings,
        signal,
      ),
    enabled: !!wallet,
    ...QUERY_PROFILES.SHORT_CACHE,
    // Prices still retrying on the Worker: USD is a lower bound, ask again.
    refetchInterval: (current) =>
      current.state.data?.data.partial ? PARTIAL_REFETCH_MS : false,
  })
  return toResult(query, !!wallet)
}

// ---------------------------------------------------------------- ledger

export type LedgerFilters = {
  /** Inclusive epochStart bounds, Unix seconds. */
  from?: number | undefined
  to?: number | undefined
  status?: readonly LedgerStatus[] | undefined
  gauge?: string | undefined
  tokenId?: bigint | undefined
  /** Page size, ≤ 500. */
  limit?: number | undefined
}

function ledgerParams(network: HistoryNetwork, filters: LedgerFilters): Params {
  return {
    network,
    from: filters.from,
    to: filters.to,
    status: filters.status,
    gauge: filters.gauge?.toLowerCase(),
    tokenId: filters.tokenId,
    limit: filters.limit,
  }
}

/** Epoch ledger rows, newest epoch first; one per epoch × lock × bribe × token. */
export function useWalletLedger(
  address: string | undefined,
  filters: LedgerFilters = {},
): HistoryPagesResult<LedgerRow> {
  const network = useHistoryNetwork()
  const wallet = normalizeAddress(address)
  const params = ledgerParams(network, filters)
  const query = useInfiniteQuery({
    queryKey: ["history", "ledger", wallet, params],
    queryFn: ({ signal, pageParam }) =>
      fetchHistory(
        historyUrl(`/api/wallets/${wallet}/ledger`, {
          ...params,
          cursor: pageParam ?? undefined,
        }),
        ledgerSchema,
        parseLedger,
        signal,
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (last: Envelope<WalletLedger>) => last.data.nextCursor,
    enabled: !!wallet,
    ...QUERY_PROFILES.SHORT_CACHE,
    refetchInterval: (current) =>
      current.state.data?.pages.some((page) => page.data.partial)
        ? PARTIAL_REFETCH_MS
        : false,
  })
  const rows = useMemo(
    () => query.data?.pages.flatMap((page) => page.data.rows),
    [query.data],
  )
  const partial = query.data?.pages.some((page) => page.data.partial) ?? false
  return { ...toPagesResult(query, rows, !!wallet), partial }
}

/**
 * Download link for the same ledger as CSV (`text/csv` attachment, all pages).
 * Pass `useHistoryNetwork()` as `network`.
 */
export function walletLedgerCsvUrl(
  address: string,
  filters: LedgerFilters = {},
  network: HistoryNetwork = "mezo",
): string {
  const { limit: _limit, ...rest } = filters
  return historyUrl(
    `/api/wallets/${address.toLowerCase()}/ledger.csv`,
    ledgerParams(network, rest),
  )
}

// -------------------------------------------------------------- activity

export type ActivityFilters = {
  kinds?: readonly ActivityKind[] | undefined
  gauge?: string | undefined
  tokenId?: bigint | undefined
  /** Unix seconds, inclusive. */
  from?: number | undefined
  to?: number | undefined
  /** Page size, ≤ 200. */
  limit?: number | undefined
}

export type ProtocolActivityFilters = Omit<ActivityFilters, "tokenId"> & {
  /** Voter source, e.g. "BOOST_VOTER". */
  source?: string | undefined
}

function activityParams(
  network: HistoryNetwork,
  filters: ActivityFilters & { source?: string | undefined },
): Params {
  return {
    network,
    kinds: filters.kinds,
    gauge: filters.gauge?.toLowerCase(),
    tokenId: filters.tokenId,
    source: filters.source,
    from: filters.from,
    to: filters.to,
    limit: filters.limit,
  }
}

function useActivityPages(
  key: string,
  path: string | undefined,
  params: Params,
  enabled = true,
): HistoryPagesResult<ActivityItem> {
  const active = enabled && !!path
  const query = useInfiniteQuery({
    queryKey: ["history", key, path, params],
    queryFn: ({ signal, pageParam }) =>
      fetchHistory(
        historyUrl(path ?? "", { ...params, cursor: pageParam ?? undefined }),
        activityPageSchema,
        parseActivityPage,
        signal,
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (last: Envelope<ActivityPage>) => last.data.nextCursor,
    enabled: active,
    staleTime: 15_000,
    gcTime: 300_000,
  })
  const rows = useMemo(
    () => query.data?.pages.flatMap((page) => page.data.items),
    [query.data],
  )
  const pages = query.data?.pages
  const truncated = pages?.[pages.length - 1]?.data.truncated ?? false
  return { ...toPagesResult(query, rows, active), truncated }
}

/** A wallet's on-chain activity, newest first, cursor-paged. */
export function useWalletActivity(
  address: string | undefined,
  filters: ActivityFilters = {},
): HistoryPagesResult<ActivityItem> {
  const network = useHistoryNetwork()
  const wallet = normalizeAddress(address)
  return useActivityPages(
    "wallet-activity",
    wallet ? `/api/wallets/${wallet}/activity` : undefined,
    activityParams(network, filters),
  )
}

/**
 * Protocol-wide activity (no wallet scope), newest first. Pass
 * `{ enabled: false }` to skip the request (reported as `unavailable`).
 */
export function useProtocolActivity(
  filters: ProtocolActivityFilters = {},
  options: { enabled?: boolean | undefined } = {},
): HistoryPagesResult<ActivityItem> {
  const network = useHistoryNetwork()
  return useActivityPages(
    "protocol-activity",
    "/api/protocol/activity",
    activityParams(network, filters),
    options.enabled ?? true,
  )
}

/** Every indexed row of one transaction, for the activity permalink. */
export function useActivityTx(
  hash: string | undefined,
  address?: string | undefined,
): HistoryResult<ActivityTx> {
  const network = useHistoryNetwork()
  const txHash =
    hash && /^0x[0-9a-fA-F]{64}$/.test(hash) ? hash.toLowerCase() : undefined
  const query = useQuery({
    queryKey: ["history", "tx", network, txHash],
    queryFn: ({ signal }) =>
      fetchHistory(
        historyUrl(`/api/activity/tx/${txHash}`, {
          network,
          address: normalizeAddress(address),
        }),
        activityTxSchema,
        parseActivityTx,
        signal,
      ),
    enabled: !!txHash,
    ...QUERY_PROFILES.SHORT_CACHE,
  })
  return toResult(query, !!txHash)
}

// ---------------------------------------------------------------- gauges

/** One gauge's epochs, newest first (current epoch first, then sealed). */
export function useGaugeEpochHistory(
  gauge: string | undefined,
  count = 8,
  boostTokenId?: bigint | undefined,
): HistoryResult<GaugeEpochRow[]> {
  const network = useHistoryNetwork()
  const address = normalizeAddress(gauge)
  const boostId = boostTokenId?.toString()
  const query = useQuery({
    queryKey: ["history", "gauge-epochs", network, address, count, boostId],
    queryFn: ({ signal }) =>
      fetchHistory(
        historyUrl(`/api/gauges/${address}/epochs`, {
          network,
          count,
          boostTokenId: boostId,
        }),
        gaugeEpochsSchema,
        parseGaugeEpochs,
        signal,
      ),
    enabled: !!address,
    ...QUERY_PROFILES.LONG_CACHE,
  })
  return toResult(query, !!address)
}

export type GaugeEpoch = {
  /** Stable epoch id: epochStart / 604800 (Unix week). Label by date. */
  epoch: number
  /** Unix seconds the epoch started. */
  startsAt?: number
  /** The live epoch (values still moving). */
  current?: boolean
  veMEZO: bigint | null
  /** Boost multiplier in basis points (42000 = 4.2×). */
  boostBps: number | null
  incentivesUsdMicro: bigint | null
  /** APY in basis points. */
  apyBps: number | null
}

const WAD_PER_BPS = 10n ** 14n

/** One gauge's recent epochs, newest first. */
export function useGaugeEpochs(
  gauge: string,
  epochs = 8,
  boostTokenId?: bigint | undefined,
): HistoryResult<GaugeEpoch[]> {
  const result = useGaugeEpochHistory(gauge, epochs, boostTokenId)
  const rows = result.data
  const data = useMemo(
    () =>
      rows?.map((row) => ({
        epoch: row.epochStart / EPOCH_SECONDS,
        startsAt: row.epochStart,
        current: row.status === "current",
        veMEZO: row.veMezo,
        boostBps:
          row.boostWad === null ? null : Number(row.boostWad / WAD_PER_BPS),
        incentivesUsdMicro: row.incentivesUsdMicro,
        apyBps: row.apyBps === null ? null : Number(row.apyBps),
      })),
    [rows],
  )
  return { ...result, data }
}

// ------------------------------------------------------------ incentives

/** Incentives deposited per epoch across all boost gauges, oldest first. */
export function useIncentiveEpochs(
  count = 8,
): HistoryResult<IncentiveEpochRow[]> {
  const network = useHistoryNetwork()
  const query = useQuery({
    queryKey: ["history", "incentive-epochs", network, count],
    queryFn: ({ signal }) =>
      fetchHistory(
        historyUrl("/api/incentives/epochs", { network, count }),
        incentiveEpochsSchema,
        parseIncentiveEpochs,
        signal,
      ),
    ...QUERY_PROFILES.LONG_CACHE,
  })
  return toResult(query, true)
}

export type IncentiveDeposits = {
  /** Stable epoch id: epochStart / 604800 (Unix week). Label by date. */
  epoch: number
  startsAt: number
  /** All incentives deposited across gauges that epoch, micro-USD. */
  usdMicro: bigint | null
  /** The live epoch (deposits can still arrive). */
  current?: boolean
}

/** Public: incentives deposited per epoch across all gauges, newest last. */
export function useIncentiveDeposits(
  epochs = 6,
): HistoryResult<IncentiveDeposits[]> {
  const result = useIncentiveEpochs(epochs)
  const rows = result.data
  const data = useMemo(
    () =>
      rows?.map((row) => ({
        epoch: row.epochStart / EPOCH_SECONDS,
        startsAt: row.epochStart,
        usdMicro: row.usdAtDepositMicro,
        current: row.status === "current",
      })),
    [rows],
  )
  return { ...result, data }
}

// --------------------------------------------------------------- pricing

/** BTC and MEZO USD at each epoch close, oldest first; null = unpriced. */
export function usePricingEpochs(count = 8): HistoryResult<PricingEpochRow[]> {
  const network = useHistoryNetwork()
  const query = useQuery({
    queryKey: ["history", "pricing-epochs", network, count],
    queryFn: ({ signal }) =>
      fetchHistory(
        historyUrl("/api/pricing/epochs", { network, count }),
        pricingEpochsSchema,
        parsePricingEpochs,
        signal,
      ),
    ...QUERY_PROFILES.LONG_CACHE,
  })
  return toResult(query, true)
}
