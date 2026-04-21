import { SpringIn } from "@/components/SpringIn"
import {
  type HistoryPeriod,
  type ProtocolEpochDatum,
  useProtocolHistory,
} from "@/hooks/useProtocolHistory"
import { Skeleton } from "@mezo-org/mezo-clay"
import { useMemo, useState } from "react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

const PERIOD_LABELS: Record<HistoryPeriod, string> = {
  "1m": "1 Month",
  "3m": "3 Months",
  all: "All Time",
}

function formatDateLabel(epochStart: number): string {
  const date = new Date(epochStart * 1000)
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

function formatCompactUsd(value: number): string {
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`
  return `$${value.toFixed(2)}`
}

type ChartDatum = {
  dateLabel: string
  incentives: number
  raw: ProtocolEpochDatum
}

type TooltipProps = {
  active?: boolean
  payload?: Array<{ payload: ChartDatum }>
}

function CustomTooltip({ active, payload }: TooltipProps) {
  if (!active || !payload || payload.length === 0) return null
  const first = payload[0]
  if (!first) return null
  const datum = first.payload
  const date = new Date(datum.raw.epochStart * 1000)

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
        {formatCompactUsd(datum.incentives)}
      </div>
      <div className="mt-1 text-2xs text-[var(--content-secondary)]">
        {datum.raw.gaugeCount} gauges
      </div>
    </div>
  )
}

type PeriodPillProps = {
  period: HistoryPeriod
  activePeriod: HistoryPeriod
  onClick: (p: HistoryPeriod) => void
}

function PeriodPill({ period, activePeriod, onClick }: PeriodPillProps) {
  const isActive = period === activePeriod
  return (
    <button
      type="button"
      onClick={() => onClick(period)}
      className={`rounded-md border px-2.5 py-1 font-mono text-2xs uppercase tracking-wider transition-colors ${
        isActive
          ? "border-[#F7931A] bg-brand-subtle text-[#F7931A]"
          : "border-[var(--border)] text-[var(--content-secondary)] hover:bg-[var(--surface-secondary)]"
      }`}
    >
      {PERIOD_LABELS[period]}
    </button>
  )
}

export function AnalyticsRevenueChart(): JSX.Element {
  const [period, setPeriod] = useState<HistoryPeriod>("all")
  const { epochs, isLoading } = useProtocolHistory(period)

  const { chartData, totalUsd } = useMemo(() => {
    const data: ChartDatum[] = epochs.map((e) => ({
      dateLabel: formatDateLabel(e.epochStart),
      incentives: e.totalIncentivesUsd,
      raw: e,
    }))
    const total = data.reduce((sum, d) => sum + d.incentives, 0)
    return { chartData: data, totalUsd: total }
  }, [epochs])

  return (
    <SpringIn delay={4} variant="default">
      <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-6 shadow-terminal-sm">
        <header className="mb-4 flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
          <div>
            <h2 className="font-mono text-lg font-bold text-[var(--content-primary)]">
              <span className="text-[#F7931A]">$</span> protocol revenue
            </h2>
            <p className="mt-1 font-mono text-xs text-[var(--content-secondary)]">
              Weekly gauge incentives distributed to voters
            </p>
          </div>
          <div className="flex items-center gap-3">
            {isLoading ? (
              <Skeleton height="24px" width="120px" />
            ) : (
              <div className="font-mono text-sm font-bold text-[var(--content-primary)]">
                {formatCompactUsd(totalUsd)}
                <span className="ml-1 text-2xs font-normal text-[var(--content-tertiary)]">
                  total
                </span>
              </div>
            )}
            <div className="flex gap-1">
              <PeriodPill
                period="1m"
                activePeriod={period}
                onClick={setPeriod}
              />
              <PeriodPill
                period="3m"
                activePeriod={period}
                onClick={setPeriod}
              />
              <PeriodPill
                period="all"
                activePeriod={period}
                onClick={setPeriod}
              />
            </div>
          </div>
        </header>

        <div className="h-72 w-full">
          {isLoading ? (
            <div className="flex h-full items-center justify-center">
              <Skeleton height="90%" width="100%" />
            </div>
          ) : chartData.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 font-mono text-xs text-[var(--content-tertiary)]">
              <div>
                <span className="text-[#F7931A]">$</span> no data available
              </div>
              <div className="text-2xs">
                Historical gauge data will appear here once recorded
              </div>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartData}
                margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
              >
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
                  tickFormatter={(v) => formatCompactUsd(Number(v))}
                  tickLine={false}
                  axisLine={{ stroke: "var(--border)" }}
                  width={56}
                />
                <Tooltip
                  content={<CustomTooltip />}
                  cursor={{ fill: "var(--surface-secondary)", opacity: 0.3 }}
                />
                <Bar
                  dataKey="incentives"
                  fill="#F7931A"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={40}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </section>
    </SpringIn>
  )
}

export default AnalyticsRevenueChart
