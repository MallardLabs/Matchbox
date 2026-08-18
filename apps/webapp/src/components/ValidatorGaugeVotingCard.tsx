import MarqueeText from "@/components/MarqueeText"
import { TokenIcon } from "@/components/TokenIcon"
import WatchGaugeButton from "@/components/WatchGaugeButton"
import useShiftKeyHeld from "@/hooks/useShiftKeyHeld"
import type {
  ValidatorIncentiveMetric,
  ValidatorMetric,
} from "@/hooks/useValidatorMetrics"
import { useValidatorProfile } from "@/hooks/useValidatorProfiles"
import type { Validator } from "@/lib/validators"
import { cn } from "@/utils/cn"
import { exportElementAsSvg } from "@/utils/exportElementAsSvg"
import { formatMicroUsd, formatValidatorApy } from "@/utils/validatorApy"
import { percentageToBasisPoints } from "@/utils/validatorVoting"
import { Button, Input, Skeleton, Tag } from "@mezo-org/mezo-clay"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import Link from "next/link"
import { type ChangeEvent, type Ref, useRef, useState } from "react"
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

type ValidatorGaugeExportSnapshotProps = {
  snapshotRef: Ref<HTMLElement>
  displayName: string
  description: string | null
  avatarUrl: string | null
  weight: bigint
  apy: bigint | null
  isLoadingMetrics: boolean
  totalIncentivesMicroUsd: bigint | null
  incentives: ValidatorIncentiveMetric[]
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

function exportFilename(displayName: string): string {
  const safeName = displayName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
  return `matchbox-${safeName || "validator-gauge"}.svg`
}

function ValidatorGaugeExportSnapshot({
  snapshotRef,
  displayName,
  description,
  avatarUrl,
  weight,
  apy,
  isLoadingMetrics,
  totalIncentivesMicroUsd,
  incentives,
}: ValidatorGaugeExportSnapshotProps): JSX.Element {
  return (
    <article
      ref={snapshotRef}
      className="flex min-w-0 flex-col gap-3 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4"
    >
      <header className="flex min-w-0 items-center gap-3">
        <div className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-full border border-[var(--border)] bg-[var(--surface-secondary)]">
          {avatarUrl ? (
            <img src={avatarUrl} alt="" className="size-full object-cover" />
          ) : (
            <span className="font-mono text-xs font-semibold text-[var(--content-secondary)]">
              {displayName.slice(0, 2).toUpperCase()}
            </span>
          )}
        </div>
        <div className="min-w-0">
          <p className="text-balance text-sm font-semibold text-[var(--content-primary)]">
            {displayName}
          </p>
          {description ? (
            <p className="line-clamp-2 text-pretty text-2xs text-[var(--content-secondary)]">
              {description}
            </p>
          ) : null}
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
          <dt className="text-[var(--content-tertiary)]">APY</dt>
          <dd className="font-mono tabular-nums text-[var(--content-primary)]">
            {isLoadingMetrics ? "…" : formatValidatorApy(apy)}
          </dd>
        </div>
        <div className="col-span-2">
          <dt className="text-[var(--content-tertiary)]">Incentives</dt>
          <dd className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-mono text-sm font-medium tabular-nums text-[var(--content-primary)]">
              {isLoadingMetrics
                ? "…"
                : formatMicroUsd(totalIncentivesMicroUsd ?? 0n)}
            </span>
            {incentives.length > 0 ? (
              <span className="flex flex-wrap items-center gap-1.5">
                {incentives.map((incentive) => (
                  <span
                    key={incentive.tokenAddress}
                    className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--surface-secondary)] px-2 py-1 text-2xs text-[var(--content-secondary)]"
                  >
                    <TokenIcon symbol={incentive.symbol} size={14} />
                    <span>{incentive.symbol}</span>
                    <span className="font-mono tabular-nums text-[var(--content-primary)]">
                      {formatMicroUsd(incentive.valueMicroUsd)}
                    </span>
                  </span>
                ))}
              </span>
            ) : null}
          </dd>
        </div>
      </dl>
    </article>
  )
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
  const exportRef = useRef<HTMLElement>(null)
  const isShiftKeyHeld = useShiftKeyHeld()
  const prefersReducedMotion = useReducedMotion()
  const [isHovered, setIsHovered] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)
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

  async function handleExport(): Promise<void> {
    if (!exportRef.current || isExporting) return

    setExportError(null)
    setIsExporting(true)
    try {
      await exportElementAsSvg(exportRef.current, exportFilename(displayName))
    } catch {
      setExportError("Couldn't export this gauge. Please try again.")
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <div
      className="relative h-full min-w-0"
      onPointerEnter={() => setIsHovered(true)}
      onPointerLeave={() => setIsHovered(false)}
    >
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

        <div className="relative mt-auto">
          <fieldset className="rounded-lg border border-[var(--border)] bg-[var(--surface-secondary)] p-3">
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
                    (allocationBasisPoints === null ||
                      allocationBasisPoints === 0n)
                  }
                  overrides={{ BaseButton: { style: { width: "100%" } } }}
                >
                  {isSelected ? "Remove" : "Add to Ballot"}
                </Button>
              </li>
            </ol>
          </fieldset>
          <AnimatePresence>
            {isShiftKeyHeld && isHovered && (
              <motion.div
                data-svg-export-ignore="true"
                className="absolute inset-0 z-10 flex flex-col justify-end gap-1 bg-[var(--surface)]"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 12 }}
                transition={{
                  duration: prefersReducedMotion ? 0 : 0.16,
                  ease: "easeOut",
                }}
              >
                <Button
                  kind="secondary"
                  size="small"
                  onClick={() => void handleExport()}
                  disabled={isExporting}
                  overrides={{
                    BaseButton: {
                      style: {
                        width: "100%",
                      },
                    },
                  }}
                >
                  {isExporting ? "Exporting…" : "Export SVG"}
                </Button>
                {exportError && (
                  <p className="text-pretty text-2xs text-[var(--negative)]">
                    {exportError}
                  </p>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </article>

      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 opacity-0"
      >
        <ValidatorGaugeExportSnapshot
          snapshotRef={exportRef}
          displayName={displayName}
          description={description}
          avatarUrl={profile?.profile_picture_url ?? null}
          weight={weight}
          apy={currentApy}
          isLoadingMetrics={isLoadingMetrics}
          totalIncentivesMicroUsd={metric?.totalIncentivesMicroUsd ?? null}
          incentives={metric?.incentives ?? []}
        />
      </div>
    </div>
  )
}
