import type { QueryBlock } from "@/lib/query/contracts"
import { Money } from "@thesis-co/cent"

type Diff = Extract<QueryBlock, { type: "allocation_diff" }>

function percentage(basisPoints: number): string {
  const sign = basisPoints < 0 ? "-" : basisPoints > 0 ? "+" : ""
  const absolute = Math.abs(basisPoints)
  const whole = Math.floor(absolute / 100)
  const fraction = absolute % 100
  return `${sign}${whole}${fraction ? `.${fraction.toString().padStart(2, "0")}` : ""}%`
}

export function AllocationDiff({ diff }: { diff: Diff }): JSX.Element {
  return (
    <section
      aria-labelledby="allocation-diff-title"
      className="mt-4 rounded-lg border border-warning/30 bg-warning/10 p-4"
    >
      <h4
        className="text-balance text-sm font-medium text-ink"
        id="allocation-diff-title"
      >
        Live proposal changed
      </h4>
      <p className="mt-1 text-pretty text-xs leading-5 text-secondary">
        {diff.notice}
      </p>
      {diff.beforeProjectedUsd && diff.afterProjectedUsd && (
        <dl className="mt-3 grid grid-cols-2 gap-3 text-xs">
          <div>
            <dt className="text-muted">Previously projected</dt>
            <dd className="mt-1 font-mono tabular-nums text-ink">
              {Money(`USD ${diff.beforeProjectedUsd}`).toString()}
            </dd>
          </div>
          <div>
            <dt className="text-muted">Refreshed projection</dt>
            <dd className="mt-1 font-mono tabular-nums text-ink">
              {Money(`USD ${diff.afterProjectedUsd}`).toString()}
            </dd>
          </div>
        </dl>
      )}
      {diff.targets.length > 0 && (
        <ul className="mt-3 divide-y divide-warning/20 border-y border-warning/20">
          {diff.targets.map((target) => (
            <li
              className="flex items-center justify-between gap-3 py-2 text-xs"
              key={`${target.ballotKey}:${target.gaugeId}`}
            >
              <span className="truncate text-secondary">
                {target.gaugeName}
              </span>
              <span className="shrink-0 font-mono tabular-nums text-ink">
                {percentage(target.beforeBasisPoints)} to{" "}
                {percentage(target.afterBasisPoints)} (
                {percentage(target.deltaBasisPoints)})
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
