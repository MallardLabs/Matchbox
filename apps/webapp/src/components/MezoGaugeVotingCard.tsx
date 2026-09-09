import { TokenStackIcon } from "@/components/PoolCard"
import { TokenIcon } from "@/components/TokenIcon"
import type { MezoGaugeRow } from "@/hooks/useMezoGauges"
import {
  formatDistributionDate,
  mezoVenueTokenIconSymbols,
} from "@/lib/mezoGauges"
import { cn } from "@/utils/cn"
import { formatMicroUsd } from "@/utils/validatorApy"
import { percentageToBasisPoints } from "@/utils/validatorVoting"
import { Button, Input } from "@mezo-org/mezo-clay"
import Link from "next/link"
import type { ChangeEvent } from "react"
import { formatUnits } from "viem"

type MezoGaugeVotingCardProps = {
  row: MezoGaugeRow
  totalWeight: bigint
  allocation: string
  currentAllocation: bigint
  isSelected: boolean
  readOnly: boolean
  isLoadingIncentives: boolean
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

export default function MezoGaugeVotingCard({
  row,
  totalWeight,
  allocation,
  currentAllocation,
  isSelected,
  readOnly,
  isLoadingIncentives,
  onAllocationChange,
  onToggleSelection,
}: MezoGaugeVotingCardProps): JSX.Element {
  const shareBasisPoints =
    totalWeight > 0n ? (row.weight * 10_000n) / totalWeight : 0n
  const allocationBasisPoints = percentageToBasisPoints(allocation)

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
      <header className="flex items-start gap-3">
        <Link
          href={`/mezo-gauges/${row.gauge}`}
          className="flex min-w-0 items-center gap-3 text-inherit no-underline"
        >
          <TokenStackIcon
            symbols={mezoVenueTokenIconSymbols(row.identity.tokens)}
            size={32}
          />
          <h3 className="truncate text-sm font-semibold text-[var(--content-primary)]">
            {row.identity.name}
          </h3>
        </Link>
      </header>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
        <div>
          <dt className="text-[var(--content-tertiary)]">Weight</dt>
          <dd className="font-mono tabular-nums text-[var(--content-primary)]">
            {formatAmount(row.weight)} veMEZO
          </dd>
        </div>
        <div>
          <dt className="text-[var(--content-tertiary)]">Share</dt>
          <dd className="font-mono tabular-nums text-[var(--content-primary)]">
            {formatBasisPoints(shareBasisPoints)}%
          </dd>
        </div>
        <div>
          <dt className="text-[var(--content-tertiary)]">Incentives</dt>
          <dd className="font-mono tabular-nums text-[var(--content-primary)]">
            {isLoadingIncentives ? "…" : formatMicroUsd(row.incentivesMicroUsd)}
          </dd>
        </div>
        <div>
          <dt className="text-[var(--content-tertiary)]">Distribution</dt>
          <dd className="font-mono tabular-nums text-[var(--content-primary)]">
            {formatDistributionDate(row.distributionDate)}
          </dd>
        </div>
        {row.incentives.length > 0 && (
          <div className="col-span-2 flex min-w-0 flex-wrap gap-1.5">
            {row.incentives.map((incentive) => (
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
              htmlFor={`mezo-gauge-vote-${row.gauge}`}
              className="mb-1 block text-2xs text-[var(--content-secondary)]"
            >
              Vote %
            </label>
            <Input
              id={`mezo-gauge-vote-${row.gauge}`}
              type="number"
              min={0}
              max={100}
              step={0.01}
              value={allocation}
              onChange={handleAllocationChange}
              placeholder="0"
              size="small"
              disabled={readOnly}
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
                readOnly ||
                (!isSelected &&
                  (allocationBasisPoints === null ||
                    allocationBasisPoints === 0n))
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
