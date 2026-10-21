import type {
  LedgerRow,
  LedgerStatus,
  SealedEpochEarnings,
} from "@/features/history/parse"
import { formatMicroUsd, microUsdToDecimalString } from "@/lib/money"
import type { Bar } from "@repo/ui/bar-chart"
import { formatNative } from "./claimSources"

export type PeriodId = "epoch" | "last-8" | "lifetime"

export const PERIODS: ReadonlyArray<{ id: PeriodId; label: string }> = [
  { id: "epoch", label: "This epoch" },
  { id: "last-8", label: "Last 8" },
  { id: "lifetime", label: "Lifetime" },
]

export const EPOCH_SECONDS = 604_800

/** Start of the epoch containing `now` (BoostVoter.epochStart). */
export function epochStartOf(nowSeconds: number): number {
  return Math.floor(nowSeconds / EPOCH_SECONDS) * EPOCH_SECONDS
}

/**
 * Oldest epochStart a period's ledger includes: the latest sealed epoch for
 * "This epoch", eight sealed epochs for "Last 8"; the in-progress epoch's
 * pending rows are always included. Undefined = no lower bound.
 */
export function periodFrom(
  period: PeriodId,
  nowSeconds: number,
): number | undefined {
  const current = epochStartOf(nowSeconds)
  if (period === "epoch") return current - EPOCH_SECONDS
  if (period === "last-8") return current - 8 * EPOCH_SECONDS
  return undefined
}

/** Sealed epochs the chart draws before the projected "Next" bar. */
export const CHART_EPOCHS = 6

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
]

/** "Oct 15" (UTC). */
export function formatEpochDate(seconds: number): string {
  const date = new Date(seconds * 1000)
  return `${MONTHS[date.getUTCMonth()]} ${String(date.getUTCDate()).padStart(2, "0")}`
}

function groupThousands(value: bigint): string {
  return value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")
}

/** Whole dollars from $10 ("$1,050"), cents below ("$4.20"). */
export function formatUsdShort(micro: bigint): string {
  if (micro >= 10_000_000n) {
    return `$${groupThousands((micro + 500_000n) / 1_000_000n)}`
  }
  return formatMicroUsd(micro)
}

/** Axis tick for chart geometry ("$1k", "$500", "$0"). */
export function formatUsdTick(value: number): string {
  if (value >= 1000) {
    const thousands = value / 1000
    return `$${Number.isInteger(thousands) ? thousands : thousands.toFixed(1)}k`
  }
  if (Number.isInteger(value)) return `$${value}`
  return `$${value.toFixed(2)}`
}

function microToNumber(micro: bigint): number {
  // Chart geometry only; display strings come from the bigint.
  return Number(micro / 10_000n) / 100
}

/**
 * Realized USD at earn for the last sealed epochs (newest highlighted), then
 * the in-progress epoch as a projected "Next" bar.
 */
export function realizedBars(
  epochs: SealedEpochEarnings[],
  projectedMicro: bigint | null,
): Bar[] {
  const recent = epochs.slice(-CHART_EPOCHS)
  return [
    ...recent.map((epoch, index): Bar => {
      const value = epoch.usdAtEarnMicro
      const latest = index === recent.length - 1
      return {
        key: String(epoch.epochStart),
        label: formatEpochDate(epoch.epochStart),
        value: value === null ? null : microToNumber(value),
        display: value === null ? "—" : formatUsdShort(value),
        tone: value === null ? "unavailable" : latest ? "current" : "past",
      }
    }),
    {
      key: "next",
      label: "Next",
      value: projectedMicro === null ? null : microToNumber(projectedMicro),
      display: projectedMicro === null ? "—" : formatUsdShort(projectedMicro),
      tone: projectedMicro === null ? "unavailable" : "projected",
    },
  ]
}

/** Placeholder bars while history loads or is unavailable. */
export function emptyBars(nowSeconds: number): Bar[] {
  const current = epochStartOf(nowSeconds)
  return [
    ...Array.from({ length: CHART_EPOCHS }, (_, index): Bar => {
      const start = current - (CHART_EPOCHS - index) * EPOCH_SECONDS
      return {
        key: String(start),
        label: formatEpochDate(start),
        value: null,
        display: "—",
        tone: "unavailable",
      }
    }),
    {
      key: "next",
      label: "Next",
      value: null,
      display: "—",
      tone: "unavailable",
    },
  ]
}

export const STATUS_LABEL: Record<LedgerStatus, string> = {
  pending: "Pending",
  claimable: "Claimable",
  claimed: "Claimed",
}

export const STATUS_TONE: Record<LedgerStatus, string> = {
  pending: "text-muted",
  claimable: "text-accent-ink",
  claimed: "text-pos",
}

export function voterLabel(
  row: Pick<LedgerRow, "voter" | "rewardType">,
): string {
  switch (row.voter) {
    case "boost":
      return "boost bribe"
    case "pools":
      return row.rewardType === "Fee" ? "pool fees" : "pool bribe"
    case "validators":
      return "validator"
    case "third_party":
      return "third-party bribe"
  }
}

export function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`
}

/** "Stackbridge · boost bribe · veMEZO #4821". */
export function ledgerSource(row: LedgerRow, gaugeName: string | null): string {
  return [
    gaugeName ?? shortAddress(row.gauge),
    voterLabel(row),
    `${row.escrow} #${row.tokenId}`,
  ].join(" · ")
}

export function ledgerNative(row: LedgerRow): string {
  return `${formatNative(row.amount, row.decimals)} ${row.symbol}`
}

export const LEDGER_CSV_HEADERS = [
  "epoch_start",
  "epoch_end",
  "date",
  "lock",
  "escrow",
  "voter",
  "gauge",
  "gauge_name",
  "reward_contract",
  "reward_type",
  "token",
  "symbol",
  "decimals",
  "amount_raw",
  "amount",
  "usd_at_earn",
  "usd_now",
  "status",
  "claim_tx",
  "method",
]

function decimalAmount(amount: bigint, decimals: number): string {
  if (decimals === 0) return amount.toString()
  const base = 10n ** BigInt(decimals)
  const fraction = (amount % base).toString().padStart(decimals, "0")
  return `${amount / base}.${fraction}`.replace(/\.?0+$/, "")
}

export function ledgerCsvRows(
  rows: LedgerRow[],
  gaugeName: (gauge: string) => string | null,
): Array<Array<string | number | null>> {
  return rows.map((row) => [
    row.epochStart,
    row.epochEnd,
    row.date.slice(0, 10),
    row.tokenId.toString(),
    row.escrow,
    row.voter,
    row.gauge,
    gaugeName(row.gauge),
    row.rewardContract,
    row.rewardType,
    row.token,
    row.symbol,
    row.decimals,
    row.amount.toString(),
    decimalAmount(row.amount, row.decimals),
    row.usdAtEarnMicro === null
      ? null
      : microUsdToDecimalString(row.usdAtEarnMicro),
    row.usdNowMicro === null ? null : microUsdToDecimalString(row.usdNowMicro),
    row.status,
    row.claim?.txHash ?? null,
    row.method,
  ])
}
