import { formatMicroUsd } from "@/lib/money"
import * as Button from "@repo/ui/button"
import { cn } from "@repo/ui/cn"
import type { ReactElement } from "react"
import { formatBps } from "./ballot"
import { formatSignedBps, formatUsdDelta } from "./format"
import type { AllocationSnapshot } from "./optimize"
import type { AllocationDiffRow } from "./presign"

type AllocationDiffProps = {
  rows: Array<AllocationDiffRow & { name: string }>
  was: AllocationSnapshot
  now: AllocationSnapshot
  changeBps: bigint | null
  blockNumber: bigint | null
  edited: boolean
  onAcknowledge: () => void
  onKeep: () => void
}

function groupThousands(value: bigint): string {
  return value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")
}

/** Pre-sign refresh found a materially different optimum (Pen 38). */
export default function AllocationDiff(
  props: AllocationDiffProps,
): ReactElement {
  const summary = [
    props.blockNumber !== null
      ? `Refreshed at block ${groupThousands(props.blockNumber)}.`
      : "Refreshed.",
    `Projected this epoch ${formatMicroUsd(props.was.projectedMicroUsd)} → ${formatMicroUsd(props.now.projectedMicroUsd)}${
      props.changeBps !== null ? ` (${formatSignedBps(props.changeBps)})` : ""
    }.`,
    props.edited ? "Manual edits were not overwritten." : null,
  ]
    .filter(Boolean)
    .join(" ")

  return (
    <section
      aria-labelledby="allocation-diff-title"
      className="flex flex-col gap-3 rounded-lg border border-accent-line bg-warn-soft p-4"
    >
      <h3
        id="allocation-diff-title"
        className="text-title-sm font-600 text-ink"
      >
        Recommendation changed before sign
      </h3>
      <output className="block text-body-sm font-500 text-warn">
        {summary}
      </output>
      <table className="w-full border-collapse text-body-sm tabular-nums">
        <thead>
          <tr className="text-caption text-muted">
            <th scope="col" className="pb-1.5 text-left font-500">
              Target
            </th>
            <th scope="col" className="w-14 pb-1.5 text-right font-500">
              Was
            </th>
            <th scope="col" className="w-14 pb-1.5 text-right font-500">
              Now
            </th>
            <th scope="col" className="w-24 pb-1.5 text-right font-500">
              Δ projected
            </th>
          </tr>
        </thead>
        <tbody>
          {props.rows.map((row) => (
            <tr key={row.id} className="border-t border-line">
              <th
                scope="row"
                className="max-w-0 truncate py-2 text-left font-500 text-ink"
              >
                {row.name}
              </th>
              <td className="py-2 text-right text-secondary">
                {formatBps(row.wasBps)}
              </td>
              <td className="py-2 text-right font-650 text-ink">
                {formatBps(row.nowBps)}
              </td>
              <td
                className={cn(
                  "py-2 text-right font-500",
                  row.deltaMicroUsd < 0n
                    ? "text-neg"
                    : row.deltaMicroUsd > 0n
                      ? "text-pos"
                      : "text-secondary",
                )}
              >
                {formatUsdDelta(row.deltaMicroUsd)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex flex-wrap gap-2">
        <Button.Root size="lg" onClick={props.onAcknowledge}>
          Acknowledge new optimum
        </Button.Root>
        <Button.Root size="lg" variant="secondary" onClick={props.onKeep}>
          Keep my allocation
        </Button.Root>
      </div>
    </section>
  )
}
