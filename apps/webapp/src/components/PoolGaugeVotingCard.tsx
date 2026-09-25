import MarqueeText from "@/components/MarqueeText"
import { TokenPairIcon } from "@/components/PoolCard"
import { TokenIcon } from "@/components/TokenIcon"
import Tooltip from "@/components/Tooltip"
import WatchGaugeButton from "@/components/WatchGaugeButton"
import type {
  GaugedPool,
  PoolVoteRewardToken,
  PoolVotingMetric,
} from "@/hooks/usePoolVotingMetrics"
import { cn } from "@/utils/cn"
import {
  aprNumberToBasisPoints,
  formatCompactMicroUsd,
  sumUsdStringsMicroUsd,
  usdStringToMicroUsd,
} from "@/utils/poolVoting"
import { formatMicroUsd, formatValidatorApy } from "@/utils/validatorApy"
import { percentageToBasisPoints } from "@/utils/validatorVoting"
import { Button, Input, Tag } from "@mezo-org/mezo-clay"
import Link from "next/link"
import type { ChangeEvent } from "react"
import { formatUnits } from "viem"

type PoolGaugeVotingCardProps = {
  pool: GaugedPool
  totalWeight: bigint
  metric: PoolVotingMetric | undefined
  isLoadingMetrics: boolean
  allocation: string
  currentAllocation: bigint
  projectedApyBasisPoints: bigint | null
  isSelected: boolean
  onAllocationChange: (value: string) => void
  onToggleSelection: () => void
}

function formatAmount(value: bigint, decimals = 18, precision = 4): string {
  const formatted = formatUnits(value, decimals)
  const [whole = "0", fraction = ""] = formatted.split(".")
  const trimmed = fraction.slice(0, precision).replace(/0+$/, "")
  return trimmed ? `${whole}.${trimmed}` : whole
}

function formatBasisPoints(value: bigint): string {
  const whole = value / 100n
  const fraction = (value % 100n).toString().padStart(2, "0")
  return `${whole}.${fraction}`
}

export function poolTypeLabel(pool: GaugedPool): string {
  if (pool.type === "concentrated") {
    return pool.tickSpacing ? `CL · ${pool.tickSpacing}` : "CL"
  }
  return pool.volatility === "stable" ? "Stable" : "Volatile"
}

function poolTypeColor(pool: GaugedPool): "blue" | "green" | "purple" {
  if (pool.type === "concentrated") return "purple"
  return pool.volatility === "stable" ? "green" : "blue"
}

export function poolPairName(pool: GaugedPool): string {
  return `${pool.token0.symbol} / ${pool.token1.symbol}`
}

type RewardTokenListProps = {
  id: string
  label: string
  tokens: PoolVoteRewardToken[]
}

function RewardTokenList({
  id,
  label,
  tokens,
}: RewardTokenListProps): JSX.Element {
  return (
    <div className="flex min-w-0 items-start gap-2">
      <p
        id={id}
        className="w-12 shrink-0 pt-1 text-2xs uppercase tracking-wider text-[var(--content-tertiary)]"
      >
        {label}
      </p>
      <ul aria-labelledby={id} className="flex min-w-0 flex-wrap gap-1.5">
        {tokens.map((token) => (
          <li
            key={token.tokenAddress}
            className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--surface-secondary)] px-2 py-1 text-2xs text-[var(--content-secondary)]"
            title={`${formatAmount(token.amount, token.decimals)} ${token.symbol}`}
          >
            <TokenIcon symbol={token.symbol} size={14} />
            <span>{token.symbol}</span>
            <span className="font-mono tabular-nums text-[var(--content-primary)]">
              {formatMicroUsd(token.valueMicroUsd)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default function PoolGaugeVotingCard({
  pool,
  totalWeight,
  metric,
  isLoadingMetrics,
  allocation,
  currentAllocation,
  projectedApyBasisPoints,
  isSelected,
  onAllocationChange,
  onToggleSelection,
}: PoolGaugeVotingCardProps): JSX.Element {
  const weight = metric?.weight ?? 0n
  const shareBasisPoints =
    totalWeight > 0n ? (weight * 10_000n) / totalWeight : 0n
  const isAlive = metric?.isAlive ?? true
  const allocationBasisPoints = percentageToBasisPoints(allocation)
  const currentApy = metric?.apyBasisPoints ?? null
  const apyChanged =
    allocationBasisPoints !== null && projectedApyBasisPoints !== currentApy
  const apyDirection =
    currentApy === -1n && projectedApyBasisPoints !== -1n
      ? "down"
      : projectedApyBasisPoints === -1n
        ? "up"
        : projectedApyBasisPoints !== null &&
            currentApy !== null &&
            projectedApyBasisPoints > currentApy
          ? "up"
          : "down"
  const tvlMicroUsd = usdStringToMicroUsd(pool.tvl)
  const volumeMicroUsd = sumUsdStringsMicroUsd(
    pool.stats.volume.map((stat) => stat.amountUSD),
  )
  const lpAprBasisPoints =
    aprNumberToBasisPoints(pool.stats.apr) +
    aprNumberToBasisPoints(pool.emissionsApr)
  const detailHref = `/pools/${pool.address}`
  const inputId = `pool-vote-${pool.address}`

  function handleAllocationChange(
    event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) {
    onAllocationChange(event.target.value)
  }

  return (
    <article
      className={cn(
        "flex h-full min-w-0 flex-col gap-4 overflow-hidden rounded-xl border bg-[var(--surface)] p-4",
        isSelected ? "border-[var(--positive)]" : "border-[var(--border)]",
      )}
    >
      <header className="flex items-start justify-between gap-3">
        <Link
          href={detailHref}
          className="flex min-w-0 items-center gap-3 text-inherit no-underline"
        >
          <TokenPairIcon
            symbol0={pool.token0.symbol}
            symbol1={pool.token1.symbol}
            size={32}
          />
          <div className="min-w-0">
            <MarqueeText className="text-sm font-semibold text-[var(--content-primary)]">
              {poolPairName(pool)}
            </MarqueeText>
            <p className="truncate text-2xs text-[var(--content-tertiary)]">
              {pool.name}
            </p>
          </div>
        </Link>
        <div className="flex shrink-0 items-center gap-2">
          <Tag color={poolTypeColor(pool)} closeable={false}>
            {poolTypeLabel(pool)}
          </Tag>
          {!isAlive && (
            <Tag color="gray" closeable={false}>
              Inactive
            </Tag>
          )}
          <WatchGaugeButton gaugeAddress={pool.gauge} compact />
        </div>
      </header>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
        <div>
          <dt className="text-[var(--content-tertiary)]">BTC Weight</dt>
          <dd className="font-mono tabular-nums text-[var(--content-primary)]">
            {isLoadingMetrics && !metric
              ? "…"
              : `${formatAmount(weight)} veBTC`}
          </dd>
        </div>
        <div>
          <dt className="text-[var(--content-tertiary)]">Share</dt>
          <dd className="font-mono tabular-nums text-[var(--content-primary)]">
            {formatBasisPoints(shareBasisPoints)}%
          </dd>
        </div>
        <div>
          <dt className="flex items-center gap-1 text-[var(--content-tertiary)]">
            vAPY
            <Tooltip
              id={`pool-vote-apy-${pool.address}`}
              content="Voter APY: this epoch's bribes plus voter fees, annualized against the veBTC weight on this pool. Updates live to show where your ballot would leave it."
            />
          </dt>
          <dd
            className={cn(
              "font-mono tabular-nums",
              apyChanged
                ? "text-[var(--positive)]"
                : "text-[var(--content-primary)]",
            )}
            title={apyChanged ? "Projected APY after this ballot" : undefined}
          >
            {isLoadingMetrics
              ? "…"
              : formatValidatorApy(
                  apyChanged ? projectedApyBasisPoints : currentApy,
                )}
            {apyChanged && (apyDirection === "up" ? " ↑" : " ↓")}
          </dd>
        </div>
        <div>
          <dt className="text-[var(--content-tertiary)]">Voter Rewards</dt>
          <dd className="font-mono tabular-nums text-[#F7931A]">
            {isLoadingMetrics
              ? "…"
              : formatMicroUsd(metric?.totalRewardsMicroUsd ?? 0n)}
          </dd>
        </div>
        <div>
          <dt className="flex items-center gap-1 text-[var(--content-tertiary)]">
            Bribes
            <Tooltip
              id={`pool-vote-bribes-${pool.address}`}
              content="Third-party incentives posted to this pool's bribe contract for the current epoch, split pro rata among its veBTC voters."
            />
          </dt>
          <dd className="font-mono tabular-nums text-[var(--content-primary)]">
            {isLoadingMetrics
              ? "…"
              : formatMicroUsd(metric?.bribesMicroUsd ?? 0n)}
          </dd>
        </div>
        <div>
          <dt className="flex items-center gap-1 text-[var(--content-tertiary)]">
            Voter Fees
            <Tooltip
              id={`pool-vote-fees-${pool.address}`}
              content="Trading fees the gauge harvested into its fee reward at the epoch flip. They are paid to this epoch's veBTC voters, not to LPs."
            />
          </dt>
          <dd className="font-mono tabular-nums text-[var(--content-primary)]">
            {isLoadingMetrics
              ? "…"
              : formatMicroUsd(metric?.voterFeesMicroUsd ?? 0n)}
          </dd>
        </div>
        <div>
          <dt className="text-[var(--content-tertiary)]">TVL</dt>
          <dd className="font-mono tabular-nums text-[var(--content-secondary)]">
            {formatCompactMicroUsd(tvlMicroUsd)}
          </dd>
        </div>
        <div>
          <dt className="text-[var(--content-tertiary)]">24h Volume</dt>
          <dd className="font-mono tabular-nums text-[var(--content-secondary)]">
            {formatCompactMicroUsd(volumeMicroUsd)}
          </dd>
        </div>
        <div className="col-span-2">
          <dt className="flex items-center gap-1 text-[var(--content-tertiary)]">
            LP APR
            <Tooltip
              id={`pool-vote-lp-apr-${pool.address}`}
              content="What liquidity providers earn (trading fees APR + MEZO emissions APY). Your vote steers emissions toward this pool, raising what LPs here earn."
            />
          </dt>
          <dd className="font-mono tabular-nums text-[var(--content-secondary)]">
            {formatValidatorApy(lpAprBasisPoints)}
          </dd>
        </div>
      </dl>

      {metric && (metric.bribes.length > 0 || metric.voterFees.length > 0) && (
        <div className="flex flex-col gap-2">
          {metric.bribes.length > 0 && (
            <RewardTokenList
              id={`pool-vote-bribe-tokens-${pool.address}`}
              label="Bribes"
              tokens={metric.bribes}
            />
          )}
          {metric.voterFees.length > 0 && (
            <RewardTokenList
              id={`pool-vote-fee-tokens-${pool.address}`}
              label="Fees"
              tokens={metric.voterFees}
            />
          )}
        </div>
      )}

      <p className="text-2xs text-[var(--content-secondary)]">
        Current selected vote: {formatBasisPoints(currentAllocation)}%
      </p>

      <fieldset className="mt-auto rounded-lg border border-[var(--border)] bg-[var(--surface-secondary)] p-3">
        <legend className="px-1 text-2xs font-medium text-[var(--content-tertiary)]">
          Vote Setup
        </legend>
        <ol className="mt-1 flex flex-col gap-3 sm:flex-row sm:items-end">
          <li className="min-w-0 flex-1">
            <label
              htmlFor={inputId}
              className="mb-1 block text-2xs text-[var(--content-secondary)]"
            >
              Vote %
            </label>
            <Input
              id={inputId}
              type="number"
              min={0}
              max={100}
              step={0.01}
              value={allocation}
              onChange={handleAllocationChange}
              placeholder="0"
              size="small"
              disabled={!isAlive}
              positive={allocation.trim() !== "" && allocation !== "0"}
              overrides={{ Root: { style: { width: "100%" } } }}
            />
          </li>
          <li>
            <Button
              kind={isSelected ? "secondary" : "primary"}
              size="small"
              onClick={onToggleSelection}
              disabled={
                !isSelected &&
                (!isAlive ||
                  allocationBasisPoints === null ||
                  allocationBasisPoints === 0n)
              }
              overrides={{ BaseButton: { style: { width: "100%" } } }}
            >
              {isSelected ? "Remove" : "Add to Ballot"}
            </Button>
          </li>
        </ol>
      </fieldset>
    </article>
  )
}
