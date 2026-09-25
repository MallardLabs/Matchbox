import { cn } from "@/lib/cn"
import {
  formatCompactUsd,
  formatWholeUsd,
  microToWholeUsd,
  niceCeiling,
} from "@/lib/overview"
import type { ReactElement } from "react"

export type ChartBar = {
  key: string
  label: string
  microUsd: bigint
  /** past = grey history, current = solid accent, next = hollow projection. */
  tone: "past" | "current" | "next"
}

const PLOT_HEIGHT = 178
const BAR_MAX = 148

const barTone = {
  past: "bg-line",
  current: "border-2 border-b-0 border-accent-ink bg-accent",
  next: "border-[1.5px] border-b-0 border-accent bg-accent-soft",
}

export default function EarningsChart({
  title,
  bars,
  empty,
}: {
  title: string
  bars: ChartBar[]
  empty: string
}): ReactElement {
  const maxWhole = bars.reduce((high, bar) => {
    const whole = microToWholeUsd(bar.microUsd)
    return whole > high ? whole : high
  }, 0n)
  const scaleMax = niceCeiling(maxWhole)
  const scaleMicro = scaleMax * 1_000_000n
  const ticks = [scaleMicro, scaleMicro / 2n, 0n]

  return (
    <figure className="flex min-w-0 flex-col gap-2.5">
      <figcaption className="text-[14px] font-650 text-ink-2">
        {title}
      </figcaption>
      <div className="flex flex-col">
        <div className="flex items-end gap-1" style={{ height: PLOT_HEIGHT }}>
          <div
            className="relative h-full w-[34px] shrink-0 font-mono text-[9px] font-500 text-muted"
            aria-hidden="true"
          >
            {scaleMax > 0n
              ? ticks.map((tick, index) => (
                  <span
                    key={tick.toString()}
                    className={cn(
                      "absolute right-0 leading-none",
                      tick > 0n && "translate-y-1/2",
                    )}
                    style={{
                      bottom: tick > 0n ? (BAR_MAX * (2 - index)) / 2 : 2,
                    }}
                  >
                    {formatCompactUsd(tick)}
                  </span>
                ))
              : null}
          </div>
          {scaleMax === 0n ? (
            <p className="self-center text-pretty text-[13px] text-muted">
              {empty}
            </p>
          ) : (
            <ol className="flex h-full min-w-0 items-end gap-4">
              {bars.map((bar) => (
                <li
                  key={bar.key}
                  className="flex h-full w-10 shrink-0 flex-col items-center justify-end gap-1"
                >
                  <span
                    className={cn(
                      bar.tone === "past"
                        ? "text-[9px] font-600 text-muted"
                        : bar.tone === "current"
                          ? "text-[9px] font-600 text-accent-ink"
                          : "text-[10px] font-650 text-accent-ink",
                    )}
                  >
                    <span className="sr-only">{bar.label}: </span>
                    {formatWholeUsd(bar.microUsd)}
                  </span>
                  <span
                    aria-hidden="true"
                    className={cn("w-[26px] rounded-t", barTone[bar.tone])}
                    style={{
                      height: Math.max(
                        4,
                        Number((bar.microUsd * BigInt(BAR_MAX)) / scaleMicro),
                      ),
                    }}
                  />
                </li>
              ))}
            </ol>
          )}
        </div>
        <div className="h-px bg-line" />
        {scaleMax > 0n ? (
          <ol
            aria-hidden="true"
            className="flex gap-4 pl-[38px] pt-2 font-mono text-[10px]"
          >
            {bars.map((bar) => (
              <li
                key={bar.key}
                title={bar.label}
                className={cn(
                  "w-10 shrink-0 truncate text-center",
                  bar.tone === "past"
                    ? "font-500 text-muted"
                    : bar.tone === "current"
                      ? "font-700 text-accent-ink"
                      : "font-650 text-accent-ink",
                )}
              >
                {bar.label}
              </li>
            ))}
          </ol>
        ) : null}
      </div>
    </figure>
  )
}
