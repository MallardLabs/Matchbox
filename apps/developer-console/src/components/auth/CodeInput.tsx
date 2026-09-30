import * as Input from "@repo/ui/input"
import { type InputHTMLAttributes, type ReactElement, forwardRef } from "react"

type CodeInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "value" | "onChange" | "size"
> & {
  value: string
  onValueChange: (value: string) => void
}

/** 6-digit email code; accepts pasted codes with spaces or dashes. */
const CodeInput = forwardRef<HTMLInputElement, CodeInputProps>(
  function CodeInput({ value, onValueChange, ...props }, ref): ReactElement {
    return (
      <Input.Root
        ref={ref}
        size="lg"
        mono
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]{6}"
        maxLength={6}
        spellCheck={false}
        className="text-center text-[20px] tracking-[0.5em]"
        value={value}
        onChange={(event) =>
          onValueChange(event.target.value.replace(/\D/g, "").slice(0, 6))
        }
        onPaste={(event) => {
          const pasted = event.clipboardData.getData("text").replace(/\D/g, "")
          if (pasted.length >= 6) {
            event.preventDefault()
            onValueChange(pasted.slice(0, 6))
          }
        }}
        {...props}
      />
    )
  },
)

export default CodeInput
