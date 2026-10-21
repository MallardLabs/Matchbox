import { cn } from "@repo/ui/cn"
import { shortenAddress } from "@repo/ui/wallet-address"
import type { ReactElement } from "react"
import type { BridgeRecordsBlock } from "../contract"
import { formatShortDate, formatUsd } from "../format"

const head = "pb-2 text-left text-caption font-400 text-muted"
const cell = "border-b border-line py-2.5"

const STATUS_TONE = {
  completed: "text-pos",
  pending: "text-warn",
  failed: "text-neg",
} as const

/** Bridge transfers touching this wallet (Wormhole and others). */
export function BridgeRecords({
  block,
}: {
  block: BridgeRecordsBlock
}): ReactElement {
  if (block.records.length === 0) {
    return (
      <p className="m-0 text-body-sm text-secondary">No transfers found.</p>
    )
  }
  return (
    <section aria-label="Bridge transfers" className="flex flex-col gap-2">
      {block.totalUsd ? (
        <p className="m-0 text-body font-600 tabular-nums text-ink">
          Total {formatUsd(block.totalUsd)}
        </p>
      ) : null}
      <table className="w-full border-collapse text-body-sm tabular-nums">
        <thead>
          <tr className="border-b border-line">
            <th scope="col" className={head}>
              When
            </th>
            <th scope="col" className={head}>
              Route
            </th>
            <th scope="col" className={head}>
              Amount
            </th>
            <th scope="col" className={cn(head, "hidden sm:table-cell")}>
              USD
            </th>
            <th scope="col" className={head}>
              Status
            </th>
            <th scope="col" className={cn(head, "hidden md:table-cell")}>
              Tx
            </th>
          </tr>
        </thead>
        <tbody>
          {block.records.map((record) => (
            <tr key={record.id}>
              <td className={cn(cell, "pr-3 text-label text-muted")}>
                {formatShortDate(record.happenedAt)}
              </td>
              <td className={cn(cell, "pr-3 text-ink")}>
                {record.sourceChain} → {record.destinationChain}
                <span className="block text-caption text-muted">
                  {record.provider}
                </span>
              </td>
              <td className={cn(cell, "pr-3 text-ink")}>
                {record.destinationAmount} {record.destinationAsset}
              </td>
              <td className={cn(cell, "hidden pr-3 text-ink sm:table-cell")}>
                {record.usdValue ? formatUsd(record.usdValue) : "Unpriced"}
              </td>
              <td
                className={cn(
                  cell,
                  "pr-3 font-600",
                  STATUS_TONE[record.status],
                )}
              >
                {record.status === "completed"
                  ? "Completed"
                  : record.status === "pending"
                    ? "Pending"
                    : "Failed"}
              </td>
              <td
                className={cn(
                  cell,
                  "hidden font-mono text-label text-secondary md:table-cell",
                )}
              >
                {shortenAddress(record.sourceHash)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}
