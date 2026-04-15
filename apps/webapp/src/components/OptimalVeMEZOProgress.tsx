import { formatFixedPoint } from "@/utils/format"
import { weightToOptimalRatio } from "@/utils/optimalVeMEZO"

type Size = "sm" | "md"

type OptimalVeMEZOProgressProps = {
  /** veMEZO target weight that reaches 5x boost. */
  optimalTarget: bigint | undefined
  /** Current veMEZO voting weight on the gauge, optionally plus projected delta. */
  effectiveWeight: bigint
  /** Visual size of the bar — compact cards use "sm", detail pages use "md". */
  size?: Size
}

export default function OptimalVeMEZOProgress({
  optimalTarget,
  effectiveWeight,
  size = "sm",
}: OptimalVeMEZOProgressProps) {
  if (optimalTarget === undefined) {
    return <span className="font-mono">-</span>
  }

  const optimalFillPercent =
    optimalTarget > 0n
      ? Math.min(100, Number((effectiveWeight * 100n) / optimalTarget))
      : 0
  const atOrAboveOptimal =
    optimalTarget > 0n && effectiveWeight >= optimalTarget
  const pastOptimal = optimalTarget > 0n && effectiveWeight > optimalTarget
  const optimalOverVeMEZO = pastOptimal ? effectiveWeight - optimalTarget : 0n
  const weightVsOptimalRatio =
    optimalTarget > 0n
      ? weightToOptimalRatio(effectiveWeight, optimalTarget)
      : 1
  const projectedAdditional =
    optimalTarget > effectiveWeight ? optimalTarget - effectiveWeight : 0n
  const hasShortfall = projectedAdditional > 0n

  const targetClass =
    size === "md"
      ? "min-w-0 font-mono text-base leading-snug tracking-tight text-[var(--content-primary)] tabular-nums [overflow-wrap:anywhere]"
      : "min-w-0 font-mono text-sm leading-snug tracking-tight text-[var(--content-primary)] [overflow-wrap:anywhere]"
  const sideTextClass =
    size === "md"
      ? "font-mono text-xs tabular-nums"
      : "font-mono text-2xs tabular-nums"
  const barHeightClass = size === "md" ? "h-2" : "h-1.5"

  return (
    <div className="space-y-1.5">
      <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
        <span className={targetClass} title={formatFixedPoint(optimalTarget)}>
          {formatFixedPoint(optimalTarget)}
        </span>
        {hasShortfall && (
          <span
            className={`${sideTextClass} text-[var(--content-secondary)]`}
            title="veMEZO still needed to reach 5x boost on this gauge"
          >
            {formatFixedPoint(projectedAdditional)} to 5x
          </span>
        )}
        {pastOptimal && (
          <span
            className={`${sideTextClass} text-[var(--negative)]`}
            title={`${weightVsOptimalRatio.toFixed(2)}x optimal weight - oversubscribed.`}
          >
            +{formatFixedPoint(optimalOverVeMEZO)} over
          </span>
        )}
      </div>
      <div
        className={`relative ${barHeightClass} w-full overflow-hidden rounded-full bg-[var(--surface-secondary)] ring-1 ring-inset ${
          atOrAboveOptimal
            ? "ring-[rgba(var(--positive-rgb),0.22)]"
            : "ring-[var(--border)]"
        }`}
        aria-hidden="true"
      >
        {hasShortfall ? (
          <div
            className="h-full rounded-full bg-[rgba(247,147,26,0.9)] transition-[width] duration-300 ease-out"
            style={{ width: `${optimalFillPercent}%` }}
          />
        ) : (
          atOrAboveOptimal && (
            <div className="relative h-full w-full">
              <div className="optimal-vemezo-shine absolute inset-y-0 left-0 h-full w-full rounded-full bg-[var(--positive)]" />
            </div>
          )
        )}
      </div>
    </div>
  )
}
