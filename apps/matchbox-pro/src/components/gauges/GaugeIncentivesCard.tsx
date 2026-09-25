import { cn } from "@/lib/cn"
import { formatMicroUsd, formatTokenAmountDigits } from "@/lib/money"
import type { GaugeRewardToken } from "@/lib/topology"
import type { ReactElement } from "react"

export type IncentiveTokenRow = GaugeRewardToken & {
  amount: bigint
  usd: bigint
}

type GaugeIncentivesCardProps = {
  rows: IncentiveTokenRow[]
  totalMicroUsd: bigint
  loading: boolean
  failed: boolean
}

function dotClass(symbol: string): string {
  const upper = symbol.toUpperCase()
  if (upper === "MEZO") return "bg-mezo-brand"
  if (upper.includes("BTC")) return "bg-accent"
  return "bg-faint"
}

/** Pen "Incentives card": this epoch's deposited incentives by token. */
export default function GaugeIncentivesCard({
  rows,
  totalMicroUsd,
  loading,
  failed,
}: GaugeIncentivesCardProps): ReactElement {
  return (
    <section
      aria-labelledby="incentives-heading"
      className="flex flex-col gap-3 rounded-[10px] bg-surface p-4"
    >
      <div className="flex items-center justify-between gap-4 text-[16px] font-650 text-ink">
        <h2 id="incentives-heading">This epoch</h2>
        <p className="tabular-nums">
          {loading ? "…" : formatMicroUsd(totalMicroUsd)}
        </p>
      </div>
      {failed ? (
        <p role="alert" className="text-pretty text-[13px] text-neg">
          Couldn't load incentives
        </p>
      ) : rows.length === 0 && !loading ? (
        <p className="text-pretty text-[13px] text-secondary">No incentives</p>
      ) : (
        <ul>
          {rows.map((row) => (
            <li
              key={row.tokenAddress}
              className="flex items-center gap-2.5 py-2"
            >
              <span
                aria-hidden="true"
                className={cn("size-2.5 rounded-full", dotClass(row.symbol))}
              />
              <span className="text-[14px] font-650 text-ink">
                {row.symbol}
              </span>
              <span className="ml-auto text-[13px] tabular-nums text-secondary">
                {formatTokenAmountDigits(row.amount, row.decimals, 4)}
              </span>
              <span className="text-[14px] font-650 tabular-nums text-ink">
                ~{formatMicroUsd(row.usd)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
