import { cn } from "@repo/ui/cn"
import type { ReactElement, ReactNode } from "react"

export type ChipOption<Value extends string> = {
  value: Value
  label: ReactNode
  /** Accessible name when the label is abbreviated ("7 d"). */
  ariaLabel?: string
}

export function chipClass(selected: boolean): string {
  return cn(
    "inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border px-3 text-label transition-colors",
    selected
      ? "border-accent bg-accent-soft font-600 text-accent-ink"
      : "border-line bg-inset font-500 text-secondary hover:border-line-2 hover:text-ink",
  )
}

/** Single-choice filter chips (ranges, states). Buttons with aria-pressed. */
export default function ChipGroup<Value extends string>({
  label,
  value,
  options,
  onChange,
  className,
}: {
  /** Accessible name of the group ("Range"). */
  label: string
  value: Value
  options: ChipOption<Value>[]
  onChange: (value: Value) => void
  className?: string | undefined
}): ReactElement {
  return (
    <fieldset
      className={cn(
        "m-0 flex min-w-0 flex-wrap items-center gap-2 border-0 p-0",
        className,
      )}
    >
      <legend className="sr-only">{label}</legend>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={option.value === value}
          aria-label={option.ariaLabel}
          onClick={() => onChange(option.value)}
          className={chipClass(option.value === value)}
        >
          {option.label}
        </button>
      ))}
    </fieldset>
  )
}
