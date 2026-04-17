import AddPoolIncentiveModal from "@/components/AddPoolIncentiveModal"
import PoolCard from "@/components/PoolCard"
import { SpringIn } from "@/components/SpringIn"
import {
  type Pool,
  poolDailyFeesUsd,
  poolDailyVolumeUsd,
  poolEmissionsAprPercent,
  poolFeesAprPercent,
  poolTvlUsd,
  usePools,
} from "@/hooks/usePools"
import { formatUsdValue } from "@/hooks/useTokenPrices"
import { Input, Skeleton, Tag } from "@mezo-org/mezo-clay"
import { useMemo, useState } from "react"

type SortColumn = "tvl" | "feesApr" | "emissionsApr" | "volume" | "totalApr"
type SortDirection = "asc" | "desc"
type PoolTypeFilter = "all" | "volatile" | "stable" | "concentrated"

function matchesPoolType(pool: Pool, filter: PoolTypeFilter): boolean {
  if (filter === "all") return true
  if (filter === "concentrated") return pool.type === "concentrated"
  if (filter === "stable")
    return pool.type === "basic" && pool.volatility === "stable"
  if (filter === "volatile")
    return pool.type === "basic" && pool.volatility !== "stable"
  return true
}

export default function PoolsPage(): JSX.Element {
  const { pools, isLoading, error } = usePools()

  const [sortColumn, setSortColumn] = useState<SortColumn>("tvl")
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc")
  const [typeFilter, setTypeFilter] = useState<PoolTypeFilter>("all")
  const [search, setSearch] = useState("")
  const [activePool, setActivePool] = useState<Pool | null>(null)

  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"))
    } else {
      setSortColumn(column)
      setSortDirection("desc")
    }
  }

  const sortIndicator = (column: SortColumn): string => {
    if (sortColumn !== column) return ""
    return sortDirection === "asc" ? " ↑" : " ↓"
  }

  const filteredAndSorted = useMemo(() => {
    const q = search.trim().toLowerCase()
    let result = pools.filter((p) => matchesPoolType(p, typeFilter))

    if (q) {
      result = result.filter((p) => {
        return (
          p.name.toLowerCase().includes(q) ||
          p.symbol.toLowerCase().includes(q) ||
          p.token0.symbol.toLowerCase().includes(q) ||
          p.token1.symbol.toLowerCase().includes(q) ||
          p.address.toLowerCase().includes(q)
        )
      })
    }

    const keyFn: Record<SortColumn, (p: Pool) => number> = {
      tvl: poolTvlUsd,
      feesApr: poolFeesAprPercent,
      emissionsApr: poolEmissionsAprPercent,
      volume: poolDailyVolumeUsd,
      totalApr: (p) => poolFeesAprPercent(p) + poolEmissionsAprPercent(p),
    }
    const keyFnSel = keyFn[sortColumn]

    result = [...result].sort((a, b) => {
      const av = keyFnSel(a)
      const bv = keyFnSel(b)
      const cmp = av < bv ? -1 : av > bv ? 1 : 0
      return sortDirection === "asc" ? cmp : -cmp
    })

    return result
  }, [pools, search, sortColumn, sortDirection, typeFilter])

  const totals = useMemo(() => {
    let tvl = 0
    let volume = 0
    let fees = 0
    for (const p of pools) {
      tvl += poolTvlUsd(p)
      volume += poolDailyVolumeUsd(p)
      fees += poolDailyFeesUsd(p)
    }
    return { tvl, volume, fees }
  }, [pools])

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="mb-2 text-2xl font-semibold text-[var(--content-primary)]">
          <span className="mr-2 text-[#F7931A]">$</span>
          pools --list
        </h1>
        <p className="text-sm text-[var(--content-secondary)]">
          Fund Mezo liquidity pools directly to attract LPs and bootstrap depth.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 md:gap-4">
        <SpringIn delay={0} variant="card">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
            <p className="mb-1 text-2xs uppercase tracking-wider text-[var(--content-tertiary)]">
              Total Pools
            </p>
            <p className="font-mono text-2xl font-semibold text-[var(--content-primary)]">
              {pools.length}
            </p>
          </div>
        </SpringIn>
        <SpringIn delay={1} variant="card">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
            <p className="mb-1 text-2xs uppercase tracking-wider text-[var(--content-tertiary)]">
              Total TVL
            </p>
            <p className="font-mono text-2xl font-semibold tabular-nums text-[var(--content-primary)]">
              {formatUsdValue(totals.tvl)}
            </p>
          </div>
        </SpringIn>
        <SpringIn delay={2} variant="card">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
            <p className="mb-1 text-2xs uppercase tracking-wider text-[var(--content-tertiary)]">
              24h Volume
            </p>
            <p className="font-mono text-2xl font-semibold tabular-nums text-[var(--content-primary)]">
              {formatUsdValue(totals.volume)}
            </p>
          </div>
        </SpringIn>
      </div>

      {/* Sticky filter + sort bar */}
      <div className="sticky top-14 z-30 -mx-4 border-b border-[var(--border)] bg-[var(--surface)]/95 px-4 py-3 backdrop-blur-sm md:top-16 md:-mx-6 md:px-6 lg:-mx-8 lg:px-8">
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-[var(--content-secondary)]">
                Type:
              </span>
              <Tag
                closeable={false}
                onClick={() => setTypeFilter("all")}
                color={typeFilter === "all" ? "blue" : "gray"}
              >
                All
              </Tag>
              <Tag
                closeable={false}
                onClick={() => setTypeFilter("volatile")}
                color={typeFilter === "volatile" ? "blue" : "gray"}
              >
                Volatile
              </Tag>
              <Tag
                closeable={false}
                onClick={() => setTypeFilter("stable")}
                color={typeFilter === "stable" ? "green" : "gray"}
              >
                Stable
              </Tag>
              <Tag
                closeable={false}
                onClick={() => setTypeFilter("concentrated")}
                color={typeFilter === "concentrated" ? "purple" : "gray"}
              >
                Concentrated
              </Tag>
            </div>
            <div className="max-w-xs md:w-64">
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search pools…"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-[var(--content-secondary)]">
              Sort:
            </span>
            <Tag
              closeable={false}
              onClick={() => handleSort("totalApr")}
              color={sortColumn === "totalApr" ? "green" : "gray"}
            >
              Total APR{sortIndicator("totalApr")}
            </Tag>
            <Tag
              closeable={false}
              onClick={() => handleSort("tvl")}
              color={sortColumn === "tvl" ? "yellow" : "gray"}
            >
              TVL{sortIndicator("tvl")}
            </Tag>
            <Tag
              closeable={false}
              onClick={() => handleSort("feesApr")}
              color={sortColumn === "feesApr" ? "blue" : "gray"}
            >
              Fees APR{sortIndicator("feesApr")}
            </Tag>
            <Tag
              closeable={false}
              onClick={() => handleSort("emissionsApr")}
              color={sortColumn === "emissionsApr" ? "purple" : "gray"}
            >
              Emissions APY{sortIndicator("emissionsApr")}
            </Tag>
            <Tag
              closeable={false}
              onClick={() => handleSort("volume")}
              color={sortColumn === "volume" ? "yellow" : "gray"}
            >
              24h Volume{sortIndicator("volume")}
            </Tag>
          </div>
        </div>
      </div>

      {/* Pool grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Skeleton width="100%" height="220px" animation />
          <Skeleton width="100%" height="220px" animation />
          <Skeleton width="100%" height="220px" animation />
        </div>
      ) : error ? (
        <div className="rounded-xl border border-[var(--negative)] bg-[rgba(239,68,68,0.08)] p-6 text-center">
          <p className="text-sm text-[var(--negative)]">
            Failed to load pools: {error.message}
          </p>
        </div>
      ) : filteredAndSorted.length === 0 ? (
        <SpringIn delay={3} variant="card">
          <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface)] p-12 text-center">
            <p className="font-mono text-sm text-[var(--content-secondary)]">
              <span className="text-[#F7931A]">$</span> no pools match
            </p>
            <p className="mt-2 text-xs text-[var(--content-tertiary)]">
              Try a different filter or search query.
            </p>
          </div>
        </SpringIn>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredAndSorted.map((pool) => (
            <PoolCard
              key={pool.address}
              pool={pool}
              onAddIncentives={setActivePool}
            />
          ))}
        </div>
      )}

      {activePool ? (
        <AddPoolIncentiveModal
          isOpen={!!activePool}
          onClose={() => setActivePool(null)}
          pool={activePool}
        />
      ) : null}
    </div>
  )
}
