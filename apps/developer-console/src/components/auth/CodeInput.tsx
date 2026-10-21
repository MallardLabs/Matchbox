import { cn } from "@repo/ui/cn"
import {
  type InputHTMLAttributes,
  type ReactElement,
  forwardRef,
  useState,
} from "react"

export const codeLength = 6

type CodeInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "value" | "onChange" | "size"
> & {
  value: string
  onValueChange: (value: string) => void
}

/** Digits only, so pasted codes with spaces or dashes still work. */
export function cleanCode(raw: string): string {
  return raw.replace(/\D/g, "").slice(0, codeLength)
}

const slots = Array.from({ length: codeLength }, (_, index) => index)

/**
 * 6-digit email code drawn as six boxes. One real input sits on top, so
 * paste, one-time-code autofill and screen readers see a single field.
 */
const CodeInput = forwardRef<HTMLInputElement, CodeInputProps>(
  function CodeInput(
    { value, onValueChange, className, onFocus, onBlur, disabled, ...props },
    ref,
  ): ReactElement {
    const [focused, setFocused] = useState(false)
    const cursor = Math.min(value.length, codeLength - 1)
    return (
      <div className={cn("relative flex w-fit gap-2", className)}>
        {slots.map((slot) => {
          const digit = value[slot]
          const active = focused && slot === cursor
          return (
            <span
              key={slot}
              aria-hidden="true"
              className={cn(
                "flex h-12 w-11 items-center justify-center rounded-lg border bg-surface text-metric font-500 text-ink transition-colors sm:h-[58px] sm:w-[52px]",
                active
                  ? "border-accent shadow-[0_0_0_1px_var(--accent)]"
                  : "border-line-2",
                disabled && "opacity-60",
              )}
            >
              {digit ??
                (active ? (
                  <span className="h-6 w-px animate-pulse bg-ink motion-reduce:animate-none" />
                ) : null)}
            </span>
          )
        })}
        <input
          ref={ref}
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]{6}"
          maxLength={codeLength}
          spellCheck={false}
          disabled={disabled}
          className="absolute inset-0 h-full w-full cursor-text appearance-none rounded-lg border-0 bg-transparent text-transparent caret-transparent opacity-0 outline-none"
          value={value}
          onFocus={(event) => {
            setFocused(true)
            onFocus?.(event)
          }}
          onBlur={(event) => {
            setFocused(false)
            onBlur?.(event)
          }}
          onChange={(event) => onValueChange(cleanCode(event.target.value))}
          onPaste={(event) => {
            const pasted = cleanCode(event.clipboardData.getData("text"))
            if (pasted.length > 0) {
              event.preventDefault()
              onValueChange(pasted)
            }
          }}
          {...props}
        />
      </div>
    )
  },
)

export default CodeInput
