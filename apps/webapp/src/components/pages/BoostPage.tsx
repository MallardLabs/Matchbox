import { AddressLink } from "@/components/AddressLink"
import { BoostCalculator } from "@/components/BoostCalculator"
import {
  LockCarouselSelector,
  type VeMEZOLockData,
} from "@/components/LockCarouselSelector"
import { SpringIn } from "@/components/SpringIn"
import { calculateProjectedAPY, formatAPY, useGaugesAPY } from "@/hooks/useAPY"
import { useBtcPrice } from "@/hooks/useBtcPrice"
import { useAllGaugeProfiles } from "@/hooks/useGaugeProfiles"
import type { BoostGauge } from "@/hooks/useGauges"
import { useBoostGauges } from "@/hooks/useGauges"
import { useVeMEZOLocks } from "@/hooks/useLocks"
import { useMezoPrice } from "@/hooks/useMezoPrice"
import { useClaimableBribes } from "@/hooks/useVoting"
import {
  useAllVoteAllocations,
  useBatchVoteState,
  useResetVote,
  useVoteAllocations,
  useVoteOnGauge,
  useVoteState,
} from "@/hooks/useVoting"
import { formatFixedPoint, formatMultiplier } from "@/utils/format"
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
import { isMezoToken } from "@repo/shared"
import Link from "next/link"
import { useCallback, useEffect, useMemo, useState } from "react"
import { formatUnits } from "viem"
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
  const { gauges, isLoading: isLoadingGauges } = useBoostGauges()

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

  // Voting state
  const [selectedLockIndex, setSelectedLockIndex] = useState<
    number | undefined
  >()
  // Track gauge allocations: Map of gauge index -> percentage (0-100)
  const [gaugeAllocations, setGaugeAllocations] = useState<Map<number, number>>(
    new Map(),
  )
  const [selectedGaugeIndexes, setSelectedGaugeIndexes] = useState<
    Set<number>
  >(new Set())
  const [cartSnapshots, setCartSnapshots] = useState<Map<number, number>>(
    new Map(),
  )

  const selectedLock =
    selectedLockIndex !== undefined ? veMEZOLocks[selectedLockIndex] : undefined

  // Batch fetch vote state for all veMEZO locks (for rich carousel cards)
  const allVeMEZOTokenIds = useMemo(
    () => veMEZOLocks.map((lock) => lock.tokenId),
    [veMEZOLocks],
  )
  const { voteStateMap, isLoading: isLoadingVoteState } =
    useBatchVoteState(allVeMEZOTokenIds)
  const { claimableBribes, isLoading: isLoadingBribes } =
    useClaimableBribes(allVeMEZOTokenIds)

  // Batch fetch vote allocations for all locks to calculate APY for each
  const { allocationsByToken } = useAllVoteAllocations(
    allVeMEZOTokenIds,
    gaugeAddresses,
  )

  const {
    canVoteInCurrentEpoch,
    hasVotedThisEpoch,
    isInVotingWindow,
    usedWeight,
  } = useVoteState(selectedLock?.tokenId)
  const { allocations: currentAllocations } = useVoteAllocations(
    selectedLock?.tokenId,
    gaugeAddresses,
  )

  // Calculate claimable USD per tokenId (same as Dashboard)
  const claimableUSDByTokenId = useMemo(() => {
    const map = new Map<string, number>()
    for (const bribe of claimableBribes) {
      const tokenIdKey = bribe.tokenId.toString()
      let usdValue = 0
      for (const reward of bribe.rewards) {
        const tokenAmount = Number(reward.earned) / 10 ** reward.decimals
        const isMezo = isMezoToken(reward.tokenAddress)
        const price = isMezo ? (mezoPrice ?? 0) : (btcPrice ?? 0)
        usdValue += tokenAmount * price
      }
      const existing = map.get(tokenIdKey) ?? 0
      map.set(tokenIdKey, existing + usdValue)
    }
    return map
  }, [claimableBribes, btcPrice, mezoPrice])

  // Create enriched veMEZO locks with voting data for the carousel
  const enrichedVeMEZOLocks: VeMEZOLockData[] = useMemo(() => {
    return veMEZOLocks.map((lock) => {
      // Get batch vote state for this lock
      const batchVoteState = voteStateMap.get(lock.tokenId.toString())
      const lockUsedWeight = batchVoteState?.usedWeight
      const lockAllocations =
        allocationsByToken.get(lock.tokenId.toString()) ?? []

      // Calculate CURRENT APY from claimable rewards (like Dashboard)
      const claimableUSD =
        claimableUSDByTokenId.get(lock.tokenId.toString()) ?? 0
      let currentAPY: number | null = null
      if (
        lockUsedWeight &&
        lockUsedWeight > 0n &&
        claimableUSD > 0 &&
        mezoPrice
      ) {
        const usedVeMEZOAmount = Number(lockUsedWeight) / 1e18
        const usedVeMEZOValueUSD = usedVeMEZOAmount * mezoPrice
        if (usedVeMEZOValueUSD > 0) {
          const weeklyReturn = claimableUSD / usedVeMEZOValueUSD
          currentAPY = weeklyReturn * 52 * 100
        }
      }

      // Calculate UPCOMING APY from vote allocations (existing logic)
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
        if (totalUserIncentivesUSD > 0) {
          const usedVeMEZOAmount = Number(lockUsedWeight) / 1e18
          const usedVeMEZOValueUSD = usedVeMEZOAmount * mezoPrice
          if (usedVeMEZOValueUSD > 0) {
            const weeklyReturn = totalUserIncentivesUSD / usedVeMEZOValueUSD
            upcomingAPY = weeklyReturn * 52 * 100
          }
        }
      }

      const result: VeMEZOLockData = {
        ...lock,
        currentAPY,
        upcomingAPY,
        isLoadingUsedWeight: isLoadingVoteState,
        isLoadingAPY: isLoadingBribes || isLoadingAPY,
      }
      if (batchVoteState?.canVoteInCurrentEpoch !== undefined) {
        result.canVote = batchVoteState.canVoteInCurrentEpoch
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
  ])
  const {
    vote,
    isPending: isVoting,
    isConfirming: isConfirmingVote,
  } = useVoteOnGauge()
  const {
    reset,
    isPending: isResetting,
    isConfirming: isConfirmingReset,
  } = useResetVote()

  // Gauge table sorting and filtering state
  const [gaugeSortColumn, setGaugeSortColumn] = useState<GaugeSortColumn>("apy")
  const [gaugeSortDirection, setGaugeSortDirection] =
    useState<SortDirection>("desc")
  const [gaugeStatusFilter, setGaugeStatusFilter] =
    useState<StatusFilter>("active")

  // Calculator modal state
  const [isCalculatorOpen, setIsCalculatorOpen] = useState(false)
  const [isCartOpen, setIsCartOpen] = useState(false)

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

  // Calculate total allocation percentage
  const totalAllocation = Array.from(gaugeAllocations.values()).reduce(
    (sum, pct) => sum + pct,
    0,
  )

  const selectedGaugeList = useMemo(
    () => Array.from(selectedGaugeIndexes.values()),
    [selectedGaugeIndexes],
  )

  useEffect(() => {
    if (selectedLockIndex === undefined) {
      setGaugeAllocations(new Map())
      setSelectedGaugeIndexes(new Set())
      setCartSnapshots(new Map())
      setIsCartOpen(false)
      return
    }
    setGaugeAllocations(new Map())
    setSelectedGaugeIndexes(new Set())
    setCartSnapshots(new Map())
    setIsCartOpen(false)
  }, [selectedLockIndex])

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

  const handleClearSelections = useCallback(
    function handleClearSelections() {
      setSelectedGaugeIndexes(new Set())
      setGaugeAllocations(new Map())
      setCartSnapshots(new Map())
    },
    [],
  )

  const handleVote = () => {
    if (!selectedLock || gaugeAllocations.size === 0) return

    const selectedGauges = Array.from(gaugeAllocations.keys())
      .map((idx) => gauges[idx])
      .filter((g) => g !== undefined)

    const gaugeAddrs = selectedGauges.map((g) => g.address)
    const weights = Array.from(gaugeAllocations.values()).map((pct) =>
      BigInt(pct),
    )

    vote(selectedLock.tokenId, gaugeAddrs, weights)
  }

  const handleReset = () => {
    if (!selectedLock) return
    reset(selectedLock.tokenId)
  }

  const handleCheckoutOpen = useCallback(
    function handleCheckoutOpen() {
      setIsCartOpen(true)
    },
    [],
  )

  const handleCheckoutClose = useCallback(
    function handleCheckoutClose() {
      setIsCartOpen(false)
    },
    [],
  )

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
                  color={totalAllocation === 100 ? "green" : "yellow"}
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
                {!selectedLock && (
                  <p className="mt-3 text-xs text-[var(--content-secondary)]">
                    Select a veMEZO lock to finalize your votes.
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
                    const currentVote =
                      gaugeAllocations.get(gaugeIndex) ?? 0
                    const snapshotVote =
                      cartSnapshots.get(gaugeIndex) ?? currentVote
                    const isProjected = !!selectedLock && currentVote > 0
                    const displayAPY = isProjected
                      ? calculateProjectedAPY(
                          apyData,
                          currentVote,
                          selectedLock.votingPower,
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
                              {profile?.description && (
                                <p className="mt-1 line-clamp-2 text-2xs text-[var(--content-secondary)]">
                                  {profile.description}
                                </p>
                              )}
                              <p className="mt-2 text-2xs text-[var(--content-secondary)]">
                                APY:{" "}
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
                              className="text-xs text-[var(--content-secondary)]"
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

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] pt-3">
              <div className="text-xs text-[var(--content-secondary)]">
                Total allocation must equal 100% to vote.
              </div>
              <div className="flex flex-wrap gap-2">
                {selectedLock && usedWeight && usedWeight > 0n && (
                  <Button
                    kind="secondary"
                    onClick={handleReset}
                    isLoading={isResetting || isConfirmingReset}
                  >
                    Reset Vote
                  </Button>
                )}
                <Button
                  kind="primary"
                  onClick={handleVote}
                  isLoading={isVoting || isConfirmingVote}
                  disabled={
                    !selectedLock ||
                    gaugeAllocations.size === 0 ||
                    totalAllocation === 0 ||
                    totalAllocation !== 100 ||
                    !canVoteInCurrentEpoch
                  }
                >
                  Vote ({totalAllocation}%)
                </Button>
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
          {/* Voting Form - shown when user has veMEZO locks */}
          {veMEZOLocks.length > 0 && (
            <SpringIn delay={0} variant="card">
              <Card title="Vote on Gauge" withBorder overrides={{}}>
                <div className="py-4">
                  <div className="flex flex-col gap-4">
                    {/* veMEZO Lock Selection Carousel */}
                    <LockCarouselSelector
                      locks={enrichedVeMEZOLocks}
                      selectedIndex={selectedLockIndex}
                      onSelect={setSelectedLockIndex}
                      lockType="veMEZO"
                      label="Select veMEZO Lock"
                    />

                    {selectedLock && (
                      <div className="rounded-lg bg-[var(--surface-secondary)] p-4">
                        <div className="grid grid-cols-3 gap-4 max-md:grid-cols-2 max-sm:grid-cols-1 max-sm:gap-3">
                          <div>
                            <p className="text-xs text-[var(--content-secondary)]">
                              Total Voting Power
                            </p>
                            <p className="font-mono text-sm font-medium tabular-nums text-[var(--content-primary)]">
                              {formatUnits(selectedLock.votingPower, 18).slice(
                                0,
                                10,
                              )}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-[var(--content-secondary)]">
                              Used
                            </p>
                            <p className="font-mono text-sm font-medium tabular-nums text-[var(--content-primary)]">
                              {usedWeight
                                ? formatUnits(usedWeight, 18).slice(0, 10)
                                : "0"}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-[var(--content-secondary)]">
                              Remaining
                            </p>
                            <p className="font-mono text-sm font-medium tabular-nums text-[var(--content-primary)]">
                              {formatUnits(
                                selectedLock.votingPower > (usedWeight ?? 0n)
                                  ? selectedLock.votingPower -
                                      (usedWeight ?? 0n)
                                  : 0n,
                                18,
                              ).slice(0, 10)}
                            </p>
                          </div>
                        </div>
                        {hasVotedThisEpoch && (
                          <div className="mt-3">
                            <Tag color="yellow" closeable={false}>
                              Already voted this epoch
                            </Tag>
                          </div>
                        )}
                        {!isInVotingWindow && !hasVotedThisEpoch && (
                          <div className="mt-3">
                            <Tag color="yellow" closeable={false}>
                              Outside voting window
                            </Tag>
                          </div>
                        )}
                        {currentAllocations.length > 0 && (
                          <div className="mt-3">
                            <p className="mb-2 text-xs text-[var(--content-secondary)]">
                              Current Vote Allocations
                            </p>
                            <div className="flex flex-col gap-2">
                              {currentAllocations.map((allocation) => {
                                const gauge = gauges.find(
                                  (g) =>
                                    g.address.toLowerCase() ===
                                    allocation.gaugeAddress.toLowerCase(),
                                )
                                return (
                                  <div
                                    key={allocation.gaugeAddress}
                                    className="flex items-center justify-between"
                                  >
                                    <span className="text-xs">
                                      <AddressLink
                                        address={allocation.gaugeAddress}
                                      />
                                      {gauge &&
                                        gauge.veBTCTokenId > 0n &&
                                        ` (veBTC #${gauge.veBTCTokenId.toString()})`}
                                    </span>
                                    <span className="font-mono text-sm font-medium tabular-nums text-[var(--content-primary)]">
                                      {formatUnits(allocation.weight, 18).slice(
                                        0,
                                        10,
                                      )}
                                    </span>
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Gauge Allocation */}
                    <div>
                      <div className="mb-4 flex items-center justify-between">
                        <p className="text-xs text-[var(--content-secondary)]">
                          Allocate Voting Power to Gauges
                        </p>
                        <p
                          className={`text-xs ${
                            totalAllocation !== 100
                              ? "text-[var(--negative)]"
                              : "text-[var(--content-secondary)]"
                          }`}
                        >
                          Total: {totalAllocation}%
                          {totalAllocation > 100 && " (exceeds 100%)"}
                          {totalAllocation > 0 && totalAllocation < 100
                            ? " (must be 100%)"
                            : ""}
                        </p>
                      </div>

                      {/* Status filter */}
                      <div className="mb-4 flex flex-wrap items-center gap-2">
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
                                { id: "optimalVeMEZO", label: "Optimal veMEZO" },
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
                          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                            {filteredAndSortedGauges.map((gauge) => {
                              const profile = gaugeProfiles.get(
                                gauge.address.toLowerCase(),
                              )
                              const apyData = apyMap.get(
                                gauge.address.toLowerCase(),
                              )
                              const userVotePercentage =
                                gaugeAllocations.get(gauge.originalIndex) ?? 0
                              const isProjected =
                                selectedLock && userVotePercentage > 0
                              const displayAPY = isProjected
                                ? calculateProjectedAPY(
                                    apyData,
                                    userVotePercentage,
                                    selectedLock.votingPower,
                                    mezoPrice,
                                  )
                                : (apyData?.apy ?? null)
                              const isSelected = selectedGaugeIndexes.has(
                                gauge.originalIndex,
                              )
                              const votePercentage =
                                gaugeAllocations.get(gauge.originalIndex) ?? 0
                              return (
                                <article
                                  key={gauge.address}
                                  className={`flex flex-col gap-3 rounded-xl border bg-[var(--surface)] p-4 ${
                                    isSelected
                                      ? "border-[var(--positive)]"
                                      : "border-[var(--border)]"
                                  }`}
                                >
                                  <div className="flex items-start justify-between gap-3">
                                    <Link
                                      href={`/gauges/${gauge.address}`}
                                      className="flex min-w-0 items-center gap-3 text-inherit no-underline"
                                    >
                                      <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center overflow-hidden rounded-full border border-[var(--border)] bg-[var(--surface-secondary)]">
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
                                        <p
                                          className={`text-sm font-semibold ${
                                            profile?.display_name ||
                                            profile?.description ||
                                            profile?.profile_picture_url
                                              ? "text-[var(--content-primary)]"
                                              : "text-[var(--content-secondary)]"
                                          }`}
                                        >
                                          {profile?.display_name
                                            ? profile.display_name
                                            : gauge.veBTCTokenId > 0n
                                              ? `veBTC #${gauge.veBTCTokenId.toString()}`
                                              : `${gauge.address.slice(0, 6)}...${gauge.address.slice(-4)}`}
                                        </p>
                                        {profile?.description && (
                                          <p className="truncate text-2xs text-[var(--content-secondary)]">
                                            {profile.description}
                                          </p>
                                        )}
                                      </div>
                                    </Link>
                                    <Tag
                                      color={gauge.isAlive ? "green" : "red"}
                                      closeable={false}
                                    >
                                      {gauge.isAlive ? "Active" : "Inactive"}
                                    </Tag>
                                  </div>
                                  <dl className="grid grid-cols-2 gap-3 text-xs">
                                    <div>
                                      <dt className="text-[var(--content-tertiary)]">
                                        veBTC Weight
                                      </dt>
                                      <dd className="font-mono text-[var(--content-primary)]">
                                        {gauge.veBTCWeight !== undefined
                                          ? formatUnits(
                                              gauge.veBTCWeight,
                                              18,
                                            ).slice(0, 10)
                                          : "-"}
                                      </dd>
                                    </div>
                                    <div>
                                      <dt className="text-[var(--content-tertiary)]">
                                        veMEZO Weight
                                      </dt>
                                      <dd className="font-mono text-[var(--content-primary)]">
                                        {formatUnits(gauge.totalWeight, 18).slice(
                                          0,
                                          10,
                                        )}
                                      </dd>
                                    </div>
                                    <div>
                                      <dt className="text-[var(--content-tertiary)]">
                                        Boost
                                      </dt>
                                      <dd className="font-mono text-[var(--content-primary)]">
                                        {formatMultiplier(gauge.boostMultiplier)}
                                      </dd>
                                    </div>
                                    <div>
                                      <dt className="text-[var(--content-tertiary)]">
                                        APY
                                      </dt>
                                      <dd
                                        className={`font-mono ${
                                          displayAPY && displayAPY > 0
                                            ? "text-[var(--positive)]"
                                            : "text-[var(--content-secondary)]"
                                        }`}
                                        title={
                                          isProjected
                                            ? "Projected APY after your vote"
                                            : undefined
                                        }
                                      >
                                        {isLoadingAPY ? "..." : formatAPY(displayAPY)}
                                        {isProjected && " ↓"}
                                      </dd>
                                    </div>
                                    <div>
                                      <dt className="text-[var(--content-tertiary)]">
                                        Optimal veMEZO
                                      </dt>
                                      <dd className="font-mono text-[var(--content-primary)]">
                                        {gauge.optimalAdditionalVeMEZO !==
                                        undefined
                                          ? formatFixedPoint(
                                              gauge.optimalAdditionalVeMEZO,
                                            )
                                          : "-"}
                                      </dd>
                                    </div>
                                  </dl>
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
                                            isSelected ? "secondary" : "primary"
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
                                          disabled={!isSelected && votePercentage <= 0}
                                        >
                                          {isSelected ? "Remove" : "Add to cart"}
                                        </Button>
                                      </li>
                                    </ol>
                                  </fieldset>
                                </article>
                              )
                            })}
                          </div>
                        </div>
                      )}
                    </div>
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
          <div className="mx-auto flex w-full max-w-3xl flex-wrap items-center justify-between gap-3 rounded-full border border-[var(--border)] bg-[var(--surface)] px-4 py-2 shadow-lg">
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
              <Button kind="secondary" size="small" onClick={handleClearSelections}>
                Clear
              </Button>
              <Button
                kind="primary"
                size="small"
                onClick={handleCheckoutOpen}
                disabled={!selectedLock}
              >
                Checkout
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
