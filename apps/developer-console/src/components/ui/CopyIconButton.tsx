import { cn } from "@repo/ui/cn"
import { useCopy } from "@repo/ui/use-copy"
import { Check, Copy, X } from "lucide-react"
import type { ReactElement } from "react"

/** Icon copy button with a polite announcement (ids, endpoints). */
export default function CopyIconButton({
  value,
  label,
  className,
}: {
  value: string
  /** What is copied, for the accessible name ("app ID"). */
  label: string
  className?: string | undefined
}): ReactElement {
  const { state, copy } = useCopy(value)
  return (
    <>
      <button
        type="button"
        aria-label={`Copy ${label}`}
        onClick={() => void copy()}
        className={cn(
          "inline-flex size-7 shrink-0 items-center justify-center rounded-md text-secondary transition-colors hover:bg-inset hover:text-ink",
          state === "copied" && "text-pos hover:text-pos",
          state === "failed" && "text-neg hover:text-neg",
          className,
        )}
      >
        {state === "copied" ? (
          <Check aria-hidden="true" size={14} strokeWidth={2} />
        ) : state === "failed" ? (
          <X aria-hidden="true" size={14} strokeWidth={2} />
        ) : (
          <Copy aria-hidden="true" size={14} strokeWidth={1.75} />
        )}
      </button>
      <span aria-live="polite" className="sr-only">
        {state === "copied"
          ? `${label} copied`
          : state === "failed"
            ? `${label} copy failed`
            : ""}
      </span>
    </>
  )
}
