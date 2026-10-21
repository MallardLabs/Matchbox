import * as BarChart from "@repo/ui/bar-chart"
import { cn } from "@repo/ui/cn"
import { type ReactElement, useState } from "react"
import { formatTick } from "./earnings"

export type LegendItem =
  | "realized"
  | "latest"
  | "claimable"
  | "projected"
  | "deposited"

const LEGEND: Record<LegendItem, { label: string; swatch: string }> = {
  realized: { label: "Realized", swatch: "bg-line" },
  latest: { label: "Last epoch", swatch: "bg-accent" },
  claimable: { label: "Claimable", swatch: "bg-accent" },
  projected: {
    label: "Projected",
    swatch: "border-[1.5px] border-accent bg-accent-soft",
  },
  deposited: { label: "Deposited", swatch: "bg-accent" },
}

/** Hover card for one epoch (Pen 07 "epoch hover"). */
export type BarDetail = {
  heading: string
  value: string
  note: string | null
  rows: Array<{ key: string; label: string; value: string }>
}

const PLOT_HEIGHT = 178
const AXIS = 38
const COLUMN = 40
const GAP = 16

// Column pitch from the design: 40px columns, 16px gaps, 38px axis gutter.
function plotWidth(bars: number): number {
  return AXIS + bars * COLUMN + Math.max(0, bars - 1) * GAP
}

/** "Earnings by epoch" / "Incentives deposited": one shared-scale bar chart. */
export default function EarningsChart({
  title,
  bars,
  legend,
  note,
  busy,
  detail,
  className,
}: {
  title: string
  bars: BarChart.Bar[]
  legend: LegendItem[]
  /** Short state line, e.g. "History unavailable". */
  note: string | null
  busy: boolean
  /** Pointer-only epoch breakdown; the chart's data table carries the values. */
  detail?: (bar: BarChart.Bar) => BarDetail | null
  className?: string
}): ReactElement {
  const [hovered, setHovered] = useState<number | null>(null)
  const hoveredBar = hovered === null ? undefined : bars[hovered]
  const card = hoveredBar && detail ? detail(hoveredBar) : null

  return (
    <section
      aria-label={title}
      aria-busy={busy || undefined}
      className={cn("flex min-w-0 flex-col gap-2.5", className)}
    >
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <h2 className="m-0 text-body font-500 text-ink-2">{title}</h2>
        {legend.length > 0 ? (
          <ul className="m-0 flex list-none items-center gap-3 p-0">
            {legend.map((item) => (
              <li
                key={item}
                className="flex items-center gap-1.5 text-caption text-secondary"
              >
                <span
                  aria-hidden="true"
                  className={cn("size-2.5 rounded-[3px]", LEGEND[item].swatch)}
                />
                {LEGEND[item].label}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <div className="relative" onMouseLeave={() => setHovered(null)}>
        <span
          aria-hidden="true"
          className="absolute inset-x-0 h-px bg-line"
          style={{ top: PLOT_HEIGHT }}
        />
        <BarChart.Root
          bars={bars}
          title={title}
          formatTick={formatTick}
          height={PLOT_HEIGHT}
          style={{ maxWidth: plotWidth(bars.length) }}
          className="relative w-full"
        />
        {detail ? (
          <div
            aria-hidden="true"
            className="absolute left-0 top-0 hidden md:block"
            style={{ width: plotWidth(bars.length), height: PLOT_HEIGHT }}
          >
            {bars.map((bar, index) => (
              <span
                key={bar.key}
                className={cn(
                  "absolute top-0 h-full rounded-md transition-colors",
                  hovered === index && "bg-ink/[0.04]",
                )}
                style={{
                  left: AXIS + index * (COLUMN + GAP) - 6,
                  width: COLUMN + 12,
                }}
                onMouseEnter={() => setHovered(index)}
              />
            ))}
          </div>
        ) : null}
        {card && hovered !== null ? (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute z-sticky hidden w-[228px] flex-col gap-1 rounded-lg border border-line bg-surface p-3 shadow-pop md:flex"
            style={{
              top: -8,
              left: Math.min(
                AXIS + hovered * (COLUMN + GAP) + COLUMN + 8,
                Math.max(0, plotWidth(bars.length) - 228),
              ),
            }}
          >
            <p className="m-0 text-caption text-muted">{card.heading}</p>
            <p className="m-0 text-title-sm font-600 tabular-nums text-ink">
              {card.value}
            </p>
            {card.note ? (
              <p className="m-0 text-label text-accent-ink">{card.note}</p>
            ) : null}
            {card.rows.length > 0 ? (
              <ul className="m-0 mt-1.5 flex list-none flex-col gap-1 p-0">
                {card.rows.map((row) => (
                  <li
                    key={row.key}
                    className="flex items-center justify-between gap-3 text-label"
                  >
                    <span className="flex min-w-0 items-center gap-1.5 text-ink-2">
                      <span className="size-1.5 shrink-0 rounded-full bg-accent" />
                      <span className="truncate">{row.label}</span>
                    </span>
                    <span className="shrink-0 tabular-nums text-ink">
                      {row.value}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </div>
      {note ? <p className="m-0 text-label text-muted">{note}</p> : null}
    </section>
  )
}
