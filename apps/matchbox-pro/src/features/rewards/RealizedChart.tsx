import * as BarChart from "@repo/ui/bar-chart"
import type { ReactElement } from "react"
import { formatUsdTick } from "./ledgerModel"

type RealizedChartProps = {
  bars: BarChart.Bar[]
  /** Short state shown beside the title ("Unavailable", "Stale"). */
  state: string | null
}

/** "Realized by epoch": USD at earn per sealed epoch, then Next projected. */
export default function RealizedChart({
  bars,
  state,
}: RealizedChartProps): ReactElement {
  return (
    <section
      aria-labelledby="realized-heading"
      className="flex w-full flex-col gap-2.5 xl:w-[420px] xl:shrink-0"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 id="realized-heading" className="text-body text-ink-2">
          Realized by epoch
        </h2>
        {state ? <span className="text-label text-muted">{state}</span> : null}
      </div>
      <BarChart.Root
        bars={bars}
        title="Realized by epoch, USD at earn"
        formatTick={formatUsdTick}
        className="pt-2"
      />
    </section>
  )
}
