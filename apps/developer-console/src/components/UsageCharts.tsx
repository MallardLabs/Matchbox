import type { UsageBucket } from "@repo/platform-contracts/console"
import { cn } from "@repo/ui/cn"
import {
  type KeyboardEvent,
  type PointerEvent,
  type ReactElement,
  type ReactNode,
  useEffect,
  useId,
  useState,
} from "react"
import { dash, formatInteger, formatLatency } from "../lib/format"

export type UsagePoint = {
  start: string
  requests: number
  errors: number
  p95LatencyMs: number | null
}

const height = 180
const margin = { top: 12, right: 8, bottom: 24, left: 44 }

/** Rounds up to a clean axis maximum (1, 2, 2.5, 5 × 10^n). */
export function niceMax(value: number): number {
  if (value <= 0) return 1
  const magnitude = 10 ** Math.floor(Math.log10(value))
  for (const step of [1, 2, 2.5, 5, 10]) {
    if (value <= step * magnitude) return step * magnitude
  }
  return 10 * magnitude
}

function useWidth(): [(element: HTMLDivElement | null) => void, number] {
  const [element, setElement] = useState<HTMLDivElement | null>(null)
  const [width, setWidth] = useState(640)
  useEffect(() => {
    if (element === null || typeof ResizeObserver === "undefined") return
    const observer = new ResizeObserver((entries) => {
      const next = entries[0]?.contentRect.width
      if (next !== undefined && next > 0) setWidth(Math.round(next))
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [element])
  return [setElement, width]
}

const hourFormat = new Intl.DateTimeFormat("en", {
  hour: "2-digit",
  minute: "2-digit",
})
const dayFormat = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric",
})
const fullFormat = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
})

function tickLabel(start: string, bucket: UsageBucket): string {
  const date = new Date(start)
  return bucket === "day" ? dayFormat.format(date) : hourFormat.format(date)
}

type Frame = {
  plotWidth: number
  slot: number
  x: (index: number) => number
  ticks: number[]
}

function frame(width: number, count: number): Frame {
  const plotWidth = Math.max(width - margin.left - margin.right, 40)
  const slot = plotWidth / Math.max(count, 1)
  const every = Math.max(
    1,
    Math.ceil(count / Math.max(2, Math.floor(plotWidth / 90))),
  )
  const ticks: number[] = []
  for (let index = 0; index < count; index += every) ticks.push(index)
  return {
    plotWidth,
    slot,
    x: (index) => margin.left + slot * index + slot / 2,
    ticks,
  }
}

/** Shared keyboard + pointer cursor over data positions. */
function useCursor(count: number) {
  const [active, setActive] = useState<number | null>(null)
  function onKeyDown(event: KeyboardEvent): void {
    if (count === 0) return
    const current = active ?? -1
    let next: number | null = null
    if (event.key === "ArrowRight") next = Math.min(count - 1, current + 1)
    if (event.key === "ArrowLeft")
      next = Math.max(0, current - 1 < 0 ? 0 : current - 1)
    if (event.key === "Home") next = 0
    if (event.key === "End") next = count - 1
    if (event.key === "Escape") {
      setActive(null)
      return
    }
    if (next !== null) {
      event.preventDefault()
      setActive(next)
    }
  }
  function onPointer(event: PointerEvent<HTMLDivElement>, slot: number): void {
    const box = event.currentTarget.getBoundingClientRect()
    const index = Math.floor((event.clientX - box.left - margin.left) / slot)
    setActive(index >= 0 && index < count ? index : null)
  }
  return {
    active,
    onKeyDown,
    onPointer,
    clear: () => setActive(null),
  }
}

function YAxis({
  max,
  width,
  format,
}: {
  max: number
  width: number
  format: (value: number) => string
}): ReactElement {
  const plotHeight = height - margin.top - margin.bottom
  return (
    <g>
      {[0, 0.5, 1].map((fraction) => {
        const y = margin.top + plotHeight * (1 - fraction)
        return (
          <g key={fraction}>
            <line
              x1={margin.left}
              x2={width - margin.right}
              y1={y}
              y2={y}
              stroke="var(--line)"
              strokeWidth={1}
            />
            <text
              x={margin.left - 8}
              y={y}
              dy="0.32em"
              textAnchor="end"
              className="fill-secondary font-mono text-[10px] tabular-nums"
            >
              {format(max * fraction)}
            </text>
          </g>
        )
      })}
    </g>
  )
}

function XAxis({
  points,
  layout,
  bucket,
}: {
  points: UsagePoint[]
  layout: Frame
  bucket: UsageBucket
}): ReactElement {
  return (
    <g>
      {layout.ticks.map((index) => {
        const point = points[index]
        if (point === undefined) return null
        return (
          <text
            key={point.start}
            x={layout.x(index)}
            y={height - 6}
            textAnchor="middle"
            className="fill-secondary font-mono text-[10px] tabular-nums"
          >
            {tickLabel(point.start, bucket)}
          </text>
        )
      })}
    </g>
  )
}

function Tooltip({
  left,
  width,
  children,
}: {
  left: number
  width: number
  children: ReactNode
}): ReactElement {
  const flip = left > width - 170
  return (
    <div
      className="pointer-events-none absolute top-2 z-10 min-w-[150px] rounded-md border border-line bg-surface px-2.5 py-2 text-[12px] shadow-pop"
      style={flip ? { right: width - left + 10 } : { left: left + 10 }}
    >
      {children}
    </div>
  )
}

function TooltipRow({
  color,
  label,
  value,
}: {
  color: string
  label: string
  value: string
}): ReactElement {
  return (
    <p className="flex items-center gap-2">
      <span
        aria-hidden="true"
        className="h-0.5 w-3 rounded-full"
        style={{ background: color }}
      />
      <span className="font-mono font-500 tabular-nums text-ink">{value}</span>
      <span className="text-secondary">{label}</span>
    </p>
  )
}

function ChartFrame({
  title,
  legend,
  summary,
  children,
}: {
  title: string
  legend?: ReactNode
  summary: string
  children: ReactNode
}): ReactElement {
  const titleId = useId()
  return (
    <figure
      className="m-0 flex min-w-0 flex-col gap-2"
      aria-labelledby={titleId}
    >
      <figcaption className="flex flex-wrap items-center justify-between gap-2">
        <span id={titleId} className="text-[13px] font-600 text-ink">
          {title}
        </span>
        {legend}
      </figcaption>
      <p className="sr-only">{summary}</p>
      {children}
    </figure>
  )
}

/** Requests per bucket, stacked: non-error (bottom) and errors (top). */
export function RequestsChart({
  points,
  bucket,
  dimmed = false,
}: {
  points: UsagePoint[]
  bucket: UsageBucket
  dimmed?: boolean
}): ReactElement {
  const [ref, width] = useWidth()
  const layout = frame(width, points.length)
  const cursor = useCursor(points.length)
  const max = niceMax(Math.max(0, ...points.map((point) => point.requests)))
  const plotHeight = height - margin.top - margin.bottom
  const barWidth = Math.max(1, Math.min(24, layout.slot - 2))
  const scale = (value: number): number => (value / max) * plotHeight
  const baseline = margin.top + plotHeight
  const activePoint = cursor.active === null ? undefined : points[cursor.active]
  const total = points.reduce((sum, point) => sum + point.requests, 0)
  const errors = points.reduce((sum, point) => sum + point.errors, 0)

  return (
    <ChartFrame
      title="Requests"
      summary={`${formatInteger(total)} requests, ${formatInteger(errors)} errors across ${points.length} buckets. Data table below.`}
      legend={
        <ul className="m-0 flex list-none gap-4 p-0 text-[12px] text-secondary">
          <li className="flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="size-2.5 rounded-[2px] bg-[var(--chart-ok)]"
            />
            2xx / 3xx
          </li>
          <li className="flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="size-2.5 rounded-[2px] bg-[var(--chart-error)]"
            />
            Errors
          </li>
        </ul>
      }
    >
      <div
        ref={ref}
        role="slider"
        aria-label="Requests by bucket"
        aria-valuemin={0}
        aria-valuemax={Math.max(0, points.length - 1)}
        aria-valuenow={cursor.active ?? 0}
        aria-valuetext={
          activePoint === undefined
            ? "Use arrow keys to read buckets"
            : `${fullFormat.format(new Date(activePoint.start))}: ${activePoint.requests} requests, ${activePoint.errors} errors`
        }
        tabIndex={0}
        className={cn(
          "relative w-full touch-pan-y outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink",
          dimmed && "opacity-60",
        )}
        onKeyDown={cursor.onKeyDown}
        onBlur={cursor.clear}
        onPointerMove={(event) => cursor.onPointer(event, layout.slot)}
        onPointerLeave={cursor.clear}
      >
        <svg width={width} height={height} aria-hidden="true" className="block">
          <YAxis
            max={max}
            width={width}
            format={(value) => formatInteger(Math.round(value))}
          />
          <XAxis points={points} layout={layout} bucket={bucket} />
          {points.map((point, index) => {
            const ok = Math.max(0, point.requests - point.errors)
            const okHeight = scale(ok)
            const errorHeight = scale(point.errors)
            const gap = okHeight > 0 && errorHeight > 0 ? 2 : 0
            const x = layout.x(index) - barWidth / 2
            const faded = cursor.active !== null && cursor.active !== index
            const radius = Math.min(4, barWidth / 2)
            return (
              <g key={point.start} opacity={faded ? 0.55 : 1}>
                {okHeight > 0 ? (
                  <path
                    d={barPath(
                      x,
                      baseline - okHeight,
                      barWidth,
                      okHeight,
                      errorHeight > 0 ? 0 : radius,
                    )}
                    fill="var(--chart-ok)"
                  />
                ) : null}
                {errorHeight > 0 ? (
                  <path
                    d={barPath(
                      x,
                      baseline - okHeight - gap - errorHeight,
                      barWidth,
                      errorHeight,
                      radius,
                    )}
                    fill="var(--chart-error)"
                  />
                ) : null}
              </g>
            )
          })}
        </svg>
        {activePoint === undefined || cursor.active === null ? null : (
          <Tooltip left={layout.x(cursor.active)} width={width}>
            <p className="mb-1 text-[11px] text-secondary">
              {fullFormat.format(new Date(activePoint.start))}
            </p>
            <TooltipRow
              color="var(--chart-ok)"
              label="2xx / 3xx"
              value={formatInteger(activePoint.requests - activePoint.errors)}
            />
            <TooltipRow
              color="var(--chart-error)"
              label="Errors"
              value={formatInteger(activePoint.errors)}
            />
          </Tooltip>
        )}
      </div>
    </ChartFrame>
  )
}

/** Column with a rounded data end and a square baseline. */
function barPath(
  x: number,
  y: number,
  width: number,
  h: number,
  radius: number,
): string {
  const r = Math.min(radius, h)
  if (r <= 0) return `M${x},${y}h${width}v${h}h${-width}Z`
  return [
    `M${x},${y + h}`,
    `V${y + r}`,
    `Q${x},${y} ${x + r},${y}`,
    `H${x + width - r}`,
    `Q${x + width},${y} ${x + width},${y + r}`,
    `V${y + h}`,
    "Z",
  ].join(" ")
}

/** p95 latency per bucket; gaps where a bucket had no requests. */
export function LatencyChart({
  points,
  bucket,
  dimmed = false,
}: {
  points: UsagePoint[]
  bucket: UsageBucket
  dimmed?: boolean
}): ReactElement {
  const [ref, width] = useWidth()
  const layout = frame(width, points.length)
  const cursor = useCursor(points.length)
  const values = points.map((point) => point.p95LatencyMs)
  const max = niceMax(Math.max(0, ...values.map((value) => value ?? 0)))
  const plotHeight = height - margin.top - margin.bottom
  const y = (value: number): number =>
    margin.top + plotHeight * (1 - value / max)

  const segments: string[] = []
  let current = ""
  values.forEach((value, index) => {
    if (value === null) {
      if (current !== "") segments.push(current)
      current = ""
      return
    }
    current += `${current === "" ? "M" : "L"}${layout.x(index)},${y(value)}`
  })
  if (current !== "") segments.push(current)

  const activeIndex = cursor.active
  const activePoint = activeIndex === null ? undefined : points[activeIndex]
  const activeValue = activePoint?.p95LatencyMs ?? null
  const measured = values.filter((value): value is number => value !== null)

  return (
    <ChartFrame
      title="p95 latency"
      summary={
        measured.length === 0
          ? "No latency data."
          : `p95 latency between ${formatLatency(Math.min(...measured))} and ${formatLatency(Math.max(...measured))}. Data table below.`
      }
    >
      <div
        ref={ref}
        role="slider"
        aria-label="p95 latency by bucket"
        aria-valuemin={0}
        aria-valuemax={Math.max(0, points.length - 1)}
        aria-valuenow={cursor.active ?? 0}
        aria-valuetext={
          activePoint === undefined
            ? "Use arrow keys to read buckets"
            : `${fullFormat.format(new Date(activePoint.start))}: p95 ${activeValue === null ? "no data" : formatLatency(activeValue)}`
        }
        tabIndex={0}
        className={cn(
          "relative w-full touch-pan-y outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink",
          dimmed && "opacity-60",
        )}
        onKeyDown={cursor.onKeyDown}
        onBlur={cursor.clear}
        onPointerMove={(event) => cursor.onPointer(event, layout.slot)}
        onPointerLeave={cursor.clear}
      >
        <svg width={width} height={height} aria-hidden="true" className="block">
          <YAxis
            max={max}
            width={width}
            format={(value) => formatLatency(value)}
          />
          <XAxis points={points} layout={layout} bucket={bucket} />
          {segments.map((segment) => (
            <path
              key={segment}
              d={segment}
              fill="none"
              stroke="var(--chart-line)"
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ))}
          {activeIndex === null ? null : (
            <line
              x1={layout.x(activeIndex)}
              x2={layout.x(activeIndex)}
              y1={margin.top}
              y2={margin.top + plotHeight}
              stroke="var(--line-2)"
              strokeWidth={1}
            />
          )}
          {activeIndex === null || activeValue === null ? null : (
            <circle
              cx={layout.x(activeIndex)}
              cy={y(activeValue)}
              r={4}
              fill="var(--chart-line)"
              stroke="var(--surface)"
              strokeWidth={2}
            />
          )}
        </svg>
        {activePoint === undefined || activeIndex === null ? null : (
          <Tooltip left={layout.x(activeIndex)} width={width}>
            <p className="mb-1 text-[11px] text-secondary">
              {fullFormat.format(new Date(activePoint.start))}
            </p>
            <TooltipRow
              color="var(--chart-line)"
              label="p95"
              value={activeValue === null ? dash : formatLatency(activeValue)}
            />
          </Tooltip>
        )}
      </div>
    </ChartFrame>
  )
}
