import { formatBps } from "@/lib/mezoGauges/participation"
import type { MezoGaugesSnapshot } from "@/lib/mezoGauges/schema"

import { gaugeColor } from "./shared"

/**
 * Stacked horizontal bar of gauge vote shares with a color legend below it.
 */
export function GaugeSplitBar({
  gauges,
  totalWeight,
}: {
  gauges: MezoGaugesSnapshot["gauges"]
  totalWeight: string
}): JSX.Element {
  type Gauge = MezoGaugesSnapshot["gauges"][number]
  const readable = gauges.filter(
    (g): g is Gauge & { weight: string; shareBps: string } =>
      g.status === "ok" && g.weight !== null && g.shareBps !== null,
  )
  const sorted = [...readable].sort((a, b) =>
    BigInt(a.weight) === BigInt(b.weight)
      ? 0
      : BigInt(a.weight) > BigInt(b.weight)
        ? -1
        : 1,
  )
  const weighted = sorted.map((g, i) => ({ gauge: g, color: gaugeColor(i) }))
  const hasFailedReads = gauges.some((gauge) => gauge.status === "error")
  const total = BigInt(totalWeight)
  const readableWeight = readable.reduce(
    (sum, gauge) => sum + BigInt(gauge.weight),
    0n,
  )
  const unreadableBps =
    hasFailedReads && total > 0n && readableWeight < total
      ? ((total - readableWeight) * 10_000n) / total
      : 0n
  const unreadablePct = Number(unreadableBps) / 100
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
        {unreadablePct > 0 && (
          <span
            title="Share not readable"
            style={{
              width: `${unreadablePct}%`,
              backgroundColor: "var(--content-tertiary)",
              opacity: 0.4,
            }}
          />
        )}
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
        {unreadablePct > 0 && (
          <li className="flex items-center gap-1 whitespace-nowrap text-2xs text-[var(--content-tertiary)]">
            <span
              aria-hidden="true"
              className="inline-block h-2 w-2 rounded-full"
              style={{
                backgroundColor: "var(--content-tertiary)",
                opacity: 0.4,
              }}
            />
            unreadable {formatBps(unreadableBps)}
          </li>
        )}
      </ul>
    </span>
  )
}
