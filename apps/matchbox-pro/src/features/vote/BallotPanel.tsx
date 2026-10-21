import { formatMicroUsd } from "@/lib/money"
import * as Button from "@repo/ui/button"
import { cn } from "@repo/ui/cn"
import { Minus, Plus, Sparkles, X } from "lucide-react"
import type { ReactElement } from "react"
import { FULL_BALLOT_BPS, formatBps } from "./ballot"
import { formatApy, formatNativeList } from "./format"
import type { NativeAmount } from "./projection"

export type BallotRowModel = {
  id: string
  name: string
  bps: number
  apyBps: bigint | null
  projectedMicroUsd: bigint
  hasUnpriced: boolean
}

export type BallotModel = {
  rows: BallotRowModel[]
  totalBps: number
  complete: boolean
  projectedMicroUsd: bigint
  native: NativeAmount[]
  hasUnpriced: boolean
  apyBps: bigint | null
  weightedCount: number
}

export type PanelAction = {
  label: string
  disabled: boolean
  onPress: () => void
}

type BallotPanelProps = {
  title: string
  model: BallotModel
  /** Personal figures need a wallet or watched address. */
  showFigures: boolean
  optimize: PanelAction
  primary: PanelAction
  highlightId: string | null
  onStep: (id: string, direction: 1 | -1) => void
  onRemove: (id: string) => void
}

export function totalTone(model: BallotModel): string {
  if (model.rows.length === 0 || model.complete) return "text-ink"
  return "text-neg"
}

/** Desktop ballot rail (J04): optimize, slots with steppers, projection, vote. */
export default function BallotPanel(props: BallotPanelProps): ReactElement {
  const { model } = props
  return (
    <div className="flex flex-col gap-[18px]">
      <Button.Root
        size="lg"
        disabled={props.optimize.disabled}
        onClick={props.optimize.onPress}
        className="h-[38px] w-full text-label"
      >
        <Sparkles aria-hidden="true" size={13} strokeWidth={2} />
        {props.optimize.label}
      </Button.Root>
      <BallotHeader
        title={props.title}
        model={model}
        placeholder={!props.showFigures && model.rows.length === 0}
      />
      {model.rows.length > 0 ? (
        <BallotSlots
          rows={model.rows}
          showFigures={props.showFigures}
          highlightId={props.highlightId}
          onStep={props.onStep}
          onRemove={props.onRemove}
        />
      ) : props.showFigures ? (
        <p className="py-1 text-body font-500 text-ink">
          Nothing on the ballot
        </p>
      ) : null}
      {props.showFigures ? (
        <>
          <hr className="m-0 border-line" />
          <Projection model={model} showFigures={props.showFigures} />
        </>
      ) : null}
      <Button.Root
        size="lg"
        disabled={props.primary.disabled}
        onClick={props.primary.onPress}
        className="h-[38px] w-full"
      >
        {props.primary.label}
      </Button.Root>
    </div>
  )
}

export function BallotHeader({
  title,
  model,
  placeholder = false,
}: {
  title: string
  model: BallotModel
  /** Disconnected with nothing picked: a dash instead of 0%. */
  placeholder?: boolean
}): ReactElement {
  return (
    <header className="flex items-center justify-between">
      <h2 className="text-lead font-400 text-ink">{title}</h2>
      <p
        aria-live="polite"
        className={cn("text-body font-600 tabular-nums", totalTone(model))}
      >
        <span className="sr-only">Total </span>
        {placeholder ? "—" : formatBps(model.totalBps)}
        {model.rows.length > 0 && !model.complete ? (
          <span className="sr-only"> of {formatBps(FULL_BALLOT_BPS)}</span>
        ) : null}
      </p>
    </header>
  )
}

export function BallotSlots({
  rows,
  showFigures,
  highlightId,
  onStep,
  onRemove,
  dense = false,
}: {
  rows: BallotRowModel[]
  showFigures: boolean
  highlightId: string | null
  onStep: (id: string, direction: 1 | -1) => void
  onRemove: (id: string) => void
  dense?: boolean
}): ReactElement {
  return (
    <ul
      className={cn(
        "m-0 flex list-none flex-col p-0",
        dense ? "gap-2" : "gap-[18px]",
      )}
    >
      {rows.map((row) => (
        <li
          key={row.id}
          className={cn(
            "group relative flex flex-col gap-1.5 rounded-lg px-3 py-2.5",
            row.id === highlightId ? "bg-accent-soft" : "bg-raised",
          )}
        >
          <p className="flex items-center justify-between gap-2">
            <span className="truncate text-body-sm font-500 text-ink">
              {row.name}
            </span>
            <button
              type="button"
              onClick={() => onRemove(row.id)}
              aria-label={`Remove ${row.name}`}
              className="-mr-1.5 -mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md text-faint opacity-60 transition-opacity hover:text-ink focus-visible:opacity-100 group-hover:opacity-100"
            >
              <X aria-hidden="true" size={13} strokeWidth={1.75} />
            </button>
          </p>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <StepButton
                label={`Decrease ${row.name}`}
                disabled={row.bps <= 0}
                onClick={() => onStep(row.id, -1)}
              >
                <Minus aria-hidden="true" size={14} strokeWidth={1.75} />
              </StepButton>
              <output
                aria-label={`${row.name} share`}
                className="min-w-[3ch] text-center text-metric font-400 text-ink tabular-nums"
              >
                {formatBps(row.bps)}
              </output>
              <StepButton
                label={`Increase ${row.name}`}
                disabled={row.bps >= FULL_BALLOT_BPS}
                onClick={() => onStep(row.id, 1)}
              >
                <Plus aria-hidden="true" size={14} strokeWidth={1.75} />
              </StepButton>
            </div>
            {showFigures ? (
              <p className="flex flex-col items-end gap-px tabular-nums">
                <span
                  className={cn(
                    "text-caption",
                    row.apyBps === null ? "text-muted" : "text-pos",
                  )}
                >
                  {formatApy(row.apyBps)}
                </span>
                <span className="text-body-sm font-500 text-secondary">
                  {row.bps > 0 ? formatMicroUsd(row.projectedMicroUsd) : "—"}
                </span>
              </p>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
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

export function Projection({
  model,
  showFigures,
}: {
  model: BallotModel
  showFigures: boolean
}): ReactElement {
  return (
    <div className="flex flex-col gap-[18px]">
      <p className="text-label font-500 text-secondary">Projected this epoch</p>
      <p className="flex items-baseline gap-2 text-metric font-600 text-ink tabular-nums">
        {showFigures ? formatMicroUsd(model.projectedMicroUsd) : "—"}
        {showFigures && model.hasUnpriced ? (
          <span className="rounded-[4px] bg-inset px-1.5 py-0.5 text-caption font-600 text-secondary">
            + Unpriced
          </span>
        ) : null}
      </p>
      <p className="text-body-sm font-500 text-secondary tabular-nums">
        {showFigures ? formatNativeList(model.native) : "—"}
      </p>
    </div>
  )
}
