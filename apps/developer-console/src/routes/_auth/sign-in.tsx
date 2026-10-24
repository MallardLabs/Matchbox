import * as Button from "@repo/ui/button"
import { useMutation } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { type ReactElement, useState } from "react"
import AuthHeading from "../../components/auth/AuthHeading"
import GoogleButton from "../../components/auth/GoogleButton"
import useCompleteSignIn from "../../components/auth/use-complete-sign-in"
import * as api from "../../lib/api"
import { errorMessage } from "../../lib/api-client"
import { useTitle } from "../../lib/title"

type SignInSearch = { redirect?: string; invitation?: string }

export const Route = createFileRoute("/_auth/sign-in")({
  validateSearch: (search: Record<string, unknown>): SignInSearch => ({
    ...(typeof search.redirect === "string"
      ? { redirect: search.redirect }
      : {}),
    ...(typeof search.invitation === "string"
      ? { invitation: search.invitation }
      : {}),
  }),
  component: SignInPage,
})

function SignInPage(): ReactElement {
  useTitle("Sign in")
  const { redirect, invitation } = Route.useSearch()
  const complete = useCompleteSignIn(
    redirect ?? (invitation === undefined ? undefined : "/organization"),
  )
  const [error, setError] = useState<string | null>(null)
  const devSignIn = useMutation({
    mutationFn: () => api.auth.devSignIn(),
    onSuccess: complete,
  })

  async function signIn(credential: string): Promise<void> {
    const me = await api.auth.googleSignIn({
      credential,
      ...(invitation === undefined ? {} : { invitationToken: invitation }),
    })
    await complete(me)
  }

  return (
    <>
      <AuthHeading
        title={invitation === undefined ? "Sign in" : "Invitation"}
      />
      <div className="flex flex-col gap-3.5">
        <GoogleButton
          purpose="sign-in"
          onCredential={signIn}
          onError={setError}
        />
        {error === null ? null : (
          <p role="alert" className="text-label font-500 text-neg">
            {error}
          </p>
        )}
      </div>
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
            <p role="alert" className="text-label font-500 text-neg">
              {errorMessage(devSignIn.error)}
            </p>
          ) : null}
        </section>
      ) : null}
    </>
  )
}
