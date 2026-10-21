import { cn } from "@repo/ui/cn"
import { Link } from "@tanstack/react-router"
import { ChevronDown } from "lucide-react"
import type { ReactElement } from "react"
import TargetAvatar from "./TargetAvatar"
import { BallotToggle, type TargetActions } from "./TargetCard"
import { STEP_BPS, formatBps } from "./ballot"
import { formatApy, formatUsdCompact } from "./format"
import type { VoteTarget } from "./model"

const SHARE_OPTIONS = Array.from({ length: 21 }, (_, index) => index * STEP_BPS)
const REMOVE = "remove"

type TargetRowProps = Pick<
  TargetActions,
  "onBallot" | "addBlocked" | "onToggleBallot"
> & {
  target: VoteTarget
  /** Ballot share in basis points when on the ballot. */
  bps: number | undefined
  onShareChange: (bps: number) => void
}

/** Phone list row (Pen M02 refined): name, APY and incentives, with a share picker. */
export default function TargetRow({
  target,
  bps,
  onShareChange,
  ...actions
}: TargetRowProps): ReactElement {
  const nameClass = "truncate text-body font-600 text-ink"
  return (
    <article className="relative flex items-center gap-3 py-3">
      <TargetAvatar mark={target.mark} size={36} />
      <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
        <h3 className="flex min-w-0 items-center gap-1.5">
          {target.hasDetail ? (
            <Link
              to="/gauges/$address"
              params={{ address: target.id }}
              className={cn(nameClass, "after:absolute after:inset-0")}
            >
              {target.name}
            </Link>
          ) : (
            <span className={nameClass}>{target.name}</span>
          )}
          {target.chip ? (
            <span className="flex h-4 shrink-0 items-center rounded-[4px] bg-accent-soft px-[5px] font-mono text-[9px] font-500 text-accent-ink">
              {target.chip}
            </span>
          ) : null}
        </h3>
        <p className="flex items-center gap-2.5 text-caption tabular-nums">
          <span
            className={cn(
              "font-600",
              target.apyBps === null ? "text-muted" : "text-pos",
            )}
          >
            {formatApy(target.apyBps)} APY
          </span>
          <span className="font-500 text-muted">
            {target.incentiveMicroUsd === 0n && target.hasUnpriced
              ? "Unpriced"
              : formatUsdCompact(target.incentiveMicroUsd)}
          </span>
        </p>
      </div>
      {bps === undefined ? (
        <BallotToggle target={target} size="lg" {...actions} />
      ) : (
        <label className="relative z-[1] flex h-8 shrink-0 items-center gap-1 rounded-lg bg-accent-soft px-2.5 text-body-sm font-700 text-accent-ink tabular-nums focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent-ink">
          <span className="sr-only">{target.name} ballot share</span>
          {formatBps(bps)}
          <ChevronDown aria-hidden="true" size={12} strokeWidth={2} />
          <select
            value={bps}
            onChange={(event) => {
              if (event.target.value === REMOVE) actions.onToggleBallot()
              else onShareChange(Number(event.target.value))
            }}
            className="absolute inset-0 cursor-pointer opacity-0"
          >
            {SHARE_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {formatBps(option)}
              </option>
            ))}
            {SHARE_OPTIONS.includes(bps) ? null : (
              <option value={bps}>{formatBps(bps)}</option>
            )}
            <option value={REMOVE}>Remove</option>
          </select>
        </label>
      )}
    </article>
  )
}
