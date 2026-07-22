import MarqueeText from "@/components/MarqueeText"
import { TokenIcon } from "@/components/TokenIcon"
import WatchGaugeButton from "@/components/WatchGaugeButton"
import type { ValidatorMetric } from "@/hooks/useValidatorMetrics"
import { useValidatorProfile } from "@/hooks/useValidatorProfiles"
import type { Validator } from "@/lib/validators"
import { cn } from "@/utils/cn"
import { formatMicroUsd, formatValidatorApy } from "@/utils/validatorApy"
import { percentageToBasisPoints } from "@/utils/validatorVoting"
import { Button, Input, Skeleton, Tag } from "@mezo-org/mezo-clay"
import Link from "next/link"
import type { ChangeEvent } from "react"
import { formatUnits } from "viem"

type ValidatorGaugeVotingCardProps = {
  validator: Validator
  totalWeight: bigint
  metric: ValidatorMetric | undefined
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

export default function ValidatorGaugeVotingCard({
  validator,
  totalWeight,
  metric,
  isLoadingMetrics,
  allocation,
  currentAllocation,
  projectedApyBasisPoints,
  isSelected,
  onAllocationChange,
  onToggleSelection,
}: ValidatorGaugeVotingCardProps): JSX.Element {
  const { profile, isLoading: isLoadingProfile } = useValidatorProfile(
    validator.gauge,
  )
  const weight = BigInt(validator.weight)
  const shareBasisPoints =
    totalWeight > 0n ? (weight * 10_000n) / totalWeight : 0n
  const displayName =
    profile?.display_name || validator.moniker || validator.operator
  const description = profile?.description || validator.details || null
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
          href={`/validator-gauges/${validator.gauge}`}
          className="flex min-w-0 items-center gap-3 text-inherit no-underline"
        >
          <div className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-full border border-[var(--border)] bg-[var(--surface-secondary)]">
            {isLoadingProfile ? (
              <Skeleton width="44px" height="44px" animation />
            ) : profile?.profile_picture_url ? (
              <img
                src={profile.profile_picture_url}
                alt={`${displayName} profile`}
                className="size-full object-cover"
              />
            ) : (
              <span className="font-mono text-xs font-semibold text-[var(--content-secondary)]">
                {displayName.slice(0, 2).toUpperCase()}
              </span>
            )}
          </div>
          <div className="min-w-0">
            <MarqueeText className="text-sm font-semibold text-[var(--content-primary)]">
              {displayName}
            </MarqueeText>
            {description && (
              <p className="line-clamp-2 text-pretty text-2xs text-[var(--content-secondary)]">
                {description}
              </p>
            )}
          </div>
        </Link>
        <div className="flex shrink-0 items-center gap-2">
          <Tag color={validator.isAlive ? "green" : "gray"} closeable={false}>
            {validator.isAlive ? "Active" : "Inactive"}
          </Tag>
          <WatchGaugeButton gaugeAddress={validator.gauge} compact />
        </div>
      </header>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
        <div>
          <dt className="text-[var(--content-tertiary)]">BTC Weight</dt>
          <dd className="font-mono tabular-nums text-[var(--content-primary)]">
            {formatAmount(weight)} veBTC
          </dd>
        </div>
        <div>
          <dt className="text-[var(--content-tertiary)]">Share</dt>
          <dd className="font-mono tabular-nums text-[var(--content-primary)]">
            {formatBasisPoints(shareBasisPoints)}%
          </dd>
        </div>
        <div>
          <dt className="text-[var(--content-tertiary)]">APY</dt>
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
          <dt className="text-[var(--content-tertiary)]">Incentives</dt>
          <dd className="font-mono tabular-nums text-[var(--content-primary)]">
            {isLoadingMetrics
              ? "…"
              : formatMicroUsd(metric?.totalIncentivesMicroUsd ?? 0n)}
          </dd>
        </div>
        {metric && metric.incentives.length > 0 && (
          <div className="col-span-2 flex min-w-0 flex-wrap gap-1.5">
            {metric.incentives.map((incentive) => (
              <span
                key={incentive.tokenAddress}
                className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--surface-secondary)] px-2 py-1 text-2xs text-[var(--content-secondary)]"
                title={`${formatAmount(incentive.amount, incentive.decimals)} ${incentive.symbol}`}
              >
                <TokenIcon symbol={incentive.symbol} size={14} />
                <span>{incentive.symbol}</span>
                <span className="font-mono tabular-nums text-[var(--content-primary)]">
                  {formatMicroUsd(incentive.valueMicroUsd)}
                </span>
              </span>
            ))}
          </div>
        )}
      </dl>

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
              htmlFor={`validator-vote-${validator.gauge}`}
              className="mb-1 block text-2xs text-[var(--content-secondary)]"
            >
              Vote %
            </label>
            <Input
              id={`validator-vote-${validator.gauge}`}
              type="number"
              min={0}
              max={100}
              step={0.01}
              value={allocation}
              onChange={handleAllocationChange}
              placeholder="0"
              size="small"
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
                (allocationBasisPoints === null || allocationBasisPoints === 0n)
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
