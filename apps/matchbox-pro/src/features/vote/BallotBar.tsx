import * as Button from "@repo/ui/button"
import { cn } from "@repo/ui/cn"
import { ArrowRight, Sparkles } from "lucide-react"
import type { ReactElement } from "react"
import type { BallotModel, PanelAction } from "./BallotPanel"
import { FULL_BALLOT_BPS, formatBps } from "./ballot"
import { formatUsd } from "./format"

type BallotBarProps = {
  model: BallotModel
  showFigures: boolean
  targetNoun: string
  optimize: PanelAction
  primary: PanelAction
  onOpenBallot: () => void
}

/**
 * Sticky ballot summary below 1280px (M02 refined, T02): projected value and
 * allocation, opening the ballot sheet, with Optimize and Review vote.
 */
export default function BallotBar(props: BallotBarProps): ReactElement {
  const { model } = props
  // Every ballot entry, as the sheet lists them (0% rows included).
  const count = model.rows.length
  const fill = Math.min(1, model.totalBps / FULL_BALLOT_BPS)
  return (
    <aside
      aria-label="Ballot summary"
      className="sticky bottom-[calc(60px+env(safe-area-inset-bottom))] z-sticky -mx-4 mt-2 flex items-center gap-3 border-t border-line bg-surface px-4 py-3 md:bottom-4 md:mx-0 md:rounded-xl md:border md:shadow-pop xl:hidden"
    >
      <button
        type="button"
        onClick={props.onOpenBallot}
        aria-haspopup="dialog"
        className="flex min-w-0 flex-1 flex-col gap-0.5 rounded-md text-left"
      >
        <span className="flex items-baseline gap-1.5">
          <span className="text-[17px] font-700 text-ink tabular-nums">
            {props.showFigures ? formatUsd(model.projectedMicroUsd) : "—"}
          </span>
          <span className="text-caption font-500 text-muted">projected</span>
        </span>
        <span
          aria-hidden="true"
          className="block h-1 overflow-hidden rounded-sm bg-inset-2"
        >
          <span
            className={cn(
              "block h-full",
              model.totalBps > FULL_BALLOT_BPS ? "bg-neg" : "bg-accent",
            )}
            style={{ width: `${fill * 100}%` }}
          />
        </span>
        <span className="text-caption font-500 text-secondary tabular-nums">
          {count}{" "}
          {count === 1 ? props.targetNoun.replace(/s$/, "") : props.targetNoun}{" "}
          · {formatBps(model.totalBps)}
        </span>
      </button>
      <Button.Root
        variant="soft"
        aria-label={props.optimize.label}
        title={props.optimize.label}
        disabled={props.optimize.disabled}
        onClick={props.optimize.onPress}
        className="size-11 rounded-[10px] px-0"
      >
        <Sparkles aria-hidden="true" size={17} strokeWidth={1.75} />
      </Button.Root>
      <Button.Root
        disabled={props.primary.disabled}
        onClick={props.primary.onPress}
        className="h-11 rounded-[10px] px-[18px] text-body"
      >
        {props.primary.label}
        {props.primary.label === "Review vote" ? (
          <ArrowRight aria-hidden="true" size={14} strokeWidth={2} />
        ) : null}
      </Button.Root>
    </aside>
  )
}
