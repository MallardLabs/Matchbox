import type { PasskeyRegistrationOptionsResponse } from "@repo/platform-contracts/console"
import * as Button from "@repo/ui/button"
import * as Field from "@repo/ui/field"
import * as Fieldset from "@repo/ui/fieldset"
import * as Input from "@repo/ui/input"
import { useMutation } from "@tanstack/react-query"
import { Link, createFileRoute } from "@tanstack/react-router"
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
import { ApiError, errorMessage } from "../../lib/api-client"
import { useTitle } from "../../lib/title"
import {
  PasskeyError,
  createPasskey,
  passkeysSupported,
} from "../../lib/webauthn"

type SignUpSearch = { invitation?: string }

export const Route = createFileRoute("/_auth/sign-up")({
  validateSearch: (search: Record<string, unknown>): SignUpSearch =>
    typeof search.invitation === "string"
      ? { invitation: search.invitation }
      : {},
  component: SignUpPage,
})

type Step =
  | { kind: "details" }
  | { kind: "code"; challengeId: string; sentAt: number }
  | { kind: "passkey"; registration: PasskeyRegistrationOptionsResponse }

const order: Record<Step["kind"], number> = { details: 1, code: 2, passkey: 3 }

function stateOf(step: Step, index: number): AuthStepState {
  const current = order[step.kind]
  if (index < current) return "done"
  return index === current ? "active" : "upcoming"
}

function SignUpPage(): ReactElement {
  useTitle("Create account")
  const { invitation } = Route.useSearch()
  const complete = useCompleteSignIn(
    invitation === undefined
      ? "/"
      : `/invite/${encodeURIComponent(invitation)}`,
  )
  const [step, setStep] = useState<Step>({ kind: "details" })
  const [email, setEmail] = useState("")
  const [displayName, setDisplayName] = useState("")
  const [organizationName, setOrganizationName] = useState("")

  const start = useMutation({
    mutationFn: () =>
      api.auth.signUpStart({
        email: email.trim(),
        displayName: displayName.trim(),
        ...(invitation === undefined ? {} : { invitationToken: invitation }),
      }),
    onSuccess: (challenge) =>
      setStep({
        kind: "code",
        challengeId: challenge.challengeId,
        sentAt: Date.now(),
      }),
  })
  const verify = useMutation({
    mutationFn: (input: { challengeId: string; code: string }) =>
      api.auth.signUpVerify(input),
    onSuccess: (registration) => setStep({ kind: "passkey", registration }),
  })
  const register = useMutation({
    mutationFn: async (registration: PasskeyRegistrationOptionsResponse) => {
      const credential = await createPasskey(registration.options)
      const organization = organizationName.trim()
      return api.auth.registerPasskey({
        challengeId: registration.challengeId,
        credential,
        ...(invitation === undefined && organization !== ""
          ? { organizationName: organization }
          : {}),
      })
    },
    onSuccess: complete,
  })

  function submitDetails(event: FormEvent): void {
    event.preventDefault()
    if (email.trim() === "" || displayName.trim() === "") return
    start.mutate()
  }

  function submitPasskey(event: FormEvent): void {
    event.preventDefault()
    if (step.kind === "passkey") register.mutate(step.registration)
  }

  const fieldError = (path: string): string | null =>
    start.error instanceof ApiError ? start.error.issueFor(path) : null
  const registerCancelled =
    register.error instanceof PasskeyError &&
    register.error.reason === "cancelled"

  const passkeyActive = step.kind === "passkey"

  return (
    <>
      <AuthHeading title="Create account" back />
      <AuthSteps label="Sign-up steps">
        <AuthStep index={1} title="Details" state={stateOf(step, 1)}>
          {step.kind === "details" ? (
            <form
              onSubmit={submitDetails}
              className="flex flex-col gap-4"
              noValidate
            >
              <Fieldset.Root disabled={start.isPending}>
                <Fieldset.Legend hidden>Account</Fieldset.Legend>
                <Fieldset.Fields>
                  <Field.Root required>
                    <Field.Label>Email</Field.Label>
                    <Field.Control>
                      <Input.Root
                        type="email"
                        size="lg"
                        autoComplete="email"
                        value={email}
                        className="h-11 bg-surface"
                        onChange={(event) => setEmail(event.target.value)}
                      />
                    </Field.Control>
                    <Field.Error>{fieldError("email")}</Field.Error>
                  </Field.Root>
                  <Field.Root required>
                    <Field.Label>Name</Field.Label>
                    <Field.Control>
                      <Input.Root
                        size="lg"
                        autoComplete="name"
                        maxLength={80}
                        value={displayName}
                        className="h-11 bg-surface"
                        onChange={(event) => setDisplayName(event.target.value)}
                      />
                    </Field.Control>
                    <Field.Error>{fieldError("displayName")}</Field.Error>
                  </Field.Root>
                </Fieldset.Fields>
              </Fieldset.Root>
              {start.isError &&
              start.error instanceof ApiError &&
              start.error.issues.length > 0 ? null : start.isError ? (
                <p role="alert" className="text-label font-500 text-neg">
                  {errorMessage(start.error)}
                </p>
              ) : null}
              <Button.Root
                type="submit"
                size="lg"
                loading={start.isPending}
                disabled={email.trim() === "" || displayName.trim() === ""}
                className="h-11"
              >
                Send code
              </Button.Root>
            </form>
          ) : (
            <p className="flex items-center gap-2 text-body-sm text-ink">
              <span className="min-w-0 flex-1 truncate">
                {`${displayName.trim()} · ${email.trim()}`}
              </span>
              <Button.Root
                variant="ghost"
                size="sm"
                onClick={() => {
                  verify.reset()
                  register.reset()
                  setStep({ kind: "details" })
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
        <AuthStep index={3} title="Passkey" state={stateOf(step, 3)}>
          <form
            onSubmit={submitPasskey}
            className="flex flex-col gap-3"
            noValidate
          >
            {invitation === undefined ? (
              <Field.Root>
                <Field.Label>Organization</Field.Label>
                <Field.Control>
                  <Input.Root
                    size="lg"
                    autoComplete="organization"
                    maxLength={80}
                    placeholder={displayName.trim()}
                    disabled={!passkeyActive || register.isPending}
                    value={organizationName}
                    className="h-11 bg-surface"
                    onChange={(event) =>
                      setOrganizationName(event.target.value)
                    }
                  />
                </Field.Control>
              </Field.Root>
            ) : null}
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
                role={registerCancelled ? "status" : "alert"}
                className={
                  registerCancelled
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
      <p className="mt-6 text-body-sm text-secondary">
        Have an account?{" "}
        <Link
          to="/sign-in"
          className="font-600 text-accent-ink hover:underline"
        >
          Sign in
        </Link>
      </p>
    </>
  )
}
