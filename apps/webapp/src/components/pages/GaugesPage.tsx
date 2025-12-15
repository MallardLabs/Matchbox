import { AddressLink } from "@/components/AddressLink"
import { Layout } from "@/components/Layout"
import { SpringIn } from "@/components/SpringIn"
import { useBoostGauges, useVoterTotals } from "@/hooks/useGauges"
import type { BoostGauge } from "@/hooks/useGauges"
import { useBribeAddress, useBribeIncentives } from "@/hooks/useVoting"
import { useReadContracts } from "wagmi"
import { getContractConfig } from "@/config/contracts"
import { CHAIN_ID } from "@repo/shared/contracts"
import { formatFixedPoint, formatMultiplier } from "@/utils/format"
import {
  Card,
  ChevronDown,
  ChevronUp,
  HeadingLarge,
  HeadingMedium,
  LabelSmall,
  ParagraphMedium,
  Skeleton,
  TableBuilder,
  TableBuilderColumn,
  Tag,
  useStyletron,
} from "@mezo-org/mezo-clay"
import type React from "react"
import { useCallback, useMemo, useState } from "react"
import { formatUnits } from "viem"

type SortColumn =
  | "veBTCWeight"
  | "veMEZOWeight"
  | "boost"
  | "optimalVeMEZO"
  | "bribes"
  | null
type SortDirection = "asc" | "desc"
type StatusFilter = "all" | "active" | "inactive"

const GaugeBribesCell = ({ gaugeAddress }: { gaugeAddress: `0x${string}` }) => {
  const [css, theme] = useStyletron()
  const {
    bribeAddress,
    hasBribe,
    isLoading: isLoadingBribe,
  } = useBribeAddress(gaugeAddress)
  const { incentives, isLoading: isLoadingIncentives } =
    useBribeIncentives(bribeAddress)

  if (isLoadingBribe || isLoadingIncentives) {
    return (
      <LabelSmall color={theme.colors.contentSecondary}>Loading...</LabelSmall>
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

export default function GaugesPage() {
  const [css, theme] = useStyletron()
  const { gauges, isLoading, totalGauges } = useBoostGauges()
  const {
    boostVoterTotalWeight,
    veMEZOTotalVotingPower,
    veBTCTotalVotingPower,
  } = useVoterTotals()

  // Load bribe addresses for all gauges for sorting
  const contracts = getContractConfig(CHAIN_ID.testnet)
  const gaugeAddresses = gauges.map((g) => g.address)
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

  const [sortColumn, setSortColumn] = useState<SortColumn>("optimalVeMEZO")
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc")
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all")

  const handleSort = useCallback(
    (column: SortColumn) => {
      if (sortColumn === column) {
        setSortDirection((d) => (d === "asc" ? "desc" : "asc"))
      } else {
        setSortColumn(column)
        setSortDirection("desc")
      }
    },
    [sortColumn],
  )

  const getSortIndicator = (column: SortColumn) => {
    if (sortColumn === column) {
      return sortDirection === "asc" ? (
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

  const SortableHeader = ({
    column,
    children,
  }: {
    column: SortColumn
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
      onClick={() => handleSort(column)}
    >
      {children}
      {getSortIndicator(column)}
    </button>
  )

  const filteredAndSortedGauges = useMemo(() => {
    let result = [...gauges]

    // Filter by status
    if (statusFilter === "active") {
      result = result.filter((g) => g.isAlive)
    } else if (statusFilter === "inactive") {
      result = result.filter((g) => !g.isAlive)
    }

    // Sort
    if (sortColumn) {
      result.sort((a, b) => {
        let comparison: number

        switch (sortColumn) {
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

        return sortDirection === "asc" ? comparison : -comparison
      })
    }

    return result
  }, [gauges, sortColumn, sortDirection, statusFilter, gaugeBribeAmountMap])

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
            veBTC Boost Gauges
          </HeadingLarge>
          <ParagraphMedium color={theme.colors.contentSecondary}>
            Vote with your veMEZO to boost veBTC locks and earn incentives
          </ParagraphMedium>
        </div>

        <div
          className={css({
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: "16px",
          })}
        >
          <SpringIn delay={0} variant="card">
            <Card withBorder overrides={{}}>
              <div className={css({ padding: "8px 0" })}>
                <LabelSmall color={theme.colors.contentSecondary}>
                  Total Gauges
                </LabelSmall>
                <HeadingMedium>{totalGauges}</HeadingMedium>
              </div>
            </Card>
          </SpringIn>

          <SpringIn delay={1} variant="card">
            <Card withBorder overrides={{}}>
              <div className={css({ padding: "8px 0" })}>
                <LabelSmall color={theme.colors.contentSecondary}>
                  Total veMEZO Votes
                </LabelSmall>
                <HeadingMedium>
                  {boostVoterTotalWeight
                    ? `${formatUnits(boostVoterTotalWeight, 18).slice(0, 10)}`
                    : "0"}
                </HeadingMedium>
              </div>
            </Card>
          </SpringIn>

          <SpringIn delay={2} variant="card">
            <Card withBorder overrides={{}}>
              <div className={css({ padding: "8px 0" })}>
                <LabelSmall color={theme.colors.contentSecondary}>
                  Total veMEZO Power
                </LabelSmall>
                <HeadingMedium>
                  {veMEZOTotalVotingPower
                    ? `${formatUnits(veMEZOTotalVotingPower, 18).slice(0, 10)}`
                    : "0"}
                </HeadingMedium>
              </div>
            </Card>
          </SpringIn>

          <SpringIn delay={3} variant="card">
            <Card withBorder overrides={{}}>
              <div className={css({ padding: "8px 0" })}>
                <LabelSmall color={theme.colors.contentSecondary}>
                  Total veBTC Power
                </LabelSmall>
                <HeadingMedium>
                  {veBTCTotalVotingPower
                    ? `${formatUnits(veBTCTotalVotingPower, 18).slice(0, 10)}`
                    : "0"}
                </HeadingMedium>
              </div>
            </Card>
          </SpringIn>
        </div>

        {isLoading ? (
          <div
            className={css({
              display: "flex",
              flexDirection: "column",
              gap: "16px",
            })}
          >
            <Skeleton width="100%" height="100px" animation />
            <Skeleton width="100%" height="100px" animation />
            <Skeleton width="100%" height="100px" animation />
          </div>
        ) : gauges.length === 0 ? (
          <SpringIn delay={4} variant="card">
            <Card withBorder overrides={{}}>
              <div
                className={css({
                  padding: "48px",
                  textAlign: "center",
                })}
              >
                <ParagraphMedium color={theme.colors.contentSecondary}>
                  No boost gauges found. veBTC holders can create gauges to
                  attract veMEZO votes.
                </ParagraphMedium>
              </div>
            </Card>
          </SpringIn>
        ) : (
          <SpringIn delay={4} variant="card">
            <Card title="Gauges" withBorder overrides={{}}>
            <div className={css({ padding: "16px 0" })}>
              <div
                className={css({
                  display: "flex",
                  gap: "8px",
                  alignItems: "center",
                  marginBottom: "16px",
                })}
              >
                <LabelSmall color={theme.colors.contentSecondary}>
                  Filter by status:
                </LabelSmall>
                <Tag
                  closeable={false}
                  onClick={() => setStatusFilter("all")}
                  color={statusFilter === "all" ? "blue" : "gray"}
                >
                  All
                </Tag>
                <Tag
                  closeable={false}
                  onClick={() => setStatusFilter("active")}
                  color={statusFilter === "active" ? "green" : "gray"}
                >
                  Active
                </Tag>
                <Tag
                  closeable={false}
                  onClick={() => setStatusFilter("inactive")}
                  color={statusFilter === "inactive" ? "red" : "gray"}
                >
                  Inactive
                </Tag>
              </div>

              <TableBuilder
              data={filteredAndSortedGauges}
              overrides={{
                Root: {
                  style: {
                    maxHeight: "600px",
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
                {(gauge: BoostGauge) => (
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
                  <SortableHeader column="veBTCWeight">
                    veBTC Weight
                  </SortableHeader>
                }
              >
                {(gauge: BoostGauge) =>
                  gauge.veBTCWeight !== undefined
                    ? formatUnits(gauge.veBTCWeight, 18).slice(0, 10)
                    : "-"
                }
              </TableBuilderColumn>
              <TableBuilderColumn
                header={
                  <SortableHeader column="veMEZOWeight">
                    veMEZO Weight
                  </SortableHeader>
                }
              >
                {(gauge: BoostGauge) =>
                  formatUnits(gauge.totalWeight, 18).slice(0, 10)
                }
              </TableBuilderColumn>
              <TableBuilderColumn
                header={<SortableHeader column="boost">Boost</SortableHeader>}
              >
                {(gauge: BoostGauge) => formatMultiplier(gauge.boostMultiplier)}
              </TableBuilderColumn>
              <TableBuilderColumn
                header={
                  <SortableHeader column="bribes">Bribes</SortableHeader>
                }
              >
                {(gauge: BoostGauge) => (
                  <GaugeBribesCell gaugeAddress={gauge.address} />
                )}
              </TableBuilderColumn>
              <TableBuilderColumn
                header={
                  <SortableHeader column="optimalVeMEZO">
                    Optimal veMEZO
                  </SortableHeader>
                }
              >
                {(gauge: BoostGauge) =>
                  gauge.optimalAdditionalVeMEZO !== undefined
                    ? formatFixedPoint(gauge.optimalAdditionalVeMEZO)
                    : "-"
                }
              </TableBuilderColumn>
              <TableBuilderColumn header="Status">
                {(gauge: BoostGauge) => (
                  <Tag
                    color={gauge.isAlive ? "green" : "red"}
                    closeable={false}
                  >
                    {gauge.isAlive ? "Active" : "Inactive"}
                  </Tag>
                )}
              </TableBuilderColumn>
              </TableBuilder>
            </div>
          </Card>
          </SpringIn>
        )}
      </div>
    </Layout>
  )
}
