import { Layout } from "@/components/Layout"
import { SpringIn } from "@/components/SpringIn"
import { useBoostGauges, useVoterTotals } from "@/hooks/useGauges"
import type { BoostGauge } from "@/hooks/useGauges"
import { useAllGaugeProfiles } from "@/hooks/useGaugeProfiles"
import { useGaugesAPY, formatAPY } from "@/hooks/useAPY"
import { formatFixedPoint, formatMultiplier } from "@/utils/format"
import {
  Card,
  ChevronDown,
  ChevronUp,
  HeadingLarge,
  HeadingMedium,
  LabelSmall,
  ParagraphMedium,
  ParagraphSmall,
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

export default function GaugesPage() {
  const [css, theme] = useStyletron()
  const { gauges, isLoading, totalGauges } = useBoostGauges()
  const {
    boostVoterTotalWeight,
    veMEZOTotalVotingPower,
    veBTCTotalVotingPower,
  } = useVoterTotals()

  // Fetch all gauge profiles from Supabase (pre-fetches all for faster loading)
  const { profiles: gaugeProfiles } = useAllGaugeProfiles()

  // Fetch APY data for all gauges
  const gaugesForAPY = useMemo(
    () => gauges.map((g) => ({ address: g.address, totalWeight: g.totalWeight })),
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
            "@media (max-width: 1024px)": {
              gridTemplateColumns: "repeat(2, 1fr)",
            },
            "@media (max-width: 480px)": {
              gridTemplateColumns: "1fr",
              gap: "12px",
            },
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
                  flexWrap: "wrap",
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
                  const profile = gaugeProfiles.get(gauge.address.toLowerCase())
                  return (
                    <Link
                      href={`/gauges/${gauge.address}`}
                      className={css({
                        display: "flex",
                        alignItems: "center",
                        gap: "12px",
                        textDecoration: "none",
                        color: "inherit",
                        ":hover": {
                          opacity: 0.8,
                        },
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
                                  maxWidth: "200px",
                                  margin: 0,
                                },
                              },
                            }}
                          >
                            {profile.description}
                          </ParagraphSmall>
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
                  <SortableHeader column="apy">APY</SortableHeader>
                }
              >
                {(gauge: BoostGauge) => {
                  const apyData = apyMap.get(gauge.address.toLowerCase())
                  if (isLoadingAPY) {
                    return (
                      <LabelSmall color={theme.colors.contentSecondary}>
                        Loading...
                      </LabelSmall>
                    )
                  }
                  return (
                    <LabelSmall
                      color={
                        apyData?.apy && apyData.apy > 0
                          ? theme.colors.positive
                          : theme.colors.contentSecondary
                      }
                    >
                      {formatAPY(apyData?.apy ?? null)}
                    </LabelSmall>
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
            </div>
          </Card>
          </SpringIn>
        )}
      </div>
    </Layout>
  )
}
