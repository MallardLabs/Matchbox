import { TokenIcon } from "@/components/TokenIcon"
import Tooltip from "@/components/Tooltip"
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
import { Button, Tag } from "@mezo-org/mezo-clay"
import Link from "next/link"
import { formatUnits } from "viem"

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
}

export default function PoolCard({
  pool,
  onAddIncentives,
  incentives,
}: PoolCardProps): JSX.Element {
  const feesApr = poolFeesAprPercent(pool)
  const emissionsApr = poolEmissionsAprPercent(pool)
  const tvl = poolTvlUsd(pool)
  const volume = poolDailyVolumeUsd(pool)
  const feesEarned = poolDailyFeesUsd(pool)
  const incentivesApr = incentives?.incentivesAprPercent ?? 0
  const totalApr = feesApr + emissionsApr + (incentivesApr > 0 ? incentivesApr : 0)
  const hasGauge = !!pool.gauge
  const detailHref = `/pools/${pool.address}`
  const activeIncentives = (incentives?.incentivesByToken ?? []).filter(
    (t) => t.amount > 0n,
  )

  return (
    <article className="group relative flex min-w-0 flex-col gap-4 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 transition-colors hover:border-[rgba(247,147,26,0.35)]">
      {/* Orange accent stripe on hover */}
      <span
        className="pointer-events-none absolute inset-x-0 top-0 h-[2px] origin-left scale-x-0 bg-[#F7931A] transition-transform duration-300 group-hover:scale-x-100"
        aria-hidden="true"
      />

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
          {!hasGauge ? (
            <span className="rounded border border-[var(--border)] px-1.5 py-0.5 text-2xs text-[var(--content-tertiary)]">
              No Gauge
            </span>
          ) : null}
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-3 text-xs">
        <div>
          <dt className="flex items-center gap-1 text-[var(--content-tertiary)]">
            Total APR
            <Tooltip
              id={`pc-totalapr-${pool.address}`}
              content="Combined annualized return: fees APR + emissions APR. Actual returns depend on boost multiplier and incentives."
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
            Fees APR
            <Tooltip
              id={`pc-feesapr-${pool.address}`}
              content="Annualized return from LP trading fees over the last 24 hours."
            />
          </dt>
          <dd className="font-mono tabular-nums text-[var(--content-primary)]">
            {formatPercent(feesApr)}
          </dd>
        </div>
        <div>
          <dt className="flex items-center gap-1 text-[var(--content-tertiary)]">
            Emissions APY
            <Tooltip
              id={`pc-emissions-${pool.address}`}
              content="Annualized MEZO emissions paid to LP stakers in this gauge."
            />
          </dt>
          <dd className="font-mono tabular-nums text-[var(--content-primary)]">
            {formatPercent(emissionsApr)}
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

      {activeIncentives.length > 0 && (
        <div className="rounded-lg border border-[rgba(247,147,26,0.25)] bg-[rgba(247,147,26,0.06)] p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="flex items-center gap-1 text-2xs uppercase tracking-wider text-[var(--content-tertiary)]">
              Incentives
              <Tooltip
                id={`pc-incentives-${pool.address}`}
                content="Current epoch bribes posted to this pool, plus their annualized yield relative to TVL."
              />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-2xs text-[var(--content-tertiary)]">
                {formatUsdValue(incentives?.totalIncentivesUSD ?? 0)}
              </span>
              {incentivesApr > 0 && (
                <span className="font-mono text-xs font-semibold tabular-nums text-[#F7931A]">
                  {formatPercent(incentivesApr)}
                </span>
              )}
            </div>
          </div>
          <ul className="flex flex-wrap gap-1.5">
            {activeIncentives.map((token) => {
              const amount = Number(
                formatUnits(token.amount, token.decimals),
              ).toLocaleString(undefined, { maximumFractionDigits: 2 })
              return (
                <li
                  key={token.tokenAddress}
                  className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--surface)] px-1.5 py-0.5"
                >
                  <TokenIcon symbol={token.symbol} size={12} />
                  <span className="font-mono text-2xs text-[var(--content-primary)]">
                    {amount}
                  </span>
                  <span className="font-mono text-2xs text-[var(--content-tertiary)]">
                    {token.symbol}
                  </span>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      <div className="flex items-center justify-between gap-2 border-t border-[var(--border)] pt-3">
        <Link
          href={detailHref}
          className="text-xs text-[var(--content-secondary)] transition-colors hover:text-[#F7931A]"
          style={{ textDecoration: "none" }}
        >
          View details &rarr;
        </Link>
        {activeIncentives.length > 0 ? (
          <span className="rounded-full border border-[rgba(247,147,26,0.3)] bg-[rgba(247,147,26,0.1)] px-2 py-0.5 font-mono text-2xs text-[#F7931A]">
            {activeIncentives.length} incentive
            {activeIncentives.length === 1 ? "" : "s"}
          </span>
        ) : null}
        <Button
          kind="primary"
          size="small"
          onClick={() => onAddIncentives(pool)}
          disabled={!hasGauge}
          overrides={{
            BaseButton: { style: { height: "32px" } },
          }}
        >
          Add Incentives
        </Button>
      </div>
    </article>
  )
}
