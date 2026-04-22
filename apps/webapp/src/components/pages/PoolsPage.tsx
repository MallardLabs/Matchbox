import AddPoolIncentiveModal from "@/components/AddPoolIncentiveModal"
import PoolCard from "@/components/PoolCard"
import { SpringIn } from "@/components/SpringIn"
import StandaloneVoteableCard from "@/components/StandaloneVoteableCard"
import { useAllGaugeProfiles } from "@/hooks/useGaugeProfiles"
import {
  type Pool,
  poolDailyFeesUsd,
  poolDailyVolumeUsd,
  poolEmissionsAprPercent,
  poolFeesAprPercent,
  poolTvlUsd,
  usePools,
} from "@/hooks/usePools"
import { usePoolsIncentivesApr } from "@/hooks/usePoolsIncentivesApr"
import { formatUsdValue } from "@/hooks/useTokenPrices"
import { useVotables } from "@/hooks/useVotables"
import { useVoteableTargetMetadata } from "@/hooks/useVoteableTargetMetadata"
import {
  ChevronDown,
  ChevronUp,
  Input,
  Skeleton,
  Tag,
} from "@mezo-org/mezo-clay"
import { useMemo, useState } from "react"

type SortColumn =
  | "tvl"
  | "feesApr"
  | "emissionsApr"
  | "volume"
  | "totalApr"
  | "incentives"
  | "votingApr"
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
  const { map: incentivesMap, refetch: refetchIncentives } =
    usePoolsIncentivesApr(pools)
  const { byPool: votablesByPool, standalone: standaloneVoteablesRaw } =
    useVotables()
  const { profiles: gaugeProfiles } = useAllGaugeProfiles()
  const { metadata: voteableTargetMetadata } = useVoteableTargetMetadata(
    standaloneVoteablesRaw.map((voteable) => voteable.targetId),
  )

  const [sortColumn, setSortColumn] = useState<SortColumn>("tvl")
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc")
  const [typeFilter, setTypeFilter] = useState<PoolTypeFilter>("all")
  const [search, setSearch] = useState("")
  const [gaugedOnly, setGaugedOnly] = useState(false)
  const [activePool, setActivePool] = useState<Pool | null>(null)

  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"))
    } else {
      setSortColumn(column)
      setSortDirection("desc")
    }
  }

  const getSortIndicator = (column: SortColumn): JSX.Element => {
    if (sortColumn === column) {
      return sortDirection === "asc" ? (
        <ChevronUp size={16} />
      ) : (
        <ChevronDown size={16} />
      )
    }
    return (
      <span className="opacity-30">
        <ChevronDown size={16} />
      </span>
    )
  }

  const filteredAndSorted = useMemo(() => {
    const q = search.trim().toLowerCase()
    let result = pools.filter((p) => matchesPoolType(p, typeFilter))

    if (gaugedOnly) {
      result = result.filter((p) => !!p.gauge)
    }

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

    const incentivesUsd = (p: Pool): number => {
      const v = votablesByPool.get(p.address.toLowerCase())
      const onchain = incentivesMap.get(
        p.address.toLowerCase(),
      )?.totalIncentivesUSD
      // Combine voter fees + current bribes; prefer on-chain bribes if available.
      return (v?.voterFeesUsd ?? 0) + (onchain ?? v?.bribesUsd ?? 0)
    }
    const votingAprOf = (p: Pool): number =>
      votablesByPool.get(p.address.toLowerCase())?.votingApr ?? 0
    const keyFn: Record<SortColumn, (p: Pool) => number> = {
      tvl: poolTvlUsd,
      feesApr: poolFeesAprPercent,
      emissionsApr: poolEmissionsAprPercent,
      volume: poolDailyVolumeUsd,
      // LP-only: fees + emissions (voter rewards don't accrue to LPs).
      totalApr: (p) => poolFeesAprPercent(p) + poolEmissionsAprPercent(p),
      incentives: incentivesUsd,
      votingApr: votingAprOf,
    }
    const keyFnSel = keyFn[sortColumn]

    result = [...result].sort((a, b) => {
      const av = keyFnSel(a)
      const bv = keyFnSel(b)
      const cmp = av < bv ? -1 : av > bv ? 1 : 0
      return sortDirection === "asc" ? cmp : -cmp
    })

    return result
  }, [
    pools,
    search,
    sortColumn,
    sortDirection,
    typeFilter,
    gaugedOnly,
    incentivesMap,
    votablesByPool,
  ])

  const standaloneVoteables = useMemo(() => {
    if (typeFilter !== "all") return []

    const q = search.trim().toLowerCase()
    let result = standaloneVoteablesRaw

    if (q) {
      result = result.filter((voteable) => {
        const profile = gaugeProfiles.get(voteable.gauge.toLowerCase())
        const metadata = voteableTargetMetadata.get(
          voteable.targetId.toLowerCase(),
        )

        return [
          profile?.display_name,
          profile?.description,
          metadata?.name,
          metadata?.symbol,
          voteable.targetType,
          voteable.targetId,
          voteable.gauge,
        ].some((value) => value?.toLowerCase().includes(q))
      })
    }

    const sorted = [...result]
    if (sortColumn === "incentives" || sortColumn === "votingApr") {
      sorted.sort((a, b) => {
        const av =
          sortColumn === "incentives" ? a.totalVoterIncentivesUsd : a.votingApr
        const bv =
          sortColumn === "incentives" ? b.totalVoterIncentivesUsd : b.votingApr
        const cmp = av < bv ? -1 : av > bv ? 1 : 0
        return sortDirection === "asc" ? cmp : -cmp
      })
    }

    return sorted
  }, [
    gaugeProfiles,
    search,
    sortColumn,
    sortDirection,
    standaloneVoteablesRaw,
    typeFilter,
    voteableTargetMetadata,
  ])

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

      {/* Filter + sort bar — sticky only from md up. On mobile the bar is
       * tall enough that pinning it would eat half the viewport, so we let it
       * scroll away with the rest of the content. */}
      <div className="-mx-4 border-b border-[var(--border)] bg-[var(--surface)]/95 px-4 py-3 backdrop-blur-sm md:sticky md:top-16 md:z-30 md:-mx-6 md:px-6 lg:-mx-8 lg:px-8">
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
            {(
              [
                { id: "totalApr", label: "LP APR" },
                { id: "votingApr", label: "vAPR" },
                { id: "tvl", label: "TVL" },
                { id: "feesApr", label: "Fees APR" },
                { id: "emissionsApr", label: "Emissions APY" },
                { id: "volume", label: "24h Volume" },
                { id: "incentives", label: "Incentives" },
              ] as const
            ).map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => handleSort(option.id)}
                className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs ${
                  sortColumn === option.id
                    ? "border-[var(--content-primary)] text-[var(--content-primary)]"
                    : "border-[var(--border)] text-[var(--content-secondary)]"
                }`}
              >
                {option.label}
                {getSortIndicator(option.id)}
              </button>
            ))}
            <button
              type="button"
              aria-pressed={gaugedOnly}
              onClick={() => setGaugedOnly((v) => !v)}
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs transition-colors ${
                gaugedOnly
                  ? "border-[rgba(247,147,26,0.35)] bg-[rgba(247,147,26,0.12)] text-[#F7931A]"
                  : "border-[var(--border)] text-[var(--content-secondary)] hover:border-[var(--content-tertiary)] hover:text-[var(--content-primary)]"
              }`}
            >
              <span
                className={`flex h-3.5 w-3.5 items-center justify-center rounded-sm border text-[9px] leading-none ${
                  gaugedOnly
                    ? "border-[#F7931A] bg-[#F7931A] text-white"
                    : "border-[var(--content-muted)] bg-transparent text-transparent"
                }`}
              >
                ✓
              </span>
              <span>Gauged Only</span>
            </button>
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
      ) : filteredAndSorted.length === 0 && standaloneVoteables.length === 0 ? (
        <SpringIn delay={3} variant="card">
          <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface)] p-12 text-center">
            <p className="font-mono text-sm text-[var(--content-secondary)]">
              <span className="text-[#F7931A]">$</span> no voteables match
            </p>
            <p className="mt-2 text-xs text-[var(--content-tertiary)]">
              Try a different filter or search query.
            </p>
          </div>
        </SpringIn>
      ) : (
        <div className="flex flex-col gap-6">
          {filteredAndSorted.length > 0 ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {filteredAndSorted.map((pool) => {
                const incentives = incentivesMap.get(pool.address.toLowerCase())
                const votable = votablesByPool.get(pool.address.toLowerCase())
                return (
                  <PoolCard
                    key={pool.address}
                    pool={pool}
                    onAddIncentives={setActivePool}
                    {...(incentives ? { incentives } : {})}
                    {...(votable ? { votable } : {})}
                  />
                )
              })}
            </div>
          ) : null}

          {standaloneVoteables.length > 0 ? (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-[var(--content-primary)]">
                  Vaults & Other Voteables
                </h2>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                {standaloneVoteables.map((voteable) => (
                  <StandaloneVoteableCard
                    key={voteable.id}
                    voteable={voteable}
                    metadata={voteableTargetMetadata.get(
                      voteable.targetId.toLowerCase(),
                    )}
                    profile={
                      gaugeProfiles.get(voteable.gauge.toLowerCase()) ?? null
                    }
                  />
                ))}
              </div>
            </div>
          ) : null}
        </div>
      )}

      {activePool ? (
        <AddPoolIncentiveModal
          isOpen={!!activePool}
          onClose={() => setActivePool(null)}
          pool={activePool}
          onIncentivesAdded={refetchIncentives}
          prefetchedBribeAddress={
            incentivesMap.get(activePool.address.toLowerCase())?.bribeAddress
          }
        />
      ) : null}
    </div>
  )
}
