import { cn } from "@repo/ui/cn"
import { Link } from "@tanstack/react-router"
import type { ReactElement, ReactNode } from "react"
import type { GaugeExplainBlock } from "../contract"
import {
  formatBlock,
  formatBoostWad,
  formatBps,
  formatShortDate,
  formatToken,
  formatUsd,
} from "../format"

const REASON_COPY: Record<
  NonNullable<GaugeExplainBlock["notSelectedReason"]>,
  string
> = {
  selected: "In your optimal allocation",
  not_alive: "Not selected · gauge is not alive",
  no_incentives: "Not selected · no incentives this epoch",
  unpriced: "Not selected · incentives unpriced",
  below_cutoff: "Not selected · below the optimizer cutoff",
  no_eligible_locks: "Not selected · no eligible locks",
}

function epochDate(epochStart: string): string {
  if (!/^\d+$/.test(epochStart)) return "—"
  return formatShortDate(
    new Date(Number.parseInt(epochStart, 10) * 1000).toISOString(),
  )
}

function Metric({
  label,
  value,
  detail,
}: {
  label: string
  value: ReactNode
  detail?: ReactNode
}): ReactElement {
  return (
    <div className="flex min-w-0 flex-col gap-1 px-3 py-3 xl:py-0">
      <dt className="text-caption text-muted">{label}</dt>
      <dd className="m-0 flex flex-col gap-1">
        <span className="truncate text-title-sm font-600 tabular-nums text-ink">
          {value}
        </span>
        {detail ? (
          <span className="truncate text-caption tabular-nums text-secondary">
            {detail}
          </span>
        ) : null}
      </dd>
    </div>
  )
}

const head = "pb-2 text-left text-caption font-400 text-muted"
const cell = "border-b border-line py-2.5 pr-3"

/** One gauge explained: this epoch's inputs and the recent epochs behind them. */
export function GaugeExplain({
  block,
}: {
  block: GaugeExplainBlock
}): ReactElement {
  const { target } = block
  const incentives =
    block.incentivesUsd === null
      ? "Unpriced"
      : `${block.pricingStatus === "partial" ? "≥ " : ""}${formatUsd(block.incentivesUsd)}`
  return (
    <section aria-label={target.name} className="flex flex-col gap-3">
      <p className="m-0 text-label text-muted">
        {target.branch === "boost" ? (
          <Link
            to="/gauges/$address"
            params={{ address: target.targetAddress }}
            className="text-ink hover:underline"
          >
            {target.name}
          </Link>
        ) : (
          <span className="text-ink">{target.name}</span>
        )}
        {target.tokenId ? ` · #${target.tokenId}` : ""}
        {target.isAlive ? "" : " · not alive"}
        {` · block ${formatBlock(block.snapshotBlock)}`}
      </p>
      {block.notSelectedReason ? (
        <p
          className={cn(
            "m-0 text-body-sm",
            block.notSelectedReason === "selected" ? "text-pos" : "text-warn",
          )}
        >
          {REASON_COPY[block.notSelectedReason]}
        </p>
      ) : null}
      <dl className="m-0 grid grid-cols-2 border-y border-line xl:grid-cols-4 xl:py-3">
        <Metric
          label="Incentives this epoch"
          value={incentives}
          detail={
            block.incentives.length > 0
              ? block.incentives
                  .map((amount) => formatToken(amount))
                  .join(" · ")
              : "None"
          }
        />
        <Metric label="Votes" value={formatToken(block.weight, 0)} />
        <Metric
          label="APY"
          value={block.apyBps === null ? "—" : formatBps(block.apyBps)}
          detail="extrapolated"
        />
        <Metric
          label="Boost"
          value={formatBoostWad(block.boostWad)}
          detail={
            block.optimalVeMEZO
              ? `Optimal ${formatToken(block.optimalVeMEZO, 0)}${
                  block.additionalVeMEZO
                    ? ` · +${formatToken(block.additionalVeMEZO, 0)}`
                    : ""
                }`
              : undefined
          }
        />
      </dl>
      {block.historyStatus === "unavailable" ? (
        <p className="m-0 text-label text-muted">History unavailable</p>
      ) : block.epochs.length > 0 ? (
        <table className="w-full border-collapse text-body-sm tabular-nums">
          <caption className="pb-1 text-left text-body-sm font-600 text-ink">
            Recent epochs
          </caption>
          <thead>
            <tr>
              <th scope="col" className={head}>
                Epoch
              </th>
              <th scope="col" className={head}>
                Incentives
              </th>
              <th scope="col" className={head}>
                APY
              </th>
              <th scope="col" className={cn(head, "hidden sm:table-cell")}>
                Votes
              </th>
              <th scope="col" className={cn(head, "hidden sm:table-cell")}>
                Boost
              </th>
            </tr>
          </thead>
          <tbody>
            {block.epochs.map((epoch) => (
              <tr key={epoch.epochStart}>
                <th
                  scope="row"
                  className={cn(cell, "text-left font-400 text-secondary")}
                >
                  {epochDate(epoch.epochStart)}
                  {epoch.status === "current" ? (
                    <span className="text-muted"> · now</span>
                  ) : null}
                </th>
                <td className={cn(cell, "text-ink")}>
                  {epoch.incentivesUsd === null
                    ? "Unpriced"
                    : formatUsd(epoch.incentivesUsd)}
                </td>
                <td className={cn(cell, "text-ink")}>
                  {epoch.apyBps === null ? "—" : formatBps(epoch.apyBps)}
                </td>
                <td className={cn(cell, "hidden text-ink sm:table-cell")}>
                  {formatToken(epoch.weight, 0)}
                </td>
                <td className={cn(cell, "hidden text-ink sm:table-cell")}>
                  {formatBoostWad(epoch.boostWad)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </section>
  )
}
