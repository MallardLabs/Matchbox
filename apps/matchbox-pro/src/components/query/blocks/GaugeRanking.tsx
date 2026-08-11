import { TokenMark } from "@/components/ui/TokenMark"
import type { QueryBlock } from "@/lib/query/contracts"
import { cn } from "@/utils/cn"
import { Money } from "@thesis-co/cent"

type GaugeBlock = Extract<QueryBlock, { type: "gauge_ranking" }>

function usd(value: string): string {
  return Money(`USD ${value}`).toString()
}

function allocationWidth(allocation: number) {
  if (allocation >= 35) return "w-[38%]"
  if (allocation >= 25) return "w-[26%]"
  if (allocation >= 19) return "w-[19%]"
  return "w-[17%]"
}

export function GaugeRanking({ block }: { block: GaugeBlock }) {
  return (
    <section
      aria-labelledby="gauge-ranking-title"
      className="border-t border-line pt-5"
    >
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-1 text-xs font-medium uppercase text-positive">
            Live Matchbox gauge data
          </p>
          <h2
            className="text-balance text-lg font-medium text-ink"
            id="gauge-ranking-title"
          >
            {block.objective}
          </h2>
        </div>
        <div className="sm:text-right">
          <p className="text-xs text-muted">
            {block.projectedTotalUsd === null
              ? "Ranking mode"
              : "Projected this epoch"}
          </p>
          <p className="font-mono text-xl font-medium tabular-nums text-accent">
            {block.projectedTotalUsd === null
              ? "Gross incentives"
              : usd(block.projectedTotalUsd)}
          </p>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-line bg-panel">
        <div className="hidden grid-cols-[36px_minmax(0,1fr)_130px_120px_80px] gap-3 border-b border-line px-4 py-2 text-xs uppercase text-muted md:grid">
          <span>Rank</span>
          <span>Gauge</span>
          <span className="text-right">Incentives</span>
          <span className="text-right">
            {block.projectedTotalUsd === null
              ? "Personal return"
              : "Your return"}
          </span>
          <span className="text-right">Vote</span>
        </div>
        {block.gauges.map((gauge, index) => (
          <article
            className="grid gap-3 border-b border-line px-4 py-3 last:border-b-0 md:grid-cols-[36px_minmax(0,1fr)_130px_120px_80px] md:items-center"
            key={gauge.id}
          >
            <span className="hidden font-mono text-xs tabular-nums text-muted md:block">
              {String(index + 1).padStart(2, "0")}
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-3">
                <div className="flex shrink-0">
                  {gauge.tokenPair.map((token, tokenIndex) => (
                    <TokenMark
                      className={cn(
                        "size-7",
                        tokenIndex > 0 && "-ml-2 ring-2 ring-panel",
                      )}
                      key={token}
                      token={token}
                    />
                  ))}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">
                    {gauge.name}
                  </p>
                  <p className="text-xs capitalize text-muted">
                    {gauge.type} · {gauge.governanceAsset} ·{" "}
                    {gauge.consistencyBps / 100}% funded consistency
                    {gauge.pricingStatus === "partial"
                      ? " · partial pricing"
                      : ""}
                  </p>
                </div>
              </div>
              <div className="mt-2 h-1 overflow-hidden rounded-full bg-subtle">
                <div
                  className={cn(
                    "h-full rounded-full bg-accent",
                    allocationWidth(
                      gauge.allocationPercentage || gauge.consistencyBps / 100,
                    ),
                  )}
                />
              </div>
            </div>
            <div className="flex justify-between md:block md:text-right">
              <span className="text-xs text-muted md:hidden">
                Deposited incentives
              </span>
              <span className="font-mono text-sm tabular-nums text-secondary">
                {usd(gauge.depositedUsd)}
              </span>
            </div>
            <div className="flex justify-between md:block md:text-right">
              <span className="text-xs text-muted md:hidden">
                {block.projectedTotalUsd === null
                  ? "Personal return"
                  : "Projected for you"}
              </span>
              <span className="font-mono text-sm font-medium tabular-nums text-positive">
                {block.projectedTotalUsd === null
                  ? "Requires wallet optimizer"
                  : usd(gauge.projectedReturnUsd)}
              </span>
            </div>
            <div className="flex justify-between md:block md:text-right">
              <span className="text-xs text-muted md:hidden">Allocation</span>
              <span className="font-mono text-sm font-medium tabular-nums text-ink">
                {gauge.allocationPercentage > 0
                  ? `${gauge.allocationPercentage}%`
                  : "—"}
              </span>
            </div>
          </article>
        ))}
      </div>
      <p className="mt-3 text-pretty text-xs text-muted">
        Objective: {block.objective}. Gross deposited incentives and historical
        consistency are shown as context and do not replace the optimizer
        objective.
      </p>
    </section>
  )
}
