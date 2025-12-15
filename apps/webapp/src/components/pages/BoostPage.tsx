import { AddressLink } from "@/components/AddressLink"
import { Layout } from "@/components/Layout"
import type { BoostGauge } from "@/hooks/useGauges"
import { useBoostGauges } from "@/hooks/useGauges"
import {
  LOCK_DURATION_OPTIONS,
  useApproveMEZO,
  useCreateVeMEZOLock,
  useMEZOBalance,
  useVeMEZOLocks,
} from "@/hooks/useLocks"
import {
  useBribeAddress,
  useBribeIncentives,
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
  HeadingLarge,
  Input,
  LabelMedium,
  LabelSmall,
  ParagraphMedium,
  Select,
  Skeleton,
  TableBuilder,
  TableBuilderColumn,
  Tag,
  useStyletron,
} from "@mezo-org/mezo-clay"
import type React from "react"
import { useCallback, useEffect, useMemo, useState } from "react"
import { formatUnits, parseUnits } from "viem"
import { useAccount } from "wagmi"

type GaugeSortColumn =
  | "veBTCWeight"
  | "veMEZOWeight"
  | "boost"
  | "optimalVeMEZO"
  | null
type SortDirection = "asc" | "desc"
type StatusFilter = "all" | "active" | "inactive"

// Extended gauge type with allocation info
type GaugeWithAllocation = BoostGauge & {
  originalIndex: number
  votingPct: number
}

export default function BoostPage() {
  const [css, theme] = useStyletron()
  const { isConnected } = useAccount()
  const {
    locks: veMEZOLocks,
    isLoading: isLoadingLocks,
    refetch: refetchLocks,
  } = useVeMEZOLocks()
  const { gauges, isLoading: isLoadingGauges } = useBoostGauges()

  // Lock creation state
  const [lockAmount, setLockAmount] = useState("")
  const [selectedDurationIndex, setSelectedDurationIndex] = useState<
    number | undefined
  >()
  const {
    balance: mezoBalance,
    allowance,
    refetch: refetchBalance,
  } = useMEZOBalance()
  const {
    approve,
    isPending: isApproving,
    isConfirming: isConfirmingApproval,
    isSuccess: isApprovalSuccess,
    reset: resetApprovalState,
  } = useApproveMEZO()
  const {
    createLock,
    isPending: isCreatingLock,
    isConfirming: isConfirmingLock,
    isSuccess: isLockSuccess,
    reset: resetLockState,
  } = useCreateVeMEZOLock()

  // Refetch after successful approval
  useEffect(() => {
    if (isApprovalSuccess) {
      // Refetch balance to get new allowance, then reset approval state
      refetchBalance().then(() => {
        // Small delay to ensure React has processed the state update
        setTimeout(() => {
          resetApprovalState()
        }, 100)
      })
    }
  }, [isApprovalSuccess, refetchBalance, resetApprovalState])

  // Refetch after successful lock creation
  useEffect(() => {
    if (isLockSuccess) {
      // Refetch both locks and balance, then reset state
      Promise.all([refetchLocks(), refetchBalance()]).then(() => {
        setLockAmount("")
        setSelectedDurationIndex(undefined)
        resetLockState()
      })
    }
  }, [isLockSuccess, refetchLocks, refetchBalance, resetLockState])

  const parsedLockAmount = lockAmount ? parseUnits(lockAmount, 18) : 0n
  const needsApproval = allowance !== undefined && parsedLockAmount > allowance
  const selectedDuration =
    selectedDurationIndex !== undefined
      ? LOCK_DURATION_OPTIONS[selectedDurationIndex]
      : undefined

  const handleApprove = () => {
    if (parsedLockAmount > 0n) {
      approve(parsedLockAmount)
    }
  }

  const handleCreateLock = () => {
    if (parsedLockAmount > 0n && selectedDuration) {
      createLock(parsedLockAmount, selectedDuration.value)
    }
  }

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
  const gaugeAddresses = gauges.map((g) => g.address)
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

  const getGaugeSortIndicator = (column: GaugeSortColumn) => {
    if (gaugeSortColumn !== column) return null
    return gaugeSortDirection === "asc" ? (
      <ChevronUp size={16} />
    ) : (
      <ChevronDown size={16} />
    )
  }

  const GaugeSortableHeader = ({
    column,
    children,
  }: {
    column: GaugeSortColumn
    children: React.ReactNode
  }) => (
    <button
      type="button"
      className={css({
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        gap: "4px",
        background: "none",
        border: "none",
        padding: 0,
        font: "inherit",
        color: "inherit",
      })}
      onClick={() => handleGaugeSort(column)}
    >
      {children}
      {getGaugeSortIndicator(column)}
    </button>
  )

  const GaugeBribesCell = ({
    gaugeAddress,
  }: { gaugeAddress: `0x${string}` }) => {
    const {
      bribeAddress,
      hasBribe,
      isLoading: isLoadingBribe,
    } = useBribeAddress(gaugeAddress)
    const { incentives, isLoading: isLoadingIncentives } =
      useBribeIncentives(bribeAddress)

    if (isLoadingBribe || isLoadingIncentives) {
      return (
        <LabelSmall color={theme.colors.contentSecondary}>
          Loading...
        </LabelSmall>
      )
    }

    if (!hasBribe || incentives.length === 0) {
      return (
        <LabelSmall color={theme.colors.contentSecondary}>No bribes</LabelSmall>
      )
    }

    return (
      <div
        className={css({
          display: "flex",
          flexDirection: "column",
          gap: "4px",
        })}
      >
        {incentives.map((incentive) => (
          <LabelSmall key={incentive.tokenAddress}>
            {formatFixedPoint(incentive.amount, BigInt(incentive.decimals))}{" "}
            {incentive.symbol}
          </LabelSmall>
        ))}
      </div>
    )
  }

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
      <div
        className={css({
          display: "flex",
          flexDirection: "column",
          gap: "24px",
        })}
      >
        <div>
          <HeadingLarge marginBottom="scale300">
            Boost veBTC with veMEZO
          </HeadingLarge>
          <ParagraphMedium color={theme.colors.contentSecondary}>
            Use your veMEZO voting power to boost veBTC gauges and earn bribes
          </ParagraphMedium>
        </div>

        {!isConnected ? (
          <Card withBorder overrides={{}}>
            <div
              className={css({
                padding: "48px",
                textAlign: "center",
              })}
            >
              <ParagraphMedium color={theme.colors.contentSecondary}>
                Connect your wallet to vote with veMEZO
              </ParagraphMedium>
            </div>
          </Card>
        ) : isLoading ? (
          <div
            className={css({
              display: "flex",
              flexDirection: "column",
              gap: "16px",
            })}
          >
            <Skeleton width="100%" height="150px" animation />
            <Skeleton width="100%" height="150px" animation />
          </div>
        ) : (
          <>
            {/* Voting Form - shown when user has veMEZO locks */}
            {veMEZOLocks.length > 0 && (
              <Card title="Vote on Gauge" withBorder overrides={{}}>
                <div className={css({ padding: "16px 0" })}>
                  <div
                    className={css({
                      display: "flex",
                      flexDirection: "column",
                      gap: "16px",
                    })}
                  >
                    {/* veMEZO Lock Selection */}
                    <div>
                      <LabelSmall
                        color={theme.colors.contentSecondary}
                        marginBottom="scale200"
                      >
                        Select veMEZO Lock
                      </LabelSmall>
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
                      <div
                        className={css({
                          padding: "16px",
                          backgroundColor: theme.colors.backgroundSecondary,
                          borderRadius: "8px",
                        })}
                      >
                        <div
                          className={css({
                            display: "grid",
                            gridTemplateColumns: "1fr 1fr 1fr",
                            gap: "16px",
                          })}
                        >
                          <div>
                            <LabelSmall color={theme.colors.contentSecondary}>
                              Total Voting Power
                            </LabelSmall>
                            <LabelMedium>
                              {formatUnits(selectedLock.votingPower, 18).slice(
                                0,
                                10,
                              )}
                            </LabelMedium>
                          </div>
                          <div>
                            <LabelSmall color={theme.colors.contentSecondary}>
                              Used
                            </LabelSmall>
                            <LabelMedium>
                              {usedWeight
                                ? formatUnits(usedWeight, 18).slice(0, 10)
                                : "0"}
                            </LabelMedium>
                          </div>
                          <div>
                            <LabelSmall color={theme.colors.contentSecondary}>
                              Remaining
                            </LabelSmall>
                            <LabelMedium>
                              {formatUnits(
                                selectedLock.votingPower > (usedWeight ?? 0n)
                                  ? selectedLock.votingPower -
                                      (usedWeight ?? 0n)
                                  : 0n,
                                18,
                              ).slice(0, 10)}
                            </LabelMedium>
                          </div>
                        </div>
                        {hasVotedThisEpoch && (
                          <div className={css({ marginTop: "12px" })}>
                            <Tag color="yellow" closeable={false}>
                              Already voted this epoch
                            </Tag>
                          </div>
                        )}
                        {!isInVotingWindow && !hasVotedThisEpoch && (
                          <div className={css({ marginTop: "12px" })}>
                            <Tag color="yellow" closeable={false}>
                              Outside voting window
                            </Tag>
                          </div>
                        )}
                        {currentAllocations.length > 0 && (
                          <div className={css({ marginTop: "12px" })}>
                            <LabelSmall
                              color={theme.colors.contentSecondary}
                              marginBottom="scale200"
                            >
                              Current Vote Allocations
                            </LabelSmall>
                            <div
                              className={css({
                                display: "flex",
                                flexDirection: "column",
                                gap: "8px",
                              })}
                            >
                              {currentAllocations.map((allocation) => {
                                const gauge = gauges.find(
                                  (g) =>
                                    g.address.toLowerCase() ===
                                    allocation.gaugeAddress.toLowerCase(),
                                )
                                return (
                                  <div
                                    key={allocation.gaugeAddress}
                                    className={css({
                                      display: "flex",
                                      justifyContent: "space-between",
                                      alignItems: "center",
                                    })}
                                  >
                                    <LabelSmall>
                                      <AddressLink
                                        address={allocation.gaugeAddress}
                                      />
                                      {gauge &&
                                        gauge.veBTCTokenId > 0n &&
                                        ` (veBTC #${gauge.veBTCTokenId.toString()})`}
                                    </LabelSmall>
                                    <LabelMedium>
                                      {formatUnits(allocation.weight, 18).slice(
                                        0,
                                        10,
                                      )}
                                    </LabelMedium>
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
                      <div
                        className={css({
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          marginBottom: "scale400",
                        })}
                      >
                        <LabelSmall color={theme.colors.contentSecondary}>
                          Allocate Voting Power to Gauges
                        </LabelSmall>
                        <LabelSmall
                          color={
                            totalAllocation > 100
                              ? theme.colors.negative
                              : theme.colors.contentSecondary
                          }
                        >
                          Total: {totalAllocation}%
                          {totalAllocation > 100 && " (exceeds 100%)"}
                        </LabelSmall>
                      </div>

                      {/* Status filter */}
                      <div
                        className={css({
                          display: "flex",
                          gap: "8px",
                          alignItems: "center",
                          marginBottom: "scale400",
                        })}
                      >
                        <LabelSmall color={theme.colors.contentSecondary}>
                          Filter:
                        </LabelSmall>
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
                        <ParagraphMedium color={theme.colors.contentSecondary}>
                          No gauges available to vote on
                        </ParagraphMedium>
                      ) : (
                        <TableBuilder
                          data={filteredAndSortedGauges}
                          overrides={{
                            Root: {
                              style: {
                                maxHeight: "400px",
                                overflow: "auto",
                              },
                            },
                            TableHeadCell: {
                              style: {
                                backgroundColor: theme.colors.backgroundSecondary,
                              },
                            },
                            TableBodyRow: {
                              style: {
                                backgroundColor: theme.colors.backgroundPrimary,
                              },
                            },
                          }}
                        >
                          <TableBuilderColumn header="veBTC NFT">
                            {(gauge: GaugeWithAllocation) => (
                              <AddressLink
                                address={gauge.address}
                                {...(gauge.veBTCTokenId > 0n && {
                                  label: `#${gauge.veBTCTokenId.toString()}`,
                                })}
                              />
                            )}
                          </TableBuilderColumn>
                          <TableBuilderColumn
                            header={
                              <GaugeSortableHeader column="veBTCWeight">
                                veBTC Weight
                              </GaugeSortableHeader>
                            }
                          >
                            {(gauge: GaugeWithAllocation) =>
                              gauge.veBTCWeight !== undefined
                                ? formatUnits(gauge.veBTCWeight, 18).slice(
                                    0,
                                    10,
                                  )
                                : "-"
                            }
                          </TableBuilderColumn>
                          <TableBuilderColumn
                            header={
                              <GaugeSortableHeader column="veMEZOWeight">
                                veMEZO Weight
                              </GaugeSortableHeader>
                            }
                          >
                            {(gauge: GaugeWithAllocation) =>
                              formatUnits(gauge.totalWeight, 18).slice(0, 10)
                            }
                          </TableBuilderColumn>
                          <TableBuilderColumn
                            header={
                              <GaugeSortableHeader column="boost">
                                Boost
                              </GaugeSortableHeader>
                            }
                          >
                            {(gauge: GaugeWithAllocation) =>
                              formatMultiplier(gauge.boostMultiplier)
                            }
                          </TableBuilderColumn>
                          <TableBuilderColumn header="Bribes">
                            {(gauge: GaugeWithAllocation) => (
                              <GaugeBribesCell gaugeAddress={gauge.address} />
                            )}
                          </TableBuilderColumn>
                          <TableBuilderColumn
                            header={
                              <GaugeSortableHeader column="optimalVeMEZO">
                                Optimal veMEZO
                              </GaugeSortableHeader>
                            }
                          >
                            {(gauge: GaugeWithAllocation) =>
                              gauge.optimalAdditionalVeMEZO !== undefined
                                ? formatFixedPoint(
                                    gauge.optimalAdditionalVeMEZO,
                                  )
                                : "-"
                            }
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
                                <div
                                  className={css({
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "4px",
                                  })}
                                >
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
                                  <LabelMedium>%</LabelMedium>
                                </div>
                              )
                            }}
                          </TableBuilderColumn>
                        </TableBuilder>
                      )}
                    </div>

                    {/* Vote Buttons */}
                    <div
                      className={css({
                        display: "flex",
                        gap: "16px",
                        marginTop: "8px",
                      })}
                    >
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
            )}

            {/* Lock Creation Form - shown when user has MEZO balance */}
            {mezoBalance !== undefined && mezoBalance > 0n && (
              <Card title="Create veMEZO Lock" withBorder overrides={{}}>
                <div className={css({ padding: "16px 0" })}>
                  <ParagraphMedium
                    color={theme.colors.contentSecondary}
                    marginBottom="scale500"
                  >
                    Lock MEZO tokens to get veMEZO voting power and vote on
                    gauges.
                  </ParagraphMedium>

                  <div
                    className={css({
                      marginBottom: "16px",
                      padding: "12px",
                      backgroundColor: theme.colors.backgroundSecondary,
                      borderRadius: "8px",
                    })}
                  >
                    <LabelSmall color={theme.colors.contentSecondary}>
                      Available MEZO Balance
                    </LabelSmall>
                    <LabelMedium>
                      {formatUnits(mezoBalance, 18)} MEZO
                    </LabelMedium>
                  </div>

                  <div
                    className={css({
                      display: "flex",
                      flexDirection: "column",
                      gap: "16px",
                    })}
                  >
                    <div>
                      <LabelSmall
                        color={theme.colors.contentSecondary}
                        marginBottom="scale200"
                      >
                        Amount to Lock
                      </LabelSmall>
                      <Input
                        value={lockAmount}
                        onChange={(e) => setLockAmount(e.target.value)}
                        placeholder="0.0"
                        type="number"
                        endEnhancer={
                          <Button
                            kind="tertiary"
                            size="xsmall"
                            onClick={() =>
                              mezoBalance &&
                              setLockAmount(formatUnits(mezoBalance, 18))
                            }
                          >
                            MAX
                          </Button>
                        }
                      />
                    </div>

                    <div>
                      <LabelSmall
                        color={theme.colors.contentSecondary}
                        marginBottom="scale200"
                      >
                        Lock Duration
                      </LabelSmall>
                      <Select
                        options={LOCK_DURATION_OPTIONS.map((opt, i) => ({
                          label: opt.label,
                          id: i.toString(),
                        }))}
                        value={
                          selectedDurationIndex !== undefined
                            ? [{ id: selectedDurationIndex.toString() }]
                            : []
                        }
                        onChange={(params) => {
                          const selected = params.value[0]
                          setSelectedDurationIndex(
                            selected ? Number(selected.id) : undefined,
                          )
                        }}
                        placeholder="Select lock duration"
                      />
                    </div>

                    <div
                      className={css({
                        display: "flex",
                        gap: "12px",
                        marginTop: "8px",
                      })}
                    >
                      {needsApproval ? (
                        <Button
                          kind="primary"
                          onClick={handleApprove}
                          isLoading={isApproving || isConfirmingApproval}
                          disabled={!lockAmount || parsedLockAmount === 0n}
                        >
                          Approve MEZO
                        </Button>
                      ) : (
                        <Button
                          kind="primary"
                          onClick={handleCreateLock}
                          isLoading={isCreatingLock || isConfirmingLock}
                          disabled={
                            !lockAmount ||
                            parsedLockAmount === 0n ||
                            !selectedDuration
                          }
                        >
                          Create Lock
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </Card>
            )}

            {/* Empty state when no MEZO and no locks */}
            {(mezoBalance === undefined || mezoBalance === 0n) &&
              veMEZOLocks.length === 0 && (
                <Card withBorder overrides={{}}>
                  <div
                    className={css({
                      padding: "48px",
                      textAlign: "center",
                    })}
                  >
                    <ParagraphMedium color={theme.colors.contentSecondary}>
                      You need MEZO tokens to create a veMEZO lock and vote on
                      gauges.
                    </ParagraphMedium>
                  </div>
                </Card>
              )}
          </>
        )}
      </div>
    </Layout>
  )
}
