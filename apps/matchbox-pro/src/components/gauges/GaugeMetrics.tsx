import { cn } from "@/lib/cn"
import type { ReactElement } from "react"

export type GaugeMetric = {
  label: string
  value: string
  positive?: boolean
}

/** Pen "Gauge metrics": five equal cards, 11px label over a 20px value. */
export default function GaugeMetrics({
  metrics,
}: {
  metrics: GaugeMetric[]
}): ReactElement {
  return (
    <dl className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
      {metrics.map((metric) => (
        <div
          key={metric.label}
          className="flex min-w-0 flex-col gap-1 rounded-[10px] bg-surface p-3.5"
        >
          <dt className="text-[11px] font-500 text-muted">{metric.label}</dt>
          <dd
            title={metric.value}
            className={cn(
              "truncate text-[20px] font-650 tabular-nums",
              metric.positive && metric.value !== "—" ? "text-pos" : "text-ink",
            )}
          >
            {metric.value}
          </dd>
        </div>
      ))}
    </dl>
  )
}
