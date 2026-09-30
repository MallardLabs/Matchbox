import type { PasskeyRegistrationOptionsResponse } from "@repo/platform-contracts/console"
import * as Button from "@repo/ui/button"
import * as Field from "@repo/ui/field"
import * as Fieldset from "@repo/ui/fieldset"
import * as Input from "@repo/ui/input"
import { useMutation } from "@tanstack/react-query"
import { Link, createFileRoute } from "@tanstack/react-router"
import { Fingerprint } from "lucide-react"
import { type FormEvent, type ReactElement, useState } from "react"
import AuthHeading from "../../components/auth/AuthHeading"
import EmailCodeForm from "../../components/auth/EmailCodeForm"
import useCompleteSignIn from "../../components/auth/use-complete-sign-in"
import * as api from "../../lib/api"
import { errorMessage } from "../../lib/api-client"
import { useTitle } from "../../lib/title"
import {
  PasskeyError,
  createPasskey,
  passkeysSupported,
} from "../../lib/webauthn"

export const Route = createFileRoute("/_auth/recover")({
  component: RecoverPage,
})

type Step =
  | { kind: "email" }
  | { kind: "code"; challengeId: string }
  | { kind: "passkey"; registration: PasskeyRegistrationOptionsResponse }

function RecoverPage(): ReactElement {
  useTitle("Recover account")
  const complete = useCompleteSignIn("/account")
  const [step, setStep] = useState<Step>({ kind: "email" })
  const [email, setEmail] = useState("")
  const [passkeyName, setPasskeyName] = useState("")

  const start = useMutation({
    mutationFn: () => api.auth.recoveryStart({ email: email.trim() }),
    onSuccess: (challenge) =>
      setStep({ kind: "code", challengeId: challenge.challengeId }),
  })
  const verify = useMutation({
    mutationFn: (input: { challengeId: string; code: string }) =>
      api.auth.recoveryVerify(input),
    onSuccess: (registration) => setStep({ kind: "passkey", registration }),
  })
  const register = useMutation({
    mutationFn: async (registration: PasskeyRegistrationOptionsResponse) => {
      const credential = await createPasskey(registration.options)
      const name = passkeyName.trim()
      return api.auth.registerPasskey({
        challengeId: registration.challengeId,
        credential,
        ...(name === "" ? {} : { name }),
      })
    },
    onSuccess: complete,
  })

  function submitEmail(event: FormEvent): void {
    event.preventDefault()
    if (email.trim() !== "") start.mutate()
  }

  function submitPasskey(event: FormEvent): void {
    event.preventDefault()
    if (step.kind === "passkey") register.mutate(step.registration)
  }

  const cancelled =
    register.error instanceof PasskeyError &&
    register.error.reason === "cancelled"

  return (
    <>
      {step.kind === "email" ? (
        <>
          <AuthHeading
            title="Recover account"
            step={{ current: 1, total: 3 }}
          />
          <form
            onSubmit={submitEmail}
            className="flex flex-col gap-4"
            noValidate
          >
            <Fieldset.Root disabled={start.isPending}>
              <Fieldset.Legend hidden>Account email</Fieldset.Legend>
              <Fieldset.Fields>
                <Field.Root required>
                  <Field.Label>Email</Field.Label>
                  <Field.Control>
                    <Input.Root
                      type="email"
                      size="lg"
                      autoComplete="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                    />
                  </Field.Control>
                  <Field.Error>
                    {start.isError ? errorMessage(start.error) : null}
                  </Field.Error>
                </Field.Root>
              </Fieldset.Fields>
            </Fieldset.Root>
            <Button.Root
              type="submit"
              size="lg"
              loading={start.isPending}
              disabled={email.trim() === ""}
            >
              Send code
            </Button.Root>
          </form>
        </>
      ) : null}
      {step.kind === "code" ? (
        <>
          <AuthHeading
            title="Check your email"
            step={{ current: 2, total: 3 }}
          />
          <EmailCodeForm
            email={email.trim()}
            pending={verify.isPending}
            error={verify.error}
            onVerify={(code) =>
              verify.mutate({ challengeId: step.challengeId, code })
            }
            resending={start.isPending}
            onResend={() => start.mutate()}
            onBack={() => {
              verify.reset()
              setStep({ kind: "email" })
            }}
          />
        </>
      ) : null}
      {step.kind === "passkey" ? (
        <>
          <AuthHeading title="New passkey" step={{ current: 3, total: 3 }} />
          <form
            onSubmit={submitPasskey}
            className="flex flex-col gap-4"
            noValidate
          >
            <Fieldset.Root disabled={register.isPending}>
              <Fieldset.Legend hidden>Passkey</Fieldset.Legend>
              <Fieldset.Fields>
                <Field.Root>
                  <Field.Label>Passkey name</Field.Label>
                  <Field.Control>
                    <Input.Root
                      size="lg"
                      maxLength={64}
                      autoComplete="off"
                      placeholder="Laptop"
                      value={passkeyName}
                      onChange={(event) => setPasskeyName(event.target.value)}
                    />
                  </Field.Control>
                </Field.Root>
              </Fieldset.Fields>
            </Fieldset.Root>
            <Button.Root
              type="submit"
              size="lg"
              loading={register.isPending}
              disabled={!passkeysSupported()}
            >
              <Fingerprint aria-hidden="true" size={15} strokeWidth={1.75} />
              Create passkey
            </Button.Root>
            {register.isError ? (
              <p
                role={cancelled ? "status" : "alert"}
                className={
                  cancelled
                    ? "text-[12px] text-secondary"
                    : "text-[12px] font-500 text-neg"
                }
              >
                {errorMessage(register.error)}
              </p>
            ) : null}
          </form>
        </>
      ) : null}
      <p className="mt-6 border-t border-line pt-4 text-[13px]">
        <Link to="/sign-in" className="font-600 text-accent-ink">
          Sign in
        </Link>
      </p>
    </>
  )
}
