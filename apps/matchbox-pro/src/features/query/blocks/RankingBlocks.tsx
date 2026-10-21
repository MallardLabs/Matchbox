import { cn } from "@repo/ui/cn"
import { Link } from "@tanstack/react-router"
import type { ReactElement } from "react"
import type {
  GaugeRankingBlock,
  MetricSummaryBlock,
  VoteComposerBlock,
} from "../contract"
import {
  formatBlock,
  formatBps,
  formatToken,
  formatTokenNumber,
  formatUsd,
} from "../format"

/** Frame 32 "Lead result": label, USD · native, objective and snapshot note. */
export function MetricSummary({
  block,
  compact = false,
}: {
  block: MetricSummaryBlock
  compact?: boolean
}): ReactElement {
  const unpriced =
    block.primaryUsd === null || block.primaryStatus === "unpriced"
  const apy = block.apyBps !== null ? formatBps(block.apyBps) : null
  return (
    <section
      aria-label={block.label}
      className={cn(
        "flex flex-col gap-1.5",
        !compact && "xl:border-b xl:border-line xl:py-4",
      )}
    >
      <p className="m-0 text-label text-muted md:hidden xl:block">
        {block.label}
      </p>
      <p className="m-0 flex flex-wrap items-baseline gap-x-2 text-metric font-600 tabular-nums text-ink md:text-[24px] md:leading-[30px] xl:text-title">
        <span>{unpriced ? "Unpriced" : formatUsd(block.primaryUsd)}</span>
        {block.secondary ? (
          <>
            <span aria-hidden="true">·</span>
            <span>{formatToken(block.secondary)}</span>
          </>
        ) : null}
      </p>
      <p className="m-0 text-label text-secondary">
        {block.objectiveNote ? (
          <span className="hidden xl:inline">
            Optimizer objective: maximize projected personal voting-incentive
            return in USD.{" "}
          </span>
        ) : null}
        {apy ? (
          <>
            APY {apy} is extrapolated
            {block.objectiveNote ? (
              <span className="hidden xl:inline">, not the objective</span>
            ) : null}
            .{" "}
          </>
        ) : null}
        {block.snapshotBlock
          ? `Snapshot block ${formatBlock(block.snapshotBlock)}.`
          : null}
      </p>
    </section>
  )
}

const OBJECTIVE_TITLES: Record<GaugeRankingBlock["objective"], string> = {
  best_personal_return: "Recommended allocation",
  most_incentives_deposited: "Most incentives deposited",
  most_consistently_funded: "Most consistently funded",
  highest_apy: "Highest APY",
}

const head = "pb-2 text-left text-caption font-400 text-muted"
const cell = "border-b border-line py-2.5 align-middle"

/** Frame 32 "Recommended allocation" (Gauge / Alloc / Projected / Native / Funded). */
export function GaugeRanking({
  block,
  compact = false,
}: {
  block: GaugeRankingBlock
  compact?: boolean
}): ReactElement {
  const hasAlloc = block.rows.some((row) => row.allocationBps !== null)
  const hasProjected = block.rows.some((row) => row.projectedUsd !== null)
  const hasNative = block.rows.some((row) => row.projectedNative !== null)
  const hasDeposited =
    block.objective !== "best_personal_return" &&
    block.rows.some((row) => row.depositedUsd !== null)
  const titleId = `${block.id}-title`
  const wide = compact ? "hidden" : "hidden xl:table-cell"
  // APY ranks "highest_apy" (always shown); research rankings show it on
  // desktop; the frame 32 allocation table keeps its five columns.
  const hasApy =
    block.objective !== "best_personal_return" &&
    block.rows.some((row) => row.apyBps !== undefined)
  const apyClass = block.objective === "highest_apy" ? "" : wide

  return (
    <section aria-labelledby={titleId} className="flex min-w-0 flex-col">
      <div
        className={cn(
          "flex items-baseline justify-between gap-4 pb-2.5",
          compact ? "sr-only" : "sr-only xl:not-sr-only xl:flex",
        )}
      >
        <h2 id={titleId} className="m-0 text-body font-600 text-ink">
          {OBJECTIVE_TITLES[block.objective]}
        </h2>
        <p className="m-0 hidden text-label text-muted sm:block">
          {block.epoch.number !== null ? `Epoch ${block.epoch.number} · ` : ""}
          block {formatBlock(block.snapshotBlock)}
        </p>
      </div>
      <table className="w-full border-collapse text-body-sm tabular-nums">
        <thead
          className={
            compact ? "sr-only" : "sr-only xl:not-sr-only xl:table-header-group"
          }
        >
          <tr className="border-b border-line">
            <th scope="col" className={head}>
              Gauge
            </th>
            {hasAlloc ? (
              <th scope="col" className={cn(head, "w-16 pl-3")}>
                Alloc
              </th>
            ) : null}
            {hasApy ? (
              <th scope="col" className={cn(head, apyClass, "w-20 pl-3")}>
                APY
              </th>
            ) : null}
            {hasDeposited ? (
              <th scope="col" className={cn(head, "w-[104px] pl-3")}>
                Deposited
              </th>
            ) : null}
            {hasProjected ? (
              <th scope="col" className={cn(head, "w-[88px] pl-3")}>
                Projected
              </th>
            ) : null}
            {hasNative ? (
              <th scope="col" className={cn(head, wide, "w-[122px] pl-3")}>
                Native
              </th>
            ) : null}
            <th scope="col" className={cn(head, wide, "w-[68px] pl-3")}>
              Funded
            </th>
          </tr>
        </thead>
        <tbody>
          {block.rows.map((row) => (
            <tr key={row.targetId}>
              <th
                scope="row"
                className={cn(
                  cell,
                  "max-w-0 truncate pr-3 text-left font-500 text-ink md:text-body xl:text-body-sm",
                )}
              >
                {block.domain.branch === "boost" ? (
                  <Link
                    to="/gauges/$address"
                    params={{ address: row.targetAddress }}
                    className="hover:underline"
                  >
                    {row.name}
                  </Link>
                ) : (
                  row.name
                )}
              </th>
              {hasAlloc ? (
                <td
                  className={cn(
                    cell,
                    "w-16 pl-3 text-right font-400 text-secondary md:text-body xl:text-left xl:font-600 xl:text-body-sm xl:text-ink",
                  )}
                >
                  {row.allocationBps === null
                    ? "—"
                    : formatBps(row.allocationBps)}
                </td>
              ) : null}
              {hasApy ? (
                <td
                  className={cn(
                    cell,
                    apyClass,
                    "w-20 pl-3 text-right font-600 md:text-body xl:text-left xl:text-body-sm",
                    row.apyBps === null || row.apyBps === undefined
                      ? "text-muted"
                      : "text-pos",
                  )}
                >
                  {row.apyBps === null || row.apyBps === undefined
                    ? "—"
                    : formatBps(row.apyBps)}
                </td>
              ) : null}
              {hasDeposited ? (
                <td className={cn(cell, "w-[104px] pl-3 text-ink")}>
                  {row.depositedUsd === null
                    ? "Unpriced"
                    : formatUsd(row.depositedUsd)}
                </td>
              ) : null}
              {hasProjected ? (
                <td
                  className={cn(
                    cell,
                    "w-[88px] pl-1 text-right font-600 md:text-body xl:pl-3 xl:text-left xl:text-body-sm",
                    row.projectedUsd === null ? "text-muted" : "text-pos",
                  )}
                >
                  {row.projectedUsd === null
                    ? row.pricingStatus === "unpriced"
                      ? "Unpriced"
                      : "—"
                    : formatUsd(row.projectedUsd)}
                </td>
              ) : null}
              {hasNative ? (
                <td
                  className={cn(
                    cell,
                    wide,
                    "w-[122px] pl-3 font-mono text-label text-secondary",
                  )}
                >
                  {row.projectedNative ? formatToken(row.projectedNative) : "—"}
                </td>
              ) : null}
              <td
                className={cn(
                  cell,
                  wide,
                  "w-[68px] pl-3 text-label text-secondary",
                )}
              >
                {row.fundedEpochs === null || row.observedEpochs === null
                  ? "—"
                  : `${row.fundedEpochs}/${row.observedEpochs}`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}

/** Ballots per lock, shown when an answer carries a vote without a ranking. */
export function VoteBallots({
  block,
}: {
  block: VoteComposerBlock
}): ReactElement {
  return (
    <section aria-label="Ballots" className="flex flex-col gap-3">
      {block.ballots.map((ballot) => (
        <div key={ballot.ballotKey} className="flex flex-col">
          <p className="m-0 flex items-baseline justify-between gap-3 pb-1 text-label text-muted">
            <span>
              {ballot.governanceAsset} #{ballot.tokenId}
            </span>
            <span className="font-mono">
              {formatTokenNumber({
                raw: ballot.votingPower,
                decimals: 18,
                symbol: ballot.governanceAsset,
              })}
            </span>
          </p>
          <ul className="m-0 list-none p-0">
            {ballot.allocations.map((allocation) => (
              <li
                key={allocation.targetId}
                className="flex items-center gap-3 border-b border-line py-2 text-body-sm tabular-nums"
              >
                <span className="min-w-0 flex-1 truncate text-ink">
                  {allocation.name}
                </span>
                <span className="text-secondary">
                  {formatBps(allocation.bps)}
                </span>
                <span className="w-20 text-right font-600 text-pos">
                  {allocation.projectedUsd === null
                    ? "—"
                    : formatUsd(allocation.projectedUsd)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  )
}
