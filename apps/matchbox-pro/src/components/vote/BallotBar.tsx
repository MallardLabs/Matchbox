import Button from "@/components/ui/Button"
import { formatMicroUsd } from "@/lib/money"
import { ArrowRight, Sparkles } from "lucide-react"
import type { ReactElement } from "react"

type BallotBarProps = {
  isConnected: boolean
  canVote: boolean
  canOptimize: boolean
  gaugeCount: number
  total: number
  projected: bigint
  onReview: () => void
  onOptimize: () => void
  onConnect: () => void
}

/** Mobile ballot summary pinned above the bottom tab bar (Pen M02). */
export default function BallotBar(props: BallotBarProps): ReactElement {
  return (
    <aside
      aria-label="Ballot"
      className="fixed inset-x-0 bottom-[60px] z-20 flex items-center gap-3 border-t border-line bg-surface px-4 py-3 md:hidden"
    >
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="flex items-baseline gap-1.5">
          <span className="text-[17px] font-700 text-ink tabular-nums">
            {props.isConnected ? formatMicroUsd(props.projected) : "—"}
          </span>
          <span className="text-[11px] font-500 text-muted">projected</span>
        </p>
        <div
          aria-hidden="true"
          className="h-1 overflow-hidden rounded-sm bg-inset-2"
        >
          <div
            className="h-full bg-accent"
            style={{ width: `${Math.min(100, props.total)}%` }}
          />
        </div>
        <p className="text-[11px] font-500 text-secondary tabular-nums">
          {props.gaugeCount} {props.gaugeCount === 1 ? "gauge" : "gauges"} ·{" "}
          {props.total}%
        </p>
      </div>
      {props.isConnected ? (
        <>
          <Button
            variant="soft"
            aria-label="Optimize"
            onClick={props.onOptimize}
            disabled={!props.canOptimize}
            className="size-11 rounded-[10px] px-0"
          >
            <Sparkles size={16} strokeWidth={1.75} aria-hidden="true" />
          </Button>
          <Button
            onClick={props.onReview}
            disabled={!props.canVote}
            className="h-11 rounded-[10px] px-[18px] text-[14px]"
          >
            Review vote
            <ArrowRight size={14} strokeWidth={2} aria-hidden="true" />
          </Button>
        </>
      ) : (
        <Button
          onClick={props.onConnect}
          className="h-11 rounded-[10px] px-[18px] text-[14px]"
        >
          Connect wallet
        </Button>
      )}
    </aside>
  )
}
