import { TokenIcon } from "@/components/TokenIcon"
import Tooltip from "@/components/Tooltip"
import { useEpochCountdown } from "@/hooks/useEpochCountdown"
import {
  type Pool,
  poolDailyFeesUsd,
  poolDailyVolumeUsd,
  poolEmissionsAprPercent,
  poolFeesAprPercent,
  poolTvlUsd,
} from "@/hooks/usePools"
import type { PoolIncentivesData } from "@/hooks/usePoolsIncentivesApr"
import { formatUsdValue } from "@/hooks/useTokenPrices"
import type { PoolVotableSummary } from "@/hooks/useVotables"
import { Button, Tag } from "@mezo-org/mezo-clay"
import Link from "next/link"

export function TokenPairIcon({
  symbol0,
  symbol1,
  size = 28,
}: {
  symbol0: string
  symbol1: string
  size?: number
}): JSX.Element {
  const overlap = Math.round(size * 0.38)
  return (
    <div
      className="relative inline-flex flex-shrink-0 items-center"
      style={{ width: size + (size - overlap), height: size }}
      aria-hidden="true"
    >
      <span
        className="absolute left-0 top-0 inline-flex items-center justify-center overflow-hidden rounded-full border border-[var(--border)] bg-[var(--surface)]"
        style={{ width: size, height: size }}
      >
        <TokenIcon symbol={symbol0} size={size - 4} />
      </span>
      <span
        className="absolute top-0 inline-flex items-center justify-center overflow-hidden rounded-full border border-[var(--border)] bg-[var(--surface)]"
        style={{ width: size, height: size, left: size - overlap }}
      >
        <TokenIcon symbol={symbol1} size={size - 4} />
      </span>
    </div>
  )
}

function poolTypeLabel(pool: Pool): string {
  if (pool.type === "concentrated") {
    const ts = pool.tickSpacing
    return ts ? `CL · ${ts}` : "CL"
  }
  return pool.volatility === "stable" ? "Stable" : "Volatile"
}

function poolTypeColor(pool: Pool): "blue" | "green" | "purple" {
  if (pool.type === "concentrated") return "purple"
  return pool.volatility === "stable" ? "green" : "blue"
}

function formatPercent(value: number): string {
  if (!Number.isFinite(value) || value === 0) return "0%"
  if (value < 0.01) return "<0.01%"
  if (value < 1) return `${value.toFixed(2)}%`
  if (value < 100) return `${value.toFixed(1)}%`
  return `${Math.round(value)}%`
}

type PoolCardProps = {
  pool: Pool
  onAddIncentives: (pool: Pool) => void
  incentives?: PoolIncentivesData
  votable?: PoolVotableSummary
}

export default function PoolCard({
  pool,
  onAddIncentives,
  incentives,
  votable,
}: PoolCardProps): JSX.Element {
  const { timeRemaining } = useEpochCountdown()
  const feesApr = poolFeesAprPercent(pool)
  const emissionsApr = poolEmissionsAprPercent(pool)
  const tvl = poolTvlUsd(pool)
  const volume = poolDailyVolumeUsd(pool)
  const feesEarned = poolDailyFeesUsd(pool)
  // Voter-side stats (prefer the API's /votes/votables; fall back to on-chain bribes only).
  const votingApr = votable?.votingApr ?? 0
  const voterFeesUsd = votable?.voterFeesUsd ?? 0
  const bribesUsdApi = votable?.bribesUsd ?? 0
  const currentBribesUsdOnchain = incentives?.totalIncentivesUSD ?? 0
  // Prefer on-chain for this-epoch bribe totals (the API may lag the bribe contract);
  // fall back to API if no on-chain data yet.
  const currentBribesUsd = currentBribesUsdOnchain || bribesUsdApi
  // LP total APR = fees + emissions only. Bribes and voter fees go to veMEZO voters.
  const totalApr = feesApr + emissionsApr
  const hasGauge = !!pool.gauge
  const detailHref = `/pools/${pool.address}`
  const currentBribeTokens = (incentives?.incentivesByToken ?? []).filter(
    (t) => t.amount > 0n,
  )
  return (
    <article className="group relative flex h-full min-w-0 flex-col gap-4 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="flex items-start justify-between gap-3">
        <Link
          href={detailHref}
          className="flex min-w-0 items-center gap-3 text-inherit no-underline"
        >
          <TokenPairIcon
            symbol0={pool.token0.symbol}
            symbol1={pool.token1.symbol}
            size={32}
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="truncate text-sm font-semibold text-[var(--content-primary)]">
                {pool.token0.symbol}
                <span className="mx-1 text-[var(--content-tertiary)]">/</span>
                {pool.token1.symbol}
              </h3>
            </div>
            <p className="mt-0.5 truncate text-2xs text-[var(--content-tertiary)]">
              {pool.name}
            </p>
          </div>
        </Link>

        <div className="flex flex-shrink-0 flex-col items-end gap-1">
          <Tag color={poolTypeColor(pool)} closeable={false}>
            {poolTypeLabel(pool)}
          </Tag>
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-3 text-xs">
        <div>
          <dt className="flex items-center gap-1 text-[var(--content-tertiary)]">
            LP APR
            <Tooltip
              id={`pc-totalapr-${pool.address}`}
              content="What LPs earn: trading fees APR + MEZO emissions APY. Voter-side rewards (bribes + fees-to-voters) are shown separately below."
            />
          </dt>
          <dd
            className={`font-mono tabular-nums ${
              totalApr > 0
                ? "text-[var(--positive)]"
                : "text-[var(--content-primary)]"
            }`}
          >
            {formatPercent(totalApr)}
          </dd>
        </div>
        <div>
          <dt className="flex items-center gap-1 text-[var(--content-tertiary)]">
            TVL
          </dt>
          <dd className="font-mono tabular-nums text-[var(--content-primary)]">
            {formatUsdValue(tvl)}
          </dd>
        </div>
        <div>
          <dt className="flex items-center gap-1 text-[var(--content-tertiary)]">
            Voter Fees
            <Tooltip
              id={`pc-voterfees-${pool.address}`}
              content="LP trading fees redirected to veMEZO voters this epoch (not to LPs). Claimable by voters at epoch end."
            />
          </dt>
          <dd
            className={`font-mono tabular-nums ${
              voterFeesUsd > 0
                ? "text-[#F7931A]"
                : "text-[var(--content-primary)]"
            }`}
          >
            {formatUsdValue(voterFeesUsd)}
          </dd>
        </div>
        <div>
          <dt className="flex items-center gap-1 text-[var(--content-tertiary)]">
            vAPR
            <Tooltip
              id={`pc-vapr-${pool.address}`}
              content="Voting APR — annualized return for veMEZO voters who allocate to this pool. (voter fees + bribes this epoch × 52) / USD votes on this pool."
            />
          </dt>
          <dd
            className={`font-mono tabular-nums ${
              votingApr > 0 ? "text-[#F7931A]" : "text-[var(--content-primary)]"
            }`}
          >
            {formatPercent(votingApr)}
          </dd>
        </div>
        <div>
          <dt className="text-[var(--content-tertiary)]">24h Volume</dt>
          <dd className="font-mono tabular-nums text-[var(--content-secondary)]">
            {formatUsdValue(volume)}
          </dd>
        </div>
        <div>
          <dt className="text-[var(--content-tertiary)]">24h Fees</dt>
          <dd className="font-mono tabular-nums text-[var(--content-secondary)]">
            {formatUsdValue(feesEarned)}
          </dd>
        </div>
      </dl>

      {hasGauge && currentBribesUsd > 0 && currentBribeTokens.length > 0 && (
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1 text-2xs uppercase tracking-wider text-[var(--content-tertiary)]">
            Incentives
            <Tooltip
              id={`pc-bribes-${pool.address}`}
              content={`Third-party incentives posted to this pool's ExternalBribe for the current epoch. Distributed to veMEZO voters at the next rollover (in ${timeRemaining}).`}
            />
          </div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-mono text-sm font-medium text-[#F7931A] tabular-nums">
              {formatUsdValue(currentBribesUsd)}
            </span>
            <span className="flex flex-wrap items-center gap-1">
              {currentBribeTokens.map((token) => (
                <span
                  key={`cur-${token.tokenAddress}`}
                  className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--surface-secondary)] px-1.5 py-0.5"
                >
                  <TokenIcon symbol={token.symbol} size={12} />
                  <span className="font-mono text-2xs text-[var(--content-primary)]">
                    {token.symbol}
                  </span>
                </span>
              ))}
            </span>
          </div>
        </div>
      )}

      <div className="mt-auto flex items-center justify-between gap-2 border-t border-[var(--border)] pt-3">
        <Link
          href={detailHref}
          className="text-xs text-[var(--content-secondary)] transition-colors hover:text-[#F7931A]"
          style={{ textDecoration: "none" }}
        >
          View details &rarr;
        </Link>
        <Button
          kind="primary"
          size="small"
          onClick={() => onAddIncentives(pool)}
          disabled={!hasGauge}
          overrides={{
            BaseButton: { style: { height: "32px" } },
          }}
        >
          {hasGauge ? "Add Incentives" : "No Gauge"}
        </Button>
      </div>
    </article>
  )
}
