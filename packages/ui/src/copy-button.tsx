import { Check, Copy, X } from "lucide-react"
import { type ButtonHTMLAttributes, type ReactElement, forwardRef } from "react"
import { cn } from "./cn"
import { useCopy } from "./use-copy"

const COPY_BUTTON_NAME = "CopyButton"

export type CopyButtonProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "value" | "onClick"
> & {
  value: string
  /** What is being copied, for the accessible name ("Copy client ID"). */
  label: string
  /** Show "Copy"/"Copied" text next to the icon. */
  showText?: boolean
}

/** Icon button with copied state and a polite live announcement. */
export const CopyButton = forwardRef<HTMLButtonElement, CopyButtonProps>(
  function CopyButton(
    { value, label, showText = false, className, ...props },
    ref,
  ): ReactElement {
    const { state, copy } = useCopy(value)
    const text =
      state === "copied"
        ? "Copied"
        : state === "failed"
          ? "Copy failed"
          : "Copy"
    return (
      <>
        <button
          ref={ref}
          type="button"
          aria-label={showText ? undefined : `Copy ${label}`}
          onClick={() => void copy()}
          className={cn(
            "inline-flex h-7 shrink-0 items-center justify-center gap-1.5 rounded-md text-[12px] font-550 text-secondary transition-colors hover:bg-inset hover:text-ink",
            showText ? "px-2" : "w-7",
            state === "copied" && "text-pos hover:text-pos",
            state === "failed" && "text-neg hover:text-neg",
            className,
          )}
          {...props}
        >
          {state === "copied" ? (
            <Check aria-hidden="true" size={14} strokeWidth={2} />
          ) : state === "failed" ? (
            <X aria-hidden="true" size={14} strokeWidth={2} />
          ) : (
            <Copy aria-hidden="true" size={14} strokeWidth={1.75} />
          )}
          {showText ? text : null}
        </button>
        <span aria-live="polite" className="sr-only">
          {state === "idle" ? "" : `${label}: ${text}`}
        </span>
      </>
    )
  },
)
CopyButton.displayName = COPY_BUTTON_NAME
