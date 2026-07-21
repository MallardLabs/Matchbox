import MarqueeText from "@/components/MarqueeText"
import { usePoolBribeIncentives } from "@/hooks/usePoolIncentives"
import { useValidatorProfile } from "@/hooks/useValidatorProfiles"
import type { Validator } from "@/lib/validators"
import { percentageToBasisPoints } from "@/utils/validatorVoting"
import { Button, Input, Skeleton, Tag } from "@mezo-org/mezo-clay"
import Link from "next/link"
import type { ChangeEvent } from "react"
import { formatUnits } from "viem"

type ValidatorGaugeVotingCardProps = {
  validator: Validator
  totalWeight: bigint
  allocation: string
  currentAllocation?: bigint | undefined
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
  allocation,
  currentAllocation,
  isSelected,
  onAllocationChange,
  onToggleSelection,
}: ValidatorGaugeVotingCardProps): JSX.Element {
  const { profile, isLoading: isLoadingProfile } = useValidatorProfile(
    validator.gauge,
  )
  const { incentives, isLoading: isLoadingIncentives } = usePoolBribeIncentives(
    validator.bribe,
  )
  const activeIncentives = incentives.filter(
    (incentive) => incentive.amount > 0n,
  )
  const weight = BigInt(validator.weight)
  const shareBasisPoints =
    totalWeight > 0n ? (weight * 10_000n) / totalWeight : 0n
  const displayName =
    profile?.display_name || validator.moniker || validator.operator
  const description =
    profile?.description || validator.details || "Mezo validator"
  const allocationBasisPoints = percentageToBasisPoints(allocation)

  function handleAllocationChange(
    event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) {
    onAllocationChange(event.target.value)
  }

  return (
    <article
      className={`flex min-w-0 flex-col gap-3 overflow-hidden rounded-xl border bg-[var(--surface)] p-3 sm:p-4 ${
        isSelected ? "border-[var(--positive)]" : "border-[var(--border)]"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <Link
          href={`/validator-gauges/${validator.gauge}`}
          className="flex min-w-0 items-center gap-3 text-inherit no-underline"
        >
          <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center overflow-hidden rounded-full border border-[var(--border)] bg-[var(--surface-secondary)]">
            {isLoadingProfile ? (
              <Skeleton width="44px" height="44px" animation />
            ) : profile?.profile_picture_url ? (
              <img
                src={profile.profile_picture_url}
                alt={`${displayName} profile`}
                className="h-full w-full object-cover"
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
            <p className="truncate text-2xs text-[var(--content-secondary)]">
              {description}
            </p>
          </div>
        </Link>
        <Tag color="green" closeable={false}>
          Active
        </Tag>
      </div>

      <dl className="grid grid-cols-2 gap-3 text-xs">
        <div>
          <dt className="text-[var(--content-tertiary)]">BTC weight</dt>
          <dd className="font-mono tabular-nums text-[var(--content-primary)]">
            {formatAmount(weight)} veBTC
          </dd>
        </div>
        <div>
          <dt className="text-[var(--content-tertiary)]">Weight share</dt>
          <dd className="font-mono tabular-nums text-[var(--content-primary)]">
            {formatBasisPoints(shareBasisPoints)}%
          </dd>
        </div>
        <div className="col-span-2">
          <dt className="text-[var(--content-tertiary)]">Current incentives</dt>
          <dd className="mt-0.5 flex min-h-5 flex-wrap items-center gap-1.5">
            {isLoadingIncentives ? (
              <Skeleton width="92px" height="16px" animation />
            ) : activeIncentives.length === 0 ? (
              <span className="text-[var(--content-secondary)]">—</span>
            ) : (
              <>
                {activeIncentives.slice(0, 2).map((incentive) => (
                  <span
                    key={incentive.tokenAddress}
                    className="rounded-full border border-[var(--border)] bg-[var(--surface-secondary)] px-2 py-0.5 font-mono text-2xs tabular-nums text-[var(--content-primary)]"
                  >
                    {formatAmount(incentive.amount, incentive.decimals)}{" "}
                    {incentive.symbol}
                  </span>
                ))}
                {activeIncentives.length > 2 && (
                  <span className="text-2xs text-[var(--content-tertiary)]">
                    +{activeIncentives.length - 2}
                  </span>
                )}
              </>
            )}
          </dd>
        </div>
      </dl>

      {currentAllocation !== undefined && currentAllocation > 0n && (
        <p className="text-2xs text-[var(--content-secondary)]">
          Current primary NFT vote: {formatBasisPoints(currentAllocation)}%
        </p>
      )}

      <fieldset className="mt-auto flex flex-col gap-3 rounded-lg bg-[var(--surface-secondary)] p-3">
        <legend className="text-2xs uppercase tracking-wider text-[var(--content-tertiary)]">
          Vote setup
        </legend>
        <ol className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
          <li className="flex min-w-0 flex-1 items-center justify-between gap-3 sm:justify-start">
            <label
              htmlFor={`validator-vote-${validator.gauge}`}
              className="shrink-0 text-2xs text-[var(--content-secondary)]"
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
              overrides={{
                Root: {
                  style: { width: "100%", maxWidth: "140px", minWidth: "0" },
                },
              }}
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
              {isSelected ? "Remove" : "Add to cart"}
            </Button>
          </li>
        </ol>
      </fieldset>
    </article>
  )
}
