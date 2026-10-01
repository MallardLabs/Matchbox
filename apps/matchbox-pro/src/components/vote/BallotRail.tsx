import Button from "@/components/ui/Button"
import { cn } from "@/lib/cn"
import {
  formatApyBasisPoints,
  formatMicroUsd,
  formatVeAmount,
} from "@/lib/money"
import { Minus, Plus, Sparkles } from "lucide-react"
import type { ReactElement } from "react"

export type BallotRow = {
  address: string
  name: string
  percent: number
  apy: bigint | null
  usd: bigint
}

type BallotRailProps = {
  isConnected: boolean
  canOptimize: boolean
  canVote: boolean
  rows: BallotRow[]
  total: number
  projected: bigint
  projectedMezo: bigint | null
  onOptimize: () => void
  onStep: (address: string, percent: number) => void
  onVote: () => void
  onConnect: () => void
}

const STEP = 5

export default function BallotRail(props: BallotRailProps): ReactElement {
  const latest = props.rows.at(-1)?.address
  return (
    <aside
      aria-labelledby="ballot-title"
      className="hidden w-full shrink-0 flex-col gap-[18px] md:flex xl:sticky xl:top-6 xl:w-[320px]"
    >
      <Button
        onClick={props.onOptimize}
        disabled={!props.canOptimize}
        className="h-[38px] w-full text-[12px]"
      >
        <Sparkles size={13} strokeWidth={2} aria-hidden="true" />
        Optimize my votes
      </Button>
      <header className="flex items-center justify-between">
        <h2 id="ballot-title" className="text-[16px] font-650 text-ink">
          Ballot
        </h2>
        <p className="text-[14px] font-600 text-ink tabular-nums">
          {props.isConnected ? `${props.total}%` : "—"}
        </p>
      </header>

      {props.isConnected ? (
        <>
          {props.rows.length === 0 ? (
            <p className="py-3 text-[13px] font-500 text-muted">Ballot empty</p>
          ) : (
            <ul className="flex flex-col gap-[18px]">
              {props.rows.map((row) => (
                <BallotSlot
                  key={row.address}
                  row={row}
                  highlighted={row.address === latest && props.rows.length > 1}
                  onStep={props.onStep}
                />
              ))}
            </ul>
          )}
          <hr className="border-line" />
          <div className="flex flex-col gap-[18px]">
            <p className="text-[12px] font-500 text-secondary">
              Projected this epoch
            </p>
            <p className="text-[22px] font-600 text-ink tabular-nums">
              {formatMicroUsd(props.projected)}
            </p>
            <p className="text-[13px] font-500 text-secondary tabular-nums">
              {props.projectedMezo === null
                ? "—"
                : `${formatVeAmount(props.projectedMezo)} MEZO`}
            </p>
          </div>
          <Button
            onClick={props.onVote}
            disabled={!props.canVote}
            className="h-[38px] w-full"
          >
            Vote
          </Button>
        </>
      ) : (
        <Button onClick={props.onConnect} className="h-[38px] w-full">
          Connect to vote
        </Button>
      )}
    </aside>
  )
}

function BallotSlot({
  row,
  highlighted,
  onStep,
}: {
  row: BallotRow
  highlighted: boolean
  onStep: (address: string, percent: number) => void
}): ReactElement {
  return (
    <li
      className={cn(
        "flex flex-col gap-1.5 rounded-lg px-3 py-2.5",
        highlighted ? "bg-accent-soft" : "bg-raised",
      )}
    >
      <p className="truncate text-[13px] font-650 text-ink">{row.name}</p>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <StepButton
            label={`Decrease ${row.name}`}
            disabled={row.percent <= 0}
            onClick={() => onStep(row.address, Math.max(0, row.percent - STEP))}
          >
            <Minus size={14} strokeWidth={1.75} />
          </StepButton>
          <output className="min-w-[3ch] text-center text-[22px] font-650 text-ink tabular-nums">
            {row.percent}%
          </output>
          <StepButton
            label={`Increase ${row.name}`}
            disabled={row.percent >= 100}
            onClick={() =>
              onStep(row.address, Math.min(100, row.percent + STEP))
            }
          >
            <Plus size={14} strokeWidth={1.75} />
          </StepButton>
        </div>
        <p className="flex flex-col items-end gap-px tabular-nums">
          <span className="text-[11px] font-650 text-pos">
            {formatApyBasisPoints(row.apy)}
          </span>
          <span className="text-[13px] font-500 text-secondary">
            {formatMicroUsd(row.usd)}
          </span>
        </p>
      </div>
    </li>
  )
}

function StepButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string
  disabled: boolean
  onClick: () => void
  children: ReactElement
}): ReactElement {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex size-7 items-center justify-center rounded-[6px] border border-line bg-surface text-secondary transition-colors hover:border-line-2 hover:text-ink disabled:opacity-40"
    >
      {children}
    </button>
  )
}
