import { AddressLink } from "@/components/AddressLink"
import { Layout } from "@/components/Layout"
import { useBoostGauges, useVoterTotals } from "@/hooks/useGauges"
import type { BoostGauge } from "@/hooks/useGauges"
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
    if (sortColumn !== column) return null
    return sortDirection === "asc" ? (
      <ChevronUp size={16} />
    ) : (
      <ChevronDown size={16} />
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
          default:
            return 0
        }

        return sortDirection === "asc" ? comparison : -comparison
      })
    }

    return result
  }, [gauges, sortColumn, sortDirection, statusFilter])

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
          <Card withBorder overrides={{}}>
            <div className={css({ padding: "8px 0" })}>
              <LabelSmall color={theme.colors.contentSecondary}>
                Total Gauges
              </LabelSmall>
              <HeadingMedium>{totalGauges}</HeadingMedium>
            </div>
          </Card>

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
        ) : (
          <>
            <div
              className={css({
                display: "flex",
                gap: "8px",
                alignItems: "center",
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
          </>
        )}
      </div>
    </Layout>
  )
}
