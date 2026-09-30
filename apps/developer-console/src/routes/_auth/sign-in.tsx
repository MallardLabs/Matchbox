import * as Button from "@repo/ui/button"
import * as Field from "@repo/ui/field"
import * as Fieldset from "@repo/ui/fieldset"
import * as Input from "@repo/ui/input"
import { useMutation } from "@tanstack/react-query"
import { Link, createFileRoute } from "@tanstack/react-router"
import { Fingerprint } from "lucide-react"
import { type FormEvent, type ReactElement, useEffect, useState } from "react"
import AuthHeading from "../../components/auth/AuthHeading"
import useCompleteSignIn from "../../components/auth/use-complete-sign-in"
import * as api from "../../lib/api"
import { errorMessage } from "../../lib/api-client"
import { useTitle } from "../../lib/title"
import {
  PasskeyError,
  assertPasskey,
  autofillSupported,
  cancelPasskeyCeremony,
  passkeysSupported,
} from "../../lib/webauthn"

type SignInSearch = { redirect?: string }

export const Route = createFileRoute("/_auth/sign-in")({
  validateSearch: (search: Record<string, unknown>): SignInSearch =>
    typeof search.redirect === "string" ? { redirect: search.redirect } : {},
  component: SignInPage,
})

async function passkeySignIn(mode: "modal" | "autofill") {
  const { challengeId, options } = await api.auth.authenticationOptions()
  const credential = await assertPasskey(options, mode)
  return api.auth.authenticate({ challengeId, credential })
}

function SignInPage(): ReactElement {
  useTitle("Sign in")
  const { redirect } = Route.useSearch()
  const complete = useCompleteSignIn(redirect)
  const [email, setEmail] = useState("")
  const supported = passkeysSupported()

  const signIn = useMutation({
    mutationFn: () => passkeySignIn("modal"),
    onSuccess: complete,
  })
  const devSignIn = useMutation({
    mutationFn: () => api.auth.devSignIn(),
    onSuccess: complete,
  })

  useEffect(() => {
    let active = true
    async function startAutofill(): Promise<void> {
      if (!(await autofillSupported()) || !active) return
      try {
        const me = await passkeySignIn("autofill")
        if (active) await complete(me)
      } catch {
        // Autofill is best-effort; the button reports errors.
      }
    }
    void startAutofill()
    return () => {
      active = false
      cancelPasskeyCeremony()
    }
  }, [complete])

  function submit(event: FormEvent): void {
    event.preventDefault()
    signIn.mutate()
  }

  const cancelled =
    signIn.error instanceof PasskeyError && signIn.error.reason === "cancelled"
  const error = signIn.isError && !cancelled ? errorMessage(signIn.error) : null

  return (
    <>
      <AuthHeading title="Sign in" />
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <Fieldset.Root>
          <Fieldset.Legend hidden>Passkey sign-in</Fieldset.Legend>
          <Fieldset.Fields>
            <Field.Root>
              <Field.Label>Email</Field.Label>
              <Field.Control>
                <Input.Root
                  type="email"
                  size="lg"
                  autoComplete="username webauthn"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </Field.Control>
            </Field.Root>
          </Fieldset.Fields>
        </Fieldset.Root>
        <Button.Root
          type="submit"
          size="lg"
          loading={signIn.isPending}
          disabled={!supported}
        >
          <Fingerprint aria-hidden="true" size={15} strokeWidth={1.75} />
          Sign in with passkey
        </Button.Root>
        {supported ? null : (
          <p role="alert" className="text-[12px] font-500 text-neg">
            Passkeys are not supported in this browser.
          </p>
        )}
        {error === null ? null : (
          <p role="alert" className="text-[12px] font-500 text-neg">
            {error}
          </p>
        )}
      </form>
      <nav
        aria-label="Account"
        className="mt-6 flex items-center justify-between border-t border-line pt-4 text-[13px]"
      >
        <Link to="/recover" className="font-550 text-secondary hover:text-ink">
          Lost passkey
        </Link>
        <Link to="/sign-up" className="font-600 text-accent-ink">
          Create account
        </Link>
      </nav>
      {import.meta.env.DEV ? (
        <section aria-label="Development" className="mt-8 flex flex-col gap-2">
          <Button.Root
            variant="soft"
            loading={devSignIn.isPending}
            onClick={() => devSignIn.mutate()}
          >
            Dev sign-in
          </Button.Root>
          {devSignIn.isError ? (
            <p role="alert" className="text-[12px] font-500 text-neg">
              {errorMessage(devSignIn.error)}
            </p>
          ) : null}
        </section>
      ) : null}
    </>
  )
}
