import { formatMicroUsd } from "@/lib/money"
import * as Button from "@repo/ui/button"
import * as Dialog from "@repo/ui/dialog"
import { Sparkles } from "lucide-react"
import type { ReactElement } from "react"
import {
  type BallotModel,
  BallotSlots,
  type PanelAction,
  totalTone,
} from "./BallotPanel"
import { formatBps } from "./ballot"
import { formatNativeList } from "./format"

type BallotSheetProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  model: BallotModel
  showFigures: boolean
  highlightId: string | null
  optimize: PanelAction
  primary: PanelAction
  onStep: (id: string, direction: 1 | -1) => void
  onRemove: (id: string) => void
}

/** Ballot bottom sheet below 1280px (M02b); the rail's controls in a sheet. */
export default function BallotSheet(props: BallotSheetProps): ReactElement {
  const { model } = props
  return (
    <Dialog.Root open={props.open} onOpenChange={props.onOpenChange}>
      <Dialog.Content placement="sheet" size="md" aria-describedby={undefined}>
        <Dialog.Header>
          <Dialog.Title className="text-title-sm">
            {props.title}
            <span className="px-1.5 text-muted">·</span>
            <span className={totalTone(model)}>
              {formatBps(model.totalBps)}
            </span>
          </Dialog.Title>
        </Dialog.Header>
        <Dialog.Body className="gap-4">
          {model.rows.length === 0 ? (
            <p className="text-body font-500 text-ink">Nothing on the ballot</p>
          ) : (
            <BallotSlots
              rows={model.rows}
              showFigures={props.showFigures}
              highlightId={props.highlightId}
              onStep={props.onStep}
              onRemove={props.onRemove}
              dense
            />
          )}
          <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-body-sm font-600 text-ink tabular-nums">
            Projected this epoch
            <span>
              {props.showFigures
                ? formatMicroUsd(model.projectedMicroUsd)
                : "—"}
            </span>
            {props.showFigures && model.native.length > 0 ? (
              <span className="font-500 text-secondary">
                · {formatNativeList(model.native)}
              </span>
            ) : null}
          </p>
          <div className="flex gap-2">
            <Button.Root
              variant="soft"
              size="lg"
              disabled={props.optimize.disabled}
              onClick={props.optimize.onPress}
              aria-label={props.optimize.label}
              title={props.optimize.label}
              className="h-12 w-12 rounded-[10px] px-0"
            >
              <Sparkles aria-hidden="true" size={17} strokeWidth={1.75} />
            </Button.Root>
            <Button.Root
              size="lg"
              disabled={props.primary.disabled}
              onClick={props.primary.onPress}
              className="h-12 flex-1 rounded-[10px] text-lead"
            >
              {props.primary.label}
            </Button.Root>
          </div>
        </Dialog.Body>
      </Dialog.Content>
    </Dialog.Root>
  )
}
