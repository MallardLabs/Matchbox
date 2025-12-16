import { AddressLink } from "@/components/AddressLink"
import { Layout } from "@/components/Layout"
import { SpringIn } from "@/components/SpringIn"
import type { BoostGauge } from "@/hooks/useGauges"
import { useBoostGauges } from "@/hooks/useGauges"
import { useGaugeProfiles } from "@/hooks/useGaugeProfiles"
import { useVeMEZOLocks } from "@/hooks/useLocks"
import {
  useBribeAddress,
  useBribeIncentives,
  useResetVote,
  useVoteAllocations,
  useVoteOnGauge,
  useVoteState,
} from "@/hooks/useVoting"
import { useReadContracts } from "wagmi"
import { getContractConfig } from "@/config/contracts"
import { CHAIN_ID } from "@repo/shared/contracts"
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
  ParagraphSmall,
  Select,
  Skeleton,
  TableBuilder,
  TableBuilderColumn,
  Tag,
  useStyletron,
} from "@mezo-org/mezo-clay"
import type React from "react"
import { useCallback, useMemo, useState } from "react"
import { formatUnits } from "viem"
import { useAccount } from "wagmi"

type GaugeSortColumn =
  | "veBTCWeight"
  | "veMEZOWeight"
  | "boost"
  | "optimalVeMEZO"
  | "bribes"
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
  const { locks: veMEZOLocks, isLoading: isLoadingLocks } = useVeMEZOLocks()
  const { gauges, isLoading: isLoadingGauges } = useBoostGauges()

  // Load bribe addresses for all gauges for sorting
  const contracts = getContractConfig(CHAIN_ID.testnet)
  const gaugeAddresses = useMemo(() => gauges.map((g) => g.address), [gauges])

  // Fetch gauge profiles from Supabase
  const { profiles: gaugeProfiles } = useGaugeProfiles(gaugeAddresses)
  const { data: bribeAddressesData } = useReadContracts({
    contracts: gaugeAddresses.map((address) => ({
      ...contracts.boostVoter,
      functionName: "gaugeToBribe",
      args: [address],
    })),
    query: {
      enabled: gaugeAddresses.length > 0,
    },
  })

  // Extract valid bribe addresses for fetching incentive data
  const bribeAddresses = useMemo(() => {
    if (!bribeAddressesData) return []
    return gaugeAddresses.map((gaugeAddr, i) => {
      const result = bribeAddressesData[i]
      const bribeAddress = result?.result as `0x${string}` | undefined
      const hasBribe =
        bribeAddress !== undefined &&
        bribeAddress !== "0x0000000000000000000000000000000000000000"
      return { gaugeAddress: gaugeAddr, bribeAddress: hasBribe ? bribeAddress : undefined }
    })
  }, [bribeAddressesData, gaugeAddresses])

  // Fetch rewards list length for all bribe contracts to get incentive counts
  const { data: rewardsLengthData } = useReadContracts({
    contracts: bribeAddresses.map(({ bribeAddress }) => ({
      address: bribeAddress,
      abi: [
        {
          inputs: [],
          name: "rewardsListLength",
          outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
          stateMutability: "view",
          type: "function",
        },
      ] as const,
      functionName: "rewardsListLength" as const,
    })),
    query: {
      enabled: bribeAddresses.some((b) => b.bribeAddress !== undefined),
    },
  })

  // Build a list of all reward token fetches needed
  const rewardTokenFetches = useMemo(() => {
    if (!rewardsLengthData) return []
    const fetches: Array<{ gaugeAddress: `0x${string}`; bribeAddress: `0x${string}`; tokenIndex: number }> = []
    bribeAddresses.forEach(({ gaugeAddress, bribeAddress }, i) => {
      if (!bribeAddress) return
      const length = Number(rewardsLengthData[i]?.result ?? 0n)
      for (let j = 0; j < length; j++) {
        fetches.push({ gaugeAddress, bribeAddress, tokenIndex: j })
      }
    })
    return fetches
  }, [bribeAddresses, rewardsLengthData])

  // Fetch all reward token addresses
  const { data: rewardTokensData } = useReadContracts({
    contracts: rewardTokenFetches.map(({ bribeAddress, tokenIndex }) => ({
      address: bribeAddress,
      abi: [
        {
          inputs: [{ internalType: "uint256", name: "", type: "uint256" }],
          name: "rewards",
          outputs: [{ internalType: "address", name: "", type: "address" }],
          stateMutability: "view",
          type: "function",
        },
      ] as const,
      functionName: "rewards" as const,
      args: [BigInt(tokenIndex)],
    })),
    query: {
      enabled: rewardTokenFetches.length > 0,
    },
  })

  // Get current epoch start for fetching rewards
  const EPOCH_DURATION = 7 * 24 * 60 * 60
  const currentEpochStart = BigInt(Math.floor(Date.now() / 1000 / EPOCH_DURATION) * EPOCH_DURATION)

  // Fetch token rewards per epoch for all tokens
  const { data: tokenRewardsData } = useReadContracts({
    contracts: rewardTokenFetches.map(({ bribeAddress }, i) => {
      const tokenAddress = rewardTokensData?.[i]?.result as `0x${string}` | undefined
      return {
        address: bribeAddress,
        abi: [
          {
            inputs: [
              { internalType: "address", name: "token", type: "address" },
              { internalType: "uint256", name: "epochStart", type: "uint256" },
            ],
            name: "tokenRewardsPerEpoch",
            outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
            stateMutability: "view",
            type: "function",
          },
        ] as const,
        functionName: "tokenRewardsPerEpoch" as const,
        args: [tokenAddress ?? "0x0000000000000000000000000000000000000000", currentEpochStart],
      }
    }),
    query: {
      enabled: rewardTokenFetches.length > 0 && !!rewardTokensData,
    },
  })

  // Create a map of gauge address -> total bribe amount (sum of all token rewards)
  const gaugeBribeAmountMap = useMemo(() => {
    const map = new Map<string, bigint>()
    // Initialize all gauges to 0
    gauges.forEach((gauge) => {
      map.set(gauge.address.toLowerCase(), 0n)
    })
    // Sum up rewards for each gauge
    if (tokenRewardsData) {
      rewardTokenFetches.forEach(({ gaugeAddress }, i) => {
        const amount = (tokenRewardsData[i]?.result as bigint) ?? 0n
        const current = map.get(gaugeAddress.toLowerCase()) ?? 0n
        map.set(gaugeAddress.toLowerCase(), current + amount)
      })
    }
    return map
  }, [gauges, tokenRewardsData, rewardTokenFetches])

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

  const getGaugeSortIndicator = (column: GaugeSortColumn) => {
    if (gaugeSortColumn === column) {
      return gaugeSortDirection === "asc" ? (
        <ChevronUp size={16} />
      ) : (
        <ChevronDown size={16} />
      )
    }
    // Show neutral chevron to indicate sortable
    return (
      <span className={css({ opacity: 0.3 })}>
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
          case "bribes": {
            const aAmount = gaugeBribeAmountMap.get(a.address.toLowerCase()) ?? 0n
            const bAmount = gaugeBribeAmountMap.get(b.address.toLowerCase()) ?? 0n
            // Sort by total bribe amount
            comparison = aAmount < bAmount ? -1 : aAmount > bAmount ? 1 : 0
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
    gaugeBribeAmountMap,
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
          <SpringIn delay={0} variant="card">
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
          </SpringIn>
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
              <SpringIn delay={0} variant="card">
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
                            "@media (max-width: 768px)": {
                              gridTemplateColumns: "1fr 1fr",
                            },
                            "@media (max-width: 480px)": {
                              gridTemplateColumns: "1fr",
                              gap: "12px",
                            },
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
                          flexWrap: "wrap",
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
                        <div
                          className={css({
                            overflowX: "auto",
                            WebkitOverflowScrolling: "touch",
                            margin: "0 -16px",
                            padding: "0 16px",
                            "@media (max-width: 768px)": {
                              margin: "0 -12px",
                              padding: "0 12px",
                            },
                          })}
                        >
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
                                backgroundColor: theme.colors.backgroundSecondary,
                                whiteSpace: "nowrap",
                              },
                            },
                            TableBodyRow: {
                              style: {
                                backgroundColor: theme.colors.backgroundPrimary,
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
                              const profile = gaugeProfiles.get(gauge.address.toLowerCase())
                              return (
                                <div
                                  className={css({
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "12px",
                                  })}
                                >
                                  {/* Profile Picture */}
                                  <div
                                    className={css({
                                      width: "36px",
                                      height: "36px",
                                      borderRadius: "50%",
                                      backgroundColor: theme.colors.backgroundSecondary,
                                      display: "flex",
                                      alignItems: "center",
                                      justifyContent: "center",
                                      overflow: "hidden",
                                      flexShrink: 0,
                                      border: `1px solid ${theme.colors.borderOpaque}`,
                                    })}
                                  >
                                    {profile?.profile_picture_url ? (
                                      <img
                                        src={profile.profile_picture_url}
                                        alt={`Gauge #${gauge.veBTCTokenId.toString()}`}
                                        className={css({
                                          width: "100%",
                                          height: "100%",
                                          objectFit: "cover",
                                        })}
                                      />
                                    ) : (
                                      <LabelSmall
                                        color={theme.colors.contentSecondary}
                                        overrides={{
                                          Block: {
                                            style: { fontSize: "10px" },
                                          },
                                        }}
                                      >
                                        #{gauge.veBTCTokenId > 0n ? gauge.veBTCTokenId.toString() : "?"}
                                      </LabelSmall>
                                    )}
                                  </div>
                                  {/* Gauge Info */}
                                  <div
                                    className={css({
                                      display: "flex",
                                      flexDirection: "column",
                                      gap: "2px",
                                      minWidth: 0,
                                    })}
                                  >
                                    <div
                                      className={css({
                                        display: "flex",
                                        alignItems: "center",
                                        gap: "6px",
                                        flexWrap: "wrap",
                                      })}
                                    >
                                      <LabelSmall
                                        color={
                                          profile?.display_name || profile?.description || profile?.profile_picture_url
                                            ? theme.colors.positive
                                            : theme.colors.negative
                                        }
                                      >
                                        {profile?.display_name
                                          ? profile.display_name
                                          : gauge.veBTCTokenId > 0n
                                            ? `veBTC #${gauge.veBTCTokenId.toString()}`
                                            : `${gauge.address.slice(0, 6)}...${gauge.address.slice(-4)}`}
                                      </LabelSmall>
                                      {profile?.display_name && gauge.veBTCTokenId > 0n && (
                                        <span
                                          className={css({
                                            display: "inline-flex",
                                            alignItems: "center",
                                            padding: "1px 5px",
                                            borderRadius: "4px",
                                            backgroundColor: "rgba(247, 147, 26, 0.15)",
                                            border: "1px solid rgba(247, 147, 26, 0.3)",
                                            fontSize: "9px",
                                            fontWeight: 600,
                                            color: "#F7931A",
                                            fontFamily: "monospace",
                                            letterSpacing: "0.5px",
                                          })}
                                        >
                                          #{gauge.veBTCTokenId.toString()}
                                        </span>
                                      )}
                                    </div>
                                    {profile?.description && (
                                      <ParagraphSmall
                                        color={theme.colors.contentSecondary}
                                        overrides={{
                                          Block: {
                                            style: {
                                              overflow: "hidden",
                                              textOverflow: "ellipsis",
                                              whiteSpace: "nowrap",
                                              maxWidth: "150px",
                                              margin: 0,
                                            },
                                          },
                                        }}
                                      >
                                        {profile.description}
                                      </ParagraphSmall>
                                    )}
                                  </div>
                                </div>
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
                          <TableBuilderColumn
                            header={
                              <GaugeSortableHeader column="bribes">
                                Bribes
                              </GaugeSortableHeader>
                            }
                          >
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
                        </div>
                      )}
                    </div>

                    {/* Vote Buttons */}
                    <div
                      className={css({
                        display: "flex",
                        gap: "16px",
                        marginTop: "8px",
                        flexWrap: "wrap",
                        "@media (max-width: 480px)": {
                          flexDirection: "column",
                          gap: "12px",
                        },
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
              </SpringIn>
            )}

            {/* Empty state when no locks */}
            {veMEZOLocks.length === 0 && (
              <SpringIn delay={0} variant="card">
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
              </SpringIn>
              )}
          </>
        )}
      </div>
    </Layout>
  )
}
