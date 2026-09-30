import * as Button from "@repo/ui/button"
import * as Field from "@repo/ui/field"
import * as Fieldset from "@repo/ui/fieldset"
import { type FormEvent, type ReactElement, useState } from "react"
import { errorMessage } from "../../lib/api-client"
import CodeInput from "./CodeInput"

type EmailCodeFormProps = {
  email: string
  pending: boolean
  error: unknown
  onVerify: (code: string) => void
  onResend: () => void
  resending: boolean
  onBack: () => void
}

/** Step: enter the 6-digit code sent to `email`. */
export default function EmailCodeForm({
  email,
  pending,
  error,
  onVerify,
  onResend,
  resending,
  onBack,
}: EmailCodeFormProps): ReactElement {
  const [code, setCode] = useState("")

  function submit(event: FormEvent): void {
    event.preventDefault()
    if (code.length === 6) onVerify(code)
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <Fieldset.Root disabled={pending}>
        <Fieldset.Legend hidden>Email code</Fieldset.Legend>
        <Fieldset.Fields>
          <Field.Root required>
            <Field.Label>Code</Field.Label>
            <Field.Control>
              <CodeInput value={code} onValueChange={setCode} autoFocus />
            </Field.Control>
            <Field.Description>
              <span className="font-mono">{email}</span>
            </Field.Description>
            <Field.Error>{error ? errorMessage(error) : null}</Field.Error>
          </Field.Root>
        </Fieldset.Fields>
      </Fieldset.Root>
      <Button.Root
        type="submit"
        size="lg"
        loading={pending}
        disabled={code.length !== 6}
      >
        Verify
      </Button.Root>
      <p className="flex items-center justify-between text-[13px]">
        <Button.Root variant="ghost" size="sm" onClick={onBack}>
          Change email
        </Button.Root>
        <Button.Root
          variant="ghost"
          size="sm"
          loading={resending}
          onClick={onResend}
        >
          Resend code
        </Button.Root>
      </p>
    </form>
  )
}
