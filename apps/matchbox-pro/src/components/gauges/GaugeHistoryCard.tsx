import { cn } from "@/lib/cn"
import type { ReactElement } from "react"

type GaugeHistoryCardProps = {
  epochLabel: string
  veMezo: string
  boost: string
  incentives: string
  apy: string
}

const headClass = "pb-2.5 pr-3 text-left text-[11px] font-650 text-muted"
const cellClass = "pr-3 text-[13px] tabular-nums text-ink"

/** Pen "History card": compact epoch table. The index only exposes the live epoch today. */
export default function GaugeHistoryCard({
  epochLabel,
  veMezo,
  boost,
  incentives,
  apy,
}: GaugeHistoryCardProps): ReactElement {
  return (
    <section
      aria-labelledby="history-heading"
      className="flex flex-col gap-2.5 rounded-[10px] bg-surface p-4"
    >
      <h2 id="history-heading" className="text-[16px] font-650 text-ink">
        Recent epochs
      </h2>
      <div className="overflow-x-auto">
        <table className="whitespace-nowrap">
          <thead>
            <tr>
              <th scope="col" className={headClass}>
                Epoch
              </th>
              <th scope="col" className={headClass}>
                veMEZO
              </th>
              <th scope="col" className={headClass}>
                Boost
              </th>
              <th scope="col" className={headClass}>
                Incentives
              </th>
              <th scope="col" className={headClass}>
                APY
              </th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th
                scope="row"
                className={cn(cellClass, "text-left font-400 text-secondary")}
              >
                {epochLabel}
                <span className="ml-1.5 font-mono text-[10px] text-accent-ink">
                  LIVE
                </span>
              </th>
              <td className={cellClass}>{veMezo}</td>
              <td className={cellClass}>{boost}</td>
              <td className={cellClass}>{incentives}</td>
              <td className={cn(cellClass, "font-650 text-pos")}>{apy}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  )
}
