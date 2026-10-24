import { LockCarouselSelector } from "@/components/LockCarouselSelector"
import PaginationControls from "@/components/PaginationControls"
import { TokenPairIcon } from "@/components/PoolCard"
import PoolGaugeVotingCard, {
  poolPairName,
  poolTypeLabel,
} from "@/components/PoolGaugeVotingCard"
import RewardOptimizerPanel, {
  type RewardOptimizerFeedback,
} from "@/components/RewardOptimizerPanel"
import { getContractConfig } from "@/config/contracts"
import { useNetwork } from "@/contexts/NetworkContext"
import { useVeBTCLocks } from "@/hooks/useLocks"
import useMultiVeBTCBallotVoting from "@/hooks/useMultiVeBTCBallotVoting"
import { usePagination } from "@/hooks/usePagination"
import {
  type GaugedPool,
  isGaugedPool,
  usePoolVotingMetrics,
} from "@/hooks/usePoolVotingMetrics"
import { usePools } from "@/hooks/usePools"
import {
  type PoolVoteSortEntry,
  type PoolVoteSortMode,
  comparePoolVoteSortEntries,
  pricedRewardMicroUsd,
  sumUsdStringsMicroUsd,
  usdStringToMicroUsd,
} from "@/utils/poolVoting"
import {
  type RewardOptimizerResult,
  calculateAnnualizedReturnBasisPoints,
  optimizeRewardAllocations,
} from "@/utils/rewardOptimizer"
import {
  calculateValidatorApyBasisPoints,
  decimalToScaledBigInt,
} from "@/utils/validatorApy"
import {
  aggregateSelectedVoteBasisPoints,
  allocationTotalBasisPoints,
  basisPointsToPercentage,
  calculateProjectedValidatorWeight,
  equalVoteBasisPoints,
  percentageToBasisPoints,
} from "@/utils/validatorVoting"
import {
  Button,
  Card,
  Input,
  Modal,
  ModalBody,
  Skeleton,
  Tag,
} from "@mezo-org/mezo-clay"
import Link from "next/link"
import { useDeferredValue, useEffect, useMemo, useState } from "react"
import { useAccount, useReadContract, useReadContracts } from "wagmi"

type SortDirection = "asc" | "desc"
type PoolTypeFilter = "all" | "volatile" | "stable" | "concentrated"

const POOLS_PER_PAGE = 9

const SORT_OPTIONS: readonly { id: PoolVoteSortMode; label: string }[] = [
  { id: "rewards", label: "Rewards" },
  { id: "apy", label: "vAPY" },
  { id: "share", label: "Share" },
  { id: "weight", label: "BTC Weight" },
  { id: "tvl", label: "TVL" },
  { id: "volume", label: "Volume" },
  { id: "name", label: "Name" },
]

const TYPE_FILTERS: readonly { id: PoolTypeFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "volatile", label: "Volatile" },
  { id: "stable", label: "Stable" },
  { id: "concentrated", label: "Concentrated" },
]

function formatBasisPoints(value: bigint): string {
  const whole = value / 100n
  const fraction = (value % 100n).toString().padStart(2, "0")
  return `${whole}.${fraction}`
}

function matchesPoolType(pool: GaugedPool, filter: PoolTypeFilter): boolean {
  if (filter === "all") return true
  if (filter === "concentrated") return pool.type === "concentrated"
  if (pool.type === "concentrated") return false
  return filter === "stable"
    ? pool.volatility === "stable"
    : pool.volatility !== "stable"
}

function poolKey(pool: GaugedPool): string {
  return pool.address.toLowerCase()
}

type PoolCartRowProps = {
  pool: GaugedPool
  allocation: string
  onAllocationChange: (value: string) => void
  onRemove: () => void
}

function PoolCartRow({
  pool,
  allocation,
  onAllocationChange,
  onRemove,
}: PoolCartRowProps): JSX.Element {
  const displayName = poolPairName(pool)

  return (
    <li className="rounded-lg border border-[var(--border)] p-3">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <TokenPairIcon
            symbol0={pool.token0.symbol}
            symbol1={pool.token1.symbol}
            size={28}
          />
          <div className="min-w-0">
            <Link
              href={`/pools/${pool.address}`}
              className="block truncate text-sm font-semibold text-[var(--content-primary)] no-underline"
            >
              {displayName}
            </Link>
            <p className="truncate font-mono text-2xs text-[var(--content-tertiary)]">
              {poolTypeLabel(pool)} · {pool.address.slice(0, 8)}…
              {pool.address.slice(-6)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <label
            htmlFor={`cart-pool-${pool.address}`}
            className="whitespace-nowrap text-xs text-[var(--content-secondary)]"
          >
            Vote %
          </label>
          <Input
            id={`cart-pool-${pool.address}`}
            type="number"
            min={0}
            max={100}
            step={0.01}
            value={allocation}
            onChange={(event) => onAllocationChange(event.target.value)}
            placeholder="0"
            size="small"
            positive={allocation.trim() !== "" && allocation !== "0"}
            overrides={{ Root: { style: { width: "90px" } } }}
          />
          <Button kind="secondary" size="small" onClick={onRemove}>
            <span className="sr-only">Remove {displayName} from cart</span>
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
              <path d="M10 11v6" />
              <path d="M14 11v6" />
              <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
            </svg>
          </Button>
        </div>
      </div>
    </li>
  )
}

export default function PoolVotingPage(): JSX.Element {
  const { chainId } = useNetwork()
  const { isConnected } = useAccount()
  const contracts = getContractConfig(chainId)
  const { locks, isLoading: isLoadingLocks } = useVeBTCLocks()
  const {
    pools,
    isLoading: isLoadingPools,
    error: poolsError,
    refetch: refetchPools,
  } = usePools()
  const gaugedPools = useMemo(() => pools.filter(isGaugedPool), [pools])
  const {
    map: poolMetrics,
    totalWeight,
    btcPriceUsd,
    isLoading: isLoadingPoolMetrics,
    error: poolMetricsError,
    refetch: refetchPoolMetrics,
  } = usePoolVotingMetrics(gaugedPools)
  // Killed gauges reject votes, so they never enter the ballot.
  const votablePools = useMemo(
    () =>
      gaugedPools.filter(
        (pool) => poolMetrics.get(poolKey(pool))?.isAlive !== false,
      ),
    [gaugedPools, poolMetrics],
  )
  const [selectedLockIndexes, setSelectedLockIndexes] = useState<Set<number>>(
    new Set(),
  )
  const [selectedPoolKeys, setSelectedPoolKeys] = useState<Set<string>>(
    new Set(),
  )
  const [allocations, setAllocations] = useState<Record<string, string>>({})
  const [search, setSearch] = useState("")
  const deferredSearch = useDeferredValue(search)
  const [typeFilter, setTypeFilter] = useState<PoolTypeFilter>("all")
  const [rewardedOnly, setRewardedOnly] = useState(false)
  const [sortMode, setSortMode] = useState<PoolVoteSortMode>("rewards")
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc")
  const [cartOpen, setCartOpen] = useState(false)
  const [optimizerFeedback, setOptimizerFeedback] =
    useState<RewardOptimizerFeedback | null>(null)
  const multiVote = useMultiVeBTCBallotVoting("pools")

  const selectedLocks = useMemo(
    () =>
      Array.from(selectedLockIndexes)
        .sort((a, b) => a - b)
        .flatMap((index) => (locks[index] ? [locks[index]] : [])),
    [locks, selectedLockIndexes],
  )
  const currentEpochTimestamp = useMemo(
    () => BigInt(Math.floor(Date.now() / 60_000) * 60),
    [],
  )
  const { data: epochStart, isLoading: isLoadingEpochStart } = useReadContract({
    ...contracts.poolsVoter,
    functionName: "epochStart",
    args: [currentEpochTimestamp],
  })
  const { data: lastVotedResults, isLoading: isLoadingLastVoted } =
    useReadContracts({
      contracts: selectedLocks.map((lock) => ({
        ...contracts.poolsVoter,
        functionName: "lastVoted" as const,
        args: [lock.tokenId] as const,
      })),
      query: { enabled: selectedLocks.length > 0 },
    })
  const selectedLockStates = selectedLocks.map((lock, index) => {
    const lastVoted = lastVotedResults?.[index]?.result as bigint | undefined
    return {
      lock,
      eligible:
        epochStart !== undefined &&
        lastVoted !== undefined &&
        lastVoted < epochStart,
    }
  })
  const eligibleLocks = selectedLockStates.flatMap((state) =>
    state.eligible ? [state.lock] : [],
  )
  const {
    data: selectedUsedWeightResults,
    isLoading: isLoadingSelectedUsedWeights,
  } = useReadContracts({
    contracts: selectedLocks.map((lock) => ({
      ...contracts.poolsVoter,
      functionName: "usedWeights" as const,
      args: [lock.tokenId] as const,
    })),
    query: { enabled: selectedLocks.length > 0 },
  })
  // PoolsVoter tallies votes by pool address, not by gauge.
  const { data: selectedVoteResults, isLoading: isLoadingSelectedVotes } =
    useReadContracts({
      contracts: selectedLocks.flatMap((lock) =>
        gaugedPools.map((pool) => ({
          ...contracts.poolsVoter,
          functionName: "votes" as const,
          args: [lock.tokenId, pool.address] as const,
        })),
      ),
      query: {
        enabled: selectedLocks.length > 0 && gaugedPools.length > 0,
      },
    })
  const isLoadingSelectedPoolState =
    selectedLocks.length > 0 &&
    (isLoadingEpochStart ||
      isLoadingLastVoted ||
      isLoadingSelectedUsedWeights ||
      isLoadingSelectedVotes)

  const selectedVotesByPool = useMemo(() => {
    const result = new Map<
      string,
      {
        vote: bigint
        usedWeight: bigint
        votingPower: bigint
        eligible: boolean
      }[]
    >()
    gaugedPools.forEach((pool, poolIndex) => {
      result.set(
        poolKey(pool),
        selectedLockStates.map((state, lockIndex) => ({
          vote:
            (selectedVoteResults?.[lockIndex * gaugedPools.length + poolIndex]
              ?.result as bigint | undefined) ?? 0n,
          usedWeight:
            (selectedUsedWeightResults?.[lockIndex]?.result as
              | bigint
              | undefined) ?? 0n,
          votingPower: state.lock.votingPower,
          eligible: state.eligible,
        })),
      )
    })
    return result
  }, [
    gaugedPools,
    selectedLockStates,
    selectedUsedWeightResults,
    selectedVoteResults,
  ])

  const poolOptimizerData = useMemo(() => {
    let unpricedIncentiveCount = 0
    const optimizerGauges = votablePools.map((pool) => {
      const metric = poolMetrics.get(poolKey(pool))
      const priced = pricedRewardMicroUsd([
        ...(metric?.bribes ?? []),
        ...(metric?.voterFees ?? []),
      ])
      unpricedIncentiveCount += priced.unpricedCount

      return {
        id: poolKey(pool),
        existingWeight: calculateProjectedValidatorWeight(
          metric?.weight ?? 0n,
          selectedVotesByPool.get(poolKey(pool)) ?? [],
          0n,
        ),
        incentiveValueMicroUsd: priced.valueMicroUsd,
      }
    })

    return { optimizerGauges, unpricedIncentiveCount }
  }, [poolMetrics, selectedVotesByPool, votablePools])
  const poolOptimizerInputFingerprint = useMemo(
    () =>
      [
        ...eligibleLocks.map(
          (lock) => `${lock.tokenId.toString()}:${lock.votingPower.toString()}`,
        ),
        ...poolOptimizerData.optimizerGauges.map(
          (gauge) =>
            `${gauge.id}:${gauge.existingWeight.toString()}:${gauge.incentiveValueMicroUsd.toString()}`,
        ),
        btcPriceUsd ?? "unpriced",
      ].join("|"),
    [btcPriceUsd, eligibleLocks, poolOptimizerData],
  )

  useEffect(() => {
    void poolOptimizerInputFingerprint
    setOptimizerFeedback(null)
  }, [poolOptimizerInputFingerprint])

  const currentAllocations = useMemo(
    () =>
      new Map(
        gaugedPools.map((pool) => [
          poolKey(pool),
          aggregateSelectedVoteBasisPoints(
            selectedVotesByPool.get(poolKey(pool)) ?? [],
          ),
        ]),
      ),
    [gaugedPools, selectedVotesByPool],
  )

  const filteredPools = useMemo(() => {
    const query = deferredSearch.trim().toLowerCase()
    const result = votablePools.filter((pool) => {
      if (!matchesPoolType(pool, typeFilter)) return false
      if (rewardedOnly) {
        const rewards = poolMetrics.get(poolKey(pool))?.totalRewardsMicroUsd
        if (rewards === 0n) return false
      }
      return (
        !query ||
        pool.name.toLowerCase().includes(query) ||
        pool.symbol.toLowerCase().includes(query) ||
        pool.token0.symbol.toLowerCase().includes(query) ||
        pool.token1.symbol.toLowerCase().includes(query) ||
        pool.address.toLowerCase().includes(query) ||
        pool.gauge.toLowerCase().includes(query)
      )
    })

    const toSortEntry = (pool: GaugedPool): PoolVoteSortEntry => {
      const metric = poolMetrics.get(poolKey(pool))
      const weight = metric?.weight ?? 0n
      return {
        pool: pool.address,
        name: poolPairName(pool),
        weight,
        shareBasisPoints:
          totalWeight > 0n ? (weight * 10_000n) / totalWeight : 0n,
        rewardsMicroUsd: metric?.totalRewardsMicroUsd ?? null,
        apyBasisPoints: metric?.apyBasisPoints ?? null,
        tvlMicroUsd: usdStringToMicroUsd(pool.tvl),
        volumeMicroUsd: sumUsdStringsMicroUsd(
          pool.stats.volume.map((stat) => stat.amountUSD),
        ),
      }
    }
    return [...result].sort((a, b) =>
      comparePoolVoteSortEntries(
        toSortEntry(a),
        toSortEntry(b),
        sortMode,
        sortDirection,
      ),
    )
  }, [
    deferredSearch,
    poolMetrics,
    rewardedOnly,
    sortDirection,
    sortMode,
    totalWeight,
    typeFilter,
    votablePools,
  ])

  const {
    currentPage,
    totalPages,
    pageStart,
    pageEnd,
    paginatedItems,
    goToPreviousPage,
    goToNextPage,
  } = usePagination(filteredPools, {
    pageSize: POOLS_PER_PAGE,
    resetDeps: [
      deferredSearch,
      sortMode,
      sortDirection,
      typeFilter,
      rewardedOnly,
    ],
  })

  const selectedPools = useMemo(
    () => votablePools.filter((pool) => selectedPoolKeys.has(poolKey(pool))),
    [selectedPoolKeys, votablePools],
  )
  const allocationValues = selectedPools.map(
    (pool) => allocations[poolKey(pool)] ?? "",
  )
  const allocationTotal = allocationTotalBasisPoints(allocationValues)
  const allocationEntries = selectedPools.flatMap((pool) => {
    const raw = allocations[poolKey(pool)] ?? ""
    const basisPoints = percentageToBasisPoints(raw)
    return basisPoints && basisPoints > 0n ? [{ pool, raw, basisPoints }] : []
  })
  const ballotPools = allocationEntries.map((entry) => entry.pool.address)
  const ballotWeights = allocationEntries.map((entry) => entry.basisPoints)
  const isAllocationValid = allocationTotal === 10_000n
  const canVote =
    isConnected &&
    eligibleLocks.length > 0 &&
    allocationEntries.length === selectedPools.length &&
    allocationEntries.length > 0 &&
    isAllocationValid &&
    !multiVote.isInProgress

  useEffect(() => {
    if (selectedPoolKeys.size === 0) setCartOpen(false)
  }, [selectedPoolKeys.size])

  function toggleLock(index: number) {
    setOptimizerFeedback(null)
    setSelectedLockIndexes((current) => {
      const next = new Set(current)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }

  function updateAllocation(key: string, value: string) {
    setOptimizerFeedback(null)
    setAllocations((current) => ({ ...current, [key]: value }))
  }

  function togglePool(pool: GaugedPool) {
    setOptimizerFeedback(null)
    const key = poolKey(pool)
    setSelectedPoolKeys((current) => {
      const next = new Set(current)
      if (next.has(key)) {
        next.delete(key)
        setAllocations((currentAllocations) => {
          const nextAllocations = { ...currentAllocations }
          delete nextAllocations[key]
          return nextAllocations
        })
      } else {
        const parsed = percentageToBasisPoints(allocations[key] ?? "")
        if (parsed && parsed > 0n) next.add(key)
      }
      return next
    })
  }

  function clearCart() {
    setOptimizerFeedback(null)
    setSelectedPoolKeys(new Set())
    setAllocations({})
    multiVote.clear()
  }

  function voteEquallyAcrossPools(targetPools: readonly GaugedPool[]) {
    setOptimizerFeedback(null)
    const weights = equalVoteBasisPoints(targetPools.length)
    const nextAllocations: Record<string, string> = {}
    const nextSelected = new Set<string>()
    targetPools.forEach((pool, index) => {
      const weight = weights[index]
      if (weight === undefined || weight === 0n) return
      nextSelected.add(poolKey(pool))
      nextAllocations[poolKey(pool)] = basisPointsToPercentage(weight)
    })
    setAllocations(nextAllocations)
    setSelectedPoolKeys(nextSelected)
  }

  function optimizePoolAllocation() {
    const votingPowers = eligibleLocks.map((lock) => lock.votingPower)
    const result = optimizeRewardAllocations({
      gauges: poolOptimizerData.optimizerGauges,
      votingPowers,
    })
    if (!result) {
      setOptimizerFeedback({
        result: null,
        annualizedReturnBasisPoints: null,
        message:
          "No active pool gauge currently has both priced voter rewards and eligible selected voting power.",
      })
      return
    }

    applyOptimizedPoolAllocation(result)
    const assetPriceMicroUsd =
      btcPriceUsd === null ? 0n : decimalToScaledBigInt(btcPriceUsd, 6)
    setOptimizerFeedback({
      result,
      annualizedReturnBasisPoints: calculateAnnualizedReturnBasisPoints({
        epochRewardMicroUsd: result.projectedRewardMicroUsd,
        votingPowers,
        assetPriceMicroUsd,
      }),
      message: null,
    })
  }

  function applyOptimizedPoolAllocation(result: RewardOptimizerResult) {
    const knownKeys = new Set(votablePools.map(poolKey))
    const nextAllocations: Record<string, string> = {}
    const nextSelected = new Set<string>()
    for (const allocation of result.allocations) {
      if (!knownKeys.has(allocation.id)) continue
      nextSelected.add(allocation.id)
      nextAllocations[allocation.id] = basisPointsToPercentage(
        allocation.basisPoints,
      )
    }

    setAllocations(nextAllocations)
    setSelectedPoolKeys(nextSelected)
  }

  function handleSort(nextSort: PoolVoteSortMode) {
    if (sortMode === nextSort) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"))
      return
    }
    setSortMode(nextSort)
    setSortDirection(nextSort === "name" ? "asc" : "desc")
  }

  function projectedApyFor(pool: GaugedPool): bigint | null {
    const metric = poolMetrics.get(poolKey(pool))
    const allocationBasisPoints = percentageToBasisPoints(
      allocations[poolKey(pool)] ?? "",
    )
    if (
      metric?.totalRewardsMicroUsd === null ||
      metric?.totalRewardsMicroUsd === undefined ||
      btcPriceUsd === null ||
      allocationBasisPoints === null
    ) {
      return metric?.apyBasisPoints ?? null
    }
    return calculateValidatorApyBasisPoints(
      metric.totalRewardsMicroUsd,
      calculateProjectedValidatorWeight(
        metric.weight,
        selectedVotesByPool.get(poolKey(pool)) ?? [],
        allocationBasisPoints,
      ),
      btcPriceUsd,
    )
  }

  async function submitVote() {
    if (!canVote) return
    const result = await multiVote.voteAll(
      eligibleLocks.map((lock) => lock.tokenId),
      ballotPools,
      ballotWeights,
    )
    if (result.successCount > 0) {
      refetchPoolMetrics()
      await refetchPools()
    }
    if (result.errorCount === 0) {
      setCartOpen(false)
      setSelectedPoolKeys(new Set())
      setAllocations({})
      setOptimizerFeedback(null)
    }
  }

  const loadError = poolsError ?? poolMetricsError

  if (isLoadingPools || (isConnected && isLoadingLocks)) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton width="100%" height="180px" animation />
        <Skeleton width="100%" height="540px" animation />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5 pb-24">
      <header>
        <h1 className="text-balance text-2xl font-semibold text-[var(--content-primary)]">
          <span className="text-[#F7931A]">$</span> pools --vote
        </h1>
        <p className="mt-1 text-pretty text-sm text-[var(--content-secondary)]">
          Direct veBTC voting power to Mezo pool gauges to steer MEZO emissions
          and earn each pool&apos;s bribes and trading fees. Build one ballot
          and apply it to every eligible selected NFT.
        </p>
      </header>

      {!isConnected ? (
        <Card withBorder overrides={{}}>
          <div className="p-6 text-center">
            <h2 className="text-balance text-lg font-semibold text-[var(--content-primary)]">
              Connect your wallet to vote
            </h2>
            <p className="mt-2 text-pretty text-sm text-[var(--content-secondary)]">
              The pool directory is public. Connect to select veBTC NFTs and
              submit a ballot.
            </p>
          </div>
        </Card>
      ) : locks.length === 0 ? (
        <Card withBorder overrides={{}}>
          <div className="p-10 text-center">
            <p className="text-sm text-[var(--content-secondary)]">
              You do not own a veBTC NFT yet.
            </p>
            <a
              href="https://mezo.org/earn/lock"
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-block text-sm text-[#F7931A]"
            >
              Lock BTC on Mezo Earn
            </a>
          </div>
        </Card>
      ) : (
        <Card withBorder overrides={{}}>
          <div className="py-4">
            <LockCarouselSelector
              locks={locks}
              selectedIndex={undefined}
              multiSelect
              selectedIndexes={selectedLockIndexes}
              onToggle={toggleLock}
              lockType="veBTC"
              label="Select veBTC NFTs"
            />
          </div>
        </Card>
      )}

      {selectedLocks.length > eligibleLocks.length &&
        !isLoadingSelectedPoolState && (
          <p className="rounded-lg border border-[var(--warning)] p-3 text-pretty text-xs text-[var(--warning)]">
            {selectedLocks.length - eligibleLocks.length} selected NFT
            {selectedLocks.length - eligibleLocks.length === 1
              ? " has"
              : "s have"}{" "}
            already voted on pools this epoch and will be skipped until reset or
            the next epoch.
          </p>
        )}

      {loadError ? (
        <p className="rounded-lg border border-[var(--negative)] p-3 text-sm text-[var(--negative)]">
          Pool voting data is unavailable right now. Please try again shortly.
        </p>
      ) : (
        <Card title="Allocate Voting Power" withBorder overrides={{}}>
          <div className="py-4">
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-[var(--content-secondary)]">
                  {filteredPools.length} pool gauge
                  {filteredPools.length === 1 ? "" : "s"}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <p
                    className={`font-mono text-xs tabular-nums ${
                      selectedPools.length > 0 && !isAllocationValid
                        ? "text-[var(--negative)]"
                        : "text-[var(--content-secondary)]"
                    }`}
                  >
                    Total:{" "}
                    {allocationTotal === null
                      ? "Invalid"
                      : `${formatBasisPoints(allocationTotal)}%`}
                  </p>
                  <Button
                    kind="secondary"
                    size="small"
                    disabled={filteredPools.length === 0}
                    onClick={() => voteEquallyAcrossPools(filteredPools)}
                  >
                    Vote equally across shown
                  </Button>
                </div>
              </div>

              <RewardOptimizerPanel
                assetLabel="veBTC"
                disabled={eligibleLocks.length === 0}
                disabledMessage={
                  selectedLocks.length === 0
                    ? "Select at least one veBTC NFT to calculate an optimized ballot."
                    : isLoadingSelectedPoolState
                      ? "Loading the selected NFTs and their prior allocations."
                      : "None of the selected veBTC NFTs are eligible to vote on pools in this epoch."
                }
                isLoading={isLoadingPoolMetrics || isLoadingSelectedPoolState}
                unpricedIncentiveCount={
                  poolOptimizerData.unpricedIncentiveCount
                }
                feedback={optimizerFeedback}
                onOptimize={optimizePoolAllocation}
              />

              <Input
                id="pool-vote-search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search pools by token, name, or address..."
                size="small"
              />

              <fieldset className="flex flex-col gap-3">
                <legend className="sr-only">Pool filters and sorting</legend>
                <ol className="flex flex-col gap-3">
                  <li className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-[var(--content-secondary)]">
                      Type:
                    </span>
                    {TYPE_FILTERS.map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        aria-pressed={typeFilter === option.id}
                        onClick={() => setTypeFilter(option.id)}
                        className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs ${
                          typeFilter === option.id
                            ? "border-[var(--content-primary)] text-[var(--content-primary)]"
                            : "border-[var(--border)] text-[var(--content-secondary)]"
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                    <label className="ml-1 inline-flex items-center gap-2 text-xs text-[var(--content-secondary)]">
                      <input
                        type="checkbox"
                        checked={rewardedOnly}
                        onChange={(event) =>
                          setRewardedOnly(event.target.checked)
                        }
                        className="accent-[#F7931A]"
                      />
                      With voter rewards only
                    </label>
                  </li>
                  <li className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-[var(--content-secondary)]">
                      Sort:
                    </span>
                    {SORT_OPTIONS.map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => handleSort(option.id)}
                        className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs ${
                          sortMode === option.id
                            ? "border-[var(--content-primary)] text-[var(--content-primary)]"
                            : "border-[var(--border)] text-[var(--content-secondary)]"
                        }`}
                      >
                        {option.label}
                        {sortMode === option.id &&
                          (sortDirection === "asc" ? " ↑" : " ↓")}
                      </button>
                    ))}
                  </li>
                </ol>
              </fieldset>

              {votablePools.length === 0 ? (
                <p className="text-sm text-[var(--content-secondary)]">
                  No pool gauges are currently available to vote on.
                </p>
              ) : filteredPools.length === 0 ? (
                <div className="rounded-lg border border-dashed border-[var(--border)] p-8 text-center">
                  <p className="text-sm text-[var(--content-secondary)]">
                    No pool gauges match your filters.
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  <fieldset>
                    <legend className="sr-only">Pool vote allocation</legend>
                    <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      {paginatedItems.map((pool) => (
                        <li key={pool.address} className="min-w-0">
                          <PoolGaugeVotingCard
                            pool={pool}
                            totalWeight={totalWeight}
                            metric={poolMetrics.get(poolKey(pool))}
                            isLoadingMetrics={isLoadingPoolMetrics}
                            allocation={allocations[poolKey(pool)] ?? ""}
                            currentAllocation={
                              currentAllocations.get(poolKey(pool)) ?? 0n
                            }
                            projectedApyBasisPoints={projectedApyFor(pool)}
                            isSelected={selectedPoolKeys.has(poolKey(pool))}
                            onAllocationChange={(value) =>
                              updateAllocation(poolKey(pool), value)
                            }
                            onToggleSelection={() => togglePool(pool)}
                          />
                        </li>
                      ))}
                    </ol>
                  </fieldset>
                  <PaginationControls
                    currentPage={currentPage}
                    totalPages={totalPages}
                    pageStart={pageStart}
                    pageEnd={pageEnd}
                    totalItems={filteredPools.length}
                    itemLabel="pool gauge"
                    onPrevious={goToPreviousPage}
                    onNext={goToNextPage}
                  />
                </div>
              )}
            </div>
          </div>
        </Card>
      )}

      <Modal
        isOpen={cartOpen}
        onClose={() => setCartOpen(false)}
        overrides={{
          Dialog: {
            style: {
              maxWidth: "720px",
              width: "100%",
              padding: "0",
              position: "fixed",
              bottom: "0",
              left: "0",
              right: "0",
              margin: "0 auto",
              borderTopLeftRadius: "16px",
              borderTopRightRadius: "16px",
            },
          },
          Close: { style: { top: "12px", right: "12px" } },
        }}
      >
        <ModalBody $style={{ padding: "16px" }}>
          <div className="flex flex-col gap-4">
            <header className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-wider text-[var(--content-tertiary)]">
                  Shopping cart
                </p>
                <h2 className="text-balance text-lg font-semibold text-[var(--content-primary)]">
                  Pool vote allocations
                </h2>
              </div>
              <div className="flex items-center gap-2">
                <Tag closeable={false} color="blue">
                  {selectedPools.length} selected
                </Tag>
                <Tag
                  closeable={false}
                  color={isAllocationValid ? "green" : "yellow"}
                >
                  Total{" "}
                  {allocationTotal === null
                    ? "Invalid"
                    : `${formatBasisPoints(allocationTotal)}%`}
                </Tag>
              </div>
            </header>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-pretty text-xs text-[var(--content-secondary)]">
                This shared ballot will be applied to {eligibleLocks.length}{" "}
                eligible veBTC NFT{eligibleLocks.length === 1 ? "" : "s"}.
              </p>
              <Button
                kind="secondary"
                size="small"
                onClick={() => voteEquallyAcrossPools(selectedPools)}
              >
                Equal vote
              </Button>
            </div>

            <fieldset className="rounded-lg border border-[var(--border)] p-4">
              <legend className="px-2 text-xs uppercase tracking-wider text-[var(--content-tertiary)]">
                Vote weights
              </legend>
              <ol className="mt-4 flex max-h-[42vh] flex-col gap-3 overflow-y-auto pr-1">
                {selectedPools.map((pool) => (
                  <PoolCartRow
                    key={pool.address}
                    pool={pool}
                    allocation={allocations[poolKey(pool)] ?? ""}
                    onAllocationChange={(value) =>
                      updateAllocation(poolKey(pool), value)
                    }
                    onRemove={() => togglePool(pool)}
                  />
                ))}
              </ol>
            </fieldset>

            {!isAllocationValid && selectedPools.length > 0 && (
              <p className="text-pretty text-xs text-[var(--negative)]">
                Allocation must equal exactly 100% before voting.
              </p>
            )}

            {multiVote.lockStates.length > 0 && (
              <div className="rounded-lg border border-[var(--border)] p-3">
                <p className="mb-3 text-xs font-semibold text-[var(--content-primary)]">
                  {multiVote.isInProgress
                    ? multiVote.executionMode === "batched"
                      ? "Confirm batch in wallet"
                      : "Signing transactions"
                    : "Transaction results"}
                </p>
                <ol className="flex flex-col gap-2">
                  {multiVote.lockStates.map((state) => (
                    <li
                      key={state.tokenId.toString()}
                      className="flex items-center justify-between text-xs"
                    >
                      <span className="font-mono text-[var(--content-primary)]">
                        veBTC #{state.tokenId.toString()}
                      </span>
                      <span
                        className={
                          state.status === "error"
                            ? "text-[var(--negative)]"
                            : state.status === "success"
                              ? "text-[var(--positive)]"
                              : "text-[var(--content-secondary)]"
                        }
                      >
                        {state.status}
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {multiVote.error && (
              <p className="text-pretty text-xs text-[var(--negative)]">
                {multiVote.error.message}
              </p>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap gap-2">
                <Button
                  kind="secondary"
                  size="small"
                  disabled={
                    selectedLocks.length === 0 || multiVote.isInProgress
                  }
                  onClick={() =>
                    void multiVote.pokeAll(
                      selectedLocks.map((lock) => lock.tokenId),
                    )
                  }
                >
                  Poke selected
                </Button>
                <Button
                  kind="secondary"
                  size="small"
                  disabled={
                    selectedLocks.length === 0 || multiVote.isInProgress
                  }
                  onClick={() =>
                    void multiVote.resetAll(
                      selectedLocks.map((lock) => lock.tokenId),
                    )
                  }
                >
                  Reset selected
                </Button>
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                {multiVote.canExportSafeBatch && eligibleLocks.length > 1 && (
                  <Button
                    kind="secondary"
                    onClick={() =>
                      void multiVote.exportVoteBatch(
                        eligibleLocks.map((lock) => lock.tokenId),
                        ballotPools,
                        ballotWeights,
                      )
                    }
                  >
                    Export Safe batch
                  </Button>
                )}
                {multiVote.canCopyBatchJson && eligibleLocks.length > 1 && (
                  <Button
                    kind="tertiary"
                    onClick={() =>
                      void multiVote.copyVoteBatchJson(
                        eligibleLocks.map((lock) => lock.tokenId),
                        ballotPools,
                        ballotWeights,
                      )
                    }
                  >
                    {multiVote.copiedBatchJson ? "Copied" : "Copy tx JSON"}
                  </Button>
                )}
                <Button kind="tertiary" onClick={() => setCartOpen(false)}>
                  Cancel
                </Button>
                <Button
                  kind="primary"
                  disabled={!canVote}
                  isLoading={multiVote.isInProgress}
                  onClick={() => void submitVote()}
                >
                  Vote
                </Button>
                {multiVote.lockStates.some(
                  (state) => state.status === "error",
                ) && (
                  <Button
                    kind="secondary"
                    disabled={!isAllocationValid || multiVote.isInProgress}
                    onClick={() =>
                      void multiVote.voteAll(
                        multiVote.lockStates
                          .filter((state) => state.status === "error")
                          .map((state) => state.tokenId),
                        ballotPools,
                        ballotWeights,
                      )
                    }
                  >
                    Retry failed
                  </Button>
                )}
              </div>
            </div>
          </div>
        </ModalBody>
      </Modal>

      {selectedPoolKeys.size > 0 && (
        <div className="fixed bottom-3 left-0 right-0 z-40 px-3 sm:bottom-4 sm:px-4">
          <div className="mx-auto flex w-full max-w-3xl flex-col items-stretch gap-2 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 shadow-lg">
            {selectedLocks.length === 0 && (
              <p className="text-xs font-medium text-[#F7931A]">
                Select veBTC NFTs above to finalize your vote
              </p>
            )}
            <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-xs text-[var(--content-secondary)]">
                  Selections
                </span>
                <span className="font-mono text-sm font-semibold tabular-nums text-[var(--content-primary)]">
                  {selectedPoolKeys.size}
                </span>
                <span className="text-xs text-[var(--content-secondary)]">
                  Total
                </span>
                <span
                  className={`font-mono text-sm font-semibold tabular-nums ${
                    isAllocationValid
                      ? "text-[var(--positive)]"
                      : "text-[var(--content-primary)]"
                  }`}
                >
                  {allocationTotal === null
                    ? "Invalid"
                    : `${formatBasisPoints(allocationTotal)}%`}
                </span>
              </div>
              <div className="flex w-full gap-2 sm:w-auto">
                <Button
                  kind="secondary"
                  size="small"
                  onClick={clearCart}
                  overrides={{ BaseButton: { style: { flex: 1 } } }}
                >
                  Clear
                </Button>
                <Button
                  kind="primary"
                  size="small"
                  onClick={() => setCartOpen(true)}
                  disabled={selectedLocks.length === 0}
                  overrides={{ BaseButton: { style: { flex: 1 } } }}
                >
                  Checkout
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
