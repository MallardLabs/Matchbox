import { cn } from "@/lib/cn"
import * as Dialog from "@radix-ui/react-dialog"
import { X } from "lucide-react"
import type { ReactElement, ReactNode } from "react"

type SheetProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: ReactNode
  description?: ReactNode
  /** Extra controls rendered next to the close button. */
  actions?: ReactNode
  /** Centered column: "narrow" 520px (lock/claim flows), "medium" 640px (forms). */
  size?: "full" | "medium" | "narrow"
  className?: string
  children: ReactNode
}

/** Bottom sheet from the Pen checkout/claim/lock flows: full-width, 16px top radius, 40px gutters. */
export default function Sheet({
  open,
  onOpenChange,
  title,
  description,
  actions,
  size = "full",
  className,
  children,
}: SheetProps): ReactElement {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/60 data-[state=open]:animate-[fade-in_160ms_ease-out]" />
        <Dialog.Content
          {...(description ? {} : { "aria-describedby": undefined })}
          className={cn(
            "fixed inset-x-0 bottom-0 z-50 max-h-[85dvh] overflow-y-auto rounded-t-2xl bg-surface px-5 pb-[max(2rem,env(safe-area-inset-bottom))] pt-3 shadow-sheet sm:px-10",
            "data-[state=open]:animate-[sheet-in_200ms_cubic-bezier(0.2,0.8,0.2,1)]",
            className,
          )}
        >
          <span
            aria-hidden="true"
            className="mx-auto mb-3 block h-1 w-10 rounded-full bg-line-2"
          />
          <div
            className={cn(
              "mx-auto flex w-full flex-col gap-4",
              size === "narrow" && "max-w-[520px]",
              size === "medium" && "max-w-[640px]",
            )}
          >
            <header className="flex items-start justify-between gap-4">
              <div className="flex flex-col gap-1">
                <Dialog.Title className="text-[22px] font-650 text-ink">
                  {title}
                </Dialog.Title>
                {description ? (
                  <Dialog.Description className="text-[13px] text-secondary">
                    {description}
                  </Dialog.Description>
                ) : null}
              </div>
              <div className="flex items-center gap-2">
                {actions}
                <Dialog.Close
                  aria-label="Close"
                  className="flex size-8 items-center justify-center rounded-md text-muted transition-colors hover:bg-inset hover:text-ink"
                >
                  <X size={18} strokeWidth={1.75} />
                </Dialog.Close>
              </div>
            </header>
            {children}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
