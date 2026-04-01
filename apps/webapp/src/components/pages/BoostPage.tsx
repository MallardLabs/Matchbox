import { AddressLink } from "@/components/AddressLink"
import { BoostCalculator } from "@/components/BoostCalculator"
import GaugeCard from "@/components/GaugeCard"
import {
  LockCarouselSelector,
  type VeMEZOLockData,
} from "@/components/LockCarouselSelector"
import OnboardingCard from "@/components/OnboardingCard"
import { SpringIn } from "@/components/SpringIn"
import Tooltip from "@/components/Tooltip"
import {
  calculateAPYFromData,
  calculateProjectedAPY,
  formatAPY,
  useGaugesAPY,
} from "@/hooks/useAPY"
import { useBtcPrice } from "@/hooks/useBtcPrice"
import { useAllGaugeProfiles } from "@/hooks/useGaugeProfiles"
import type { BoostGauge } from "@/hooks/useGauges"
import { useBoostGauges } from "@/hooks/useGauges"
import { useVeMEZOLocks } from "@/hooks/useLocks"
import { useMezoPrice } from "@/hooks/useMezoPrice"
import { useMultiLockVoting } from "@/hooks/useMultiLockVoting"
import { useClaimableBribes } from "@/hooks/useVoting"
import { useAllVoteAllocations, useBatchVoteState } from "@/hooks/useVoting"
import {
  Button,
  Card,
  ChevronDown,
  ChevronUp,
  Input,
  Modal,
  ModalBody,
  Skeleton,
  Tag,
} from "@mezo-org/mezo-clay"
import { getTokenUsdPrice } from "@repo/shared"
import Link from "next/link"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { type Address, formatUnits } from "viem"
import { useAccount } from "wagmi"

type GaugeSortColumn =
  | "veBTCWeight"
  | "veMEZOWeight"
  | "boost"
  | "optimalVeMEZO"
  | "apy"
  | null
type SortDirection = "asc" | "desc"
type StatusFilter = "all" | "active" | "inactive"

// Extended gauge type with allocation info
type GaugeWithAllocation = BoostGauge & {
  originalIndex: number
  votingPct: number
}

export default function BoostPage(): JSX.Element {
  const { isConnected } = useAccount()
  const { locks: veMEZOLocks, isLoading: isLoadingLocks } = useVeMEZOLocks()
  const { gauges, isLoading: isLoadingGauges } = useBoostGauges({
    includeOwnership: true,
  })

  const gaugeAddresses = useMemo(() => gauges.map((g) => g.address), [gauges])

  // Fetch all gauge profiles from Supabase (pre-fetches all for faster loading)
  const { profiles: gaugeProfiles } = useAllGaugeProfiles()

  // Fetch APY data for all gauges
  const gaugesForAPY = useMemo(
    () =>
      gauges.map((g) => ({ address: g.address, totalWeight: g.totalWeight })),
    [gauges],
  )
  const { apyMap, isLoading: isLoadingAPY } = useGaugesAPY(gaugesForAPY)
  const { price: mezoPrice } = useMezoPrice()
  const { price: btcPrice } = useBtcPrice()

  // Voting state — multi-lock selection
  const [selectedLockIndexes, setSelectedLockIndexes] = useState<Set<number>>(
    new Set(),
  )
  // Track gauge allocations: Map of gauge index -> percentage (0-100)
  const [gaugeAllocations, setGaugeAllocations] = useState<Map<number, number>>(
    new Map(),
  )
  const [selectedGaugeIndexes, setSelectedGaugeIndexes] = useState<Set<number>>(
    new Set(),
  )
  const [cartSnapshots, setCartSnapshots] = useState<Map<number, number>>(
    new Map(),
  )
  const prevSelectedLockCountRef = useRef(0)

  const selectedLocks = useMemo(
    () =>
      Array.from(selectedLockIndexes)
        .sort((a, b) => a - b)
        .map((i) => veMEZOLocks[i])
        .filter(
          (lock): lock is (typeof veMEZOLocks)[number] => lock !== undefined,
        ),
    [selectedLockIndexes, veMEZOLocks],
  )

  // Batch fetch vote state for all veMEZO locks (for rich carousel cards)
  const allVeMEZOTokenIds = useMemo(
    () => veMEZOLocks.map((lock) => lock.tokenId),
    [veMEZOLocks],
  )
  const {
    voteStateMap,
    isInVotingWindow,
    isLoading: isLoadingVoteState,
  } = useBatchVoteState(allVeMEZOTokenIds)
  const { claimableBribes, isLoading: isLoadingBribes } =
    useClaimableBribes(allVeMEZOTokenIds)

  // Batch fetch vote allocations for all locks to calculate APY for each
  const { allocationsByToken } = useAllVoteAllocations(
    allVeMEZOTokenIds,
    gaugeAddresses,
  )

  // Derive aggregated vote state from batch data
  const {
    totalVotingPower,
    votableLocks,
    anyVotedThisEpoch,
    allVotedThisEpoch,
    currentAllocations,
  } = useMemo(() => {
    let power = 0n
    const votable: typeof selectedLocks = []
    let anyVoted = false
    let allVoted = selectedLocks.length > 0

    for (const lock of selectedLocks) {
      power += lock.votingPower
      const state = voteStateMap.get(lock.tokenId.toString())
      if (state?.canVoteInCurrentEpoch) votable.push(lock)
      if (state?.hasVotedThisEpoch) anyVoted = true
      if (!state?.hasVotedThisEpoch) allVoted = false
    }

    // Aggregate current allocations across all selected locks
    const allocMap = new Map<string, { gaugeAddress: string; weight: bigint }>()
    for (const lock of selectedLocks) {
      const lockAllocs = allocationsByToken.get(lock.tokenId.toString()) ?? []
      for (const alloc of lockAllocs) {
        const key = alloc.gaugeAddress.toLowerCase()
        const existing = allocMap.get(key)
        if (existing) {
          allocMap.set(key, {
            gaugeAddress: alloc.gaugeAddress,
            weight: existing.weight + alloc.weight,
          })
        } else {
          allocMap.set(key, {
            gaugeAddress: alloc.gaugeAddress,
            weight: alloc.weight,
          })
        }
      }
    }

    return {
      totalVotingPower: power,
      votableLocks: votable,
      anyVotedThisEpoch: anyVoted,
      allVotedThisEpoch: allVoted,
      currentAllocations: Array.from(allocMap.values()).filter(
        (a) => a.weight > 0n,
      ),
    }
  }, [selectedLocks, voteStateMap, allocationsByToken])

  // Calculate claimable USD per tokenId (same as Dashboard)
  const claimableUSDByTokenId = useMemo(() => {
    const map = new Map<string, number>()
    for (const bribe of claimableBribes) {
      const tokenIdKey = bribe.tokenId.toString()
      let usdValue = 0
      for (const reward of bribe.rewards) {
        const tokenAmount = Number(reward.earned) / 10 ** reward.decimals
        const price =
          getTokenUsdPrice(
            reward.tokenAddress,
            reward.symbol,
            btcPrice,
            mezoPrice,
          ) ?? 0
        usdValue += tokenAmount * price
      }
      const existing = map.get(tokenIdKey) ?? 0
      map.set(tokenIdKey, existing + usdValue)
    }
    return map
  }, [claimableBribes, btcPrice, mezoPrice])

  // Create enriched veMEZO locks with voting data for the carousel
  const enrichedVeMEZOLocks: VeMEZOLockData[] = useMemo(() => {
    return veMEZOLocks.map((lock, lockIndex) => {
      // Get batch vote state for this lock
      const batchVoteState = voteStateMap.get(lock.tokenId.toString())
      const lockUsedWeight = batchVoteState?.usedWeight
      const lockAllocations =
        allocationsByToken.get(lock.tokenId.toString()) ?? []

      const claimableUSD =
        claimableUSDByTokenId.get(lock.tokenId.toString()) ?? 0

      // Calculate UPCOMING APY from vote allocations
      let upcomingAPY: number | null = null
      if (
        lockUsedWeight &&
        lockUsedWeight > 0n &&
        lockAllocations.length > 0 &&
        mezoPrice
      ) {
        let totalUserIncentivesUSD = 0
        for (const allocation of lockAllocations) {
          const gaugeKey = allocation.gaugeAddress.toLowerCase()
          const gaugeData = apyMap.get(gaugeKey)
          if (
            gaugeData &&
            gaugeData.totalVeMEZOWeight > 0n &&
            gaugeData.totalIncentivesUSD > 0
          ) {
            const userShare =
              Number(allocation.weight) / Number(gaugeData.totalVeMEZOWeight)
            totalUserIncentivesUSD += gaugeData.totalIncentivesUSD * userShare
          }
        }
        upcomingAPY = calculateAPYFromData(
          totalUserIncentivesUSD,
          lockUsedWeight,
          mezoPrice,
        )
      }

      // Calculate PROJECTED APY from local gauge allocations (pending votes)
      // Only calculate for selected locks
      let projectedAPY: number | null = null
      if (selectedLockIndexes.has(lockIndex) && mezoPrice && mezoPrice > 0) {
        let totalProjectedIncentivesUSD = 0
        let totalUserVoteWeight = 0n

        // Iterate through all gauge allocations for this lock
        for (const [gaugeIndex, votePercentage] of gaugeAllocations.entries()) {
          if (votePercentage <= 0) continue

          const gauge = gauges[gaugeIndex]
          if (!gauge) continue

          const gaugeData = apyMap.get(gauge.address.toLowerCase())
          if (!gaugeData || gaugeData.totalIncentivesUSD <= 0) continue

          // Calculate user's vote weight for this gauge
          const userVoteWeight =
            (BigInt(Math.floor(votePercentage * 100)) * lock.votingPower) /
            10000n
          totalUserVoteWeight += userVoteWeight

          // Calculate user's share of incentives (considering their vote adds to total)
          const newTotalWeight = gaugeData.totalVeMEZOWeight + userVoteWeight
          if (newTotalWeight > 0n) {
            const userShare = Number(userVoteWeight) / Number(newTotalWeight)
            totalProjectedIncentivesUSD +=
              gaugeData.totalIncentivesUSD * userShare
          }
        }

        projectedAPY = calculateAPYFromData(
          totalProjectedIncentivesUSD,
          totalUserVoteWeight,
          mezoPrice,
        )
      }

      const result: VeMEZOLockData = {
        ...lock,
        claimableUSD: claimableUSD > 0 ? claimableUSD : null,
        upcomingAPY,
        projectedAPY,
        isLoadingUsedWeight: isLoadingVoteState,
        isLoadingAPY: isLoadingBribes || isLoadingAPY,
      }
      if (batchVoteState?.canVoteInCurrentEpoch !== undefined) {
        result.canVote = batchVoteState.canVoteInCurrentEpoch
      }
      if (batchVoteState?.hasVotedThisEpoch !== undefined) {
        result.hasVotedThisEpoch = batchVoteState.hasVotedThisEpoch
      }
      if (batchVoteState?.lastVoted !== undefined) {
        result.lastVoted = batchVoteState.lastVoted
      }
      if (lockUsedWeight !== undefined) {
        result.usedWeight = lockUsedWeight
      }
      return result
    })
  }, [
    veMEZOLocks,
    voteStateMap,
    allocationsByToken,
    apyMap,
    mezoPrice,
    claimableUSDByTokenId,
    isLoadingVoteState,
    isLoadingBribes,
    isLoadingAPY,
    selectedLockIndexes,
    gaugeAllocations,
    gauges,
  ])
  const {
    voteAll,
    resetAll,
    lockStates,
    currentIndex: multiVoteCurrentIndex,
    totalLocks: multiVoteTotalLocks,
    successCount: multiVoteSuccessCount,
    errorCount: multiVoteErrorCount,
    isInProgress: isMultiVoteInProgress,
    isDone: isMultiVoteDone,
    hasErrors: multiVoteHasErrors,
    clear: clearMultiVote,
  } = useMultiLockVoting()

  // Gauge table sorting and filtering state
  const [gaugeSortColumn, setGaugeSortColumn] = useState<GaugeSortColumn>("apy")
  const [gaugeSortDirection, setGaugeSortDirection] =
    useState<SortDirection>("desc")
  const [gaugeStatusFilter, setGaugeStatusFilter] =
    useState<StatusFilter>("active")
  const [gaugeSearchQuery, setGaugeSearchQuery] = useState("")

  // Calculator modal state
  const [isCalculatorOpen, setIsCalculatorOpen] = useState(false)
  const [isCartOpen, setIsCartOpen] = useState(false)

  // Close cart and clear allocations after fully successful multi-vote
  useEffect(() => {
    if (isMultiVoteDone && !multiVoteHasErrors) {
      const timer = setTimeout(() => {
        setIsCartOpen(false)
        setGaugeAllocations(new Map())
        setSelectedGaugeIndexes(new Set())
        setCartSnapshots(new Map())
        clearMultiVote()
      }, 1500)
      return () => clearTimeout(timer)
    }
  }, [isMultiVoteDone, multiVoteHasErrors, clearMultiVote])

  const handleGaugeSort = useCallback(
    (column: GaugeSortColumn) => {
      if (gaugeSortColumn === column) {
        setGaugeSortDirection((d) => (d === "asc" ? "desc" : "asc"))
      } else {
        setGaugeSortColumn(column)
        setGaugeSortDirection("desc")
      }
    },
    [gaugeSortColumn],
  )

  const getGaugeSortIndicator = (column: GaugeSortColumn): JSX.Element => {
    if (gaugeSortColumn === column) {
      return gaugeSortDirection === "asc" ? (
        <ChevronUp size={16} />
      ) : (
        <ChevronDown size={16} />
      )
    }
    // Show neutral chevron to indicate sortable
    return (
      <span className="opacity-30">
        <ChevronDown size={16} />
      </span>
    )
  }

  // Calculate total allocation percentage (only for selected/cart gauges)
  const totalAllocationRaw = Array.from(selectedGaugeIndexes).reduce(
    (sum, idx) => sum + (gaugeAllocations.get(idx) ?? 0),
    0,
  )
  const totalAllocation = Number(totalAllocationRaw.toFixed(2))
  const allocationEpsilon = 0.01
  const isAllocationValid =
    Math.abs(totalAllocationRaw - 100) <= allocationEpsilon
  const isOverAllocated = totalAllocationRaw > 100 + allocationEpsilon
  const isUnderAllocated =
    totalAllocationRaw > 0 && totalAllocationRaw < 100 - allocationEpsilon

  const cartStatusMessage = useMemo(() => {
    if (selectedLocks.length === 0)
      return "Select veMEZO locks to finalize your votes."
    if (votableLocks.length === 0)
      return "All selected locks have already voted this epoch."
    if (gaugeAllocations.size === 0 || totalAllocationRaw === 0) {
      return "Add vote allocations to continue."
    }
    if (!isAllocationValid) {
      return "Total allocation must equal 100% to vote."
    }
    if (isLoadingVoteState) return "Checking voting eligibility..."
    if (votableLocks.length < selectedLocks.length)
      return `${votableLocks.length} of ${selectedLocks.length} locks eligible to vote.`
    return null
  }, [
    selectedLocks.length,
    votableLocks.length,
    gaugeAllocations.size,
    totalAllocationRaw,
    isAllocationValid,
    isLoadingVoteState,
  ])

  const selectedGaugeList = useMemo(
    () => Array.from(selectedGaugeIndexes.values()),
    [selectedGaugeIndexes],
  )

  // Clear allocations only when selection becomes fully empty
  useEffect(() => {
    const prevCount = prevSelectedLockCountRef.current
    prevSelectedLockCountRef.current = selectedLockIndexes.size

    if (selectedLockIndexes.size === 0 && prevCount > 0) {
      setGaugeAllocations(new Map())
      setSelectedGaugeIndexes(new Set())
      setCartSnapshots(new Map())
      setIsCartOpen(false)
    }
  }, [selectedLockIndexes.size])

  // Filtered and sorted gauges for voting table
  const filteredAndSortedGauges = useMemo(() => {
    // Build gauges with allocation info
    let result: GaugeWithAllocation[] = gauges.map((gauge, i) => ({
      ...gauge,
      originalIndex: i,
      votingPct: gaugeAllocations.get(i) ?? 0,
    }))

    const hasGaugeProfile = (gauge: BoostGauge) => {
      const profile = gaugeProfiles.get(gauge.address.toLowerCase())
      return Boolean(
        profile?.display_name ||
          profile?.description ||
          profile?.profile_picture_url,
      )
    }

    // Filter by status
    if (gaugeStatusFilter === "active") {
      result = result.filter((g) => g.isAlive)
    } else if (gaugeStatusFilter === "inactive") {
      result = result.filter((g) => !g.isAlive)
    }

    // Filter by search query
    if (gaugeSearchQuery.trim()) {
      const query = gaugeSearchQuery.trim().toLowerCase()
      result = result.filter((g) => {
        const profile = gaugeProfiles.get(g.address.toLowerCase())
        const displayName = profile?.display_name?.toLowerCase() ?? ""
        const tokenIdStr = g.veBTCTokenId > 0n ? g.veBTCTokenId.toString() : ""
        const addressStr = g.address.toLowerCase()
        return (
          displayName.includes(query) ||
          tokenIdStr.includes(query) ||
          addressStr.includes(query)
        )
      })
    }

    // Sort
    if (gaugeSortColumn) {
      result.sort((a, b) => {
        let comparison: number

        const aHasProfile = hasGaugeProfile(a)
        const bHasProfile = hasGaugeProfile(b)
        if (aHasProfile !== bHasProfile) {
          return aHasProfile ? -1 : 1
        }

        switch (gaugeSortColumn) {
          case "veBTCWeight": {
            const aVal = a.veBTCWeight ?? 0n
            const bVal = b.veBTCWeight ?? 0n
            comparison = aVal < bVal ? -1 : aVal > bVal ? 1 : 0
            break
          }
          case "veMEZOWeight": {
            const aVal = a.totalWeight
            const bVal = b.totalWeight
            comparison = aVal < bVal ? -1 : aVal > bVal ? 1 : 0
            break
          }
          case "boost":
            comparison = a.boostMultiplier - b.boostMultiplier
            break
          case "optimalVeMEZO": {
            const aVal = a.optimalAdditionalVeMEZO ?? -1n
            const bVal = b.optimalAdditionalVeMEZO ?? -1n
            comparison = aVal < bVal ? -1 : aVal > bVal ? 1 : 0
            break
          }
          case "apy": {
            const aAPY = apyMap.get(a.address.toLowerCase())?.apy ?? -1
            const bAPY = apyMap.get(b.address.toLowerCase())?.apy ?? -1
            comparison = aAPY < bAPY ? -1 : aAPY > bAPY ? 1 : 0
            break
          }
          default:
            return 0
        }

        return gaugeSortDirection === "asc" ? comparison : -comparison
      })
    }

    return result
  }, [
    gauges,
    gaugeSortColumn,
    gaugeSortDirection,
    gaugeStatusFilter,
    gaugeSearchQuery,
    gaugeAllocations,
    gaugeProfiles,
    apyMap,
  ])

  const handleAllocationChange = (gaugeIndex: number, percentage: number) => {
    setGaugeAllocations((prev) => {
      const next = new Map(prev)
      if (percentage <= 0) {
        next.delete(gaugeIndex)
      } else {
        next.set(gaugeIndex, Math.min(percentage, 100))
      }
      return next
    })
    if (percentage <= 0) {
      setSelectedGaugeIndexes((prev) => {
        const next = new Set(prev)
        next.delete(gaugeIndex)
        return next
      })
      setCartSnapshots((prev) => {
        const next = new Map(prev)
        next.delete(gaugeIndex)
        return next
      })
    }
  }

  const handleToggleGaugeSelection = useCallback(
    function handleToggleGaugeSelection(gaugeIndex: number) {
      setSelectedGaugeIndexes((prev) => {
        const next = new Set(prev)
        if (next.has(gaugeIndex)) {
          next.delete(gaugeIndex)
          setGaugeAllocations((prevAllocations) => {
            const nextAllocations = new Map(prevAllocations)
            nextAllocations.delete(gaugeIndex)
            return nextAllocations
          })
          setCartSnapshots((prevSnapshots) => {
            const nextSnapshots = new Map(prevSnapshots)
            nextSnapshots.delete(gaugeIndex)
            return nextSnapshots
          })
        } else {
          next.add(gaugeIndex)
        }
        return next
      })
    },
    [],
  )

  const handleAddGaugeToCart = useCallback(
    function handleAddGaugeToCart(gaugeIndex: number) {
      setSelectedGaugeIndexes((prev) => {
        const next = new Set(prev)
        next.add(gaugeIndex)
        return next
      })
      setCartSnapshots((prev) => {
        const next = new Map(prev)
        const allocation = gaugeAllocations.get(gaugeIndex) ?? 0
        next.set(gaugeIndex, allocation)
        return next
      })
    },
    [gaugeAllocations],
  )

  const handleClearSelections = useCallback(function handleClearSelections() {
    setSelectedGaugeIndexes(new Set())
    setGaugeAllocations(new Map())
    setCartSnapshots(new Map())
  }, [])

  const handleVote = () => {
    if (votableLocks.length === 0 || selectedGaugeIndexes.size === 0) return

    const selectedGauges = Array.from(selectedGaugeIndexes)
      .map((idx) => ({
        gauge: gauges[idx],
        weight: gaugeAllocations.get(idx) ?? 0,
      }))
      .filter((entry) => entry.gauge !== undefined && entry.weight > 0)

    const gaugeAddrs = selectedGauges.map(
      (entry) => entry.gauge?.address as Address,
    )
    const weights = selectedGauges.map((entry) => BigInt(entry.weight))
    const tokenIds = votableLocks.map((l) => l.tokenId)

    voteAll(tokenIds, gaugeAddrs, weights)
  }

  // Only locks that have used weight AND can vote this epoch are resettable
  const resettableLocks = useMemo(
    () =>
      selectedLocks.filter((lock) => {
        const state = voteStateMap.get(lock.tokenId.toString())
        return (
          state?.usedWeight &&
          state.usedWeight > 0n &&
          state.canVoteInCurrentEpoch
        )
      }),
    [selectedLocks, voteStateMap],
  )

  const handleReset = () => {
    if (resettableLocks.length === 0) return
    resetAll(resettableLocks.map((l) => l.tokenId))
  }

  const handleToggleLock = useCallback((index: number) => {
    setSelectedLockIndexes((prev) => {
      const next = new Set(prev)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }, [])

  const handleCheckoutOpen = useCallback(function handleCheckoutOpen() {
    setIsCartOpen(true)
  }, [])

  const handleCheckoutClose = useCallback(function handleCheckoutClose() {
    setIsCartOpen(false)
  }, [])

  const isLoading = isLoadingLocks || isLoadingGauges

  return (
    <div className="flex flex-col gap-6">
      {/* Page Header */}
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="mb-2 text-2xl font-semibold text-[var(--content-primary)]">
            <span className="text-[#F7931A]">$</span> boost --vote
          </h1>
          <p className="text-sm text-[var(--content-secondary)]">
            Use your veMEZO voting power to boost veBTC gauges and earn bribes
          </p>
        </div>
        <Button
          kind="secondary"
          size="small"
          onClick={() => setIsCalculatorOpen(true)}
          startEnhancer={
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
              <rect x="4" y="2" width="16" height="20" rx="2" />
              <line x1="8" y1="6" x2="16" y2="6" />
              <line x1="8" y1="10" x2="10" y2="10" />
              <line x1="12" y1="10" x2="14" y2="10" />
              <line x1="16" y1="10" x2="16" y2="10" />
              <line x1="8" y1="14" x2="10" y2="14" />
              <line x1="12" y1="14" x2="14" y2="14" />
              <line x1="16" y1="14" x2="16" y2="14" />
              <line x1="8" y1="18" x2="10" y2="18" />
              <line x1="12" y1="18" x2="16" y2="18" />
            </svg>
          }
        >
          Calculator
        </Button>
      </header>

      {/* Boost Calculator Modal */}
      <Modal
        isOpen={isCalculatorOpen}
        onClose={() => setIsCalculatorOpen(false)}
        overrides={{
          Dialog: {
            style: {
              maxWidth: "420px",
              width: "100%",
              padding: "0",
            },
          },
          Close: {
            style: {
              top: "12px",
              right: "12px",
            },
          },
        }}
      >
        <ModalBody
          $style={{
            padding: "16px",
          }}
        >
          <BoostCalculator />
        </ModalBody>
      </Modal>

      <Modal
        isOpen={isCartOpen}
        onClose={handleCheckoutClose}
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
          Close: {
            style: {
              top: "12px",
              right: "12px",
            },
          },
        }}
      >
        <ModalBody
          $style={{
            padding: "16px",
          }}
        >
          <div className="flex flex-col gap-4">
            <header className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-wider text-[var(--content-tertiary)]">
                  Shopping cart
                </p>
                <h2 className="text-lg font-semibold text-[var(--content-primary)]">
                  Vote allocations
                </h2>
              </div>
              <div className="flex items-center gap-2">
                <Tag closeable={false} color="blue">
                  {selectedGaugeIndexes.size} selected
                </Tag>
                <Tag
                  closeable={false}
                  color={isAllocationValid ? "green" : "yellow"}
                >
                  Total {totalAllocation}%
                </Tag>
              </div>
            </header>

            {selectedGaugeList.length === 0 ? (
              <div className="rounded-lg border border-dashed border-[var(--border)] p-6 text-center">
                <p className="text-sm text-[var(--content-secondary)]">
                  Select gauges to start building your vote
                </p>
              </div>
            ) : (
              <fieldset className="rounded-lg border border-[var(--border)] p-4">
                <legend className="px-2 text-xs uppercase tracking-wider text-[var(--content-tertiary)]">
                  Vote weights
                </legend>
                {selectedLocks.length === 0 && (
                  <p className="mt-3 text-xs text-[var(--content-secondary)]">
                    Select veMEZO locks to finalize your votes.
                  </p>
                )}
                <ol className="mt-4 flex flex-col gap-3">
                  {selectedGaugeList.map((gaugeIndex) => {
                    const gauge = gauges[gaugeIndex]
                    if (!gauge) return null
                    const profile = gaugeProfiles.get(
                      gauge.address.toLowerCase(),
                    )
                    const apyData = apyMap.get(gauge.address.toLowerCase())
                    const currentVote = gaugeAllocations.get(gaugeIndex) ?? 0
                    const snapshotVote =
                      cartSnapshots.get(gaugeIndex) ?? currentVote
                    const isProjected =
                      selectedLocks.length > 0 && currentVote > 0
                    const displayAPY = isProjected
                      ? calculateProjectedAPY(
                          apyData,
                          currentVote,
                          totalVotingPower,
                          mezoPrice,
                        )
                      : (apyData?.apy ?? null)
                    const hasChangedVote = snapshotVote !== currentVote
                    return (
                      <li
                        key={gauge.address}
                        className="rounded-lg border border-[var(--border)] p-3"
                      >
                        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                          <div className="flex min-w-0 items-center gap-3">
                            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded-full border border-[var(--border)] bg-[var(--surface-secondary)]">
                              {profile?.profile_picture_url ? (
                                <img
                                  src={profile.profile_picture_url}
                                  alt={`Gauge #${gauge.veBTCTokenId.toString()}`}
                                  className="h-full w-full object-cover"
                                />
                              ) : (
                                <span className="text-2xs text-[var(--content-secondary)]">
                                  #
                                  {gauge.veBTCTokenId > 0n
                                    ? gauge.veBTCTokenId.toString()
                                    : "?"}
                                </span>
                              )}
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <Link
                                  href={`/gauges/${gauge.address}`}
                                  className="text-sm font-semibold text-[var(--content-primary)] no-underline"
                                >
                                  {profile?.display_name
                                    ? profile.display_name
                                    : gauge.veBTCTokenId > 0n
                                      ? `veBTC #${gauge.veBTCTokenId.toString()}`
                                      : `${gauge.address.slice(0, 6)}...${gauge.address.slice(-4)}`}
                                </Link>
                                {profile?.display_name &&
                                  gauge.veBTCTokenId > 0n && (
                                    <span className="inline-flex items-center rounded bg-[rgba(247,147,26,0.15)] border border-[rgba(247,147,26,0.3)] px-1.5 py-0.5 font-mono text-2xs font-semibold tracking-wide text-[#F7931A]">
                                      #{gauge.veBTCTokenId.toString()}
                                    </span>
                                  )}
                              </div>
                              {profile?.description && (
                                <p className="mt-1 line-clamp-2 text-2xs text-[var(--content-secondary)]">
                                  {profile.description}
                                </p>
                              )}
                              <p className="mt-2 flex items-center gap-1 text-2xs text-[var(--content-secondary)]">
                                APY
                                <Tooltip
                                  id={`boost-apy-${gaugeIndex}`}
                                  content="Projected APY if your current allocation is applied. Based on this gauge's incentive pool divided by the resulting total veMEZO weight."
                                />
                                :{" "}
                                <span
                                  className={
                                    displayAPY && displayAPY > 0
                                      ? "font-mono text-[var(--positive)]"
                                      : "font-mono text-[var(--content-secondary)]"
                                  }
                                >
                                  {formatAPY(displayAPY)}
                                  {isProjected && " ↓"}
                                </span>
                              </p>
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center gap-2 md:flex-nowrap">
                            <label
                              htmlFor={`vote-weight-${gaugeIndex}`}
                              className="whitespace-nowrap text-xs text-[var(--content-secondary)]"
                            >
                              Vote %
                            </label>
                            <Input
                              id={`vote-weight-${gaugeIndex}`}
                              value={currentVote.toString()}
                              onChange={(e) =>
                                handleAllocationChange(
                                  gaugeIndex,
                                  Number(e.target.value) || 0,
                                )
                              }
                              placeholder="0"
                              type="number"
                              size="small"
                              positive={currentVote > 0}
                              overrides={{
                                Root: {
                                  style: { width: "90px" },
                                },
                              }}
                            />
                            <Button
                              kind="secondary"
                              size="small"
                              onClick={() => {
                                if (hasChangedVote) {
                                  setCartSnapshots((prev) => {
                                    const next = new Map(prev)
                                    next.set(gaugeIndex, currentVote)
                                    return next
                                  })
                                  return
                                }
                                handleToggleGaugeSelection(gaugeIndex)
                              }}
                            >
                              <span className="sr-only">
                                {hasChangedVote
                                  ? "Update vote percentage"
                                  : "Remove from cart"}
                              </span>
                              {hasChangedVote ? (
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
                                  <polyline points="20 6 9 17 4 12" />
                                </svg>
                              ) : (
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
                              )}
                            </Button>
                          </div>
                        </div>
                      </li>
                    )
                  })}
                </ol>
              </fieldset>
            )}

            {/* Multi-sign progress */}
            {(isMultiVoteInProgress || isMultiVoteDone) && (
              <div className="rounded-lg border border-[var(--border)] p-3">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-xs font-semibold text-[var(--content-primary)]">
                    {isMultiVoteInProgress
                      ? `Signing transactions (${multiVoteCurrentIndex + 1}/${multiVoteTotalLocks})`
                      : multiVoteHasErrors
                        ? `${multiVoteSuccessCount} of ${multiVoteTotalLocks} succeeded`
                        : "All transactions confirmed"}
                  </p>
                  {isMultiVoteDone && !multiVoteHasErrors && (
                    <Tag color="green" closeable={false}>
                      Done
                    </Tag>
                  )}
                </div>
                {/* Progress bar */}
                <div className="mb-3 flex h-2 gap-0.5 overflow-hidden rounded-full">
                  {lockStates.map((ls) => (
                    <div
                      key={ls.tokenId.toString()}
                      className={`flex-1 transition-colors ${
                        ls.status === "success"
                          ? "bg-[var(--positive)]"
                          : ls.status === "error"
                            ? "bg-[var(--negative)]"
                            : ls.status === "signing" ||
                                ls.status === "confirming"
                              ? "animate-pulse bg-[#F7931A]"
                              : ls.status === "skipped"
                                ? "bg-[var(--content-tertiary)]"
                                : "bg-[var(--border)]"
                      }`}
                    />
                  ))}
                </div>
                {/* Per-lock status */}
                <ol className="flex flex-col gap-2">
                  {lockStates.map((ls) => (
                    <li
                      key={ls.tokenId.toString()}
                      className="flex items-center justify-between text-xs"
                    >
                      <span className="font-mono text-[var(--content-primary)]">
                        veMEZO #{ls.tokenId.toString()}
                      </span>
                      <span
                        className={`flex items-center gap-1.5 ${
                          ls.status === "success"
                            ? "text-[var(--positive)]"
                            : ls.status === "error"
                              ? "text-[var(--negative)]"
                              : ls.status === "signing" ||
                                  ls.status === "confirming"
                                ? "text-[#F7931A]"
                                : "text-[var(--content-tertiary)]"
                        }`}
                      >
                        {ls.status === "success" && "Confirmed"}
                        {ls.status === "error" && "Failed"}
                        {ls.status === "signing" && "Confirm in wallet..."}
                        {ls.status === "confirming" && "Confirming..."}
                        {ls.status === "pending" && "Pending"}
                        {ls.status === "skipped" && "Skipped"}
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            )}

            <div className="flex flex-col gap-3 border-t border-[var(--border)] pt-3">
              {/* Voting summary for multi-lock */}
              {selectedLocks.length > 0 &&
                !isMultiVoteInProgress &&
                !isMultiVoteDone && (
                  <div className="text-xs text-[var(--content-secondary)]">
                    Voting with{" "}
                    <span className="font-medium text-[var(--content-primary)]">
                      {votableLocks.length} lock
                      {votableLocks.length !== 1 ? "s" : ""}
                    </span>
                    :{" "}
                    {votableLocks
                      .map((l) => `#${l.tokenId.toString()}`)
                      .join(", ")}
                  </div>
                )}
              {!isMultiVoteInProgress && !isMultiVoteDone && (
                <p className="flex items-center gap-1 text-xs text-[var(--content-secondary)]">
                  Votes lock for this epoch. You can reset and re-vote once.
                  <Tooltip
                    id="vote-epoch-hint"
                    content="Each veMEZO lock can vote once per epoch. After voting, you may reset your allocation and vote again once more in the same epoch."
                  />
                </p>
              )}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-xs text-[var(--content-secondary)]">
                  {cartStatusMessage ?? "Ready to vote."}
                </div>
                <div className="flex flex-wrap gap-2">
                  {resettableLocks.length > 0 && !isMultiVoteInProgress && (
                    <Button
                      kind="secondary"
                      onClick={handleReset}
                      isLoading={isMultiVoteInProgress}
                    >
                      Reset{" "}
                      {resettableLocks.length > 1
                        ? `${resettableLocks.length} Locks`
                        : "Vote"}
                    </Button>
                  )}
                  {isMultiVoteDone && multiVoteHasErrors ? (
                    <>
                      <Button
                        kind="secondary"
                        onClick={() => {
                          clearMultiVote()
                          setIsCartOpen(false)
                        }}
                      >
                        Close
                      </Button>
                      <Button
                        kind="primary"
                        onClick={() => {
                          // Retry failed locks
                          const failedTokenIds = lockStates
                            .filter((ls) => ls.status === "error")
                            .map((ls) => ls.tokenId)
                          if (failedTokenIds.length === 0) return
                          clearMultiVote()

                          const selectedGauges = Array.from(
                            selectedGaugeIndexes,
                          )
                            .map((idx) => ({
                              gauge: gauges[idx],
                              weight: gaugeAllocations.get(idx) ?? 0,
                            }))
                            .filter(
                              (entry) =>
                                entry.gauge !== undefined && entry.weight > 0,
                            )
                          const gaugeAddrs = selectedGauges.map(
                            (entry) => entry.gauge?.address as Address,
                          )
                          const weights = selectedGauges.map((entry) =>
                            BigInt(entry.weight),
                          )
                          voteAll(failedTokenIds, gaugeAddrs, weights)
                        }}
                      >
                        Retry Failed ({multiVoteErrorCount})
                      </Button>
                    </>
                  ) : (
                    <Button
                      kind="primary"
                      onClick={handleVote}
                      isLoading={isMultiVoteInProgress}
                      disabled={
                        selectedLocks.length === 0 ||
                        votableLocks.length === 0 ||
                        gaugeAllocations.size === 0 ||
                        totalAllocation === 0 ||
                        !isAllocationValid ||
                        isMultiVoteInProgress
                      }
                    >
                      {isMultiVoteInProgress
                        ? `Signing ${multiVoteCurrentIndex + 1}/${multiVoteTotalLocks}...`
                        : isMultiVoteDone
                          ? "Done"
                          : votableLocks.length > 1
                            ? `Vote with ${votableLocks.length} Locks (${totalAllocation}%)`
                            : `Vote (${totalAllocation}%)`}
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </ModalBody>
      </Modal>

      {!isConnected ? (
        <SpringIn delay={0} variant="card">
          <Card withBorder overrides={{}}>
            <div className="p-12 text-center">
              <p className="text-sm text-[var(--content-secondary)]">
                Connect your wallet to vote with veMEZO
              </p>
            </div>
          </Card>
        </SpringIn>
      ) : isLoading ? (
        <div className="flex flex-col gap-4">
          <Skeleton width="100%" height="150px" animation />
          <Skeleton width="100%" height="150px" animation />
        </div>
      ) : (
        <>
          {/* Card 1 — Lock Selection + Position Info */}
          {veMEZOLocks.length > 0 && (
            <SpringIn delay={0} variant="card">
              <Card withBorder overrides={{}}>
                <div className="py-4">
                  <div className="flex flex-col gap-4">
                    <LockCarouselSelector
                      locks={enrichedVeMEZOLocks}
                      multiSelect
                      selectedIndexes={selectedLockIndexes}
                      onToggle={handleToggleLock}
                      lockType="veMEZO"
                      label="Select veMEZO Locks"
                    />

                    {selectedLocks.length > 0 && (
                      <section className="flex flex-col gap-4 rounded-xl border border-[var(--border)] bg-[var(--surface-secondary)] p-5">
                        <dl className="grid grid-cols-4 gap-4 max-md:grid-cols-2 max-sm:grid-cols-1 max-sm:gap-3">
                          <div>
                            <dt className="text-2xs font-medium uppercase tracking-wider text-[var(--content-tertiary)]">
                              Locks
                            </dt>
                            <dd className="mt-1 font-mono text-lg font-semibold tabular-nums text-[var(--content-primary)]">
                              {selectedLocks.length}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-2xs font-medium uppercase tracking-wider text-[var(--content-tertiary)]">
                              Voting Power
                            </dt>
                            <dd className="mt-1 font-mono text-lg font-semibold tabular-nums text-[var(--content-primary)]">
                              {formatUnits(totalVotingPower, 18).slice(0, 10)}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-2xs font-medium uppercase tracking-wider text-[var(--content-tertiary)]">
                              Eligible to Vote
                            </dt>
                            <dd className="mt-1 text-lg font-semibold text-[var(--content-primary)]">
                              {votableLocks.length} of {selectedLocks.length}{" "}
                              lock
                              {selectedLocks.length !== 1 ? "s" : ""}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-2xs font-medium uppercase tracking-wider text-[var(--content-tertiary)]">
                              Epoch Status
                            </dt>
                            <dd className="mt-1">
                              {allVotedThisEpoch ? (
                                <span className="text-lg font-semibold text-[var(--content-tertiary)]">
                                  Already Voted
                                </span>
                              ) : isInVotingWindow ? (
                                <span className="text-lg font-semibold text-[var(--positive)]">
                                  Voting Open
                                </span>
                              ) : (
                                <span className="text-lg font-semibold text-[var(--warning)]">
                                  Window Closed
                                </span>
                              )}
                            </dd>
                          </div>
                        </dl>

                        {votableLocks.length < selectedLocks.length &&
                          votableLocks.length > 0 && (
                            <div className="flex flex-wrap gap-2">
                              <Tag color="yellow" closeable={false}>
                                {selectedLocks.length - votableLocks.length}{" "}
                                lock
                                {selectedLocks.length - votableLocks.length > 1
                                  ? "s"
                                  : ""}{" "}
                                already voted — will be skipped
                              </Tag>
                            </div>
                          )}

                        {currentAllocations.length > 0 && (
                          <div className="flex flex-col gap-2">
                            <div>
                              <p className="text-2xs font-medium uppercase tracking-wider text-[var(--content-tertiary)]">
                                On-Chain Allocations
                              </p>
                              <p className="mt-0.5 text-2xs text-[var(--content-tertiary)]">
                                {allVotedThisEpoch
                                  ? "Updated this epoch"
                                  : anyVotedThisEpoch
                                    ? "Some locks have not voted this epoch — allocations may be from a prior vote"
                                    : "From previous vote — will persist until you vote again"}
                              </p>
                            </div>
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="border-b border-[var(--border)] text-left text-2xs text-[var(--content-tertiary)]">
                                  <th className="pb-2 font-medium">Gauge</th>
                                  <th className="pb-2 text-right font-medium">
                                    Weight
                                  </th>
                                </tr>
                              </thead>
                              <tbody>
                                {currentAllocations.map((allocation) => {
                                  const gauge = gauges.find(
                                    (g) =>
                                      g.address.toLowerCase() ===
                                      allocation.gaugeAddress.toLowerCase(),
                                  )
                                  return (
                                    <tr
                                      key={allocation.gaugeAddress}
                                      className="border-b border-[var(--border)] last:border-0"
                                    >
                                      <td className="py-2 text-[var(--content-secondary)]">
                                        <AddressLink
                                          address={
                                            allocation.gaugeAddress as Address
                                          }
                                        />
                                        {gauge &&
                                          gauge.veBTCTokenId > 0n &&
                                          ` (veBTC #${gauge.veBTCTokenId.toString()})`}
                                      </td>
                                      <td className="py-2 text-right font-mono font-medium tabular-nums text-[var(--content-primary)]">
                                        {formatUnits(
                                          allocation.weight,
                                          18,
                                        ).slice(0, 10)}
                                      </td>
                                    </tr>
                                  )
                                })}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </section>
                    )}
                  </div>
                </div>
              </Card>
            </SpringIn>
          )}

          {/* Card 2 — Gauge List */}
          {veMEZOLocks.length > 0 && (
            <SpringIn delay={1} variant="card-subtle">
              <Card title="Allocate Voting Power" withBorder overrides={{}}>
                <div className="py-4">
                  <div className="flex flex-col gap-4">
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-[var(--content-secondary)]">
                        {filteredAndSortedGauges.length} gauge
                        {filteredAndSortedGauges.length !== 1 ? "s" : ""}
                      </p>
                      <p
                        className={`text-xs ${
                          !isAllocationValid
                            ? "text-[var(--negative)]"
                            : "text-[var(--content-secondary)]"
                        }`}
                      >
                        Total: {totalAllocation}%
                        {isOverAllocated && " (exceeds 100%)"}
                        {isUnderAllocated ? " (must be 100%)" : ""}
                      </p>
                    </div>

                    {/* Status filter */}
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs text-[var(--content-secondary)]">
                        Filter:
                      </span>
                      <Tag
                        closeable={false}
                        onClick={() => setGaugeStatusFilter("all")}
                        color={gaugeStatusFilter === "all" ? "blue" : "gray"}
                      >
                        All
                      </Tag>
                      <Tag
                        closeable={false}
                        onClick={() => setGaugeStatusFilter("active")}
                        color={
                          gaugeStatusFilter === "active" ? "green" : "gray"
                        }
                      >
                        Active
                      </Tag>
                      <Tag
                        closeable={false}
                        onClick={() => setGaugeStatusFilter("inactive")}
                        color={
                          gaugeStatusFilter === "inactive" ? "red" : "gray"
                        }
                      >
                        Inactive
                      </Tag>
                    </div>

                    {/* Search field */}
                    <div>
                      <Input
                        value={gaugeSearchQuery}
                        onChange={(e) => setGaugeSearchQuery(e.target.value)}
                        placeholder="Search gauges..."
                        size="small"
                      />
                    </div>

                    {gauges.length === 0 ? (
                      <p className="text-sm text-[var(--content-secondary)]">
                        No gauges available to vote on
                      </p>
                    ) : (
                      <div className="flex flex-col gap-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs text-[var(--content-secondary)]">
                            Sort:
                          </span>
                          {(
                            [
                              { id: "apy", label: "APY" },
                              { id: "veMEZOWeight", label: "veMEZO Weight" },
                              { id: "veBTCWeight", label: "veBTC Weight" },
                              { id: "boost", label: "Boost" },
                              {
                                id: "optimalVeMEZO",
                                label: "Optimal veMEZO",
                              },
                            ] as const
                          ).map((option) => (
                            <button
                              key={option.id}
                              type="button"
                              onClick={() => handleGaugeSort(option.id)}
                              className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs ${
                                gaugeSortColumn === option.id
                                  ? "border-[var(--content-primary)] text-[var(--content-primary)]"
                                  : "border-[var(--border)] text-[var(--content-secondary)]"
                              }`}
                            >
                              {option.label}
                              {getGaugeSortIndicator(option.id)}
                            </button>
                          ))}
                        </div>

                        {filteredAndSortedGauges.length === 0 &&
                        gauges.length > 0 ? (
                          <div className="rounded-lg border border-dashed border-[var(--border)] p-8 text-center">
                            <p className="text-sm text-[var(--content-secondary)]">
                              No gauges match your filters
                            </p>
                          </div>
                        ) : (
                          <div className="relative">
                            <div className="pointer-events-none sticky top-0 z-10 h-6 bg-gradient-to-b from-[var(--background)] to-transparent" />
                            <div className="max-h-[600px] overflow-y-auto">
                              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                                {filteredAndSortedGauges.map((gauge) => {
                                  const profile = gaugeProfiles.get(
                                    gauge.address.toLowerCase(),
                                  )
                                  const apyData = apyMap.get(
                                    gauge.address.toLowerCase(),
                                  )
                                  const userVotePercentage =
                                    gaugeAllocations.get(gauge.originalIndex) ??
                                    0
                                  const isProjected =
                                    selectedLocks.length > 0 &&
                                    userVotePercentage > 0
                                  const displayAPY = isProjected
                                    ? calculateProjectedAPY(
                                        apyData,
                                        userVotePercentage,
                                        totalVotingPower,
                                        mezoPrice,
                                      )
                                    : (apyData?.apy ?? null)
                                  const isSelected = selectedGaugeIndexes.has(
                                    gauge.originalIndex,
                                  )
                                  const votePercentage =
                                    gaugeAllocations.get(gauge.originalIndex) ??
                                    0
                                  return (
                                    <GaugeCard
                                      key={gauge.address}
                                      gauge={gauge}
                                      profile={profile ?? null}
                                      apyData={apyData}
                                      isLoadingAPY={isLoadingAPY}
                                      displayAPY={displayAPY}
                                      isProjected={!!isProjected}
                                      isSelected={isSelected}
                                    >
                                      <fieldset className="flex flex-col gap-3 rounded-lg bg-[var(--surface-secondary)] p-3">
                                        <legend className="text-2xs uppercase tracking-wider text-[var(--content-tertiary)]">
                                          Vote setup
                                        </legend>
                                        <ol className="flex flex-wrap items-center justify-between gap-3">
                                          <li className="flex flex-1 items-center gap-2">
                                            <label
                                              htmlFor={`gauge-vote-${gauge.originalIndex}`}
                                              className="text-2xs text-[var(--content-secondary)]"
                                            >
                                              Vote %
                                            </label>
                                            <Input
                                              id={`gauge-vote-${gauge.originalIndex}`}
                                              value={votePercentage.toString()}
                                              onChange={(e) =>
                                                handleAllocationChange(
                                                  gauge.originalIndex,
                                                  Number(e.target.value) || 0,
                                                )
                                              }
                                              placeholder="0"
                                              type="number"
                                              size="small"
                                              positive={votePercentage > 0}
                                              overrides={{
                                                Root: {
                                                  style: { width: "96px" },
                                                },
                                              }}
                                            />
                                          </li>
                                          <li className="flex items-center gap-2">
                                            <Button
                                              kind={
                                                isSelected
                                                  ? "secondary"
                                                  : "primary"
                                              }
                                              size="small"
                                              onClick={() =>
                                                isSelected
                                                  ? handleToggleGaugeSelection(
                                                      gauge.originalIndex,
                                                    )
                                                  : handleAddGaugeToCart(
                                                      gauge.originalIndex,
                                                    )
                                              }
                                              disabled={
                                                !isSelected &&
                                                votePercentage <= 0
                                              }
                                            >
                                              {isSelected
                                                ? "Remove"
                                                : "Add to cart"}
                                            </Button>
                                          </li>
                                        </ol>
                                      </fieldset>
                                    </GaugeCard>
                                  )
                                })}
                              </div>
                            </div>
                            <div className="pointer-events-none sticky bottom-0 z-10 h-6 bg-gradient-to-t from-[var(--background)] to-transparent" />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            </SpringIn>
          )}

          {/* Empty state when no locks */}
          {veMEZOLocks.length === 0 && (
            <SpringIn delay={0} variant="card">
              <Card withBorder overrides={{}}>
                <div className="p-12 text-center">
                  <p className="text-sm text-[var(--content-secondary)]">
                    You need MEZO tokens to create a veMEZO lock and vote on
                    gauges.
                  </p>
                </div>
              </Card>
            </SpringIn>
          )}
        </>
      )}

      {selectedGaugeIndexes.size > 0 && (
        <div className="fixed bottom-4 left-0 right-0 z-40 px-4">
          <div className="mx-auto flex w-full max-w-3xl flex-col items-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 shadow-lg">
            {selectedLocks.length === 0 && (
              <p className="text-xs font-medium text-[#F7931A]">
                Select veMEZO locks above to finalize your vote
              </p>
            )}
            <div className="flex w-full flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="text-xs text-[var(--content-secondary)]">
                  Selections
                </span>
                <span className="font-mono text-sm font-semibold text-[var(--content-primary)]">
                  {selectedGaugeIndexes.size}
                </span>
                <span className="text-xs text-[var(--content-secondary)]">
                  Total
                </span>
                <span
                  className={`font-mono text-sm font-semibold ${
                    totalAllocation === 100
                      ? "text-[var(--positive)]"
                      : "text-[var(--content-primary)]"
                  }`}
                >
                  {totalAllocation}%
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  kind="secondary"
                  size="small"
                  onClick={handleClearSelections}
                >
                  Clear
                </Button>
                <Button
                  kind="primary"
                  size="small"
                  onClick={handleCheckoutOpen}
                  disabled={selectedLocks.length === 0}
                >
                  Checkout
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      <OnboardingCard
        storageKey="matchbox-onboarding-boost"
        heading="boost --guide"
        steps={[
          {
            title: "Select your lock(s)",
            description:
              "The carousel at the top shows your veMEZO NFT positions. Click a card to select it — you can pick multiple locks to vote with at once.",
          },
          {
            title: "Find a gauge",
            description:
              "Browse the table sorted by APY. Click any gauge to see its full profile, incentive breakdown, and strategy. Higher APY = more bribe rewards per vote.",
          },
          {
            title: "Vote and earn",
            description:
              "Enter a Vote % for each gauge (total ≤ 100%), then click Checkout → Vote. After the epoch ends each Thursday, claim your bribe rewards on the Dashboard.",
          },
        ]}
      />
    </div>
  )
}
