import type { BoostGauge } from "@/hooks/useBoostGauges"
import { formatBoost, formatVeAmount } from "@/lib/money"
import type { ReactElement } from "react"

/** Pen "Optimal card": optimal veMEZO target, current boost, and progress toward 5×. */
export default function GaugeOptimalCard({
  gauge,
}: {
  gauge: BoostGauge
}): ReactElement {
  const progress = gauge.optimalVeMEZO
    ? Math.min(
        100,
        Number((gauge.totalWeight * 10_000n) / gauge.optimalVeMEZO) / 100,
      )
    : 0
  const remaining =
    gauge.optimalAdditionalVeMEZO && gauge.optimalAdditionalVeMEZO > 0n
      ? `${formatVeAmount(gauge.optimalAdditionalVeMEZO)} veMEZO to 5×`
      : gauge.boostMultiplier >= 5
        ? "Max boost"
        : "—"

  return (
    <section
      aria-labelledby="optimal-heading"
      className="flex flex-col gap-2 rounded-[10px] bg-surface p-4"
    >
      <div className="flex items-center gap-3">
        <h2 id="optimal-heading" className="text-[13px] font-500 text-muted">
          Optimal veMEZO
        </h2>
        <p className="ml-auto flex items-baseline gap-2 tabular-nums text-ink">
          <span className="text-[18px] font-650">
            {gauge.optimalVeMEZO ? formatVeAmount(gauge.optimalVeMEZO) : "—"}
          </span>
          <span className="text-[14px] font-700">
            {formatBoost(gauge.boostMultiplier)}
          </span>
        </p>
      </div>
      <p className="text-[12px] font-500 tabular-nums text-muted">
        {remaining}
      </p>
      <progress
        aria-label="Progress to optimal veMEZO"
        max={100}
        value={progress}
        className="h-2 w-full appearance-none overflow-hidden rounded bg-inset-2 [&::-moz-progress-bar]:bg-accent [&::-webkit-progress-bar]:bg-inset-2 [&::-webkit-progress-value]:bg-accent"
      />
    </section>
  )
}
