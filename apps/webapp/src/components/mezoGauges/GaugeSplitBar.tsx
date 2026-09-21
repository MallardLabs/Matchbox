import { formatBps } from "@/lib/mezoGauges/participation"
import type { MezoGaugesSnapshot } from "@/lib/mezoGauges/schema"

import { gaugeColor } from "./shared"

/**
 * Stacked horizontal bar of gauge vote shares, with a visually-hidden text
 * list so the same data is available to assistive tech.
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
  return (
    <span className="block min-w-[140px]">
      <span
        className="flex h-3 w-full overflow-hidden rounded-full bg-[var(--surface-secondary)]"
        role="img"
        aria-label="Gauge vote share split"
      >
        {sorted.map((g, i) => {
          const pct = Number(g.shareBps) / 100
          if (pct <= 0) return null
          return (
            <span
              key={g.address}
              title={`${g.name}: ${formatBps(BigInt(g.shareBps))}`}
              style={{ width: `${pct}%`, backgroundColor: gaugeColor(i) }}
            />
          )
        })}
      </span>
      <ul className="sr-only">
        {sorted.map((g) => (
          <li key={g.address}>
            {g.name}: {formatBps(BigInt(g.shareBps))}
          </li>
        ))}
      </ul>
    </span>
  )
}
