import { SpringIn } from "@/components/SpringIn"
import { useAnalyticsKPIs } from "@/hooks/useAnalyticsKPIs"
import { Skeleton } from "@mezo-org/mezo-clay"
import { formatUnits } from "viem"

function formatCompactUsd(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—"
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`
  if (value >= 1_000) return `$${(value / 1_000).toFixed(2)}K`
  return `$${value.toLocaleString(undefined, {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  })}`
}

function formatCompactNumber(value: bigint | undefined): string {
  if (value === undefined) return "—"
  const num = Number(formatUnits(value, 18))
  if (!Number.isFinite(num)) return "—"
  if (num >= 1_000_000_000) return `${(num / 1_000_000_000).toFixed(2)}B`
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(2)}M`
  if (num >= 1_000) return `${(num / 1_000).toFixed(2)}K`
  return num.toLocaleString(undefined, { maximumFractionDigits: 2 })
}

// Simple inline SVG icons matching the terminal/monospace aesthetic.
function TvlIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 3v18h18" />
      <path d="M7 14l4-4 4 4 6-6" />
    </svg>
  )
}

function BtcIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M11.767 19.089c4.924.868 6.14-6.025 1.216-6.894m-1.216 6.894L5.86 18.047m5.908 1.042l-.345 1.97m1.216-8.864c4.924.869 6.14-6.025 1.215-6.893m-1.215 6.893L6.215 12.1m7.06-5.85c-4.922.868-3.706 7.763 1.218 6.894l-5.908-1.042m2.472-11.49L9.86 3.982m2.67 9.28L10.51 18.79" />
    </svg>
  )
}

function FeesIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v12M16 10H9.5a2.5 2.5 0 0 0 0 5h5a2.5 2.5 0 0 1 0 5H8" />
    </svg>
  )
}

function PowerIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  )
}

type KPICardProps = {
  icon: React.ReactNode
  label: string
  value: string
  sublabel?: string
  accent?: "brand" | "positive" | "amber" | "cyan"
  isLoading?: boolean
}

const ACCENT_STYLES: Record<NonNullable<KPICardProps["accent"]>, string> = {
  brand: "text-[#F7931A]",
  positive: "text-[var(--positive)]",
  amber: "text-[#F59E0B]",
  cyan: "text-[#06B6D4]",
}

function KPICard({
  icon,
  label,
  value,
  sublabel,
  accent = "brand",
  isLoading,
}: KPICardProps): JSX.Element {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-terminal-sm transition-all duration-200 hover:shadow-terminal-md">
      <div className="flex items-center gap-2">
        <span className={ACCENT_STYLES[accent]}>{icon}</span>
        <span className="text-2xs uppercase tracking-wider text-[var(--content-tertiary)]">
          {label}
        </span>
      </div>
      <div className="mt-3">
        {isLoading ? (
          <Skeleton height="36px" width="60%" animation />
        ) : (
          <div className="font-mono text-2xl font-bold text-[var(--content-primary)]">
            {value}
          </div>
        )}
      </div>
      {sublabel ? (
        <div className="mt-1 font-mono text-xs text-[var(--content-secondary)]">
          {sublabel}
        </div>
      ) : null}
    </div>
  )
}

export function AnalyticsKPIBar(): JSX.Element {
  const kpis = useAnalyticsKPIs()

  const weekLabel =
    kpis.epochWeek !== null ? `Week ${kpis.epochWeek}` : "Current Epoch"

  // Combine veBTC + veMEZO voting power for the fourth card.
  const combinedVotingPower =
    kpis.veBTCVotingPower !== undefined && kpis.veMEZOVotingPower !== undefined
      ? kpis.veBTCVotingPower + kpis.veMEZOVotingPower
      : undefined

  return (
    <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <SpringIn delay={0} variant="card-subtle">
        <KPICard
          icon={<TvlIcon />}
          label="Global TVL"
          value={formatCompactUsd(kpis.globalTvlUsd)}
          sublabel="veBTC + veMEZO"
          accent="brand"
          isLoading={kpis.isLoading && kpis.globalTvlUsd === null}
        />
      </SpringIn>
      <SpringIn delay={1} variant="card-subtle">
        <KPICard
          icon={<BtcIcon />}
          label="Total Locked BTC"
          value={formatCompactUsd(kpis.totalLockedBtcUsd)}
          sublabel={
            kpis.btcPrice
              ? `@ $${kpis.btcPrice.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
              : undefined
          }
          accent="amber"
          isLoading={kpis.isLoading && kpis.totalLockedBtcUsd === null}
        />
      </SpringIn>
      <SpringIn delay={2} variant="card-subtle">
        <KPICard
          icon={<FeesIcon />}
          label={`${weekLabel} Fees`}
          value={formatCompactUsd(kpis.epochFeesUsd)}
          sublabel={`ends in ${kpis.epochCountdown}`}
          accent="positive"
          isLoading={kpis.isLoading && kpis.epochFeesUsd === null}
        />
      </SpringIn>
      <SpringIn delay={3} variant="card-subtle">
        <KPICard
          icon={<PowerIcon />}
          label="Voting Power"
          value={formatCompactNumber(combinedVotingPower)}
          sublabel={`${kpis.gaugeCount} active gauges`}
          accent="cyan"
          isLoading={kpis.isLoading && combinedVotingPower === undefined}
        />
      </SpringIn>
    </section>
  )
}

export default AnalyticsKPIBar
