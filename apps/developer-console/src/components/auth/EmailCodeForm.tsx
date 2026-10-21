import * as Field from "@repo/ui/field"
import { type ReactElement, useEffect, useState } from "react"
import { errorMessage } from "../../lib/api-client"
import CodeInput, { codeLength } from "./CodeInput"

/** Seconds before "Resend" unlocks again. */
export const resendCooldownSeconds = 60

type EmailCodeFormProps = {
  pending: boolean
  error: unknown
  /** Called once all six digits are in. */
  onVerify: (code: string) => void
  onResend: () => void
  resending: boolean
  /** Time the current code was sent; restarts the resend countdown. */
  sentAt: number
}

function useSecondsLeft(from: number, seconds: number): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])
  return Math.max(0, Math.ceil(seconds - (now - from) / 1000))
}

/** "0:42" */
export function formatCountdown(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`
}

/** Code step body (C01b): six boxes, validity, resend countdown. */
export default function EmailCodeForm({
  pending,
  error,
  onVerify,
  onResend,
  resending,
  sentAt,
}: EmailCodeFormProps): ReactElement {
  const [code, setCode] = useState("")
  const left = useSecondsLeft(sentAt, resendCooldownSeconds)

  function change(next: string): void {
    setCode(next)
    if (next.length === codeLength && !pending) onVerify(next)
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        if (code.length === codeLength) onVerify(code)
      }}
      className="flex flex-col gap-2.5"
      noValidate
    >
      <Field.Root required>
        <Field.Label className="sr-only">Code</Field.Label>
        <Field.Control>
          <CodeInput
            value={code}
            onValueChange={change}
            disabled={pending}
            autoFocus
          />
        </Field.Control>
        <Field.Error>{error ? errorMessage(error) : null}</Field.Error>
      </Field.Root>
      <p className="flex items-center gap-2 text-caption text-muted">
        <span aria-live="polite">
          {pending ? "Checking…" : "6 digits · 15 min"}
        </span>
        <span className="flex-1" />
        <button
          type="button"
          disabled={left > 0 || resending}
          onClick={() => {
            setCode("")
            onResend()
          }}
          className="font-500 text-secondary enabled:hover:text-ink disabled:cursor-default"
        >
          Resend
        </button>
        {left > 0 ? (
          <span className="font-mono text-label text-ink-2">
            {formatCountdown(left)}
          </span>
        ) : null}
      </p>
    </form>
  )
}
