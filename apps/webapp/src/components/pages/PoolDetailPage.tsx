import AddPoolIncentiveModal from "@/components/AddPoolIncentiveModal"
import { ClickableAddress } from "@/components/ClickableAddress"
import { TokenPairIcon } from "@/components/PoolCard"
import { SpringIn } from "@/components/SpringIn"
import { TokenIcon } from "@/components/TokenIcon"
import { useBtcPrice } from "@/hooks/useBtcPrice"
import { useEpochCountdown } from "@/hooks/useEpochCountdown"
import { useMezoPrice } from "@/hooks/useMezoPrice"
import { usePool } from "@/hooks/usePools"
import {
  poolDailyFeesUsd,
  poolDailyVolumeUsd,
  poolEmissionsAprPercent,
  poolFeesAprPercent,
  poolTvlUsd,
} from "@/hooks/usePools"
import {
  usePoolBribeAddress,
  usePoolBribeIncentives,
} from "@/hooks/usePoolIncentives"
import { computePoolIncentivesApr } from "@/hooks/usePoolsIncentivesApr"
import { formatUsdValue } from "@/hooks/useTokenPrices"
import { getTokenUsdPrice } from "@repo/shared"
import { Button, Skeleton, Tag } from "@mezo-org/mezo-clay"
import Link from "next/link"
import { useMemo, useState } from "react"
import { type Address, formatUnits } from "viem"

type PoolDetailPageProps = {
  address: string
}

function formatPercent(value: number): string {
  if (!Number.isFinite(value) || value === 0) return "0%"
  if (value < 0.01) return "<0.01%"
  if (value < 1) return `${value.toFixed(2)}%`
  if (value < 100) return `${value.toFixed(1)}%`
  return `${Math.round(value)}%`
}

export default function PoolDetailPage({
  address,
}: PoolDetailPageProps): JSX.Element {
  const { pool, isLoading } = usePool(address as Address)
  const { bribeAddress } = usePoolBribeAddress(pool?.gauge ?? undefined)
  const { incentives, isLoading: isLoadingIncentives } =
    usePoolBribeIncentives(bribeAddress)
  const { price: btcPrice } = useBtcPrice()
  const { price: mezoPrice } = useMezoPrice()
  const { timeRemaining } = useEpochCountdown()
  const [addOpen, setAddOpen] = useState(false)

  const incentivesEnriched = useMemo(
    () =>
      incentives
        .filter((i) => i.amount > 0n)
        .map((i) => {
          const amountNum = Number(formatUnits(i.amount, i.decimals))
          const priceUsd = getTokenUsdPrice(
            i.tokenAddress,
            i.symbol,
            btcPrice,
            mezoPrice,
          )
          const usdValue = priceUsd !== null ? amountNum * priceUsd : 0
          return { ...i, amountNum, usdValue }
        }),
    [incentives, btcPrice, mezoPrice],
  )
  const totalIncentivesUSD = incentivesEnriched.reduce(
    (s, i) => s + i.usdValue,
    0,
  )

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton width="100%" height="80px" animation />
        <Skeleton width="100%" height="200px" animation />
      </div>
    )
  }

  if (!pool) {
    return (
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-12 text-center">
        <p className="font-mono text-sm text-[var(--content-secondary)]">
          <span className="text-[#F7931A]">$</span> pool not found
        </p>
        <Link
          href="/pools"
          className="mt-4 inline-block text-sm text-[#F7931A]"
          style={{ textDecoration: "none" }}
        >
          &larr; Back to pools
        </Link>
      </div>
    )
  }

  const feesApr = poolFeesAprPercent(pool)
  const emissionsApr = poolEmissionsAprPercent(pool)
  const tvl = poolTvlUsd(pool)
  const incentivesApr = computePoolIncentivesApr(totalIncentivesUSD, tvl) ?? 0
  // Incentives pay veMEZO voters, not LPs — keep out of LP Total APR.
  const totalApr = feesApr + emissionsApr
  const volume = poolDailyVolumeUsd(pool)
  const fees = poolDailyFeesUsd(pool)
  const hasGauge = !!pool.gauge

  const typeLabel =
    pool.type === "concentrated"
      ? pool.tickSpacing
        ? `CL · ${pool.tickSpacing}`
        : "CL"
      : pool.volatility === "stable"
        ? "Stable"
        : "Volatile"

  const typeColor: "blue" | "green" | "purple" =
    pool.type === "concentrated"
      ? "purple"
      : pool.volatility === "stable"
        ? "green"
        : "blue"

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href="/pools"
          className="mb-3 inline-flex items-center gap-1 text-xs text-[var(--content-secondary)] transition-colors hover:text-[#F7931A]"
          style={{ textDecoration: "none" }}
        >
          &larr; All pools
        </Link>
        <div className="flex items-center gap-4">
          <TokenPairIcon
            symbol0={pool.token0.symbol}
            symbol1={pool.token1.symbol}
            size={44}
          />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold text-[var(--content-primary)]">
                {pool.token0.symbol}
                <span className="mx-1 text-[var(--content-tertiary)]">/</span>
                {pool.token1.symbol}
              </h1>
              <Tag color={typeColor} closeable={false}>
                {typeLabel}
              </Tag>
              {hasGauge ? (
                <span className="rounded-full bg-[rgba(34,197,94,0.12)] px-2 py-0.5 text-2xs font-medium text-[var(--positive)]">
                  Live Gauge
                </span>
              ) : (
                <span className="rounded border border-[var(--border)] px-1.5 py-0.5 text-2xs text-[var(--content-tertiary)]">
                  No Gauge
                </span>
              )}
            </div>
            <p className="mt-1 text-sm text-[var(--content-secondary)]">
              {pool.name}
            </p>
          </div>
        </div>
      </div>

      {/* Stat grid */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
        <SpringIn delay={0} variant="card">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
            <p className="mb-1 text-2xs uppercase tracking-wider text-[var(--content-tertiary)]">
              Total APR
            </p>
            <p
              className={`font-mono text-xl font-semibold tabular-nums ${
                totalApr > 0
                  ? "text-[var(--positive)]"
                  : "text-[var(--content-primary)]"
              }`}
            >
              {formatPercent(totalApr)}
            </p>
          </div>
        </SpringIn>
        <SpringIn delay={1} variant="card">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
            <p className="mb-1 text-2xs uppercase tracking-wider text-[var(--content-tertiary)]">
              TVL
            </p>
            <p className="font-mono text-xl font-semibold tabular-nums text-[var(--content-primary)]">
              {formatUsdValue(tvl)}
            </p>
          </div>
        </SpringIn>
        <SpringIn delay={2} variant="card">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
            <p className="mb-1 text-2xs uppercase tracking-wider text-[var(--content-tertiary)]">
              24h Volume
            </p>
            <p className="font-mono text-xl font-semibold tabular-nums text-[var(--content-primary)]">
              {formatUsdValue(volume)}
            </p>
          </div>
        </SpringIn>
        <SpringIn delay={3} variant="card">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
            <p className="mb-1 text-2xs uppercase tracking-wider text-[var(--content-tertiary)]">
              24h Fees
            </p>
            <p className="font-mono text-xl font-semibold tabular-nums text-[var(--content-primary)]">
              {formatUsdValue(fees)}
            </p>
          </div>
        </SpringIn>
      </div>

      {/* Two column content */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Left: Composition + APR breakdown */}
        <div className="flex flex-col gap-4 lg:col-span-1">
          <SpringIn delay={4} variant="card">
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
              <h2 className="mb-3 text-sm font-semibold text-[var(--content-primary)]">
                Composition
              </h2>
              <div className="flex flex-col gap-3">
                <ReserveRow
                  symbol={pool.token0.symbol}
                  reserve={pool.token0.reserve}
                  decimals={pool.token0.decimals}
                  price={pool.token0.price}
                />
                <ReserveRow
                  symbol={pool.token1.symbol}
                  reserve={pool.token1.reserve}
                  decimals={pool.token1.decimals}
                  price={pool.token1.price}
                />
              </div>
            </div>
          </SpringIn>

          <SpringIn delay={5} variant="card">
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
              <h2 className="mb-3 text-sm font-semibold text-[var(--content-primary)]">
                APR breakdown
              </h2>
              <dl className="grid grid-cols-1 gap-2 text-xs">
                <div className="flex items-center justify-between">
                  <dt className="text-[var(--content-secondary)]">Fees APR</dt>
                  <dd className="font-mono tabular-nums text-[var(--content-primary)]">
                    {formatPercent(feesApr)}
                  </dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-[var(--content-secondary)]">
                    Emissions APY
                  </dt>
                  <dd className="font-mono tabular-nums text-[var(--content-primary)]">
                    {formatPercent(emissionsApr)}
                  </dd>
                </div>
                <div className="mt-1 flex items-center justify-between border-t border-[var(--border)] pt-2">
                  <dt className="text-[var(--content-secondary)]">LP Total</dt>
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
                <div className="mt-1 flex items-center justify-between border-t border-dashed border-[var(--border)] pt-2">
                  <dt
                    className="flex items-center gap-1 text-[var(--content-tertiary)]"
                    title="Paid to veMEZO voters, not LPs — shown for context"
                  >
                    Voter APR
                  </dt>
                  <dd
                    className={`font-mono tabular-nums ${
                      incentivesApr > 0
                        ? "text-[#F7931A]"
                        : "text-[var(--content-tertiary)]"
                    }`}
                  >
                    {formatPercent(incentivesApr)}
                  </dd>
                </div>
              </dl>
            </div>
          </SpringIn>

          <SpringIn delay={6} variant="card">
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 text-xs">
              <h2 className="mb-3 text-sm font-semibold text-[var(--content-primary)]">
                Addresses
              </h2>
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-2xs text-[var(--content-tertiary)]">
                    Pool
                  </span>
                  <ClickableAddress address={pool.address} />
                </div>
                {pool.gauge && (
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-2xs text-[var(--content-tertiary)]">
                      Gauge
                    </span>
                    <ClickableAddress address={pool.gauge} />
                  </div>
                )}
                {bribeAddress && (
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-2xs text-[var(--content-tertiary)]">
                      Bribe
                    </span>
                    <ClickableAddress address={bribeAddress} />
                  </div>
                )}
              </div>
            </div>
          </SpringIn>
        </div>

        {/* Right: Incentives */}
        <div className="lg:col-span-2">
          <SpringIn delay={4} variant="card">
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div className="flex min-w-0 flex-col">
                  <h2 className="text-sm font-semibold text-[var(--content-primary)]">
                    Incentives
                  </h2>
                  <span
                    className="font-mono text-2xs text-[var(--content-tertiary)]"
                    title="Time until this epoch's bribes lock in and voters can claim"
                  >
                    Epoch rolls in {timeRemaining}
                  </span>
                </div>
                {hasGauge && (
                  <Button
                    kind="secondary"
                    size="small"
                    onClick={() => setAddOpen(true)}
                  >
                    Add
                  </Button>
                )}
              </div>

              {!hasGauge ? (
                <div className="rounded-lg border border-dashed border-[var(--border)] p-6 text-center">
                  <p className="text-sm text-[var(--content-secondary)]">
                    This pool has no gauge. Incentives cannot be added until a
                    gauge is created.
                  </p>
                </div>
              ) : isLoadingIncentives ? (
                <div className="flex flex-col gap-2">
                  <Skeleton width="100%" height="40px" animation />
                  <Skeleton width="100%" height="40px" animation />
                </div>
              ) : incentivesEnriched.length === 0 ? (
                <div className="rounded-lg border border-dashed border-[var(--border)] p-6 text-center">
                  <p className="text-sm text-[var(--content-secondary)]">
                    Nothing posted this epoch yet. Be the first to fund this
                    pool&apos;s bribe — veMEZO voters who vote for this pool
                    claim after rollover.
                  </p>
                </div>
              ) : (
                <>
                  <div className="mb-2 flex items-center justify-between text-2xs uppercase tracking-wider text-[var(--content-tertiary)]">
                    <span>
                      {incentivesEnriched.length} token
                      {incentivesEnriched.length === 1 ? "" : "s"} ·{" "}
                      {formatUsdValue(totalIncentivesUSD)}
                    </span>
                    {incentivesApr > 0 && (
                      <span
                        className="font-mono text-xs font-semibold normal-case tracking-normal text-[#F7931A]"
                        title="Voter APR — paid to veMEZO voters, not LPs"
                      >
                        {formatPercent(incentivesApr)} voter APR
                      </span>
                    )}
                  </div>
                  <ul className="flex flex-col divide-y divide-[var(--border)]">
                    {incentivesEnriched.map((inc) => (
                      <li
                        key={inc.tokenAddress}
                        className="flex items-center justify-between gap-3 py-2"
                      >
                        <div className="flex items-center gap-2">
                          <TokenIcon symbol={inc.symbol} size={24} />
                          <span className="text-sm text-[var(--content-primary)]">
                            {inc.symbol}
                          </span>
                        </div>
                        <div className="flex flex-col items-end leading-tight">
                          <span className="font-mono text-sm tabular-nums text-[var(--content-primary)]">
                            {inc.amountNum.toLocaleString(undefined, {
                              maximumFractionDigits: 4,
                            })}
                          </span>
                          {inc.usdValue > 0 && (
                            <span className="font-mono text-2xs text-[var(--content-tertiary)]">
                              {formatUsdValue(inc.usdValue)}
                            </span>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          </SpringIn>
        </div>
      </div>

      {addOpen && (
        <AddPoolIncentiveModal
          isOpen={addOpen}
          onClose={() => setAddOpen(false)}
          pool={pool}
        />
      )}
    </div>
  )
}

function ReserveRow({
  symbol,
  reserve,
  decimals,
  price,
}: {
  symbol: string
  reserve: string
  decimals: number
  price: string | null
}): JSX.Element {
  const rawAmount = (() => {
    try {
      return Number(formatUnits(BigInt(reserve), decimals))
    } catch {
      return Number.parseFloat(reserve) || 0
    }
  })()
  const usd = price ? rawAmount * Number.parseFloat(price) : null

  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <TokenIcon symbol={symbol} size={22} />
        <span className="text-sm text-[var(--content-primary)]">{symbol}</span>
      </div>
      <div className="flex flex-col items-end leading-tight">
        <span className="font-mono text-sm tabular-nums text-[var(--content-primary)]">
          {rawAmount.toLocaleString(undefined, { maximumFractionDigits: 4 })}
        </span>
        {usd !== null && (
          <span className="font-mono text-2xs text-[var(--content-tertiary)]">
            {formatUsdValue(usd)}
          </span>
        )}
      </div>
    </div>
  )
}

