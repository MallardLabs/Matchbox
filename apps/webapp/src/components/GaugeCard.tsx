import type { GaugeProfile } from "@/config/supabase"
import { type GaugeAPYData, formatAPY } from "@/hooks/useAPY"
import type { BoostGauge } from "@/hooks/useGauges"
import { formatUsdValue } from "@/hooks/useTokenPrices"
import { formatMultiplier } from "@/utils/format"
import { Tag } from "@mezo-org/mezo-clay"
import Link from "next/link"
import type { ReactNode } from "react"
import { formatUnits } from "viem"
import MarqueeText from "./MarqueeText"
import OptimalVeMEZOProgress from "./OptimalVeMEZOProgress"
import { TokenIcon } from "./TokenIcon"
import Tooltip from "./Tooltip"

type GaugeCardProps = {
  gauge: BoostGauge
  profile: GaugeProfile | null
  apyData: GaugeAPYData | undefined
  isLoadingAPY: boolean
  displayAPY?: number | null
  isProjected?: boolean
  isSelected?: boolean
  projectedVoteWeight?: bigint | undefined
  projectedBoostMultiplier?: number | undefined
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
  projectedVoteWeight,
  projectedBoostMultiplier,
  children,
}: GaugeCardProps) {
  const displayAPY =
    displayAPYOverride !== undefined
      ? displayAPYOverride
      : (apyData?.apy ?? null)

  const hasProjection =
    projectedVoteWeight !== undefined && projectedVoteWeight > 0n
  const effectiveWeight = hasProjection
    ? gauge.totalWeight + projectedVoteWeight
    : gauge.totalWeight

  const displayBoost =
    hasProjection && projectedBoostMultiplier !== undefined
      ? projectedBoostMultiplier
      : gauge.boostMultiplier
  const boostChanged =
    hasProjection &&
    projectedBoostMultiplier !== undefined &&
    Math.abs(projectedBoostMultiplier - gauge.boostMultiplier) > 0.005

  return (
    <article
      className={`flex min-w-0 flex-col gap-3 overflow-hidden rounded-xl border bg-[var(--surface)] p-3 sm:p-4 ${
        isSelected ? "border-[var(--positive)]" : "border-[var(--border)]"
      }`}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
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
            <div className="flex items-center gap-1.5">
              <MarqueeText
                className={`min-w-0 flex-1 text-sm font-semibold ${
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
              </MarqueeText>
              {profile?.display_name && gauge.veBTCTokenId > 0n && (
                <span className="inline-flex flex-shrink-0 items-center rounded border border-[rgba(247,147,26,0.3)] bg-[rgba(247,147,26,0.15)] px-1.5 py-0.5 font-mono text-2xs font-semibold tracking-wide text-[#F7931A]">
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
        <div className="self-start">
          <Tag color={gauge.isAlive ? "green" : "red"} closeable={false}>
            {gauge.isAlive ? "Active" : "Inactive"}
          </Tag>
        </div>
      </div>
      <dl className="grid grid-cols-1 gap-3 text-xs min-[420px]:grid-cols-2">
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
          <div
            className="grid transition-[grid-template-rows] duration-300 ease-out"
            style={{
              gridTemplateRows: hasProjection ? "1fr" : "0fr",
            }}
          >
            <div className="overflow-hidden">
              {hasProjection && (
                <p className="pt-0.5 font-mono text-2xs font-medium tabular-nums text-[#F7931A]">
                  +{formatUnits(projectedVoteWeight ?? 0n, 18).slice(0, 10)}
                </p>
              )}
            </div>
          </div>
        </div>
        <div>
          <dt className="flex items-center gap-1 text-[var(--content-tertiary)]">
            Boost
            <Tooltip
              id={`gc-boost-${gauge.address}`}
              content="The gauge's boost multiplier (1x–5x). Increases as more veMEZO votes are allocated relative to the gauge's veBTC weight."
            />
          </dt>
          <dd
            className={`font-mono ${
              boostChanged
                ? "text-[var(--positive)]"
                : "text-[var(--content-primary)]"
            }`}
          >
            {formatMultiplier(displayBoost)}
            {boostChanged && " \u2191"}
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
        {apyData &&
          apyData.totalIncentivesUSD > 0 &&
          apyData.incentivesByToken.length > 0 && (
            <div className="min-[420px]:col-span-2">
              <dt className="flex items-center gap-1 text-[var(--content-tertiary)]">
                Incentives
                <Tooltip
                  id={`gc-incentives-${gauge.address}`}
                  content="Total bribe incentives deployed on this gauge for the current epoch. Distributed pro-rata to veMEZO voters."
                />
              </dt>
              <dd className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                <span className="font-mono text-sm font-medium tabular-nums text-[var(--content-primary)]">
                  {formatUsdValue(apyData.totalIncentivesUSD)}
                </span>
                <span className="flex flex-wrap items-center gap-1">
                  {apyData.incentivesByToken.map((token) => (
                    <span
                      key={token.tokenAddress}
                      className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--surface-secondary)] px-1.5 py-0.5 text-2xs text-[var(--content-secondary)]"
                      title={`${formatUsdValue(token.usdValue)} in ${token.symbol}`}
                    >
                      <TokenIcon symbol={token.symbol} size={12} />
                      <span className="font-mono tabular-nums">
                        {token.symbol}
                      </span>
                    </span>
                  ))}
                </span>
              </dd>
            </div>
          )}
      </dl>
      <dl className="mt-auto text-xs">
        <div>
          <dt className="flex flex-wrap items-center gap-1.5 text-[var(--content-tertiary)]">
            Optimal veMEZO
            <Tooltip
              id={`gc-optimal-${gauge.address}`}
              content="veMEZO voting weight on this gauge that reaches maximum (5x) boost. System totals are veBTC and veMEZO totalVotingPower() from escrow—the same bases as the Boost calculator. Below that, the bar fills in orange toward the goal. At the target the bar is green. If oversubscribed, a red layer grows over the green from 0% at 1× to 100% at 2× the optimal weight (full red); beyond 2× the bar stays full red—more veMEZO dilutes rewards per voter."
            />
          </dt>
          <dd className="min-w-0 text-[var(--content-primary)]">
            <OptimalVeMEZOProgress
              optimalTarget={gauge.optimalVeMEZO}
              effectiveWeight={effectiveWeight}
              size="sm"
            />
          </dd>
        </div>
      </dl>
      {children}
    </article>
  )
}
