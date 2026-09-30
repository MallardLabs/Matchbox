import * as AlertDialog from "@repo/ui/alert-dialog"
import * as Button from "@repo/ui/button"
import { type ReactElement, type ReactNode, useState } from "react"
import { errorMessage } from "../lib/api-client"
import { isStepUpCancelled } from "../lib/step-up"

type ConfirmDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  /** Exact target and consequence, e.g. "mbx_sk_live_AbC… stops working." */
  description: ReactNode
  confirmLabel: string
  tone?: "danger" | "primary"
  /** Rejections render inline; the dialog stays open. */
  onConfirm: () => Promise<unknown>
  confirmDisabled?: boolean
  children?: ReactNode
}

/** Destructive confirmation. Focus starts on Cancel and is restored on close. */
export default function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  tone = "danger",
  onConfirm,
  confirmDisabled = false,
  children,
}: ConfirmDialogProps): ReactElement {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function confirm(): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      await onConfirm()
      onOpenChange(false)
    } catch (caught) {
      if (!isStepUpCancelled(caught)) setError(errorMessage(caught))
    } finally {
      setBusy(false)
    }
  }

  return (
    <AlertDialog.Root
      open={open}
      onOpenChange={(next) => {
        if (busy) return
        if (!next) setError(null)
        onOpenChange(next)
      }}
    >
      <AlertDialog.Content>
        <AlertDialog.Header>
          <AlertDialog.Title>{title}</AlertDialog.Title>
          <AlertDialog.Description>{description}</AlertDialog.Description>
        </AlertDialog.Header>
        {children}
        {error === null ? null : (
          <p role="alert" className="text-[12px] font-500 text-neg">
            {error}
          </p>
        )}
        <AlertDialog.Footer>
          <AlertDialog.Cancel disabled={busy}>Cancel</AlertDialog.Cancel>
          <Button.Root
            variant={tone}
            loading={busy}
            disabled={confirmDisabled}
            onClick={() => void confirm()}
          >
            {confirmLabel}
          </Button.Root>
        </AlertDialog.Footer>
      </AlertDialog.Content>
    </AlertDialog.Root>
  )
}
