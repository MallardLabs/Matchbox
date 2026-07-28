import type { RewardOptimizerResult } from "@/utils/rewardOptimizer"
import { formatMicroUsd, formatValidatorApy } from "@/utils/validatorApy"
import { Button, Input, Tag } from "@mezo-org/mezo-clay"
import { useState } from "react"

export type RewardOptimizerFeedback =
  | {
      result: RewardOptimizerResult
      annualizedReturnBasisPoints: bigint | null
      message: null
    }
  | {
      result: null
      annualizedReturnBasisPoints: null
      message: string
    }

type RewardOptimizerPanelProps = {
  assetLabel: "veMEZO" | "veBTC"
  disabled: boolean
  disabledMessage: string
  isLoading: boolean
  unpricedIncentiveCount: number
  feedback: RewardOptimizerFeedback | null
  resolveGaugeLabel: (gaugeId: string) => string
  onPreview: (
    maxGaugeCount: number,
    excludedGaugeIds: ReadonlySet<string>,
  ) => void
  onApply: (result: RewardOptimizerResult) => void
}

export default function RewardOptimizerPanel({
  assetLabel,
  disabled,
  disabledMessage,
  isLoading,
  unpricedIncentiveCount,
  feedback,
  resolveGaugeLabel,
  onPreview,
  onApply,
}: RewardOptimizerPanelProps): JSX.Element {
  const [maxGaugeCount, setMaxGaugeCount] = useState("8")
  const [lastPreviewGaugeCount, setLastPreviewGaugeCount] = useState<
    number | null
  >(null)
  const [excludedGaugeIds, setExcludedGaugeIds] = useState<Set<string>>(
    new Set(),
  )
  const [isApplied, setIsApplied] = useState(false)
  const parsedMaxGaugeCount = Number(maxGaugeCount)
  const hasIntegerGaugeCountSyntax = /^\d+$/.test(maxGaugeCount)
  const isGaugeCountValid =
    hasIntegerGaugeCountSyntax &&
    Number.isSafeInteger(parsedMaxGaugeCount) &&
    parsedMaxGaugeCount >= 1 &&
    parsedMaxGaugeCount <= 16
  const maxGaugeInputId = `optimizer-max-gauges-${assetLabel.toLowerCase()}`
  const maxGaugeErrorId = `${maxGaugeInputId}-error`

  function preview(nextExcludedGaugeIds = excludedGaugeIds) {
    if (!isGaugeCountValid) return
    setLastPreviewGaugeCount(parsedMaxGaugeCount)
    setIsApplied(false)
    onPreview(parsedMaxGaugeCount, nextExcludedGaugeIds)
  }

  function excludeGauge(gaugeId: string) {
    const next = new Set(excludedGaugeIds)
    next.add(gaugeId)
    setExcludedGaugeIds(next)
    preview(next)
  }

  function resetExclusions() {
    const next = new Set<string>()
    setExcludedGaugeIds(next)
    preview(next)
  }

  return (
    <fieldset className="rounded-xl border border-[var(--border)] bg-[var(--surface-secondary)] p-4">
      <legend className="px-2 text-balance text-sm font-semibold text-[var(--content-primary)]">
        Reward optimizer
      </legend>
      <div className="flex flex-col gap-4">
        <p className="text-pretty text-xs text-[var(--content-secondary)]">
          Estimates a reward-maximizing ballot from the current USD value of
          priced incentives, your {assetLabel} vote, and its dilution of each
          gauge.
        </p>

        <ol className="flex list-none flex-col gap-3 p-0 sm:flex-row sm:items-end">
          <li className="w-full sm:max-w-36">
            <label
              htmlFor={maxGaugeInputId}
              className="mb-1 block text-xs text-[var(--content-secondary)]"
            >
              Maximum gauges
            </label>
            <Input
              id={maxGaugeInputId}
              type="number"
              min={1}
              max={16}
              step={1}
              value={maxGaugeCount}
              onChange={(event) => {
                setMaxGaugeCount(event.target.value)
                setIsApplied(false)
              }}
              aria-invalid={!isGaugeCountValid}
              aria-describedby={maxGaugeErrorId}
              size="small"
            />
          </li>
          <li>
            <Button
              kind="primary"
              size="small"
              disabled={disabled || isLoading || !isGaugeCountValid}
              isLoading={isLoading}
              onClick={() => preview()}
            >
              Preview optimized ballot
            </Button>
          </li>
        </ol>

        <p
          id={maxGaugeErrorId}
          className={
            isGaugeCountValid
              ? "sr-only"
              : "text-pretty text-xs text-[var(--negative)]"
          }
        >
          Choose between 1 and 16 gauges.
        </p>
        {isGaugeCountValid && disabled ? (
          <p className="text-pretty text-xs text-[var(--content-tertiary)]">
            {disabledMessage}
          </p>
        ) : null}

        {feedback && (
          <div
            aria-live="polite"
            className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3"
          >
            {feedback.result ? (
              <div className="flex flex-col gap-3">
                <div className="flex flex-wrap gap-2">
                  <Tag closeable={false} color="green">
                    {isApplied ? "Applied" : "Preview"}
                  </Tag>
                  <Tag closeable={false} color="gray">
                    {feedback.result.allocations.length} gauge
                    {feedback.result.allocations.length === 1 ? "" : "s"}
                  </Tag>
                  {lastPreviewGaugeCount !== null && (
                    <Tag closeable={false} color="gray">
                      {lastPreviewGaugeCount} gauge max
                    </Tag>
                  )}
                  {excludedGaugeIds.size > 0 && (
                    <Tag closeable={false} color="yellow">
                      {excludedGaugeIds.size} excluded
                    </Tag>
                  )}
                  <Tag closeable={false} color="gray">
                    0.01% precision
                  </Tag>
                </div>
                <dl className="grid gap-3 sm:grid-cols-3">
                  <div>
                    <dt className="text-xs text-[var(--content-tertiary)]">
                      Estimated epoch rewards
                    </dt>
                    <dd className="mt-1 font-mono text-sm font-semibold tabular-nums text-[var(--content-primary)]">
                      {formatMicroUsd(feedback.result.projectedRewardMicroUsd)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-[var(--content-tertiary)]">
                      Blended APY
                    </dt>
                    <dd className="mt-1 font-mono text-sm font-semibold tabular-nums text-[var(--content-primary)]">
                      {formatValidatorApy(feedback.annualizedReturnBasisPoints)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-[var(--content-tertiary)]">
                      Gauges evaluated
                    </dt>
                    <dd className="mt-1 font-mono text-sm font-semibold tabular-nums text-[var(--content-primary)]">
                      {feedback.result.evaluatedGaugeCount}
                    </dd>
                  </div>
                </dl>
                <ol className="flex max-h-64 flex-col gap-2 overflow-y-auto">
                  {feedback.result.allocations.map((allocation) => (
                    <li
                      key={allocation.id}
                      className="flex flex-col gap-2 rounded-lg border border-[var(--border)] p-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-[var(--content-primary)]">
                          {resolveGaugeLabel(allocation.id)}
                        </p>
                        <p className="mt-1 font-mono text-xs tabular-nums text-[var(--content-secondary)]">
                          {formatOptimizerPercentage(allocation.basisPoints)}% ·{" "}
                          {formatMicroUsd(allocation.projectedRewardMicroUsd)}{" "}
                          estimated
                        </p>
                      </div>
                      <Button
                        kind="tertiary"
                        size="small"
                        onClick={() => excludeGauge(allocation.id)}
                      >
                        Exclude
                      </Button>
                    </li>
                  ))}
                </ol>
                <p className="text-pretty text-xs text-[var(--content-secondary)]">
                  The ballot balances each gauge&apos;s marginal reward after
                  self-dilution. Previewed percentages do not change your ballot
                  until you apply them.
                </p>
                <div className="flex flex-wrap gap-2">
                  {excludedGaugeIds.size > 0 && (
                    <Button
                      kind="secondary"
                      size="small"
                      onClick={resetExclusions}
                    >
                      Reset exclusions
                    </Button>
                  )}
                  <Button
                    kind="primary"
                    size="small"
                    disabled={isApplied}
                    onClick={() => {
                      setIsApplied(true)
                      onApply(feedback.result)
                    }}
                  >
                    {isApplied
                      ? "Applied to ballot"
                      : "Apply optimized allocation"}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <p className="text-pretty text-xs text-[var(--content-secondary)]">
                  {feedback.message}
                </p>
                {excludedGaugeIds.size > 0 && (
                  <Button
                    kind="secondary"
                    size="small"
                    onClick={resetExclusions}
                  >
                    Reset exclusions
                  </Button>
                )}
              </div>
            )}
          </div>
        )}

        {unpricedIncentiveCount > 0 && (
          <p className="text-pretty text-xs text-[var(--warning)]">
            {unpricedIncentiveCount} current-epoch incentive token
            {unpricedIncentiveCount === 1 ? " was" : "s were"} excluded because
            a reliable USD price is unavailable.
          </p>
        )}
      </div>
    </fieldset>
  )
}

function formatOptimizerPercentage(basisPoints: bigint): string {
  const whole = basisPoints / 100n
  const fraction = (basisPoints % 100n).toString().padStart(2, "0")
  return fraction === "00" ? whole.toString() : `${whole}.${fraction}`
}
