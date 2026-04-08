import type { GaugeProfile } from "@/config/supabase"
import { type GaugeAPYData, formatAPY } from "@/hooks/useAPY"
import type { BoostGauge } from "@/hooks/useGauges"
import { formatFixedPoint, formatMultiplier } from "@/utils/format"
import { Tag } from "@mezo-org/mezo-clay"
import Link from "next/link"
import type { ReactNode } from "react"
import { formatUnits } from "viem"
import Tooltip from "./Tooltip"

/** `totalWeight / optimal` — only meaningful when weight is at or above optimal. */
function weightToOptimalRatio(weight: bigint, optimal: bigint): number {
  if (optimal <= 0n) return 1
  return Number((weight * 10000n) / optimal) / 10000
}

/** Red overlay width 0% at 1× optimal → 100% at 2×; stays full past 2×. */
function oversubscribedRedWidthPercent(ratio: number): number {
  if (ratio <= 1) return 0
  return Math.min(100, (ratio - 1) * 100)
}

/** Text color: green at 1×, red at 2× and beyond. */
function oversubscribedStressColor(ratio: number): string {
  if (ratio <= 1) return "var(--positive)"
  if (ratio >= 2) return "var(--negative)"
  const t = ratio - 1
  return `color-mix(in oklab, var(--positive) ${(1 - t) * 100}%, var(--negative) ${t * 100}%)`
}

type GaugeCardProps = {
  gauge: BoostGauge
  profile: GaugeProfile | null
  apyData: GaugeAPYData | undefined
  isLoadingAPY: boolean
  displayAPY?: number | null
  isProjected?: boolean
  isSelected?: boolean
  children?: ReactNode
}

export default function GaugeCard({
  gauge,
  profile,
  apyData,
  isLoadingAPY,
  displayAPY: displayAPYOverride,
  isProjected = false,
  isSelected = false,
  children,
}: GaugeCardProps) {
  const displayAPY =
    displayAPYOverride !== undefined
      ? displayAPYOverride
      : (apyData?.apy ?? null)

  const optimalTarget = gauge.optimalVeMEZO
  const optimalFillPercent =
    optimalTarget !== undefined && optimalTarget > 0n
      ? Math.min(100, Number((gauge.totalWeight * 100n) / optimalTarget))
      : 0
  const atOrAboveOptimal =
    optimalTarget !== undefined &&
    optimalTarget > 0n &&
    gauge.totalWeight >= optimalTarget
  const pastOptimal =
    optimalTarget !== undefined &&
    optimalTarget > 0n &&
    gauge.totalWeight > optimalTarget
  const optimalOverVeMEZO =
    pastOptimal && optimalTarget !== undefined
      ? gauge.totalWeight - optimalTarget
      : 0n
  const weightVsOptimalRatio =
    optimalTarget !== undefined && optimalTarget > 0n
      ? weightToOptimalRatio(gauge.totalWeight, optimalTarget)
      : 1
  const oversubRedBarPct = oversubscribedRedWidthPercent(weightVsOptimalRatio)
  const oversubTextColor = oversubscribedStressColor(weightVsOptimalRatio)
  const optimalAdditional = gauge.optimalAdditionalVeMEZO
  const hasShortfall = optimalAdditional !== undefined && optimalAdditional > 0n

  return (
    <article
      className={`flex flex-col gap-3 rounded-xl border bg-[var(--surface)] p-4 ${
        isSelected ? "border-[var(--positive)]" : "border-[var(--border)]"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <Link
          href={`/gauges/${gauge.address}`}
          className="flex min-w-0 items-center gap-3 text-inherit no-underline"
        >
          <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center overflow-hidden rounded-full border border-[var(--border)] bg-[var(--surface-secondary)]">
            {profile?.profile_picture_url ? (
              <img
                src={profile.profile_picture_url}
                alt={`Gauge #${gauge.veBTCTokenId.toString()}`}
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="text-2xs text-[var(--content-secondary)]">
                #{gauge.veBTCTokenId > 0n ? gauge.veBTCTokenId.toString() : "?"}
              </span>
            )}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p
                className={`text-sm font-semibold ${
                  profile?.display_name ||
                  profile?.description ||
                  profile?.profile_picture_url
                    ? "text-[var(--content-primary)]"
                    : "text-[var(--content-secondary)]"
                }`}
              >
                {profile?.display_name
                  ? profile.display_name
                  : gauge.veBTCTokenId > 0n
                    ? `veBTC #${gauge.veBTCTokenId.toString()}`
                    : `${gauge.address.slice(0, 6)}...${gauge.address.slice(-4)}`}
              </p>
              {profile?.display_name && gauge.veBTCTokenId > 0n && (
                <span className="inline-flex items-center rounded border border-[rgba(247,147,26,0.3)] bg-[rgba(247,147,26,0.15)] px-1.5 py-0.5 font-mono text-2xs font-semibold tracking-wide text-[#F7931A]">
                  #{gauge.veBTCTokenId.toString()}
                </span>
              )}
            </div>
            {profile?.description && (
              <p className="truncate text-2xs text-[var(--content-secondary)]">
                {profile.description}
              </p>
            )}
          </div>
        </Link>
        <Tag color={gauge.isAlive ? "green" : "red"} closeable={false}>
          {gauge.isAlive ? "Active" : "Inactive"}
        </Tag>
      </div>
      <dl className="grid grid-cols-2 gap-3 text-xs">
        <div>
          <dt className="text-[var(--content-tertiary)]">veBTC Weight</dt>
          <dd className="font-mono text-[var(--content-primary)]">
            {gauge.veBTCWeight !== undefined
              ? formatUnits(gauge.veBTCWeight, 18).slice(0, 10)
              : "-"}
          </dd>
        </div>
        <div>
          <dt className="text-[var(--content-tertiary)]">veMEZO Weight</dt>
          <dd className="font-mono text-[var(--content-primary)]">
            {formatUnits(gauge.totalWeight, 18).slice(0, 10)}
          </dd>
        </div>
        <div>
          <dt className="flex items-center gap-1 text-[var(--content-tertiary)]">
            Boost
            <Tooltip
              id={`gc-boost-${gauge.address}`}
              content="The gauge's boost multiplier (1x–5x). Increases as more veMEZO votes are allocated relative to the gauge's veBTC weight."
            />
          </dt>
          <dd className="font-mono text-[var(--content-primary)]">
            {formatMultiplier(gauge.boostMultiplier)}
          </dd>
        </div>
        <div>
          <dt className="flex items-center gap-1 text-[var(--content-tertiary)]">
            APY
            <Tooltip
              id={`gc-apy-${gauge.address}`}
              content="Estimated annualized yield from this gauge's bribe pool divided by total veMEZO voting weight. Higher incentives or fewer voters means higher APY."
            />
          </dt>
          <dd
            className={`font-mono ${
              displayAPY && displayAPY > 0
                ? "text-[var(--positive)]"
                : "text-[var(--content-secondary)]"
            }`}
            title={isProjected ? "Projected APY after your vote" : undefined}
          >
            {isLoadingAPY ? "..." : formatAPY(displayAPY)}
            {isProjected && " \u2193"}
          </dd>
        </div>
        <div className="col-span-2">
          <dt className="flex flex-wrap items-center gap-1.5 text-[var(--content-tertiary)]">
            Optimal veMEZO
            <Tooltip
              id={`gc-optimal-${gauge.address}`}
              content="veMEZO voting weight on this gauge that reaches maximum (5x) boost. System totals are veBTC and veMEZO supply() from escrow—the same bases as the Boost calculator. Below that, the bar fills in orange toward the goal. At the target the bar is green. If oversubscribed, a red layer grows over the green from 0% at 1× to 100% at 2× the optimal weight (full red); beyond 2× the bar stays full red—more veMEZO dilutes rewards per voter."
            />
          </dt>
          <dd className="min-w-0 text-[var(--content-primary)]">
            {optimalTarget === undefined ? (
              <span className="font-mono">-</span>
            ) : (
              <div className="space-y-1.5">
                <div className="flex min-w-0 items-baseline justify-between gap-2">
                  <span
                    className="min-w-0 flex-1 font-mono text-sm leading-snug tracking-tight text-[var(--content-primary)] [overflow-wrap:anywhere]"
                    title={formatFixedPoint(optimalTarget)}
                  >
                    {formatFixedPoint(optimalTarget)}
                  </span>
                  {hasShortfall && (
                    <span
                      className="shrink-0 font-mono text-2xs text-[var(--content-secondary)] tabular-nums"
                      title="veMEZO still needed to reach 5x boost on this gauge"
                    >
                      {formatFixedPoint(optimalAdditional)} to 5x
                    </span>
                  )}
                  {pastOptimal && (
                    <span
                      className="shrink-0 font-mono text-2xs tabular-nums"
                      style={{ color: oversubTextColor }}
                      title={`${weightVsOptimalRatio.toFixed(2)}× optimal weight — oversubscribed. Red stress goes from green (1×) to red (2×+).`}
                    >
                      +{formatFixedPoint(optimalOverVeMEZO)} oversubscribed
                    </span>
                  )}
                </div>
                <div
                  className={`relative h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-secondary)] ring-1 ring-inset ${
                    pastOptimal
                      ? "ring-[color-mix(in_oklab,var(--negative)_28%,transparent)]"
                      : atOrAboveOptimal
                        ? "ring-[rgba(var(--positive-rgb),0.22)]"
                        : "ring-[var(--border)]"
                  }`}
                  aria-hidden="true"
                >
                  {hasShortfall ? (
                    <div
                      className="h-full rounded-full bg-[rgba(247,147,26,0.9)] transition-[width] duration-300 ease-out"
                      style={{ width: `${optimalFillPercent}%` }}
                    />
                  ) : (
                    atOrAboveOptimal && (
                      <div className="relative h-full w-full">
                        <div className="absolute inset-y-0 left-0 h-full w-full rounded-full bg-[var(--positive)]" />
                        {pastOptimal && (
                          <div
                            className="absolute inset-y-0 left-0 h-full rounded-full bg-[var(--negative)] transition-[width] duration-300 ease-out"
                            style={{ width: `${oversubRedBarPct}%` }}
                          />
                        )}
                      </div>
                    )
                  )}
                </div>
              </div>
            )}
          </dd>
        </div>
      </dl>
      {children}
    </article>
  )
}
