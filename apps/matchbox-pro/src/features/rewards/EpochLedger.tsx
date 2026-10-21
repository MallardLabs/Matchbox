import type { LedgerRow } from "@/features/history/parse"
import { formatMicroUsd } from "@/lib/money"
import * as Button from "@repo/ui/button"
import { cn } from "@repo/ui/cn"
import * as Skeleton from "@repo/ui/skeleton"
import type { ReactElement } from "react"
import {
  STATUS_LABEL,
  STATUS_TONE,
  formatEpochDate,
  ledgerNative,
  ledgerSource,
  shortAddress,
} from "./ledgerModel"

type EpochLedgerProps = {
  status: "loading" | "ready" | "unavailable" | "error"
  /** A price read is still retrying: a missing USD shows "—", not "Unpriced". */
  pricesPending: boolean
  rows: LedgerRow[]
  gaugeName: (gauge: string) => string | null
  epochLabel: (epochStart: number) => string
  hasMore: boolean
  loadingMore: boolean
  onLoadMore: () => void
  onRetry: () => void
}

const SKELETON_ROWS = ["a", "b", "c", "d"]

const headClass = "pb-2 pr-3 text-caption font-400 text-muted"
const numericHead = cn(headClass, "text-right")

/**
 * Per-epoch ledger. One table: below xl it collapses to epoch · source and
 * native · status, matching the compact phone and tablet rows.
 */
export default function EpochLedger({
  status,
  pricesPending,
  rows,
  gaugeName,
  epochLabel,
  hasMore,
  loadingMore,
  onLoadMore,
  onRetry,
}: EpochLedgerProps): ReactElement {
  return (
    <section aria-labelledby="ledger-heading" className="flex min-w-0 flex-col">
      <h2
        id="ledger-heading"
        className="pb-1 text-body font-600 text-ink md:sr-only xl:not-sr-only xl:pb-3"
      >
        <span className="xl:hidden">Ledger</span>
        <span className="hidden xl:inline">Epoch ledger</span>
      </h2>

      {status === "unavailable" || status === "error" ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line py-5">
          <p className="text-body-sm text-secondary">
            {status === "error"
              ? "History failed to load"
              : "History unavailable"}
          </p>
          <Button.Root variant="secondary" size="sm" onClick={onRetry}>
            Retry
          </Button.Root>
        </div>
      ) : status === "ready" && rows.length === 0 ? (
        <p className="border-t border-line py-5 text-body-sm text-secondary">
          No rewards in this range
        </p>
      ) : (
        <div className="flex min-w-0 flex-col">
          <table
            aria-labelledby="ledger-heading"
            aria-busy={status === "loading" || undefined}
            className="w-full table-auto border-collapse text-left xl:table-fixed"
          >
            <thead className="max-xl:sr-only">
              <tr className="border-b border-line">
                <th scope="col" className={cn(headClass, "w-10 xl:w-[68px]")}>
                  Epoch
                </th>
                <th
                  scope="col"
                  className={cn(headClass, "hidden xl:table-cell xl:w-[76px]")}
                >
                  Date
                </th>
                <th scope="col" className={headClass}>
                  Source
                </th>
                <th
                  scope="col"
                  className={cn(
                    numericHead,
                    "hidden xl:table-cell xl:w-[122px]",
                  )}
                >
                  Native
                </th>
                <th
                  scope="col"
                  className={cn(
                    numericHead,
                    "hidden xl:table-cell xl:w-[100px]",
                  )}
                >
                  USD at earn
                </th>
                <th
                  scope="col"
                  className={cn(
                    numericHead,
                    "hidden xl:table-cell xl:w-[92px]",
                  )}
                >
                  USD now
                </th>
                <th
                  scope="col"
                  className={cn(
                    headClass,
                    "w-[132px] pr-0 text-right xl:w-[100px] xl:pl-3 xl:text-left",
                  )}
                >
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {status === "loading"
                ? SKELETON_ROWS.map((key) => (
                    <tr key={key} className="border-b border-line">
                      <td colSpan={7} className="py-3">
                        <Skeleton.Root className="h-3 w-full" />
                      </td>
                    </tr>
                  ))
                : rows.map((row) => (
                    <LedgerLine
                      key={row.id}
                      row={row}
                      pricesPending={pricesPending}
                      gaugeName={gaugeName(row.gauge)}
                      epochLabel={epochLabel(row.epochStart)}
                    />
                  ))}
            </tbody>
          </table>
          {hasMore ? (
            <Button.Root
              variant="ghost"
              size="sm"
              className="mt-2 self-start"
              loading={loadingMore}
              onClick={onLoadMore}
            >
              Load more
            </Button.Root>
          ) : null}
        </div>
      )}
    </section>
  )
}

/**
 * USD at earn: pending rows haven't been earned yet ("—"); a missing price
 * is "Unpriced" once prices have settled, "—" while a read is retrying.
 */
export function atEarnLabel(row: LedgerRow, pricesPending: boolean): string {
  if (row.status === "pending") return "—"
  if (row.usdAtEarnMicro !== null) return formatMicroUsd(row.usdAtEarnMicro)
  return pricesPending ? "—" : "Unpriced"
}

function LedgerLine({
  row,
  pricesPending,
  gaugeName,
  epochLabel,
}: {
  row: LedgerRow
  pricesPending: boolean
  gaugeName: string | null
  epochLabel: string
}): ReactElement {
  const unpriced =
    !pricesPending &&
    row.usdNowMicro === null &&
    (row.status === "pending" || row.usdAtEarnMicro === null)
  return (
    <tr className="border-b border-line text-label">
      <td className="whitespace-nowrap py-2 pr-3 font-mono text-secondary tabular-nums xl:py-2.5 xl:text-ink">
        {epochLabel}
      </td>
      <td className="hidden py-2.5 pr-3 text-secondary tabular-nums xl:table-cell">
        {formatEpochDate(row.epochEnd)}
      </td>
      <td className="w-full max-w-0 truncate py-2 pr-3 text-ink md:text-body-sm xl:w-auto xl:max-w-none xl:py-2.5 xl:text-label">
        <span className="xl:hidden">
          {gaugeName ?? shortAddress(row.gauge)} {ledgerNative(row)}
        </span>
        <span className="hidden xl:inline">{ledgerSource(row, gaugeName)}</span>
      </td>
      <td className="hidden truncate py-2.5 pr-3 text-right font-mono text-ink tabular-nums xl:table-cell">
        {ledgerNative(row)}
      </td>
      <td className="hidden py-2.5 pr-3 text-right font-mono text-ink tabular-nums xl:table-cell">
        {atEarnLabel(row, pricesPending)}
      </td>
      <td className="hidden py-2.5 pr-3 text-right font-mono text-secondary tabular-nums xl:table-cell">
        {row.usdNowMicro !== null
          ? formatMicroUsd(row.usdNowMicro)
          : pricesPending
            ? "—"
            : "Unpriced"}
      </td>
      <td
        className={cn(
          "whitespace-nowrap py-2 text-right font-600 xl:py-2.5 xl:pl-3 xl:text-left",
          STATUS_TONE[row.status],
        )}
      >
        {STATUS_LABEL[row.status]}
        {unpriced ? (
          <span className="text-warn xl:hidden"> · Unpriced</span>
        ) : null}
      </td>
    </tr>
  )
}
