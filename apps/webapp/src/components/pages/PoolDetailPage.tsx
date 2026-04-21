import AddPoolIncentiveModal from "@/components/AddPoolIncentiveModal"
import { ClickableAddress } from "@/components/ClickableAddress"
import { TokenPairIcon } from "@/components/PoolCard"
import { SpringIn } from "@/components/SpringIn"
import { TokenIcon } from "@/components/TokenIcon"
import { useBtcPrice } from "@/hooks/useBtcPrice"
import { useEpochCountdown } from "@/hooks/useEpochCountdown"
import { useMezoPrice } from "@/hooks/useMezoPrice"
import {
  usePoolBribeAddress,
  usePoolBribeIncentives,
} from "@/hooks/usePoolIncentives"
import { usePool } from "@/hooks/usePools"
import {
  poolDailyFeesUsd,
  poolDailyVolumeUsd,
  poolEmissionsAprPercent,
  poolFeesAprPercent,
  poolTvlUsd,
} from "@/hooks/usePools"
import { computePoolIncentivesApr } from "@/hooks/usePoolsIncentivesApr"
import { formatUsdValue } from "@/hooks/useTokenPrices"
import { useVotables } from "@/hooks/useVotables"
import { Button, Skeleton, Tag } from "@mezo-org/mezo-clay"
import { getTokenUsdPrice } from "@repo/shared"
import Link from "next/link"
import { useCallback, useMemo, useState } from "react"
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
  const {
    incentives,
    nextEpochIncentives,
    isLoading: isLoadingIncentives,
    refetch: refetchIncentives,
  } = usePoolBribeIncentives(bribeAddress)
  const { price: btcPrice } = useBtcPrice()
  const { price: mezoPrice } = useMezoPrice()
  const { timeRemaining } = useEpochCountdown()
  const { byPool: votablesByPool } = useVotables()
  const [addOpen, setAddOpen] = useState(false)

  const votable = pool
    ? votablesByPool.get(pool.address.toLowerCase())
    : undefined

  const enrichItems = useCallback(
    (items: typeof incentives) =>
      items
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
    [btcPrice, mezoPrice],
  )

  const incentivesEnriched = useMemo(
    () => enrichItems(incentives),
    [incentives, enrichItems],
  )
  const nextEpochEnriched = useMemo(
    () => enrichItems(nextEpochIncentives),
    [nextEpochIncentives, enrichItems],
  )
  const totalIncentivesUSD = incentivesEnriched.reduce(
    (s, i) => s + i.usdValue,
    0,
  )
  const totalNextEpochUSD = nextEpochEnriched.reduce(
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
  // Prefer API's vAPR (accounts for fees-to-voters + bribes); fall back to
  // on-chain-derived bribe APR when the API hasn't indexed this pool yet.
  const votingApr =
    votable?.votingApr ?? computePoolIncentivesApr(totalIncentivesUSD, tvl) ?? 0
  const voterFeesUsd = votable?.voterFeesUsd ?? 0
  // LP Total APR = fees + emissions only. Voter rewards don't accrue to LPs.
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
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4">
        <SpringIn delay={0} variant="card">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
            <p className="mb-1 text-2xs uppercase tracking-wider text-[var(--content-tertiary)]">
              LP APR
            </p>
            <p
              className={`font-mono text-xl font-semibold tabular-nums ${
                totalApr > 0
                  ? "text-[var(--positive)]"
                  : "text-[var(--content-primary)]"
              }`}
              title="Fees APR + Emissions APY — LP-side only. Voter rewards shown separately."
            >
              {formatPercent(totalApr)}
            </p>
          </div>
        </SpringIn>
        <SpringIn delay={1} variant="card">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
            <p className="mb-1 text-2xs uppercase tracking-wider text-[var(--content-tertiary)]">
              vAPR
            </p>
            <p
              className={`font-mono text-xl font-semibold tabular-nums ${
                votingApr > 0
                  ? "text-[#F7931A]"
                  : "text-[var(--content-primary)]"
              }`}
              title="Voting APR — annualized return for veMEZO voters who allocate to this pool."
            >
              {formatPercent(votingApr)}
            </p>
          </div>
        </SpringIn>
        <SpringIn delay={2} variant="card">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
            <p className="mb-1 text-2xs uppercase tracking-wider text-[var(--content-tertiary)]">
              TVL
            </p>
            <p className="font-mono text-xl font-semibold tabular-nums text-[var(--content-primary)]">
              {formatUsdValue(tvl)}
            </p>
          </div>
        </SpringIn>
        <SpringIn delay={3} variant="card">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
            <p className="mb-1 text-2xs uppercase tracking-wider text-[var(--content-tertiary)]">
              Voter Fees
            </p>
            <p
              className={`font-mono text-xl font-semibold tabular-nums ${
                voterFeesUsd > 0
                  ? "text-[#F7931A]"
                  : "text-[var(--content-primary)]"
              }`}
              title="LP trading fees redirected to veMEZO voters this epoch. Claimable by voters at epoch end."
            >
              {formatUsdValue(voterFeesUsd)}
            </p>
          </div>
        </SpringIn>
        <SpringIn delay={4} variant="card">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
            <p className="mb-1 text-2xs uppercase tracking-wider text-[var(--content-tertiary)]">
              24h Volume
            </p>
            <p className="font-mono text-xl font-semibold tabular-nums text-[var(--content-primary)]">
              {formatUsdValue(volume)}
            </p>
          </div>
        </SpringIn>
        <SpringIn delay={5} variant="card">
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
                LP APR breakdown
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
          <SpringIn delay={6} variant="card">
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div className="flex min-w-0 flex-col">
                  <h2 className="text-sm font-semibold text-[var(--content-primary)]">
                    External bribes
                  </h2>
                  <span
                    className="font-mono text-2xs text-[var(--content-tertiary)]"
                    title="Time until this epoch's bribes lock in and voters can claim"
                  >
                    Rolls to voters in {timeRemaining}
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
              ) : incentivesEnriched.length === 0 &&
                nextEpochEnriched.length === 0 ? (
                <div className="rounded-lg border border-dashed border-[var(--border)] p-6 text-center">
                  <p className="text-sm text-[var(--content-secondary)]">
                    No bribes posted this epoch yet. Be the first to fund this
                    pool&apos;s bribe — veMEZO voters who vote for this pool
                    will claim your deposit at the next rollover.
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  <IncentivesList
                    title="This epoch"
                    subtitle="Claimable by voters after the next rollover."
                    incentives={incentivesEnriched}
                    totalUsd={totalIncentivesUSD}
                    accent="solid"
                  />
                  {nextEpochEnriched.length > 0 && (
                    <IncentivesList
                      title="Pre-posted for next epoch"
                      subtitle="Already funded for the round starting at rollover."
                      incentives={nextEpochEnriched}
                      totalUsd={totalNextEpochUSD}
                      accent="dashed"
                    />
                  )}
                </div>
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
          onIncentivesAdded={refetchIncentives}
          prefetchedBribeAddress={bribeAddress}
        />
      )}
    </div>
  )
}

type EnrichedIncentive = {
  tokenAddress: Address
  symbol: string
  decimals: number
  amount: bigint
  amountNum: number
  usdValue: number
  logoURI?: string
}

function IncentivesList({
  title,
  subtitle,
  incentives,
  totalUsd,
  accent,
}: {
  title: string
  subtitle: string
  incentives: EnrichedIncentive[]
  totalUsd: number
  accent: "solid" | "dashed"
}): JSX.Element | null {
  if (incentives.length === 0) return null
  const border =
    accent === "dashed"
      ? "border-dashed border-[var(--border)]"
      : "border-[rgba(247,147,26,0.25)]"
  const bg =
    accent === "dashed"
      ? "bg-[var(--surface-secondary)]"
      : "bg-[rgba(247,147,26,0.04)]"
  return (
    <div className={`rounded-lg border ${border} ${bg} p-3`}>
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--content-primary)]">
            {title}
          </p>
          <p className="mt-0.5 text-2xs text-[var(--content-tertiary)]">
            {subtitle}
          </p>
        </div>
        <span className="whitespace-nowrap font-mono text-xs text-[var(--content-secondary)]">
          {incentives.length} token{incentives.length === 1 ? "" : "s"} ·{" "}
          {formatUsdValue(totalUsd)}
        </span>
      </div>
      <ul className="flex flex-col divide-y divide-[var(--border)]">
        {incentives.map((inc) => (
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
