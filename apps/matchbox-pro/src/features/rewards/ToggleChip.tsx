import { cn } from "@repo/ui/cn"
import type { ButtonHTMLAttributes, ReactElement } from "react"

type ToggleChipProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  pressed: boolean
  /** outline: period/scope chips. solid: kind filters. */
  tone?: "outline" | "solid"
}

/** Single-choice chip; the group around it carries the accessible name. */
export default function ToggleChip({
  pressed,
  tone = "outline",
  className,
  ...props
}: ToggleChipProps): ReactElement {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      className={cn(
        "inline-flex shrink-0 items-center whitespace-nowrap rounded-md text-label transition-colors",
        tone === "outline"
          ? cn(
              "h-8 border px-3",
              pressed
                ? "border-accent bg-accent-soft font-600 text-accent-ink"
                : "border-line bg-inset font-500 text-secondary hover:text-ink",
            )
          : cn(
              "h-7 px-2.5",
              pressed
                ? "bg-ink font-600 text-canvas"
                : "bg-inset font-500 text-secondary hover:text-ink",
            ),
        className,
      )}
      {...props}
    />
  )
}
