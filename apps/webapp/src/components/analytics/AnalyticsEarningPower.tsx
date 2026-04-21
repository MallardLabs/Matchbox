import { SpringIn } from "@/components/SpringIn"
import { useVoterTotals } from "@/hooks/useGauges"
import { useProtocolHistory } from "@/hooks/useProtocolHistory"
import { Skeleton } from "@mezo-org/mezo-clay"
import { useMemo } from "react"
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { formatUnits } from "viem"

function formatCompactNumber(value: bigint | undefined): string {
  if (value === undefined) return "—"
  const num = Number(formatUnits(value, 18))
  if (!Number.isFinite(num)) return "—"
  if (num >= 1_000_000_000) return `${(num / 1_000_000_000).toFixed(2)}B`
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(2)}M`
  if (num >= 1_000) return `${(num / 1_000).toFixed(2)}K`
  return num.toLocaleString(undefined, { maximumFractionDigits: 2 })
}

function formatCompactNumberFromString(value: string): number {
  // totalVemezoWeight comes back as a raw string (1e18 precision).
  // Convert to a float for charting purposes.
  try {
    return Number(formatUnits(BigInt(value), 18))
  } catch {
    return 0
  }
}

function formatChartValue(value: number): string {
  if (!Number.isFinite(value)) return "0"
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}B`
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`
  return value.toFixed(0)
}

function formatDateLabel(epochStart: number): string {
  const date = new Date(epochStart * 1000)
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

type TooltipDatum = {
  dateLabel: string
  vemezoWeight: number
  epochStart: number
}

type TooltipProps = {
  active?: boolean
  payload?: Array<{ payload: TooltipDatum }>
}

function CustomTooltip({ active, payload }: TooltipProps) {
  if (!active || !payload || payload.length === 0) return null
  const first = payload[0]
  if (!first) return null
  const datum = first.payload
  const date = new Date(datum.epochStart * 1000)

  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--surface-elevated)] p-3 font-mono text-xs shadow-terminal-md">
      <div className="text-[var(--content-tertiary)]">
        {date.toLocaleDateString("en-US", {
          year: "numeric",
          month: "short",
          day: "numeric",
        })}
      </div>
      <div className="mt-1 text-sm font-bold text-[var(--content-primary)]">
        {formatChartValue(datum.vemezoWeight)}
      </div>
      <div className="mt-1 text-2xs text-[var(--content-secondary)]">
        veMEZO weight
      </div>
    </div>
  )
}

export function AnalyticsEarningPower(): JSX.Element {
  const {
    veBTCTotalVotingPower,
    veMEZOTotalVotingPower,
    isLoading: isLoadingVoter,
  } = useVoterTotals()
  const { epochs, isLoading: isLoadingHistory } = useProtocolHistory("3m")

  const chartData = useMemo(() => {
    return epochs.map((e) => ({
      dateLabel: formatDateLabel(e.epochStart),
      vemezoWeight: formatCompactNumberFromString(e.totalVemezoWeight),
      epochStart: e.epochStart,
    }))
  }, [epochs])

  const hasChartData = chartData.some((d) => d.vemezoWeight > 0)

  return (
    <SpringIn delay={7} variant="default">
      <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-6 shadow-terminal-sm">
        <header className="mb-4 flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
          <div>
            <h2 className="font-mono text-lg font-bold text-[var(--content-primary)]">
              <span className="text-[#F7931A]">$</span> earning power
            </h2>
            <p className="mt-1 font-mono text-xs text-[var(--content-secondary)]">
              Total veBTC and veMEZO voting power over time
            </p>
          </div>
        </header>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-secondary)] p-4">
            <div className="text-2xs uppercase tracking-wider text-[var(--content-tertiary)]">
              veBTC voting power
            </div>
            <div className="mt-2">
              {isLoadingVoter && veBTCTotalVotingPower === undefined ? (
                <Skeleton height="32px" width="60%" />
              ) : (
                <div className="font-mono text-xl font-bold text-[var(--content-primary)]">
                  {formatCompactNumber(veBTCTotalVotingPower)}
                </div>
              )}
            </div>
            <div className="mt-1 font-mono text-2xs text-[var(--content-secondary)]">
              locked BTC earning power
            </div>
          </div>
          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-secondary)] p-4">
            <div className="text-2xs uppercase tracking-wider text-[var(--content-tertiary)]">
              veMEZO voting power
            </div>
            <div className="mt-2">
              {isLoadingVoter && veMEZOTotalVotingPower === undefined ? (
                <Skeleton height="32px" width="60%" />
              ) : (
                <div className="font-mono text-xl font-bold text-[var(--content-primary)]">
                  {formatCompactNumber(veMEZOTotalVotingPower)}
                </div>
              )}
            </div>
            <div className="mt-1 font-mono text-2xs text-[var(--content-secondary)]">
              locked MEZO boosting power
            </div>
          </div>
        </div>

        <div className="mt-6">
          <div className="mb-2 font-mono text-2xs uppercase tracking-wider text-[var(--content-tertiary)]">
            veMEZO weight history (90d)
          </div>
          <div className="h-56 w-full">
            {isLoadingHistory ? (
              <div className="flex h-full items-center justify-center">
                <Skeleton height="90%" width="100%" />
              </div>
            ) : !hasChartData ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 font-mono text-xs text-[var(--content-tertiary)]">
                <div>
                  <span className="text-[#F7931A]">$</span> no historical data
                </div>
                <div className="text-2xs">
                  Weight history will appear once epochs accumulate
                </div>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={chartData}
                  margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                >
                  <defs>
                    <linearGradient
                      id="earningPowerGradient"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop
                        offset="0%"
                        stopColor="var(--positive)"
                        stopOpacity={0.35}
                      />
                      <stop
                        offset="100%"
                        stopColor="var(--positive)"
                        stopOpacity={0.02}
                      />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="var(--border)"
                    opacity={0.4}
                  />
                  <XAxis
                    dataKey="dateLabel"
                    stroke="var(--content-tertiary)"
                    style={{
                      fontFamily: "IBM Plex Mono, monospace",
                      fontSize: "11px",
                    }}
                    tickLine={false}
                    axisLine={{ stroke: "var(--border)" }}
                  />
                  <YAxis
                    stroke="var(--content-tertiary)"
                    style={{
                      fontFamily: "IBM Plex Mono, monospace",
                      fontSize: "11px",
                    }}
                    tickFormatter={(v) => formatChartValue(Number(v))}
                    tickLine={false}
                    axisLine={{ stroke: "var(--border)" }}
                    width={56}
                  />
                  <Tooltip
                    content={<CustomTooltip />}
                    cursor={{
                      stroke: "var(--border)",
                      strokeDasharray: "3 3",
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="vemezoWeight"
                    stroke="var(--positive)"
                    strokeWidth={2}
                    fill="url(#earningPowerGradient)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </section>
    </SpringIn>
  )
}

export default AnalyticsEarningPower
