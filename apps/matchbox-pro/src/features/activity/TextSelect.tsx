import { ChevronDown } from "lucide-react"
import type { ReactElement } from "react"

type TextSelectProps = {
  id: string
  label: string
  value: string
  options: ReadonlyArray<{ value: string; label: string }>
  onChange: (value: string) => void
}

/** Native select styled as inline muted text ("Last 8 ⌄"). */
export default function TextSelect({
  id,
  label,
  value,
  options,
  onChange,
}: TextSelectProps): ReactElement {
  return (
    <span className="relative inline-flex items-center">
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(change) => onChange(change.target.value)}
        className="cursor-pointer appearance-none rounded bg-transparent pr-4 text-label text-muted [field-sizing:content] hover:text-ink focus-visible:text-ink"
      >
        {options.map((option) => (
          // Explicit colors: the native list ignores the page theme on
          // Windows dark mode otherwise.
          <option
            key={option.value}
            value={option.value}
            className="bg-surface text-ink"
          >
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown
        aria-hidden="true"
        size={12}
        strokeWidth={1.75}
        className="pointer-events-none absolute right-0 text-muted"
      />
    </span>
  )
}
