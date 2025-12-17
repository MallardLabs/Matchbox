import { AddressLink } from "@/components/AddressLink"
import { Layout } from "@/components/Layout"
import { SpringIn } from "@/components/SpringIn"
import { formatAPY, useGaugesAPY } from "@/hooks/useAPY"
import { useAllGaugeProfiles } from "@/hooks/useGaugeProfiles"
import type { BoostGauge } from "@/hooks/useGauges"
import { useBoostGauges } from "@/hooks/useGauges"
import { useVeMEZOLocks } from "@/hooks/useLocks"
import {
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
  Select,
  Skeleton,
  TableBuilder,
  TableBuilderColumn,
  Tag,
  useStyletron,
} from "@mezo-org/mezo-clay"
import Link from "next/link"
import type React from "react"
import { useCallback, useMemo, useState } from "react"
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
  const [, theme] = useStyletron()
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

  // Voting state
  const [selectedLockIndex, setSelectedLockIndex] = useState<
    number | undefined
  >()
  // Track gauge allocations: Map of gauge index -> percentage (0-100)
  const [gaugeAllocations, setGaugeAllocations] = useState<Map<number, number>>(
    new Map(),
  )

  const selectedLock =
    selectedLockIndex !== undefined ? veMEZOLocks[selectedLockIndex] : undefined

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
  const [gaugeSortColumn, setGaugeSortColumn] =
    useState<GaugeSortColumn>("optimalVeMEZO")
  const [gaugeSortDirection, setGaugeSortDirection] =
    useState<SortDirection>("desc")
  const [gaugeStatusFilter, setGaugeStatusFilter] =
    useState<StatusFilter>("active")

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

  const GaugeSortableHeader = ({
    column,
    children,
  }: {
    column: GaugeSortColumn
    children: React.ReactNode
  }): JSX.Element => (
    <button
      type="button"
      className="inline-flex cursor-pointer items-center gap-1 border-none bg-transparent p-0 font-inherit text-inherit"
      onClick={() => handleGaugeSort(column)}
    >
      {children}
      {getGaugeSortIndicator(column)}
    </button>
  )

  // Calculate total allocation percentage
  const totalAllocation = Array.from(gaugeAllocations.values()).reduce(
    (sum, pct) => sum + pct,
    0,
  )

  // Filtered and sorted gauges for voting table
  const filteredAndSortedGauges = useMemo(() => {
    // Build gauges with allocation info
    let result: GaugeWithAllocation[] = gauges.map((gauge, i) => ({
      ...gauge,
      originalIndex: i,
      votingPct: gaugeAllocations.get(i) ?? 0,
    }))

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
  }

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

  const isLoading = isLoadingLocks || isLoadingGauges

  return (
    <Layout>
      <div className="flex flex-col gap-6">
        {/* Page Header */}
        <header>
          <h1 className="mb-2 text-2xl font-semibold text-[var(--content-primary)]">
            <span className="text-[#F7931A]">$</span> boost --vote
          </h1>
          <p className="text-sm text-[var(--content-secondary)]">
            Use your veMEZO voting power to boost veBTC gauges and earn bribes
          </p>
        </header>

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
                      {/* veMEZO Lock Selection */}
                      <div>
                        <p className="mb-2 text-xs text-[var(--content-secondary)]">
                          Select veMEZO Lock
                        </p>
                        <Select
                          options={veMEZOLocks.map((lock, i) => ({
                            label: `veMEZO #${lock.tokenId.toString()} - ${formatUnits(lock.votingPower, 18).slice(0, 8)} voting power`,
                            id: i.toString(),
                          }))}
                          value={
                            selectedLockIndex !== undefined
                              ? [{ id: selectedLockIndex.toString() }]
                              : []
                          }
                          onChange={(params) => {
                            const selected = params.value[0]
                            setSelectedLockIndex(
                              selected ? Number(selected.id) : undefined,
                            )
                          }}
                          placeholder="Select your veMEZO lock"
                        />
                      </div>

                      {selectedLock && (
                        <div className="rounded-lg bg-[var(--surface-secondary)] p-4">
                          <div className="grid grid-cols-3 gap-4 max-md:grid-cols-2 max-sm:grid-cols-1 max-sm:gap-3">
                            <div>
                              <p className="text-xs text-[var(--content-secondary)]">
                                Total Voting Power
                              </p>
                              <p className="font-mono text-sm font-medium tabular-nums text-[var(--content-primary)]">
                                {formatUnits(
                                  selectedLock.votingPower,
                                  18,
                                ).slice(0, 10)}
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
                                        {formatUnits(
                                          allocation.weight,
                                          18,
                                        ).slice(0, 10)}
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
                              totalAllocation > 100
                                ? "text-[var(--negative)]"
                                : "text-[var(--content-secondary)]"
                            }`}
                          >
                            Total: {totalAllocation}%
                            {totalAllocation > 100 && " (exceeds 100%)"}
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
                            color={
                              gaugeStatusFilter === "all" ? "blue" : "gray"
                            }
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
                          <div className="-mx-4 overflow-x-auto px-4 md:-mx-3 md:px-3">
                            <TableBuilder
                              data={filteredAndSortedGauges}
                              overrides={{
                                Root: {
                                  style: {
                                    maxHeight: "400px",
                                    overflow: "auto",
                                    minWidth: "800px",
                                  },
                                },
                                TableHeadCell: {
                                  style: {
                                    backgroundColor:
                                      theme.colors.backgroundSecondary,
                                    whiteSpace: "nowrap",
                                  },
                                },
                                TableBodyRow: {
                                  style: {
                                    backgroundColor:
                                      theme.colors.backgroundPrimary,
                                  },
                                },
                                TableBodyCell: {
                                  style: {
                                    whiteSpace: "nowrap",
                                    verticalAlign: "middle",
                                  },
                                },
                              }}
                            >
                              <TableBuilderColumn header="Gauge">
                                {(gauge: GaugeWithAllocation) => {
                                  const profile = gaugeProfiles.get(
                                    gauge.address.toLowerCase(),
                                  )
                                  return (
                                    <Link
                                      href={`/gauges/${gauge.address}`}
                                      className="flex items-center gap-3 text-inherit no-underline transition-opacity hover:opacity-80"
                                    >
                                      {/* Profile Picture */}
                                      <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center overflow-hidden rounded-full border border-[var(--border)] bg-[var(--surface-secondary)]">
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
                                      {/* Gauge Info */}
                                      <div className="flex min-w-0 flex-col gap-0.5">
                                        <div className="flex flex-wrap items-center gap-1.5">
                                          <span
                                            className={`text-xs font-medium ${
                                              profile?.display_name ||
                                              profile?.description ||
                                              profile?.profile_picture_url
                                                ? "text-[var(--positive)]"
                                                : "text-[var(--negative)]"
                                            }`}
                                          >
                                            {profile?.display_name
                                              ? profile.display_name
                                              : gauge.veBTCTokenId > 0n
                                                ? `veBTC #${gauge.veBTCTokenId.toString()}`
                                                : `${gauge.address.slice(0, 6)}...${gauge.address.slice(-4)}`}
                                          </span>
                                          {profile?.display_name &&
                                            gauge.veBTCTokenId > 0n && (
                                              <span className="inline-flex items-center rounded border border-[rgba(247,147,26,0.3)] bg-[rgba(247,147,26,0.15)] px-1.5 py-0.5 font-mono text-2xs font-semibold tracking-wide text-[#F7931A]">
                                                #{gauge.veBTCTokenId.toString()}
                                              </span>
                                            )}
                                        </div>
                                        {profile?.description && (
                                          <span className="max-w-[150px] truncate text-2xs text-[var(--content-secondary)]">
                                            {profile.description}
                                          </span>
                                        )}
                                      </div>
                                    </Link>
                                  )
                                }}
                              </TableBuilderColumn>
                              <TableBuilderColumn
                                header={
                                  <GaugeSortableHeader column="veBTCWeight">
                                    veBTC Weight
                                  </GaugeSortableHeader>
                                }
                              >
                                {(gauge: GaugeWithAllocation) => (
                                  <span className="font-mono text-sm tabular-nums">
                                    {gauge.veBTCWeight !== undefined
                                      ? formatUnits(
                                          gauge.veBTCWeight,
                                          18,
                                        ).slice(0, 10)
                                      : "-"}
                                  </span>
                                )}
                              </TableBuilderColumn>
                              <TableBuilderColumn
                                header={
                                  <GaugeSortableHeader column="veMEZOWeight">
                                    veMEZO Weight
                                  </GaugeSortableHeader>
                                }
                              >
                                {(gauge: GaugeWithAllocation) => (
                                  <span className="font-mono text-sm tabular-nums">
                                    {formatUnits(gauge.totalWeight, 18).slice(
                                      0,
                                      10,
                                    )}
                                  </span>
                                )}
                              </TableBuilderColumn>
                              <TableBuilderColumn
                                header={
                                  <GaugeSortableHeader column="boost">
                                    Boost
                                  </GaugeSortableHeader>
                                }
                              >
                                {(gauge: GaugeWithAllocation) => (
                                  <span className="font-mono text-sm tabular-nums">
                                    {formatMultiplier(gauge.boostMultiplier)}
                                  </span>
                                )}
                              </TableBuilderColumn>
                              <TableBuilderColumn
                                header={
                                  <GaugeSortableHeader column="apy">
                                    APY
                                  </GaugeSortableHeader>
                                }
                              >
                                {(gauge: GaugeWithAllocation) => {
                                  const apyData = apyMap.get(
                                    gauge.address.toLowerCase(),
                                  )
                                  if (isLoadingAPY) {
                                    return (
                                      <span className="text-xs text-[var(--content-secondary)]">
                                        ...
                                      </span>
                                    )
                                  }
                                  return (
                                    <span
                                      className={`font-mono text-sm font-medium ${
                                        apyData?.apy && apyData.apy > 0
                                          ? "text-[var(--positive)]"
                                          : "text-[var(--content-secondary)]"
                                      }`}
                                    >
                                      {formatAPY(apyData?.apy ?? null)}
                                    </span>
                                  )
                                }}
                              </TableBuilderColumn>
                              <TableBuilderColumn
                                header={
                                  <GaugeSortableHeader column="optimalVeMEZO">
                                    Optimal veMEZO
                                  </GaugeSortableHeader>
                                }
                              >
                                {(gauge: GaugeWithAllocation) => (
                                  <span className="font-mono text-sm tabular-nums">
                                    {gauge.optimalAdditionalVeMEZO !== undefined
                                      ? formatFixedPoint(
                                          gauge.optimalAdditionalVeMEZO,
                                        )
                                      : "-"}
                                  </span>
                                )}
                              </TableBuilderColumn>
                              <TableBuilderColumn header="Status">
                                {(gauge: GaugeWithAllocation) => (
                                  <Tag
                                    color={gauge.isAlive ? "green" : "red"}
                                    closeable={false}
                                  >
                                    {gauge.isAlive ? "Active" : "Inactive"}
                                  </Tag>
                                )}
                              </TableBuilderColumn>
                              <TableBuilderColumn header="Vote %">
                                {(gauge: GaugeWithAllocation) => {
                                  const currentVote = gaugeAllocations.get(
                                    gauge.originalIndex,
                                  )
                                  const hasVote =
                                    currentVote !== undefined && currentVote > 0
                                  return (
                                    <div className="flex items-center gap-1">
                                      <Input
                                        value={currentVote?.toString() ?? ""}
                                        onChange={(e) =>
                                          handleAllocationChange(
                                            gauge.originalIndex,
                                            Number(e.target.value) || 0,
                                          )
                                        }
                                        placeholder="0"
                                        type="number"
                                        size="small"
                                        positive={hasVote}
                                        overrides={{
                                          Root: {
                                            style: { width: "80px" },
                                          },
                                        }}
                                      />
                                      <span className="font-mono text-sm font-medium text-[var(--content-primary)]">
                                        %
                                      </span>
                                    </div>
                                  )
                                }}
                              </TableBuilderColumn>
                            </TableBuilder>
                          </div>
                        )}
                      </div>

                      {/* Vote Buttons */}
                      <div className="mt-2 flex flex-wrap gap-4 max-sm:flex-col max-sm:gap-3">
                        <Button
                          kind="primary"
                          onClick={handleVote}
                          isLoading={isVoting || isConfirmingVote}
                          disabled={
                            !selectedLock ||
                            gaugeAllocations.size === 0 ||
                            totalAllocation === 0 ||
                            !canVoteInCurrentEpoch
                          }
                        >
                          Vote ({totalAllocation}%)
                        </Button>

                        {selectedLock && usedWeight && usedWeight > 0n && (
                          <Button
                            kind="secondary"
                            onClick={handleReset}
                            isLoading={isResetting || isConfirmingReset}
                          >
                            Reset Vote
                          </Button>
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
      </div>
    </Layout>
  )
}
