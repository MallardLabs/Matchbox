import { cn } from "@repo/ui/cn"
import type { ReactElement, ReactNode } from "react"
import type {
  AllocationDiffBlock as AllocationDiffData,
  MaterialityReason,
} from "../contract"
import {
  formatBlock,
  formatBps,
  formatSignedBps,
  formatSignedUsd,
  formatTokenNumber,
  formatUsd,
  microToUsd6,
  usd6ToMicro,
  usdSign,
} from "../format"

type DiffRow = {
  targetId: string
  name: string
  beforeBps: number
  afterBps: number
  /** Null when any lock's delta is unpriced. */
  deltaMicro: bigint | null
}

/** One row per gauge: locks share the same bps vector, deltas add up. */
export function groupDiffRows(diff: AllocationDiffData): DiffRow[] {
  const rows = new Map<string, DiffRow>()
  for (const row of diff.rows) {
    const existing = rows.get(row.targetId)
    const delta =
      row.deltaProjectedUsd === null ? null : usd6ToMicro(row.deltaProjectedUsd)
    if (existing) {
      existing.deltaMicro =
        existing.deltaMicro === null || delta === null
          ? null
          : existing.deltaMicro + delta
    } else {
      rows.set(row.targetId, {
        targetId: row.targetId,
        name: row.name,
        beforeBps: row.beforeBps,
        afterBps: row.afterBps,
        deltaMicro: delta,
      })
    }
  }
  return [...rows.values()]
}

const REASON_COPY: Record<MaterialityReason, string> = {
  allocation_pp: "allocation moved",
  projected_pct: "projection moved",
  target_set: "targets changed",
  ballot_set: "locks changed",
  quote: "quote changed",
  approval: "approval grew",
  can_sign: "signing changed",
  position: "position changed",
}

export function diffLead(diff: AllocationDiffData): string {
  const parts = [`Refreshed at block ${formatBlock(diff.refreshedAtBlock)}.`]
  if (diff.beforeProjectedUsd !== null && diff.afterProjectedUsd !== null) {
    parts.push(
      `Projected this epoch ${formatUsd(diff.beforeProjectedUsd)} → ${formatUsd(
        diff.afterProjectedUsd,
      )}${
        diff.projectedDeltaBps === null
          ? ""
          : ` (${formatSignedBps(diff.projectedDeltaBps)})`
      }.`,
    )
  }
  if (diff.manualEditsPreserved)
    parts.push("Manual edits were not overwritten.")
  return parts.join(" ")
}

export function diffReasons(reasons: readonly MaterialityReason[]): string {
  return reasons.map((reason) => REASON_COPY[reason]).join(" · ")
}

const head = "pb-2 text-left text-caption font-400 text-muted"
const cell = "border-b border-line py-2.5"

/** Frame 38: Was / Now / Δ projected per gauge, totals, and the two choices. */
export function AllocationDiff({
  diff,
  actions,
  error,
}: {
  diff: AllocationDiffData
  actions: ReactNode
  error?: string | null
}): ReactElement {
  const rows = groupDiffRows(diff)
  return (
    <section aria-label="Allocation change" className="flex flex-col gap-3">
      <p className="m-0 text-body-sm text-warn" aria-live="polite">
        {diffLead(diff)}
      </p>
      {rows.length > 0 ? (
        <table className="w-full border-collapse text-body tabular-nums">
          <thead>
            <tr>
              <th scope="col" className={head}>
                Gauge
              </th>
              <th scope="col" className={cn(head, "w-16 sm:w-20")}>
                Was
              </th>
              <th scope="col" className={cn(head, "w-16 sm:w-20")}>
                Now
              </th>
              <th scope="col" className={cn(head, "w-24 sm:w-[120px]")}>
                Δ projected
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const delta =
                row.deltaMicro === null ? null : microToUsd6(row.deltaMicro)
              const sign = delta === null ? "zero" : usdSign(delta)
              return (
                <tr key={row.targetId}>
                  <th
                    scope="row"
                    className={cn(
                      cell,
                      "max-w-0 truncate pr-3 text-left font-400 text-ink",
                    )}
                  >
                    {row.name}
                  </th>
                  <td className={cn(cell, "text-secondary")}>
                    {formatBps(row.beforeBps)}
                  </td>
                  <td className={cn(cell, "font-600 text-ink")}>
                    {formatBps(row.afterBps)}
                  </td>
                  <td
                    className={cn(
                      cell,
                      "font-600",
                      sign === "neg" && "text-neg",
                      sign === "pos" && "text-pos",
                      sign === "zero" && "text-secondary",
                    )}
                  >
                    {delta === null ? "Unpriced" : formatSignedUsd(delta)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      ) : (
        <p className="m-0 text-body-sm text-secondary">
          {diffReasons(diff.reasons)}
        </p>
      )}
      <p className="m-0 flex flex-wrap gap-x-4 gap-y-1 text-body font-600 tabular-nums text-ink">
        {diff.beforeProjectedUsd !== null && diff.afterProjectedUsd !== null ? (
          <span>
            Projected this epoch{" "}
            <span className="font-500">
              {formatUsd(diff.beforeProjectedUsd)} →{" "}
              {formatUsd(diff.afterProjectedUsd)}
            </span>
          </span>
        ) : null}
        {diff.beforeNative && diff.afterNative ? (
          <span>
            Native{" "}
            <span className="font-500">
              {formatTokenNumber(diff.beforeNative)} →{" "}
              {formatTokenNumber(diff.afterNative)} {diff.afterNative.symbol}
            </span>
          </span>
        ) : null}
      </p>
      {error ? (
        <p className="m-0 text-label text-neg" role="alert">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">{actions}</div>
    </section>
  )
}
