import { formatApyBasisPoints } from "@/lib/money"
import { Link } from "@tanstack/react-router"
import { ChevronDown, Plus } from "lucide-react"
import type { ReactElement } from "react"
import { type VoteGaugeCard, formatCompactUsd } from "./model"

const PERCENT_OPTIONS = Array.from({ length: 21 }, (_, index) => index * 5)
const REMOVE = "remove"

type GaugeRowProps = {
  card: VoteGaugeCard
  /** Ballot share, or undefined when the gauge is not on the ballot. */
  percent: number | undefined
  onAdd: () => void
  onPercentChange: (percent: number) => void
  onRemove: () => void
}

/** Mobile list row (Pen M02): name, APY and incentives, with an inline ballot share picker. */
export default function GaugeRow({
  card,
  percent,
  onAdd,
  onPercentChange,
  onRemove,
}: GaugeRowProps): ReactElement {
  const url = card.profile?.profile_picture_url
  return (
    <article className="relative flex items-center gap-3 border-b md:hidden border-inset-2 py-3">
      {url ? (
        <img
          src={url}
          alt=""
          loading="lazy"
          className="size-9 shrink-0 rounded-full bg-inset object-cover"
        />
      ) : (
        <span
          aria-hidden="true"
          className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent-soft-2 text-[13px] font-650 text-accent-ink"
        >
          {card.name.slice(0, 1).toUpperCase()}
        </span>
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
        <h3 className="flex min-w-0 items-center gap-1.5">
          <Link
            to="/gauges/$address"
            params={{ address: card.gauge.address }}
            className="truncate text-[14px] font-650 text-ink after:absolute after:inset-0"
          >
            {card.name}
          </Link>
          {card.tokenId ? (
            <span className="flex h-4 shrink-0 items-center rounded-[4px] bg-accent-soft px-[5px] text-[9px] font-650 text-accent-ink">
              #{card.tokenId}
            </span>
          ) : null}
        </h3>
        <p className="flex items-center gap-2.5 text-[11px] tabular-nums">
          <span
            className={
              card.apy === null ? "font-650 text-muted" : "font-650 text-pos"
            }
          >
            {formatApyBasisPoints(card.apy)} APY
          </span>
          <span className="font-500 text-muted">
            {formatCompactUsd(card.incentives)}
          </span>
        </p>
      </div>
      {percent === undefined ? (
        <button
          type="button"
          onClick={onAdd}
          aria-label={`Add ${card.name} to ballot`}
          className="relative flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent text-on-accent"
        >
          <Plus size={14} strokeWidth={2.25} />
        </button>
      ) : (
        <label className="relative flex h-8 shrink-0 items-center gap-1 rounded-lg bg-accent-soft px-2.5 text-[13px] font-700 text-accent-ink tabular-nums">
          <span className="sr-only">{card.name} ballot share</span>
          {percent}%
          <ChevronDown size={12} strokeWidth={2} aria-hidden="true" />
          <select
            value={percent}
            onChange={(event) => {
              if (event.target.value === REMOVE) onRemove()
              else onPercentChange(Number(event.target.value))
            }}
            className="absolute inset-0 cursor-pointer opacity-0"
          >
            {PERCENT_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}%
              </option>
            ))}
            {PERCENT_OPTIONS.includes(percent) ? null : (
              <option value={percent}>{percent}%</option>
            )}
            <option value={REMOVE}>Remove</option>
          </select>
        </label>
      )}
    </article>
  )
}
