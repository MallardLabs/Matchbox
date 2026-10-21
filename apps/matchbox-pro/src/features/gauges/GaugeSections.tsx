import type { HistoryStatus } from "@/features/history/useHistory"
import { formatBoost, formatMicroUsd } from "@/lib/money"
import * as Badge from "@repo/ui/badge"
import * as Button from "@repo/ui/button"
import { cn } from "@repo/ui/cn"
import * as Meter from "@repo/ui/meter"
import * as Skeleton from "@repo/ui/skeleton"
import type { ReactElement, ReactNode } from "react"
import {
  type EpochIncentives,
  type EpochTableRow,
  formatNative,
  usdLabel,
} from "./model"

const SECTION = "flex min-w-0 flex-col rounded-[10px] bg-surface p-4"

export type GaugeStat = {
  label: string
  value: ReactNode
  tone?: "pos" | "muted"
  loading?: boolean
}

// Five tiles: one row from lg, 3 + 2 on tablets, pairs on phones.
export const STAT_GRID =
  "m-0 grid grid-cols-2 gap-2.5 sm:grid-cols-6 lg:grid-cols-5"

export function statTileClass(index: number, count: number): string {
  return cn(
    "flex min-w-0 flex-col gap-1 rounded-[10px] bg-surface p-3.5 lg:col-span-1",
    index < 3 ? "sm:col-span-2" : "sm:col-span-3",
    index === count - 1 && count % 2 === 1 && "col-span-2",
  )
}

/** Pen "Gauge metrics": five label/value tiles. */
export function GaugeStats({ stats }: { stats: GaugeStat[] }): ReactElement {
  return (
    <dl className={STAT_GRID}>
      {stats.map((stat, index) => (
        <div key={stat.label} className={statTileClass(index, stats.length)}>
          <dt className="truncate text-caption font-500 text-muted">
            {stat.label}
          </dt>
          <dd
            className={cn(
              "m-0 truncate text-title-sm font-400 tabular-nums text-ink lg:text-[20px] lg:leading-[26px]",
              stat.tone === "pos" && "text-pos",
              stat.tone === "muted" && "text-muted",
            )}
          >
            {stat.loading ? (
              <Skeleton.Root className="my-[5px] h-4 w-20 bg-inset-2" />
            ) : (
              stat.value
            )}
          </dd>
        </div>
      ))}
    </dl>
  )
}

type OptimalCardProps = {
  optimal: bigint | undefined
  additional: bigint | undefined
  boost: number | undefined
  fraction: number
}

/** Pen "Optimal card": veMEZO that reaches 5× and progress toward it. */
export function OptimalCard({
  optimal,
  additional,
  boost,
  fraction,
}: OptimalCardProps): ReactElement {
  const remaining =
    optimal === undefined
      ? "Unavailable"
      : additional && additional > 0n
        ? `${formatNative(additional, 18)} to 5×`
        : "At 5×"
  return (
    <section aria-labelledby="optimal-heading" className={cn(SECTION, "gap-2")}>
      <div className="flex flex-wrap items-baseline gap-x-2">
        <h2
          id="optimal-heading"
          className="m-0 text-body-sm font-500 text-muted"
        >
          Optimal veMEZO
        </h2>
        <p className="m-0 ml-auto flex items-baseline gap-2 tabular-nums text-ink">
          <span className="text-title-sm font-400">
            {optimal === undefined ? "—" : formatNative(optimal, 18)}
          </span>
          {boost === undefined || optimal === undefined ? null : (
            <span className="text-body font-700">{formatBoost(boost)}</span>
          )}
        </p>
      </div>
      <p className="m-0 text-label font-500 tabular-nums text-muted">
        {remaining}
      </p>
      <Meter.Root
        fraction={fraction}
        label={
          optimal === undefined
            ? "Optimal veMEZO unavailable"
            : `${Math.round(fraction * 100)}% of optimal veMEZO`
        }
        className="h-2 rounded"
      />
    </section>
  )
}

function tokenDot(symbol: string): string {
  const upper = symbol.toUpperCase()
  if (upper === "MEZO") return "bg-mezo-brand"
  if (upper === "BTC" || upper.endsWith("BTC")) return "bg-accent"
  if (upper.includes("USD")) return "bg-ink-2"
  return "bg-faint"
}

type EpochIncentivesCardProps = {
  incentives: EpochIncentives | undefined
  loading: boolean
  failed: boolean
  onRetry: () => void
}

/** Pen "Incentives card": this epoch's deposits by token. */
export function EpochIncentivesCard({
  incentives,
  loading,
  failed,
  onRetry,
}: EpochIncentivesCardProps): ReactElement {
  return (
    <section
      aria-labelledby="epoch-incentives-heading"
      aria-busy={loading || undefined}
      className={cn(SECTION, "gap-3")}
    >
      <div className="flex items-baseline justify-between gap-4">
        <h2
          id="epoch-incentives-heading"
          className="m-0 text-lead font-400 text-ink"
        >
          This epoch
        </h2>
        <p className="m-0 text-lead font-400 tabular-nums text-ink">
          {loading ? (
            <Skeleton.Root className="h-4 w-16 bg-inset-2" />
          ) : failed || !incentives ? (
            "—"
          ) : (
            usdLabel(incentives.totalUsdMicro, incentives.unpricedCount)
          )}
        </p>
      </div>
      {loading ? (
        <div className="flex flex-col">
          {["a", "b"].map((key) => (
            <div key={key} className="flex items-center gap-2.5 py-2">
              <Skeleton.Root shape="circle" className="size-2.5 bg-inset-2" />
              <Skeleton.Root className="h-3.5 w-14 bg-inset-2" />
              <Skeleton.Root className="ml-auto h-3.5 w-24 bg-inset-2" />
            </div>
          ))}
        </div>
      ) : failed ? (
        <div className="flex flex-wrap items-center justify-between gap-3 py-1">
          <p role="alert" className="m-0 text-body-sm text-neg">
            Incentives unavailable
          </p>
          <Button.Root
            variant="secondary"
            size="sm"
            onClick={onRetry}
            className="relative after:absolute after:inset-x-0 after:-inset-y-2 after:content-['']"
          >
            Retry
          </Button.Root>
        </div>
      ) : !incentives || incentives.rows.length === 0 ? (
        <p className="m-0 py-1 text-body-sm text-secondary">
          No incentives yet
        </p>
      ) : (
        <ul className="m-0 flex list-none flex-col p-0">
          {incentives.rows.map((row) => (
            <li
              key={row.tokenAddress}
              className="flex min-w-0 items-center gap-2.5 py-2"
            >
              <span
                aria-hidden="true"
                className={cn(
                  "size-2.5 shrink-0 rounded-full",
                  tokenDot(row.symbol),
                )}
              />
              <span className="min-w-0 truncate text-body font-400 text-ink">
                {row.symbol}
              </span>
              <span className="ml-auto shrink-0 text-body-sm tabular-nums text-secondary">
                {formatNative(row.amount, row.decimals)}
              </span>
              <span className="shrink-0 text-body tabular-nums text-ink">
                {row.usdMicro === null ? (
                  <span className="text-muted">Unpriced</span>
                ) : (
                  `~${formatMicroUsd(row.usdMicro)}`
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

const HEAD = "pb-1.5 pr-3 text-left text-caption font-400 text-muted last:pr-0"
const CELL =
  "py-[3px] pr-3 text-body-sm font-400 tabular-nums text-ink last:pr-0"

function historyNote(status: HistoryStatus): string {
  if (status === "loading") return "Loading earlier epochs"
  if (status === "error") return "History unavailable"
  return "Earlier epochs unavailable"
}

/** Pen "History card": recent epochs, newest first. */
export function RecentEpochsCard({
  rows,
  status,
  stale,
}: {
  rows: EpochTableRow[]
  status: HistoryStatus
  stale: boolean
}): ReactElement {
  return (
    <section
      aria-labelledby="recent-epochs-heading"
      className={cn(SECTION, "gap-2.5")}
    >
      <div className="flex items-center gap-2">
        <h2
          id="recent-epochs-heading"
          className="m-0 text-lead font-400 text-ink"
        >
          Recent epochs
        </h2>
        {stale ? <Badge.Root tone="warn">Stale</Badge.Root> : null}
      </div>
      <div className="min-w-0 overflow-x-auto">
        <table className="w-auto border-collapse">
          <thead>
            <tr>
              <th scope="col" className={HEAD}>
                Epoch
              </th>
              <th scope="col" className={HEAD}>
                veMEZO
              </th>
              <th scope="col" className={HEAD}>
                Boost
              </th>
              <th scope="col" className={HEAD}>
                Incentives
              </th>
              <th scope="col" className={HEAD}>
                APY
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key}>
                <th
                  scope="row"
                  className={cn(CELL, "text-left text-secondary")}
                >
                  <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                    {row.label}
                    {row.current ? (
                      <Badge.Root
                        tone="accent"
                        className="h-4 px-1 text-micro font-650"
                      >
                        Live
                      </Badge.Root>
                    ) : null}
                  </span>
                </th>
                <td className={CELL}>{row.veMezo}</td>
                <td className={CELL}>{row.boost}</td>
                <td className={CELL}>{row.incentives}</td>
                <td className={cn(CELL, row.apyKnown && "text-pos")}>
                  {row.apy}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {status === "ready" ? null : (
        <p className="m-0 text-label text-muted">{historyNote(status)}</p>
      )}
    </section>
  )
}
