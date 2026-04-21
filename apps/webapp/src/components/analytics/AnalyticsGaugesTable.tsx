import PaginationControls from "@/components/PaginationControls"
import { SpringIn } from "@/components/SpringIn"
import { type GaugeAPYData, formatAPY, useGaugesAPY } from "@/hooks/useAPY"
import { useAllGaugeProfiles } from "@/hooks/useGaugeProfiles"
import { type BoostGauge, useBoostGauges } from "@/hooks/useGauges"
import { usePagination } from "@/hooks/usePagination"
import { formatUsdValue } from "@/hooks/useTokenPrices"
import { formatFixedPoint, formatMultiplier } from "@/utils/format"
import { ChevronDown, ChevronUp, Input, Skeleton } from "@mezo-org/mezo-clay"
import Link from "next/link"
import type React from "react"
import { useCallback, useDeferredValue, useMemo, useState } from "react"

type SortColumn = "veMEZOWeight" | "boost" | "apy" | "incentives" | null
type SortDirection = "asc" | "desc"

const PAGE_SIZE = 8

function truncateAddress(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

export function AnalyticsGaugesTable(): JSX.Element {
  const { gauges, isLoading } = useBoostGauges({ includeOwnership: false })
  const { profiles: gaugeProfiles } = useAllGaugeProfiles()

  const gaugesForAPY = useMemo(
    () =>
      gauges.map((g) => ({ address: g.address, totalWeight: g.totalWeight })),
    [gauges],
  )
  const { apyMap } = useGaugesAPY(gaugesForAPY)

  const [sortColumn, setSortColumn] = useState<SortColumn>("incentives")
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
    align = "left",
  }: {
    column: SortColumn
    children: React.ReactNode
    align?: "left" | "right"
  }) => (
    <button
      type="button"
      className={`inline-flex w-full cursor-pointer items-center gap-1 border-none bg-transparent p-0 font-mono text-2xs uppercase tracking-wider text-[var(--content-tertiary)] ${
        align === "right" ? "justify-end" : "justify-start"
      }`}
      onClick={() => handleSort(column)}
    >
      {children}
      <SortIndicator column={column} />
    </button>
  )

  type GaugeRow = {
    gauge: BoostGauge
    apyData: GaugeAPYData | undefined
    displayName: string
  }

  const rows: GaugeRow[] = useMemo(() => {
    const built: GaugeRow[] = gauges
      .filter((g) => g.veBTCTokenId > 0n)
      .map((gauge) => {
        const profile = gaugeProfiles.get(gauge.address.toLowerCase())
        const apyData = apyMap.get(gauge.address.toLowerCase())
        const displayName =
          profile?.display_name ?? truncateAddress(gauge.address)
        return { gauge, apyData, displayName }
      })

    const search = deferredSearch.trim().toLowerCase()
    const filtered = search
      ? built.filter(
          (r) =>
            r.displayName.toLowerCase().includes(search) ||
            r.gauge.address.toLowerCase().includes(search),
        )
      : built

    if (!sortColumn) return filtered

    const sorted = [...filtered].sort((a, b) => {
      let cmp = 0
      switch (sortColumn) {
        case "veMEZOWeight": {
          const aVal = a.gauge.totalWeight
          const bVal = b.gauge.totalWeight
          cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0
          break
        }
        case "boost": {
          cmp = a.gauge.boostMultiplier - b.gauge.boostMultiplier
          break
        }
        case "apy": {
          const aApy = a.apyData?.apy ?? -1
          const bApy = b.apyData?.apy ?? -1
          cmp = aApy < bApy ? -1 : aApy > bApy ? 1 : 0
          break
        }
        case "incentives": {
          const aInc = a.apyData?.totalIncentivesUSD ?? 0
          const bInc = b.apyData?.totalIncentivesUSD ?? 0
          cmp = aInc < bInc ? -1 : aInc > bInc ? 1 : 0
          break
        }
      }
      return sortDirection === "asc" ? cmp : -cmp
    })

    return sorted
  }, [gauges, gaugeProfiles, apyMap, sortColumn, sortDirection, deferredSearch])

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
    <SpringIn delay={5} variant="default">
      <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-6 shadow-terminal-sm">
        <header className="mb-4 flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
          <div>
            <h2 className="font-mono text-lg font-bold text-[var(--content-primary)]">
              <span className="text-[#F7931A]">$</span> gauges
            </h2>
            <p className="mt-1 font-mono text-xs text-[var(--content-secondary)]">
              All active gauges ranked by voting rewards
            </p>
          </div>
          <div className="w-full sm:w-64">
            <Input
              size="small"
              placeholder="search gauges..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </div>
        </header>

        {isLoading && rows.length === 0 ? (
          <div className="flex flex-col gap-2">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} height="44px" width="100%" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="py-8 text-center font-mono text-xs text-[var(--content-tertiary)]">
            <span className="text-[#F7931A]">$</span> no gauges match your
            search
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] border-collapse">
              <thead>
                <tr className="border-b border-[var(--border)]">
                  <th className="px-2 py-2 text-left">
                    <span className="font-mono text-2xs uppercase tracking-wider text-[var(--content-tertiary)]">
                      Gauge
                    </span>
                  </th>
                  <th className="px-2 py-2 text-right">
                    <SortableHeader column="veMEZOWeight" align="right">
                      veMEZO
                    </SortableHeader>
                  </th>
                  <th className="px-2 py-2 text-right">
                    <SortableHeader column="boost" align="right">
                      Boost
                    </SortableHeader>
                  </th>
                  <th className="px-2 py-2 text-right">
                    <SortableHeader column="apy" align="right">
                      APY
                    </SortableHeader>
                  </th>
                  <th className="px-2 py-2 text-right">
                    <SortableHeader column="incentives" align="right">
                      Incentives
                    </SortableHeader>
                  </th>
                </tr>
              </thead>
              <tbody>
                {paginatedItems.map(({ gauge, apyData, displayName }) => (
                  <tr
                    key={gauge.address}
                    className="border-b border-[var(--border-subtle)] transition-colors hover:bg-[var(--surface-secondary)]"
                  >
                    <td className="px-2 py-3">
                      <Link
                        href={`/gauges/${gauge.address}`}
                        className="group flex items-center gap-2"
                      >
                        <span className="font-mono text-sm text-[var(--content-primary)] group-hover:text-[#F7931A]">
                          {displayName}
                        </span>
                        {!gauge.isAlive && (
                          <span className="rounded border border-[var(--border)] bg-[var(--surface-secondary)] px-1.5 py-0.5 font-mono text-2xs uppercase text-[var(--content-tertiary)]">
                            inactive
                          </span>
                        )}
                      </Link>
                    </td>
                    <td className="px-2 py-3 text-right font-mono text-sm text-[var(--content-secondary)]">
                      {formatFixedPoint(gauge.totalWeight)}
                    </td>
                    <td className="px-2 py-3 text-right font-mono text-sm text-[var(--content-secondary)]">
                      {formatMultiplier(gauge.boostMultiplier)}
                    </td>
                    <td className="px-2 py-3 text-right font-mono text-sm text-[var(--positive)]">
                      {apyData?.apy !== null && apyData?.apy !== undefined
                        ? formatAPY(apyData.apy)
                        : "—"}
                    </td>
                    <td className="px-2 py-3 text-right font-mono text-sm text-[var(--content-primary)]">
                      {apyData
                        ? formatUsdValue(apyData.totalIncentivesUSD)
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {rows.length > PAGE_SIZE && (
          <div className="mt-4">
            <PaginationControls
              currentPage={currentPage}
              totalPages={totalPages}
              pageStart={pageStart}
              pageEnd={pageEnd}
              totalItems={rows.length}
              itemLabel="gauge"
              onPrevious={goToPreviousPage}
              onNext={goToNextPage}
            />
          </div>
        )}
      </section>
    </SpringIn>
  )
}

export default AnalyticsGaugesTable
