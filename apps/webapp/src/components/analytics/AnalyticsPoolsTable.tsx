import PaginationControls from "@/components/PaginationControls"
import { SpringIn } from "@/components/SpringIn"
import { type PoolRow, useEarnApiPools } from "@/hooks/useEarnApiPools"
import { usePagination } from "@/hooks/usePagination"
import {
  ChevronDown,
  ChevronUp,
  Input,
  Skeleton,
  Tag,
} from "@mezo-org/mezo-clay"
import type React from "react"
import { useCallback, useDeferredValue, useMemo, useState } from "react"

type SortColumn = "tvl" | "volume" | "fees" | "apr" | null
type SortDirection = "asc" | "desc"

const PAGE_SIZE = 8

function formatCompactUsd(value: number): string {
  if (!Number.isFinite(value) || value === 0) return "$0"
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`
  if (value >= 1_000) return `$${(value / 1_000).toFixed(2)}K`
  return `$${value.toLocaleString(undefined, {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  })}`
}

function formatAprBps(bps: number): string {
  if (!Number.isFinite(bps) || bps === 0) return "—"
  const pct = bps / 100
  return `${pct.toFixed(2)}%`
}

export function AnalyticsPoolsTable(): JSX.Element {
  const { pools, isLoading, isUnavailable } = useEarnApiPools()

  const [sortColumn, setSortColumn] = useState<SortColumn>("tvl")
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc")
  const [searchInput, setSearchInput] = useState("")
  const deferredSearch = useDeferredValue(searchInput)

  const handleSort = useCallback((column: SortColumn) => {
    setSortColumn((prev) => {
      if (prev === column) {
        setSortDirection((d) => (d === "asc" ? "desc" : "asc"))
        return prev
      }
      setSortDirection("desc")
      return column
    })
  }, [])

  const SortIndicator = ({ column }: { column: SortColumn }) => {
    if (sortColumn !== column) {
      return (
        <span className="opacity-30">
          <ChevronDown size={14} />
        </span>
      )
    }
    return sortDirection === "asc" ? (
      <ChevronUp size={14} />
    ) : (
      <ChevronDown size={14} />
    )
  }

  const SortableHeader = ({
    column,
    children,
  }: {
    column: SortColumn
    children: React.ReactNode
  }) => (
    <button
      type="button"
      className="inline-flex w-full cursor-pointer items-center justify-end gap-1 border-none bg-transparent p-0 font-mono text-2xs uppercase tracking-wider text-[var(--content-tertiary)]"
      onClick={() => handleSort(column)}
    >
      {children}
      <SortIndicator column={column} />
    </button>
  )

  const rows: PoolRow[] = useMemo(() => {
    const search = deferredSearch.trim().toLowerCase()
    const filtered = search
      ? pools.filter(
          (p) =>
            p.name.toLowerCase().includes(search) ||
            p.token0Symbol.toLowerCase().includes(search) ||
            p.token1Symbol.toLowerCase().includes(search),
        )
      : pools

    if (!sortColumn) return filtered

    const sorted = [...filtered].sort((a, b) => {
      let cmp = 0
      switch (sortColumn) {
        case "tvl":
          cmp = a.tvlUsd - b.tvlUsd
          break
        case "volume":
          cmp = a.volumeUsd - b.volumeUsd
          break
        case "fees":
          cmp = a.feesUsd - b.feesUsd
          break
        case "apr":
          cmp = a.aprBps - b.aprBps
          break
      }
      return sortDirection === "asc" ? cmp : -cmp
    })

    return sorted
  }, [pools, sortColumn, sortDirection, deferredSearch])

  const {
    paginatedItems,
    currentPage,
    totalPages,
    pageStart,
    pageEnd,
    goToNextPage,
    goToPreviousPage,
  } = usePagination(rows, {
    pageSize: PAGE_SIZE,
    resetDeps: [deferredSearch, sortColumn, sortDirection],
  })

  return (
    <SpringIn delay={6} variant="default">
      <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-6 shadow-terminal-sm">
        <header className="mb-4 flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
          <div>
            <h2 className="font-mono text-lg font-bold text-[var(--content-primary)]">
              <span className="text-[#F7931A]">$</span> liquidity pools
            </h2>
            <p className="mt-1 font-mono text-xs text-[var(--content-secondary)]">
              TVL, volume, fees, and APR across Mezo DEX pools
            </p>
          </div>
          {!isUnavailable && (
            <div className="w-full sm:w-64">
              <Input
                size="small"
                placeholder="search pools..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
              />
            </div>
          )}
        </header>

        {isLoading ? (
          <div className="flex flex-col gap-2">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} height="44px" width="100%" animation />
            ))}
          </div>
        ) : isUnavailable ? (
          <div className="rounded-lg border border-dashed border-[var(--border)] bg-[var(--surface-secondary)] p-8 text-center">
            <p className="font-mono text-sm text-[var(--content-secondary)]">
              <span className="text-[#F7931A]">$</span> pool data temporarily
              unavailable
            </p>
            <p className="mt-2 font-mono text-xs text-[var(--content-tertiary)]">
              The Mezo earn-api is experiencing issues. Pool analytics will
              return once upstream is healthy.
            </p>
          </div>
        ) : rows.length === 0 ? (
          <div className="py-8 text-center font-mono text-xs text-[var(--content-tertiary)]">
            <span className="text-[#F7931A]">$</span> no pools match your search
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] border-collapse">
              <thead>
                <tr className="border-b border-[var(--border)]">
                  <th className="px-2 py-2 text-left">
                    <span className="font-mono text-2xs uppercase tracking-wider text-[var(--content-tertiary)]">
                      Pool
                    </span>
                  </th>
                  <th className="px-2 py-2 text-right">
                    <SortableHeader column="tvl">TVL</SortableHeader>
                  </th>
                  <th className="px-2 py-2 text-right">
                    <SortableHeader column="volume">Volume</SortableHeader>
                  </th>
                  <th className="px-2 py-2 text-right">
                    <SortableHeader column="fees">Fees</SortableHeader>
                  </th>
                  <th className="px-2 py-2 text-right">
                    <SortableHeader column="apr">APR</SortableHeader>
                  </th>
                </tr>
              </thead>
              <tbody>
                {paginatedItems.map((pool) => (
                  <tr
                    key={pool.address}
                    className="border-b border-[var(--border-subtle)] transition-colors hover:bg-[var(--surface-secondary)]"
                  >
                    <td className="px-2 py-3">
                      <div className="flex flex-col gap-1">
                        <span className="font-mono text-sm text-[var(--content-primary)]">
                          {pool.token0Symbol}/{pool.token1Symbol}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <Tag
                            closeable={false}
                            color={
                              pool.type === "concentrated" ? "yellow" : "gray"
                            }
                          >
                            {pool.type === "concentrated" ? "CL" : "AMM"}
                          </Tag>
                          {pool.volatility === "stable" && (
                            <Tag closeable={false} color="blue">
                              stable
                            </Tag>
                          )}
                          {pool.isVotable && (
                            <Tag closeable={false} color="green">
                              votable
                            </Tag>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-2 py-3 text-right font-mono text-sm text-[var(--content-primary)]">
                      {formatCompactUsd(pool.tvlUsd)}
                    </td>
                    <td className="px-2 py-3 text-right font-mono text-sm text-[var(--content-secondary)]">
                      {formatCompactUsd(pool.volumeUsd)}
                    </td>
                    <td className="px-2 py-3 text-right font-mono text-sm text-[var(--content-secondary)]">
                      {formatCompactUsd(pool.feesUsd)}
                    </td>
                    <td className="px-2 py-3 text-right font-mono text-sm text-[var(--positive)]">
                      {formatAprBps(pool.aprBps)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!isUnavailable && rows.length > PAGE_SIZE && (
          <div className="mt-4">
            <PaginationControls
              currentPage={currentPage}
              totalPages={totalPages}
              pageStart={pageStart}
              pageEnd={pageEnd}
              totalItems={rows.length}
              itemLabel="pool"
              onPrevious={goToPreviousPage}
              onNext={goToNextPage}
            />
          </div>
        )}
      </section>
    </SpringIn>
  )
}

export default AnalyticsPoolsTable
