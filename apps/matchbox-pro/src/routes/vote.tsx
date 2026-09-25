import BallotBar from "@/components/vote/BallotBar"
import BallotRail, { type BallotRow } from "@/components/vote/BallotRail"
import CheckoutSheet from "@/components/vote/CheckoutSheet"
import GaugeCard from "@/components/vote/GaugeCard"
import GaugeFilters from "@/components/vote/GaugeFilters"
import GaugePagination from "@/components/vote/GaugePagination"
import GaugeRow from "@/components/vote/GaugeRow"
import LockSelector from "@/components/vote/LockSelector"
import VoteTypeTabs from "@/components/vote/VoteTypeTabs"
import {
  type Density,
  type FilterKey,
  type SortKey,
  type VoteGaugeCard,
  compareDesc,
  isLockExpired,
  projectedSliceMicroUsd,
  voteWeightForPercent,
} from "@/components/vote/model"
import { useWalletDialog } from "@/components/wallet/WalletDialogContext"
import { useBoostGauges } from "@/hooks/useBoostGauges"
import { useGaugeWatchlist } from "@/hooks/useGaugeWatchlist"
import { useVeMEZOLocks } from "@/hooks/useLocks"
import { useBtcPrice, useMezoPrice } from "@/hooks/usePrices"
import { profileForGauge, useGaugeProfiles } from "@/hooks/useProfiles"
import { useTopology } from "@/hooks/useTopology"
import { useSequentialWrites } from "@/hooks/useWrites"
import {
  type CarouselState,
  createCarousel,
  markConfirmed,
  markFailed,
  retryItem,
} from "@/lib/carousel"
import { cn } from "@/lib/cn"
import { microUsdToTokenAmount, priceToMicroUsd } from "@/lib/money"
import {
  calculateAnnualizedReturnBasisPoints,
  optimizeRewardAllocations,
} from "@/lib/rewardOptimizer"
import { buildVoteSafeJson } from "@/lib/safeJson"
import { tokenUsdMicro } from "@/lib/tokenUsd"
import { createFileRoute } from "@tanstack/react-router"
import { type ReactElement, useEffect, useMemo, useRef, useState } from "react"
import { type Address, encodeFunctionData } from "viem"
import { useAccount } from "wagmi"

type VoteSearch = { gauge?: string | undefined }

export const Route = createFileRoute("/vote")({
  validateSearch: (search: Record<string, unknown>): VoteSearch => ({
    gauge: typeof search.gauge === "string" ? search.gauge : undefined,
  }),
  component: VotePage,
})

const PAGE_SIZE = 9

function VotePage(): ReactElement {
  const { gauge: requestedGauge } = Route.useSearch()
  const { isConnected } = useAccount()
  const { openConnect } = useWalletDialog()
  const { locks, isLoading: locksLoading } = useVeMEZOLocks()
  const { gauges, isLoading: gaugesLoading } = useBoostGauges()
  const { data: profiles } = useGaugeProfiles()
  const { data: topology } = useTopology()
  const { data: btcPrice = null } = useBtcPrice()
  const { data: mezoPrice = null } = useMezoPrice()
  const { isWatching, toggleWatching } = useGaugeWatchlist()
  const writes = useSequentialWrites()

  // null = every votable lock (the default until the user picks).
  const [pickedLocks, setPickedLocks] = useState<string[] | null>(null)
  const [ballot, setBallot] = useState<Record<string, number>>({})
  const [query, setQuery] = useState("")
  const [filter, setFilter] = useState<FilterKey>("all")
  const [needsBoostOnly, setNeedsBoostOnly] = useState(false)
  const [sort, setSort] = useState<SortKey>("apy")
  const [density, setDensity] = useState<Density>("comfortable")
  const [page, setPage] = useState(0)
  const [checkout, setCheckout] = useState(false)
  const [carousel, setCarousel] = useState<CarouselState>({ items: [] })
  const appliedGauge = useRef<string | null>(null)

  useEffect(() => {
    if (!requestedGauge || appliedGauge.current === requestedGauge) return
    const match = gauges.find(
      (gauge) => gauge.address.toLowerCase() === requestedGauge.toLowerCase(),
    )
    if (!match) return
    appliedGauge.current = requestedGauge
    setBallot((previous) =>
      match.address in previous
        ? previous
        : { ...previous, [match.address]: 0 },
    )
  }, [gauges, requestedGauge])

  const votable = locks.filter((lock) => !isLockExpired(lock))
  const votableIds = votable.map((lock) => lock.tokenId.toString())
  const selectedIds = new Set(
    pickedLocks === null
      ? votableIds
      : pickedLocks.filter((id) => votableIds.includes(id)),
  )
  const selectedLocks = votable.filter((lock) =>
    selectedIds.has(lock.tokenId.toString()),
  )
  const selectedPower = selectedLocks.reduce(
    (sum, lock) => sum + lock.votingPower,
    0n,
  )
  const assetPriceMicroUsd = mezoPrice ? priceToMicroUsd(mezoPrice) : 0n

  const cards = useMemo((): VoteGaugeCard[] => {
    const incentiveByGauge = new Map(
      (topology?.gauges ?? []).map((entry) => {
        const pills = entry.rewardTokens.map((token) => ({
          symbol: token.symbol,
          usd: tokenUsdMicro({
            amount: BigInt(token.epochAmount),
            decimals: token.decimals,
            tokenAddress: token.tokenAddress,
            symbol: token.symbol,
            btcPriceUsd: btcPrice,
            mezoPriceUsd: mezoPrice,
          }),
        }))
        return [entry.gaugeAddress.toLowerCase(), pills] as const
      }),
    )
    return gauges.map((gauge) => {
      const profile = profileForGauge(profiles, gauge.address)
      const pills = incentiveByGauge.get(gauge.address.toLowerCase()) ?? []
      const incentives = pills.reduce((sum, pill) => sum + pill.usd, 0n)
      return {
        gauge,
        profile,
        name: profile?.display_name || `Gauge ${gauge.address.slice(0, 6)}`,
        incentives,
        pills,
        apy:
          mezoPrice && gauge.totalWeight > 0n
            ? calculateAnnualizedReturnBasisPoints({
                epochRewardMicroUsd: incentives,
                votingPowers: [gauge.totalWeight],
                assetPriceMicroUsd: priceToMicroUsd(mezoPrice),
              })
            : null,
        tokenId: profile?.vebtc_token_id,
      }
    })
  }, [btcPrice, gauges, mezoPrice, profiles, topology])

  const cardByAddress = new Map(cards.map((card) => [card.gauge.address, card]))
  const needle = query.trim().toLowerCase()
  const filtered = cards
    .filter((card) => {
      if (filter === "active" && !card.gauge.isAlive) return false
      if (filter === "watching" && !isWatching(card.gauge.address)) return false
      if (needsBoostOnly && !card.gauge.needsBoost) return false
      if (!needle) return true
      return (
        card.name.toLowerCase().includes(needle) ||
        card.gauge.address.toLowerCase().includes(needle) ||
        (card.tokenId ?? "").includes(needle)
      )
    })
    .sort((a, b) => {
      if (Boolean(a.profile) !== Boolean(b.profile)) return a.profile ? -1 : 1
      if (sort === "incentives") return compareDesc(a.incentives, b.incentives)
      if (sort === "vebtc")
        return compareDesc(a.gauge.veBTCWeight ?? 0n, b.gauge.veBTCWeight ?? 0n)
      if (sort === "vemezo")
        return compareDesc(a.gauge.totalWeight, b.gauge.totalWeight)
      if (sort === "boost")
        return compareDesc(a.gauge.boostMultiplier, b.gauge.boostMultiplier)
      return compareDesc(a.apy ?? 0n, b.apy ?? 0n)
    })

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const currentPage = Math.min(page, pageCount - 1)
  const visible = filtered.slice(
    currentPage * PAGE_SIZE,
    (currentPage + 1) * PAGE_SIZE,
  )

  const ballotRows: BallotRow[] = Object.entries(ballot).map(
    ([address, percent]) => {
      const card = cardByAddress.get(address as Address)
      const usd = card
        ? projectedSliceMicroUsd(card, selectedPower, percent)
        : 0n
      const voteWeight = voteWeightForPercent(selectedPower, percent)
      return {
        address,
        name: card?.name ?? address,
        percent,
        usd,
        apy: calculateAnnualizedReturnBasisPoints({
          epochRewardMicroUsd: usd,
          votingPowers: voteWeight > 0n ? [voteWeight] : [],
          assetPriceMicroUsd,
        }),
      }
    },
  )
  const allocated = ballotRows.filter((row) => row.percent > 0)
  const ballotTotal = allocated.reduce((sum, row) => sum + row.percent, 0)
  const projected = allocated.reduce((sum, row) => sum + row.usd, 0n)
  const projectedMezo = mezoPrice
    ? microUsdToTokenAmount(projected, 18, mezoPrice)
    : null
  const gaugeAddresses = allocated.map((row) => row.address as Address)
  const weights = allocated.map((row) => BigInt(Math.round(row.percent * 100)))

  const canVote = ballotTotal === 100 && selectedLocks.length > 0
  const canOptimize = isConnected && selectedLocks.length > 0

  function setShare(address: string, percent: number): void {
    setBallot((previous) => ({ ...previous, [address]: percent }))
  }

  function updateFilters(update: () => void): void {
    update()
    setPage(0)
  }

  function toggleLock(id: string): void {
    const current = [...selectedIds]
    setPickedLocks(
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    )
  }

  function toggleBallot(address: string): void {
    setBallot((previous) => {
      if (!(address in previous)) return { ...previous, [address]: 0 }
      const { [address]: _removed, ...rest } = previous
      return rest
    })
  }

  function optimize(): void {
    const result = optimizeRewardAllocations({
      gauges: cards
        .filter((card) => card.incentives > 0n)
        .map((card) => ({
          id: card.gauge.address,
          existingWeight: card.gauge.totalWeight,
          incentiveValueMicroUsd: card.incentives,
        })),
      votingPowers: selectedLocks.map((lock) => lock.votingPower),
    })
    if (!result) return
    setBallot(
      Object.fromEntries(
        result.allocations.map((allocation) => [
          allocation.id,
          Number(allocation.basisPoints) / 100,
        ]),
      ),
    )
  }

  function voteCall(tokenId: bigint) {
    return {
      ...writes.contracts.boostVoter,
      functionName: "vote" as const,
      args: [tokenId, gaugeAddresses, weights] as const,
    }
  }

  function retryVote(id: string): void {
    setCarousel((previous) => retryItem(previous, id))
    void writes.retry(id)
  }

  async function signVote(): Promise<void> {
    setCarousel(
      createCarousel(
        selectedLocks.map((lock) => ({
          id: lock.tokenId.toString(),
          label: `Vote with veMEZO #${lock.tokenId}`,
        })),
      ),
    )
    setCheckout(true)
    await writes.run(
      selectedLocks.map((lock) => ({
        id: lock.tokenId.toString(),
        call: {
          to: writes.contracts.boostVoter.address,
          data: encodeFunctionData(voteCall(lock.tokenId)),
        },
        write: () => writes.writeContractAsync(voteCall(lock.tokenId)),
      })),
      (id, status, error) => {
        setCarousel((previous) => {
          if (status === "done") return markConfirmed(previous, id)
          if (status === "failed")
            return markFailed(previous, id, error ?? "Failed")
          return previous
        })
      },
    )
  }

  return (
    <div className="flex flex-col gap-4 pb-20 md:gap-7 md:pb-0">
      <h1 className="text-[20px] font-700 text-ink md:text-[28px] md:font-600">
        Vote
      </h1>
      <VoteTypeTabs />
      <LockSelector
        isConnected={isConnected}
        isLoading={locksLoading}
        locks={locks}
        selectedIds={selectedIds}
        selectedPower={selectedPower}
        allSelected={votable.length > 0 && selectedIds.size === votable.length}
        onToggle={toggleLock}
        onSelectAll={() => setPickedLocks(null)}
        onConnect={openConnect}
      />

      <div className="flex flex-col gap-8 xl:flex-row xl:items-start">
        <section
          aria-label="Gauges"
          className={cn(
            "flex min-w-0 flex-1 flex-col",
            density === "compact" ? "gap-3" : "gap-4 md:gap-5",
          )}
        >
          <GaugeFilters
            query={query}
            filter={filter}
            needsBoostOnly={needsBoostOnly}
            sort={sort}
            density={density}
            onQueryChange={(next) => updateFilters(() => setQuery(next))}
            onFilterChange={(next) => updateFilters(() => setFilter(next))}
            onNeedsBoostChange={(next) =>
              updateFilters(() => setNeedsBoostOnly(next))
            }
            onSortChange={setSort}
            onDensityChange={setDensity}
          />
          {!gaugesLoading && filtered.length === 0 ? (
            <div className="flex flex-col items-start gap-1.5 rounded-[10px] bg-inset px-3.5 py-4">
              <p className="text-[14px] font-650 text-ink">No matches</p>
              <button
                type="button"
                onClick={() =>
                  updateFilters(() => {
                    setQuery("")
                    setFilter("all")
                    setNeedsBoostOnly(false)
                  })
                }
                className="text-[13px] font-600 text-accent-ink hover:underline"
              >
                Clear filters
              </button>
            </div>
          ) : (
            <ul
              className={cn(
                "grid grid-cols-1",
                density === "compact"
                  ? "md:grid-cols-[repeat(auto-fill,minmax(260px,1fr))] md:gap-3"
                  : "md:grid-cols-[repeat(auto-fill,minmax(290px,1fr))] md:gap-[18px]",
                gaugesLoading && "gap-3",
              )}
            >
              {gaugesLoading
                ? ["a", "b", "c", "d", "e", "f"].map((key) => (
                    <li key={key} aria-hidden="true">
                      <GaugeCardSkeleton />
                    </li>
                  ))
                : visible.map((card) => (
                    <li key={card.gauge.address}>
                      <GaugeCard
                        card={card}
                        density={density}
                        onBallot={card.gauge.address in ballot}
                        watching={isWatching(card.gauge.address)}
                        onToggleBallot={() => toggleBallot(card.gauge.address)}
                        onToggleWatch={() => toggleWatching(card.gauge.address)}
                      />
                      <GaugeRow
                        card={card}
                        percent={ballot[card.gauge.address]}
                        onAdd={() => toggleBallot(card.gauge.address)}
                        onPercentChange={(percent) =>
                          setShare(card.gauge.address, percent)
                        }
                        onRemove={() => toggleBallot(card.gauge.address)}
                      />
                    </li>
                  ))}
            </ul>
          )}
          {gaugesLoading ? null : (
            <GaugePagination
              page={currentPage}
              pageCount={pageCount}
              onPageChange={setPage}
            />
          )}
        </section>

        <BallotRail
          isConnected={isConnected}
          canOptimize={canOptimize}
          canVote={canVote}
          rows={ballotRows}
          total={ballotTotal}
          projected={projected}
          projectedMezo={projectedMezo}
          onOptimize={optimize}
          onStep={setShare}
          onVote={() => void signVote()}
          onConnect={openConnect}
        />
      </div>

      <BallotBar
        isConnected={isConnected}
        canVote={canVote}
        canOptimize={canOptimize}
        gaugeCount={allocated.length}
        total={ballotTotal}
        projected={projected}
        onReview={() => void signVote()}
        onOptimize={optimize}
        onConnect={openConnect}
      />

      <CheckoutSheet
        open={checkout}
        onOpenChange={setCheckout}
        ballot={allocated}
        projected={projected}
        projectedMezo={projectedMezo}
        projectedApy={calculateAnnualizedReturnBasisPoints({
          epochRewardMicroUsd: projected,
          votingPowers: selectedPower > 0n ? [selectedPower] : [],
          assetPriceMicroUsd,
        })}
        carousel={carousel}
        safeJson={
          selectedLocks.length >= 2
            ? buildVoteSafeJson({
                chainId: writes.contracts.boostVoter.chainId,
                safeAddress: writes.contracts.boostVoter.address,
                calls: selectedLocks.map((lock) => ({
                  to: writes.contracts.boostVoter.address,
                  value: 0n,
                  data: encodeFunctionData(voteCall(lock.tokenId)),
                })),
              })
            : null
        }
        onRetry={retryVote}
      />
    </div>
  )
}

function GaugeCardSkeleton(): ReactElement {
  return (
    <div className="flex h-[264px] flex-col gap-3 overflow-hidden rounded-xl border border-line bg-surface pt-4">
      <div className="flex items-center gap-2.5 px-3.5">
        <div className="size-10 rounded-full bg-inset" />
        <div className="flex flex-1 flex-col gap-1.5">
          <div className="h-4 w-2/5 rounded bg-inset" />
          <div className="h-3 w-3/5 rounded bg-inset" />
        </div>
      </div>
      <div className="flex gap-9 px-3.5">
        {["a", "b", "c"].map((key) => (
          <div key={key} className="flex flex-col gap-1">
            <div className="h-3 w-10 rounded bg-inset" />
            <div className="h-4 w-14 rounded bg-inset" />
          </div>
        ))}
      </div>
      <div className="mx-3.5 h-10 w-24 rounded bg-inset" />
      <div className="mt-auto h-2 bg-inset-2" />
    </div>
  )
}
