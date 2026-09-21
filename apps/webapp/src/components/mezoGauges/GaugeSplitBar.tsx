import { formatBps } from "@/lib/mezoGauges/participation"
import type { MezoGaugesSnapshot } from "@/lib/mezoGauges/schema"

import { gaugeColor } from "./shared"

/**
 * Stacked horizontal bar of gauge vote shares with a color legend below it.
 */
export function GaugeSplitBar({
  gauges,
}: {
  gauges: MezoGaugesSnapshot["gauges"]
}): JSX.Element {
  const sorted = [...gauges].sort((a, b) =>
    BigInt(a.weight) === BigInt(b.weight)
      ? 0
      : BigInt(a.weight) > BigInt(b.weight)
        ? -1
        : 1,
  )
  const weighted = sorted.map((g, i) => ({ gauge: g, color: gaugeColor(i) }))
  return (
    <span className="block min-w-[180px]">
      <span
        className="flex h-3 w-full overflow-hidden rounded-full bg-[var(--surface-secondary)]"
        role="img"
        aria-label="Gauge vote share split"
      >
        {weighted.map(({ gauge: g, color }) => {
          const pct = Number(g.shareBps) / 100
          if (pct <= 0) return null
          return (
            <span
              key={g.address}
              style={{ width: `${pct}%`, backgroundColor: color }}
            />
          )
        })}
      </span>
      <ul className="m-0 mt-1.5 flex list-none flex-wrap gap-x-2 gap-y-0.5 p-0">
        {weighted.map(({ gauge: g, color }) => {
          const pct = Number(g.shareBps) / 100
          if (pct <= 0) return null
          return (
            <li
              key={g.address}
              className="flex items-center gap-1 whitespace-nowrap text-2xs text-[var(--content-tertiary)]"
            >
              <span
                aria-hidden="true"
                className="inline-block h-2 w-2 rounded-full"
                style={{ backgroundColor: color }}
              />
              {g.name} {formatBps(BigInt(g.shareBps))}
            </li>
          )
        })}
      </ul>
    </span>
  )
}
