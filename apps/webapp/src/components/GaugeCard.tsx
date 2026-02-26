import type { GaugeProfile } from "@/config/supabase"
import { type GaugeAPYData, formatAPY } from "@/hooks/useAPY"
import type { BoostGauge } from "@/hooks/useGauges"
import { formatFixedPoint, formatMultiplier } from "@/utils/format"
import { Tag } from "@mezo-org/mezo-clay"
import Link from "next/link"
import type { ReactNode } from "react"
import { formatUnits } from "viem"

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
          <dt className="text-[var(--content-tertiary)]">Boost</dt>
          <dd className="font-mono text-[var(--content-primary)]">
            {formatMultiplier(gauge.boostMultiplier)}
          </dd>
        </div>
        <div>
          <dt className="text-[var(--content-tertiary)]">APY</dt>
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
        <div>
          <dt className="text-[var(--content-tertiary)]">Optimal veMEZO</dt>
          <dd className="font-mono text-[var(--content-primary)]">
            {gauge.optimalAdditionalVeMEZO !== undefined
              ? formatFixedPoint(gauge.optimalAdditionalVeMEZO)
              : "-"}
          </dd>
        </div>
      </dl>
      {children}
    </article>
  )
}
