import { type HTMLAttributes, type ReactElement, forwardRef } from "react"
import { cn } from "./cn"

const ROOT_NAME = "Meter"

export type MeterTone = "accent" | "pos" | "neg" | "muted"

export type RootProps = HTMLAttributes<HTMLDivElement> & {
  /** 0–1; values outside are clamped. */
  fraction: number
  tone?: MeterTone
  /** Accessible description, e.g. "4.2× of 5× boost". */
  label: string
}

/** Thin progress bar (gauge boost toward 5×, ballot allocation). */
export const Root = forwardRef<HTMLDivElement, RootProps>(function Meter(
  { fraction, tone = "accent", label, className, ...props },
  ref,
): ReactElement {
  const clamped = Math.min(1, Math.max(0, fraction))
  return (
    <div
      ref={ref}
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clamped * 100)}
      className={cn("h-1.5 w-full overflow-hidden bg-inset-2", className)}
      {...props}
    >
      <span
        className={cn(
          "block h-full transition-[width] duration-200 ease-out",
          tone === "accent" && "bg-accent",
          tone === "pos" && "bg-pos",
          tone === "neg" && "bg-neg",
          tone === "muted" && "bg-line-2",
        )}
        style={{ width: `${clamped * 100}%` }}
      />
    </div>
  )
})
Root.displayName = ROOT_NAME
