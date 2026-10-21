import { cn } from "@repo/ui/cn"
import { shortenAddress } from "@repo/ui/wallet-address"
import type { ReactElement, ReactNode } from "react"
import type {
  Evidence,
  LiquidationScenarioBlock,
  LoanPositionBlock,
} from "../contract"
import {
  formatBlock,
  formatBps,
  formatShortDate,
  formatToken,
  formatUsd,
} from "../format"

const HEALTH_COPY: Record<LoanPositionBlock["health"], string> = {
  healthy: "Healthy",
  near_liquidation: "Near liquidation",
  liquidatable: "Liquidatable",
  unpriced: "Unpriced",
  inactive: "Inactive",
}

const HEALTH_TONE: Record<LoanPositionBlock["health"], string> = {
  healthy: "text-pos",
  near_liquidation: "text-warn",
  liquidatable: "text-neg",
  unpriced: "text-muted",
  inactive: "text-muted",
}

const STATUS_COPY: Record<LoanPositionBlock["status"], string> = {
  active: "Active",
  closed_by_owner: "Closed",
  closed_by_liquidation: "Liquidated",
  closed_by_redemption: "Redeemed",
  none: "No trove",
}

const HISTORY_COPY: Record<
  LoanPositionBlock["history"][number]["kind"],
  string
> = {
  open: "Opened with",
  repay: "Repaid",
  borrow: "Borrowed",
  add_collateral: "Added",
  withdraw_collateral: "Withdrew",
  close: "Closed",
  redeemed: "Redeemed",
  liquidated: "Liquidated",
  adjust: "Adjusted",
}

function Metric({
  label,
  value,
  detail,
}: {
  label: string
  value: ReactNode
  detail: ReactNode
}): ReactElement {
  return (
    <div className="flex min-w-0 flex-col gap-1 px-3 py-3 xl:py-0">
      <dt className="text-caption text-muted">{label}</dt>
      <dd className="m-0 flex flex-col gap-1">
        <span className="truncate text-title-sm font-600 tabular-nums text-ink">
          {value}
        </span>
        <span className="truncate text-caption tabular-nums text-secondary">
          {detail}
        </span>
      </dd>
    </div>
  )
}

function priceNote(
  block: LoanPositionBlock,
  evidence: readonly Evidence[],
): string {
  if (block.priceStatus === "unavailable") return " BTC price unavailable."
  const price = evidence.find((item) => item.kind === "price")
  const stale = block.priceStatus === "stale" ? " · stale" : ""
  if (!price) {
    return ` Snapshot block ${formatBlock(block.snapshotBlock)}${stale}.`
  }
  return ` Price ${price.source} @ block ${formatBlock(
    price.blockNumber ?? block.snapshotBlock,
  )}${price.calculationVersion ? ` · ${price.calculationVersion}` : ""}${stale}.`
}

/** Frame 40: trove metrics, snapshot note, recent repayments. */
export function LoanPosition({
  block,
  evidence,
}: {
  block: LoanPositionBlock
  evidence: readonly Evidence[]
}): ReactElement {
  const inactive = block.status !== "active"
  return (
    <section aria-label="Trove" className="flex flex-col gap-3">
      <p className="m-0 text-label text-muted">
        Trove · {shortenAddress(block.troveOwner)} · Mezo mainnet
        {inactive ? ` · ${STATUS_COPY[block.status]}` : null}
        {block.recoveryMode
          ? ` · Recovery mode${
              block.totalCollateralRatioBps !== null
                ? ` (TCR ${formatBps(block.totalCollateralRatioBps)})`
                : ""
            }`
          : null}
      </p>
      {block.surplusCollateral && block.surplusCollateral.raw !== "0" ? (
        <p className="m-0 text-body-sm text-warn">
          {formatToken(block.surplusCollateral)} surplus to claim.
        </p>
      ) : null}
      {inactive ? null : (
        <dl className="m-0 grid grid-cols-2 border-y border-line xl:grid-cols-4 xl:py-3">
          <Metric
            label="Collateral"
            value={formatToken(block.collateral)}
            detail={
              block.collateralUsd === null || block.collateralPriceUsd === null
                ? "Unpriced"
                : `${formatUsd(block.collateralUsd, { cents: false })} at ${formatUsd(
                    block.collateralPriceUsd,
                    { cents: false },
                  )}`
            }
          />
          <Metric
            label="Debt"
            value={formatToken(block.debt, 0)}
            detail={`incl. ${formatToken(block.interest)} interest${
              block.interestRateBps === null
                ? ""
                : ` · ${formatBps(block.interestRateBps)} simple`
            }`}
          />
          <Metric
            label="Collateral ratio"
            value={
              block.collateralRatioBps === null
                ? "Unpriced"
                : formatBps(block.collateralRatioBps)
            }
            detail={
              <>
                <span className={HEALTH_TONE[block.health]}>
                  {HEALTH_COPY[block.health]}
                </span>
                {" · "}min {formatBps(block.minCollateralRatioBps)}
              </>
            }
          />
          <Metric
            label="Liq. price"
            value={
              block.liquidationPriceUsd === null
                ? "Unpriced"
                : `${formatUsd(block.liquidationPriceUsd, { cents: false })} / BTC`
            }
            detail={
              block.dropToLiquidationBps === null
                ? "deterministic"
                : `BTC −${formatBps(block.dropToLiquidationBps)} away`
            }
          />
        </dl>
      )}
      <p className="m-0 text-label text-secondary">
        Protocol state, not a portfolio P&amp;L.{priceNote(block, evidence)}
      </p>
      {block.historyStatus === "unavailable" ? (
        <p className="m-0 text-label text-muted">History unavailable</p>
      ) : block.history.length > 0 ? (
        <div className="flex flex-col">
          <h2 className="m-0 pb-1 text-body-sm font-600 text-ink">
            Recent repayments
          </h2>
          <ul className="m-0 list-none p-0">
            {block.history.map((entry) => (
              <li
                key={`${entry.at}-${entry.kind}-${entry.txHash ?? ""}`}
                className="flex items-center gap-3 border-b border-line py-2 text-body-sm tabular-nums"
              >
                <span className="w-16 shrink-0 text-label text-muted">
                  {formatShortDate(entry.at)}
                </span>
                <span className="min-w-0 flex-1 truncate text-ink">
                  {entry.kind === "repay"
                    ? formatToken(entry.amount, 0)
                    : `${HISTORY_COPY[entry.kind]}${
                        entry.amount ? ` ${formatToken(entry.amount)}` : ""
                      }`}
                </span>
                <span
                  className={cn(
                    "text-label font-600",
                    entry.finality === "final" ? "text-pos" : "text-warn",
                  )}
                >
                  {entry.finality === "final" ? "Final" : "Pending"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  )
}

const BAND_COPY: Record<
  LiquidationScenarioBlock["rows"][number]["band"],
  string
> = {
  healthy: "Healthy",
  near_liquidation: "Near liquidation",
  liquidatable: "Liquidation band",
}

const BAND_TONE: Record<
  LiquidationScenarioBlock["rows"][number]["band"],
  string
> = {
  healthy: "text-pos",
  near_liquidation: "text-warn",
  liquidatable: "text-neg",
}

/** Frame 41: deterministic BTC price shocks against the current trove. */
export function ScenarioModel({
  block,
}: {
  block: LiquidationScenarioBlock
}): ReactElement {
  return (
    <section aria-label="Price scenario" className="flex flex-col gap-3">
      <p className="m-0 text-body-sm text-warn">
        Deterministic model on the current snapshot. Not a forecast.
      </p>
      <p className="m-0 text-body font-600 tabular-nums text-ink">
        Now BTC {formatUsd(block.base.priceUsd, { cents: false })} · CR{" "}
        {formatBps(block.base.collateralRatioBps)} · liq.{" "}
        {formatUsd(block.base.liquidationPriceUsd, { cents: false })}
      </p>
      <table className="w-full border-collapse tabular-nums">
        <thead className="sr-only">
          <tr>
            <th scope="col">Shock</th>
            <th scope="col">BTC price</th>
            <th scope="col">Collateral ratio</th>
            <th scope="col">Status</th>
          </tr>
        </thead>
        <tbody>
          {block.rows.map((row) => (
            <tr
              key={row.shockBps}
              aria-current={row.requested ? "true" : undefined}
              className="border-b border-line"
            >
              <th
                scope="row"
                className="w-[92px] py-2.5 pl-0 text-left text-body font-600 text-ink sm:w-[112px]"
              >
                BTC {formatBps(row.shockBps)}
              </th>
              <td className="w-[92px] py-2.5 font-mono text-body-sm text-ink sm:w-[112px]">
                {formatUsd(row.priceUsd, { cents: false })}
              </td>
              <td className="w-[88px] py-2.5 text-body-sm text-ink sm:w-[100px]">
                CR {formatBps(row.collateralRatioBps)}
              </td>
              <td
                className={cn(
                  "py-2.5 text-body-sm font-600",
                  BAND_TONE[row.band],
                )}
              >
                {row.isLiquidationRow ? "Liquidation" : BAND_COPY[row.band]}
                {row.requested ? (
                  <span className="font-400 text-muted"> · asked</span>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}
