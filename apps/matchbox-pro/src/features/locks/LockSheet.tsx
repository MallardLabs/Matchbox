import * as Button from "@repo/ui/button"
import { cn } from "@repo/ui/cn"
import * as Dialog from "@repo/ui/dialog"
import { TriangleAlert } from "lucide-react"
import type { ReactElement, ReactNode } from "react"

/** Bottom sheet chrome shared by the lock flows (Pen 14, 15b, 20, 21, J03). */
export default function LockSheet({
  title,
  description,
  size = "sm",
  onClose,
  children,
}: {
  title: string
  description: string | null
  size?: Dialog.DialogSize
  onClose: () => void
  children: ReactNode
}): ReactElement {
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <Dialog.Content
        placement="sheet"
        size={size}
        {...(description === null ? { "aria-describedby": undefined } : {})}
      >
        <Dialog.Header className="gap-0.5">
          <Dialog.Title className="font-500">{title}</Dialog.Title>
          {description === null ? null : (
            <Dialog.Description className="text-label font-500 text-muted">
              {description}
            </Dialog.Description>
          )}
        </Dialog.Header>
        {children}
      </Dialog.Content>
    </Dialog.Root>
  )
}

export function SheetFooter({
  onCancel,
  children,
}: {
  onCancel: () => void
  children: ReactNode
}): ReactElement {
  return (
    <div className="flex items-center justify-end gap-2 pt-1">
      <Button.Root
        variant="ghost"
        size="lg"
        className="h-9 bg-inset px-3.5 font-500"
        onClick={onCancel}
      >
        Cancel
      </Button.Root>
      {children}
    </div>
  )
}

export function WarningNote({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}): ReactElement {
  return (
    <p
      className={cn(
        "m-0 flex items-start gap-2 rounded-lg bg-accent-soft px-3 py-2.5 text-body-sm font-500 text-ink-2",
        className,
      )}
    >
      <TriangleAlert
        aria-hidden="true"
        size={14}
        strokeWidth={1.75}
        className="mt-0.5 shrink-0 text-accent-ink"
      />
      <span>{children}</span>
    </p>
  )
}

export function ErrorNote({
  message,
}: { message: string | null }): ReactElement {
  return (
    <p
      role="alert"
      className={cn(
        "m-0 text-pretty text-body-sm font-500 text-neg",
        message === null && "sr-only",
      )}
    >
      {message ?? ""}
    </p>
  )
}
