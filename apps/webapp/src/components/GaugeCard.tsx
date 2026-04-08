import type { GaugeProfile } from "@/config/supabase"
import { type GaugeAPYData, formatAPY } from "@/hooks/useAPY"
import type { BoostGauge } from "@/hooks/useGauges"
import { formatFixedPoint, formatMultiplier } from "@/utils/format"
import { Tag } from "@mezo-org/mezo-clay"
import Link from "next/link"
import type { ReactNode } from "react"
import { formatUnits } from "viem"
import Tooltip from "./Tooltip"

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
  const isMaxBoosted =
    optimalTarget !== undefined &&
    optimalTarget > 0n &&
    gauge.optimalAdditionalVeMEZO !== undefined &&
    gauge.optimalAdditionalVeMEZO === 0n

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
              content="Total veMEZO weight required for this gauge to reach maximum (5x) boost. The bar fills as current veMEZO voting weight approaches that target; below the target value, the second line shows how much veMEZO is still needed."
            />
          </dt>
          <dd className="min-w-0 text-[var(--content-primary)]">
            {optimalTarget === undefined ? (
              <span className="font-mono">-</span>
            ) : (
              <div className="space-y-1.5">
                <p
                  className="font-mono text-sm leading-snug tracking-tight text-[var(--content-primary)] [overflow-wrap:anywhere]"
                  title={formatFixedPoint(optimalTarget)}
                >
                  {formatFixedPoint(optimalTarget)}
                </p>
                {gauge.optimalAdditionalVeMEZO !== undefined &&
                  gauge.optimalAdditionalVeMEZO > 0n && (
                    <p
                      className="text-right font-mono text-2xs text-[var(--content-secondary)] tabular-nums"
                      title="veMEZO still needed to reach 5x boost on this gauge"
                    >
                      {formatFixedPoint(gauge.optimalAdditionalVeMEZO)} to 5x
                    </p>
                  )}
                <div
                  className={`h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-secondary)] ring-1 ring-inset ring-[var(--border)] ${
                    isMaxBoosted ? "ring-[rgba(var(--positive-rgb),0.35)]" : ""
                  }`}
                  aria-hidden="true"
                >
                  <div
                    className={`h-full rounded-full transition-[width] duration-300 ease-out ${
                      isMaxBoosted
                        ? "bg-[var(--positive)]"
                        : "bg-[rgba(247,147,26,0.9)]"
                    }`}
                    style={{
                      width: `${isMaxBoosted ? 100 : optimalFillPercent}%`,
                    }}
                  />
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
