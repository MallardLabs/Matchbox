import EarningsChart, {
  type ChartBar,
} from "@/components/overview/EarningsChart"
import Button from "@/components/ui/Button"
import TokenMark from "@/components/ui/TokenMark"
import type { ClaimableRow } from "@/hooks/useClaimable"
import { cn } from "@/lib/cn"
import { formatApyBasisPoints, formatMicroUsd } from "@/lib/money"
import {
  formatRewardAmount,
  formatWholeUsd,
  gaugeDisplayName,
} from "@/lib/overview"
import type { GaugeProfile } from "@/lib/supabase"
import { Link } from "@tanstack/react-router"
import { ChevronRight, Gift, Vote } from "lucide-react"
import type { ReactElement, ReactNode } from "react"

type RewardTotal = {
  tokenAddress: string
  symbol: string
  decimals: number
  earned: bigint
}

type SourceRow = {
  gaugeAddress: string
  name: string
  usdMicro: bigint
  rewards: RewardTotal[]
}

function sumRewards(rows: ClaimableRow[]): RewardTotal[] {
  const totals = new Map<string, RewardTotal>()
  for (const row of rows) {
    for (const reward of row.rewards) {
      const key = reward.tokenAddress.toLowerCase()
      const current = totals.get(key)
      if (current) current.earned += reward.earned
      else totals.set(key, { ...reward, earned: reward.earned })
    }
  }
  return [...totals.values()]
}

function sourcesByGauge(
  rows: ClaimableRow[],
  profiles: GaugeProfile[] | undefined,
): SourceRow[] {
  const byGauge = new Map<string, ClaimableRow[]>()
  for (const row of rows) {
    const key = row.gaugeAddress.toLowerCase()
    byGauge.set(key, [...(byGauge.get(key) ?? []), row])
  }
  return [...byGauge.entries()]
    .map(([gaugeAddress, gaugeRows]) => ({
      gaugeAddress,
      name: gaugeDisplayName(profiles, gaugeAddress),
      usdMicro: gaugeRows.reduce(
        (sum, row) =>
          sum + row.rewards.reduce((acc, reward) => acc + reward.usdMicro, 0n),
        0n,
      ),
      rewards: sumRewards(gaugeRows),
    }))
    .sort((a, b) =>
      a.usdMicro === b.usdMicro ? 0 : a.usdMicro > b.usdMicro ? -1 : 1,
    )
}

export type OverviewHeroProps = {
  epochRemaining: string
  /** false while locks load, error out, or the wallet has none. */
  hasLocks: boolean
  claimable: {
    totalMicro: bigint
    rows: ClaimableRow[]
    isLoading: boolean
    canClaim: boolean
    onClaimAll: () => void
  }
  projection: {
    projectedMicro: bigint
    aprBasisPoints: bigint | null
    isLoading: boolean
  }
  votingPower: string
  unvotedLocks: number
  profiles: GaugeProfile[] | undefined
}

/** J01 hero (M01 on phones): claim cluster, then "Earnings by epoch". */
export default function OverviewHero({
  epochRemaining,
  hasLocks,
  claimable,
  projection,
  votingPower,
  unvotedLocks,
  profiles,
}: OverviewHeroProps): ReactElement {
  const claimReady = hasLocks && !claimable.isLoading
  const projectionReady = hasLocks && !projection.isLoading
  const showClaim = claimReady && claimable.canClaim
  const sources = claimReady ? sourcesByGauge(claimable.rows, profiles) : []
  const bars: ChartBar[] = hasLocks
    ? [
        {
          key: "now",
          label: "Now",
          microUsd: claimReady ? claimable.totalMicro : 0n,
          tone: "current",
        },
        {
          key: "next",
          label: "Next",
          microUsd: projectionReady ? projection.projectedMicro : 0n,
          tone: "next",
        },
      ]
    : []

  return (
    <div
      className={cn(
        "grid gap-10 lg:grid-cols-[440px_minmax(0,1fr)] lg:gap-14",
        hasLocks ? "lg:min-h-[400px]" : "lg:min-h-[280px]",
      )}
    >
      <div className="flex min-w-0 flex-col gap-1.5 md:gap-3.5">
        <hgroup className="flex flex-col gap-3.5">
          <h1 className="text-[26px] font-600 leading-tight text-ink max-md:sr-only">
            Overview
          </h1>
          <p className="flex items-center gap-1.5 text-[12px] font-550 text-accent-ink md:text-[13px] md:font-600">
            <span
              aria-hidden="true"
              className="size-1.5 rounded-full bg-pos md:hidden"
            />
            Epoch · {epochRemaining}
          </p>
        </hgroup>

        <div className="flex flex-col gap-[18px] md:mt-1 md:gap-3.5">
          <dl className="flex flex-col gap-1.5 md:gap-3.5">
            <dt className="text-[13px] font-500 text-muted md:text-[12px] md:text-secondary">
              Claimable
            </dt>
            <dd className="flex items-center gap-7 md:h-12">
              <span className="text-[44px] font-650 leading-none tracking-[-1px] tabular-nums text-ink md:text-[40px] md:font-600 md:tracking-normal">
                {claimReady ? formatMicroUsd(claimable.totalMicro) : "—"}
              </span>
              {showClaim ? (
                <Button
                  className="max-md:hidden"
                  onClick={claimable.onClaimAll}
                >
                  Claim all
                </Button>
              ) : null}
            </dd>
            {claimReady && claimable.totalMicro > 0n ? (
              <dd>
                <RewardChips rewards={sumRewards(claimable.rows)} />
              </dd>
            ) : null}
            {showClaim ? (
              <dd className="mt-3 md:hidden">
                <Button
                  size="lg"
                  className="h-12 w-full gap-2 rounded-[10px] text-[14px]"
                  onClick={claimable.onClaimAll}
                >
                  <Gift size={16} strokeWidth={1.75} aria-hidden="true" />
                  Claim all
                </Button>
              </dd>
            ) : null}
          </dl>
          <dl className="grid grid-cols-3 border-y border-line py-3 md:flex md:gap-10 md:border-0 md:py-0">
            <Metric label="APR" accent>
              {projectionReady
                ? formatApyBasisPoints(projection.aprBasisPoints)
                : "—"}
            </Metric>
            <Metric label="Projected">
              {projectionReady
                ? formatMicroUsd(projection.projectedMicro)
                : "—"}
            </Metric>
            <Metric label="Voting power" className="md:hidden">
              {hasLocks ? votingPower : "—"}
            </Metric>
          </dl>
        </div>

        {hasLocks && unvotedLocks > 0 ? (
          <div className="mt-3 flex items-center gap-3 rounded-xl bg-accent-soft p-3.5 md:hidden">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft-2 text-accent-ink">
              <Vote size={16} strokeWidth={1.75} aria-hidden="true" />
            </span>
            <p className="flex flex-1 flex-col gap-0.5">
              <span className="text-[13px] font-650 text-ink">Unvoted</span>
              <span className="text-[11px] font-500 text-accent-ink">
                {unvotedLocks === 1 ? "1 lock" : `${unvotedLocks} locks`}
              </span>
            </p>
            <Link
              to="/vote"
              className="flex h-8 items-center rounded-[7px] bg-accent px-3 text-[12px] font-700 text-on-accent"
            >
              Vote
            </Link>
          </div>
        ) : null}

        {sources.length > 0 ? (
          <details open className="group mt-0.5 max-md:hidden">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[13px] [&::-webkit-details-marker]:hidden">
              <span className="flex items-center gap-2 font-550 text-ink-2">
                <ChevronRight
                  size={14}
                  strokeWidth={1.75}
                  aria-hidden="true"
                  className="text-muted transition-transform group-open:rotate-90"
                />
                veBTC
              </span>
              <span className="font-500 tabular-nums text-muted">
                {formatWholeUsd(
                  sources.reduce((sum, source) => sum + source.usdMicro, 0n),
                )}
              </span>
            </summary>
            <ul className="mt-0.5 flex flex-col gap-0.5">
              {sources.map((source) => (
                <li
                  key={source.gaugeAddress}
                  className="flex items-center justify-between gap-4 py-px pl-[22px]"
                >
                  <span className="truncate text-[12px] font-500 text-secondary">
                    {source.name}
                  </span>
                  <RewardChips rewards={source.rewards} />
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </div>

      <div className="min-w-0 max-md:hidden">
        <EarningsChart
          title="Earnings by epoch"
          bars={bars}
          empty="No earnings yet"
        />
      </div>
    </div>
  )
}

function Metric({
  label,
  accent,
  className,
  children,
}: {
  label: string
  accent?: boolean
  className?: string
  children: ReactNode
}): ReactElement {
  return (
    <div className={cn("flex flex-col gap-0.5", className)}>
      <dt className="text-[11px] font-500 text-muted md:text-[12px] md:text-secondary">
        {label}
      </dt>
      <dd
        className={cn(
          "text-[18px] font-650 tabular-nums md:text-[22px] md:font-600",
          accent ? "text-accent-ink" : "text-ink",
        )}
      >
        {children}
      </dd>
    </div>
  )
}

function RewardChips({ rewards }: { rewards: RewardTotal[] }): ReactElement {
  return (
    <ul className="flex shrink-0 flex-wrap items-center gap-2.5">
      {rewards.map((reward) => {
        const mark = /btc/i.test(reward.symbol)
          ? "btc"
          : /mezo/i.test(reward.symbol)
            ? "mezo"
            : null
        return (
          <li
            key={reward.tokenAddress}
            className="flex items-center gap-1 text-[11px] font-550 tabular-nums text-ink-2"
          >
            {mark ? <TokenMark kind={mark} size={12} /> : null}
            {formatRewardAmount(reward.earned, reward.decimals, reward.symbol)}{" "}
            {reward.symbol}
          </li>
        )
      })}
    </ul>
  )
}
