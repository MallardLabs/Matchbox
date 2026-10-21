import type { PasskeyRegistrationOptionsResponse } from "@repo/platform-contracts/console"
import * as Button from "@repo/ui/button"
import * as Field from "@repo/ui/field"
import * as Input from "@repo/ui/input"
import { useMutation } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { KeyRound } from "lucide-react"
import { type FormEvent, type ReactElement, useState } from "react"
import AuthHeading from "../../components/auth/AuthHeading"
import {
  AuthStep,
  type AuthStepState,
  AuthSteps,
} from "../../components/auth/AuthSteps"
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
  | { kind: "code"; challengeId: string; sentAt: number }
  | { kind: "passkey"; registration: PasskeyRegistrationOptionsResponse }

const order: Record<Step["kind"], number> = { email: 1, code: 2, passkey: 3 }

function stateOf(step: Step, index: number): AuthStepState {
  const current = order[step.kind]
  if (index < current) return "done"
  return index === current ? "active" : "upcoming"
}

/** C01b: email → 6-digit code → new passkey, as one stepped page. */
function RecoverPage(): ReactElement {
  useTitle("Recover account")
  const complete = useCompleteSignIn("/account")
  const [step, setStep] = useState<Step>({ kind: "email" })
  const [email, setEmail] = useState("")
  const [passkeyName, setPasskeyName] = useState("")

  const start = useMutation({
    mutationFn: () => api.auth.recoveryStart({ email: email.trim() }),
    onSuccess: (challenge) =>
      setStep({
        kind: "code",
        challengeId: challenge.challengeId,
        sentAt: Date.now(),
      }),
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
  const passkeyActive = step.kind === "passkey"

  return (
    <>
      <AuthHeading title="Recover account" back />
      <AuthSteps label="Recovery steps">
        <AuthStep index={1} title="Email" state={stateOf(step, 1)}>
          {step.kind === "email" ? (
            <form
              onSubmit={submitEmail}
              className="flex flex-col gap-3"
              noValidate
            >
              <Field.Root required>
                <Field.Label className="sr-only">Email</Field.Label>
                <Field.Control>
                  <Input.Root
                    type="email"
                    size="lg"
                    autoComplete="email"
                    placeholder="you@example.com"
                    disabled={start.isPending}
                    value={email}
                    className="h-11 bg-surface"
                    onChange={(event) => setEmail(event.target.value)}
                  />
                </Field.Control>
                <Field.Error>
                  {start.isError ? errorMessage(start.error) : null}
                </Field.Error>
              </Field.Root>
              <Button.Root
                type="submit"
                size="lg"
                loading={start.isPending}
                disabled={email.trim() === ""}
                className="h-11"
              >
                Send code
              </Button.Root>
            </form>
          ) : (
            <p className="flex items-center gap-2 text-body-sm text-ink">
              <span className="min-w-0 flex-1 truncate">{email.trim()}</span>
              <Button.Root
                variant="ghost"
                size="sm"
                onClick={() => {
                  verify.reset()
                  register.reset()
                  setStep({ kind: "email" })
                }}
              >
                Change
              </Button.Root>
            </p>
          )}
        </AuthStep>
        <AuthStep index={2} title="Code" state={stateOf(step, 2)}>
          {step.kind === "code" ? (
            <EmailCodeForm
              key={step.challengeId}
              pending={verify.isPending}
              error={verify.error}
              onVerify={(code) =>
                verify.mutate({ challengeId: step.challengeId, code })
              }
              resending={start.isPending}
              onResend={() => {
                verify.reset()
                start.mutate()
              }}
              sentAt={step.sentAt}
            />
          ) : step.kind === "passkey" ? (
            <p className="text-body-sm text-secondary">Verified</p>
          ) : undefined}
        </AuthStep>
        <AuthStep index={3} title="New passkey" state={stateOf(step, 3)}>
          <form
            onSubmit={submitPasskey}
            className="flex flex-col gap-3"
            noValidate
          >
            <Field.Root>
              <Field.Label>Passkey name</Field.Label>
              <Field.Control>
                <Input.Root
                  size="lg"
                  maxLength={64}
                  autoComplete="off"
                  placeholder="Laptop"
                  disabled={!passkeyActive || register.isPending}
                  value={passkeyName}
                  className="h-11 bg-surface"
                  onChange={(event) => setPasskeyName(event.target.value)}
                />
              </Field.Control>
            </Field.Root>
            <Button.Root
              type="submit"
              size="lg"
              loading={register.isPending}
              disabled={!passkeyActive || !passkeysSupported()}
              className="h-11"
            >
              {register.isPending ? null : (
                <KeyRound aria-hidden="true" size={15} strokeWidth={1.75} />
              )}
              Create passkey
            </Button.Root>
            {register.isError ? (
              <p
                role={cancelled ? "status" : "alert"}
                className={
                  cancelled
                    ? "text-label text-secondary"
                    : "text-label font-500 text-neg"
                }
              >
                {errorMessage(register.error)}
              </p>
            ) : null}
          </form>
        </AuthStep>
      </AuthSteps>
    </>
  )
}
