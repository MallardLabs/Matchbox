import { type HTMLAttributes, type ReactElement, forwardRef } from "react"
import { cn } from "./cn"

const ROOT_NAME = "BarChart"

export type BarTone = "past" | "current" | "projected" | "unavailable"

export type Bar = {
  key: string
  /** Axis label under the bar ("121", "Next"). */
  label: string
  /** Geometry only; display text comes from `display`. Null = no data. */
  value: number | null
  /** Exact, pre-formatted value shown above the bar ("$1,050"). */
  display: string
  tone: BarTone
}

export type RootProps = HTMLAttributes<HTMLDivElement> & {
  bars: Bar[]
  /** Accessible name for the chart and its data table. */
  title: string
  /** Formats a y-axis tick ("$500", "$1k"). */
  formatTick: (value: number) => string
  /** Plot height in px (the design uses 178). */
  height?: number
  /** compact: tighter columns so 8+ date-labelled epochs fit a half-width card. */
  spacing?: "comfortable" | "compact"
}

// Fine enough that bars fill most of the plot; each halves cleanly for the
// middle tick.
const NICE_STEPS = [1, 2, 3, 4, 5, 6, 8, 10]

/** Rounds up to a step × 10ⁿ so every chart shares readable ticks. */
export function niceCeiling(value: number): number {
  if (value <= 0 || !Number.isFinite(value)) return 1
  const exponent = 10 ** Math.floor(Math.log10(value))
  const fraction = value / exponent
  const nice = NICE_STEPS.find((step) => fraction <= step) ?? 10
  // toPrecision drops float noise such as 3 * 0.1 = 0.30000000000000004.
  return Number((nice * exponent).toPrecision(12))
}

/**
 * Epoch bar chart (Overview earnings, Rewards realized, public incentives).
 * Bars share one linear scale from zero; missing epochs draw a dashed stub
 * instead of a zero bar. A visually hidden table carries the exact values.
 */
export const Root = forwardRef<HTMLDivElement, RootProps>(function BarChart(
  {
    bars,
    title,
    formatTick,
    height = 178,
    spacing = "comfortable",
    className,
    ...props
  },
  ref,
): ReactElement {
  const max = niceCeiling(
    Math.max(0, ...bars.map((bar) => (bar.value === null ? 0 : bar.value))),
  )
  const ticks = [max, max / 2, 0]
  const gap = spacing === "compact" ? "gap-1 sm:gap-1.5" : "gap-2 sm:gap-4"

  return (
    <div ref={ref} className={cn("flex flex-col", className)} {...props}>
      <figure aria-hidden="true" className="m-0 flex flex-col">
        <div className="flex items-end gap-1" style={{ height }}>
          <div
            className="flex h-full w-[34px] shrink-0 flex-col items-end justify-between pb-0 font-mono text-[9px] text-muted"
            style={{ marginTop: -5, marginBottom: -5, height: height + 10 }}
          >
            {ticks.map((tick) => (
              <span key={tick}>{formatTick(tick)}</span>
            ))}
          </div>
          <div className={cn("flex h-full min-w-0 flex-1 items-end", gap)}>
            {bars.map((bar) => (
              <BarColumn key={bar.key} bar={bar} max={max} height={height} />
            ))}
          </div>
        </div>
        <div className="h-px w-full bg-line" />
        <div className="flex gap-1 pt-2">
          <span className="w-[34px] shrink-0" />
          <div className={cn("flex min-w-0 flex-1", gap)}>
            {bars.map((bar) => (
              <span
                key={bar.key}
                className={cn(
                  "flex-1 truncate text-center font-mono text-[10px]",
                  bar.tone === "current"
                    ? "font-500 text-accent-ink"
                    : bar.tone === "projected"
                      ? "text-accent-ink"
                      : "text-muted",
                )}
              >
                {bar.label}
              </span>
            ))}
          </div>
        </div>
      </figure>
      <table className="sr-only">
        <caption>{title}</caption>
        <thead>
          <tr>
            <th scope="col">Epoch</th>
            <th scope="col">Value</th>
          </tr>
        </thead>
        <tbody>
          {bars.map((bar) => (
            <tr key={bar.key}>
              <th scope="row">{bar.label}</th>
              <td>{bar.value === null ? "Unavailable" : bar.display}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
})
Root.displayName = ROOT_NAME

function BarColumn({
  bar,
  max,
  height,
}: {
  bar: Bar
  max: number
  height: number
}): ReactElement {
  const labelSpace = 16
  const usable = height - labelSpace
  const barHeight =
    bar.value === null
      ? 6
      : Math.max(bar.value > 0 ? 4 : 1, (bar.value / max) * usable)
  return (
    <div className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1">
      <span
        className={cn(
          "whitespace-nowrap text-[9px] font-600 tabular-nums",
          bar.tone === "current" || bar.tone === "projected"
            ? "text-accent-ink"
            : "text-muted",
        )}
      >
        {bar.value === null ? "—" : bar.display}
      </span>
      <span
        className={cn(
          "block w-full max-w-[36px] rounded-t",
          bar.tone === "past" && "bg-line",
          bar.tone === "current" && "border-2 border-accent-ink bg-accent",
          bar.tone === "projected" &&
            "border-[1.5px] border-accent bg-accent-soft",
          bar.tone === "unavailable" &&
            "border border-dashed border-line-2 bg-transparent",
        )}
        style={{ height: barHeight }}
      />
    </div>
  )
}
