import type { RewardOptimizerResult } from "@/utils/rewardOptimizer"
import { formatMicroUsd, formatValidatorApy } from "@/utils/validatorApy"
import { Button, Tag } from "@mezo-org/mezo-clay"

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
  onOptimize: () => void
}

function summaryMetrics(
  feedback: Extract<RewardOptimizerFeedback, { message: null }>,
): { label: string; value: string }[] {
  return [
    {
      label: "Est. epoch rewards",
      value: formatMicroUsd(feedback.result.projectedRewardMicroUsd),
    },
    {
      label: "Blended APY",
      value: formatValidatorApy(feedback.annualizedReturnBasisPoints),
    },
    {
      label: "Gauges considered",
      value: feedback.result.evaluatedGaugeCount.toString(),
    },
  ]
}

export default function RewardOptimizerPanel({
  assetLabel,
  disabled,
  disabledMessage,
  isLoading,
  unpricedIncentiveCount,
  feedback,
  onOptimize,
}: RewardOptimizerPanelProps): JSX.Element {
  return (
    <section className="flex flex-col gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-secondary)] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-[var(--content-primary)]">
            Optimize
          </h3>
          <p className="text-pretty text-xs text-[var(--content-secondary)]">
            Fills your ballot with the reward-maximizing split of this
            epoch&apos;s priced incentives across your {assetLabel} vote.
          </p>
        </div>
        <Button
          kind="primary"
          size="small"
          disabled={disabled || isLoading}
          isLoading={isLoading}
          onClick={onOptimize}
        >
          Optimize
        </Button>
      </div>

      {disabled && !isLoading ? (
        <p className="text-pretty text-xs text-[var(--content-tertiary)]">
          {disabledMessage}
        </p>
      ) : null}

      <div aria-live="polite" className="empty:hidden">
        {feedback?.result ? (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <Tag closeable={false} color="green">
              Applied to {feedback.result.allocations.length} gauge
              {feedback.result.allocations.length === 1 ? "" : "s"}
            </Tag>
            <dl className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
              {summaryMetrics(feedback).map((metric) => (
                <div key={metric.label} className="flex items-baseline">
                  <dt className="text-[var(--content-tertiary)]">
                    {metric.label}
                  </dt>
                  <dd className="ml-1.5 font-mono font-semibold tabular-nums text-[var(--content-primary)]">
                    {metric.value}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        ) : (
          feedback && (
            <p className="text-pretty text-xs text-[var(--content-secondary)]">
              {feedback.message}
            </p>
          )
        )}
      </div>

      {unpricedIncentiveCount > 0 && (
        <p className="text-pretty text-xs text-[var(--warning)]">
          {unpricedIncentiveCount} current-epoch incentive token
          {unpricedIncentiveCount === 1 ? " was" : "s were"} excluded because a
          reliable USD price is unavailable.
        </p>
      )}
    </section>
  )
}
