import { Layout } from "@/components/Layout"
import { SpringIn } from "@/components/SpringIn"
import { formatAPY, useGaugesAPY } from "@/hooks/useAPY"
import { useAllGaugeProfiles } from "@/hooks/useGaugeProfiles"
import { useBoostGauges, useVoterTotals } from "@/hooks/useGauges"
import type { BoostGauge } from "@/hooks/useGauges"
import { formatFixedPoint, formatMultiplier } from "@/utils/format"
import {
  Card,
  ChevronDown,
  ChevronUp,
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

type SortColumn =
  | "veBTCWeight"
  | "veMEZOWeight"
  | "boost"
  | "optimalVeMEZO"
  | "apy"
  | null
type SortDirection = "asc" | "desc"
type StatusFilter = "all" | "active" | "inactive"

export default function GaugesPage(): JSX.Element {
  const [, theme] = useStyletron()
  const { gauges, isLoading, totalGauges } = useBoostGauges()
  const {
    boostVoterTotalWeight,
    veMEZOTotalVotingPower,
    veBTCTotalVotingPower,
  } = useVoterTotals()

  const { profiles: gaugeProfiles } = useAllGaugeProfiles()

  const gaugesForAPY = useMemo(
    () =>
      gauges.map((g) => ({ address: g.address, totalWeight: g.totalWeight })),
    [gauges],
  )
  const { apyMap, isLoading: isLoadingAPY } = useGaugesAPY(gaugesForAPY)

  const [sortColumn, setSortColumn] = useState<SortColumn>("apy")
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
    return (
      <span className="opacity-30">
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
      className="inline-flex cursor-pointer items-center gap-1 border-none bg-transparent p-0 font-inherit text-inherit"
      onClick={() => handleSort(column)}
    >
      {children}
      {getSortIndicator(column)}
    </button>
  )

  const filteredAndSortedGauges = useMemo(() => {
    let result = [...gauges]

    if (statusFilter === "active") {
      result = result.filter((g) => g.isAlive)
    } else if (statusFilter === "inactive") {
      result = result.filter((g) => !g.isAlive)
    }

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
          case "apy": {
            const aAPY = apyMap.get(a.address.toLowerCase())?.apy ?? -1
            const bAPY = apyMap.get(b.address.toLowerCase())?.apy ?? -1
            comparison = aAPY < bAPY ? -1 : aAPY > bAPY ? 1 : 0
            break
          }
          default:
            return 0
        }

        return sortDirection === "asc" ? comparison : -comparison
      })
    }

    return result
  }, [gauges, sortColumn, sortDirection, statusFilter, apyMap])

  return (
    <Layout>
      <div className="flex flex-col gap-6">
        {/* Page Header */}
        <header>
          <h1 className="mb-2 text-2xl font-semibold text-[var(--content-primary)]">
            <span className="mr-2 text-[#F7931A]">$</span>
            gauges --list
          </h1>
          <p className="text-sm text-[var(--content-secondary)]">
            Vote with your veMEZO to boost veBTC locks and earn incentives
          </p>
        </header>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:gap-4 lg:grid-cols-4">
          <SpringIn delay={0} variant="card">
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
              <p className="mb-1 text-2xs uppercase tracking-wider text-[var(--content-tertiary)]">
                Total Gauges
              </p>
              <p className="font-mono text-2xl font-semibold text-[var(--content-primary)]">
                {totalGauges}
              </p>
            </div>
          </SpringIn>

          <SpringIn delay={1} variant="card">
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
              <p className="mb-1 text-2xs uppercase tracking-wider text-[var(--content-tertiary)]">
                Total veMEZO Votes
              </p>
              <p className="font-mono text-2xl font-semibold tabular-nums text-[var(--content-primary)]">
                {boostVoterTotalWeight
                  ? `${formatUnits(boostVoterTotalWeight, 18).slice(0, 10)}`
                  : "0"}
              </p>
            </div>
          </SpringIn>

          <SpringIn delay={2} variant="card">
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
              <p className="mb-1 text-2xs uppercase tracking-wider text-[var(--content-tertiary)]">
                Total veMEZO Power
              </p>
              <p className="font-mono text-2xl font-semibold tabular-nums text-[var(--content-primary)]">
                {veMEZOTotalVotingPower
                  ? `${formatUnits(veMEZOTotalVotingPower, 18).slice(0, 10)}`
                  : "0"}
              </p>
            </div>
          </SpringIn>

          <SpringIn delay={3} variant="card">
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
              <p className="mb-1 text-2xs uppercase tracking-wider text-[var(--content-tertiary)]">
                Total veBTC Power
              </p>
              <p className="font-mono text-2xl font-semibold tabular-nums text-[var(--content-primary)]">
                {veBTCTotalVotingPower
                  ? `${formatUnits(veBTCTotalVotingPower, 18).slice(0, 10)}`
                  : "0"}
              </p>
            </div>
          </SpringIn>
        </div>

        {/* Gauges Table */}
        {isLoading ? (
          <div className="flex flex-col gap-4">
            <Skeleton width="100%" height="100px" animation />
            <Skeleton width="100%" height="100px" animation />
            <Skeleton width="100%" height="100px" animation />
          </div>
        ) : gauges.length === 0 ? (
          <SpringIn delay={4} variant="card">
            <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface)] p-12 text-center">
              <p className="font-mono text-sm text-[var(--content-secondary)]">
                <span className="text-[#F7931A]">$</span> no gauges found
              </p>
              <p className="mt-2 text-xs text-[var(--content-tertiary)]">
                veBTC holders can create gauges to attract veMEZO votes
              </p>
            </div>
          </SpringIn>
        ) : (
          <SpringIn delay={4} variant="card">
            <Card title="Gauges" withBorder overrides={{}}>
              <div className="py-4">
                {/* Filter Buttons */}
                <div className="mb-4 flex flex-wrap items-center gap-2">
                  <span className="text-xs text-[var(--content-secondary)]">
                    Filter:
                  </span>
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

                {/* Table Container */}
                <div className="-mx-4 overflow-x-auto px-4 md:-mx-3 md:px-3">
                  <TableBuilder
                    data={filteredAndSortedGauges}
                    overrides={{
                      Root: {
                        style: {
                          maxHeight: "600px",
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
                      {(gauge: BoostGauge) => {
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
                                    <span className="rounded bg-[rgba(247,147,26,0.15)] px-1.5 py-0.5 font-mono text-2xs font-semibold tracking-wide text-[#F7931A]">
                                      #{gauge.veBTCTokenId.toString()}
                                    </span>
                                  )}
                              </div>
                              {profile?.description && (
                                <span className="max-w-[200px] truncate text-2xs text-[var(--content-secondary)]">
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
                        <SortableHeader column="veBTCWeight">
                          veBTC Weight
                        </SortableHeader>
                      }
                    >
                      {(gauge: BoostGauge) => (
                        <span className="font-mono text-sm tabular-nums">
                          {gauge.veBTCWeight !== undefined
                            ? formatUnits(gauge.veBTCWeight, 18).slice(0, 10)
                            : "-"}
                        </span>
                      )}
                    </TableBuilderColumn>
                    <TableBuilderColumn
                      header={
                        <SortableHeader column="veMEZOWeight">
                          veMEZO Weight
                        </SortableHeader>
                      }
                    >
                      {(gauge: BoostGauge) => (
                        <span className="font-mono text-sm tabular-nums">
                          {formatUnits(gauge.totalWeight, 18).slice(0, 10)}
                        </span>
                      )}
                    </TableBuilderColumn>
                    <TableBuilderColumn
                      header={
                        <SortableHeader column="boost">Boost</SortableHeader>
                      }
                    >
                      {(gauge: BoostGauge) => (
                        <span className="font-mono text-sm tabular-nums">
                          {formatMultiplier(gauge.boostMultiplier)}
                        </span>
                      )}
                    </TableBuilderColumn>
                    <TableBuilderColumn
                      header={<SortableHeader column="apy">APY</SortableHeader>}
                    >
                      {(gauge: BoostGauge) => {
                        const apyData = apyMap.get(gauge.address.toLowerCase())
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
                        <SortableHeader column="optimalVeMEZO">
                          Optimal veMEZO
                        </SortableHeader>
                      }
                    >
                      {(gauge: BoostGauge) => (
                        <span className="font-mono text-sm tabular-nums">
                          {gauge.optimalAdditionalVeMEZO !== undefined
                            ? formatFixedPoint(gauge.optimalAdditionalVeMEZO)
                            : "-"}
                        </span>
                      )}
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
              </div>
            </Card>
          </SpringIn>
        )}
      </div>
    </Layout>
  )
}
