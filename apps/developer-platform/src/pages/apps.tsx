import { IdentityShell } from "@/components/IdentityShell"
import { WalletAuthButton } from "@/components/WalletAuthButton"
import { supabase } from "@/config/supabase"
import { authenticatedFetch } from "@/lib/api"
import * as AlertDialog from "@radix-ui/react-alert-dialog"
import { useQuery } from "@tanstack/react-query"
import Head from "next/head"
import { useState } from "react"
import { z } from "zod"

const appsResponseSchema = z.object({
  walletAddress: z.string(),
  grants: z.array(
    z.object({
      id: z.uuid(),
      scopes: z.array(z.string()),
      authorizedAt: z.string(),
      lastAccessedAt: z.string().nullable(),
      app: z.object({
        name: z.string(),
        logoUrl: z.string().nullable(),
        websiteUrl: z.string().nullable(),
        privacyPolicyUrl: z.string().nullable(),
      }),
    }),
  ),
})

export default function ConnectedAppsPage(): JSX.Element {
  const [revokeError, setRevokeError] = useState<string | null>(null)
  const appsQuery = useQuery({
    queryKey: ["connected-apps"],
    retry: false,
    queryFn: async () => {
      const response = await authenticatedFetch("/api/identity/apps")
      if (!response.ok)
        throw new Error(
          response.status === 401 ? "sign-in-required" : "load-failed",
        )
      const rawData: unknown = await response.json()
      return appsResponseSchema.parse(rawData)
    },
  })

  async function revoke(grantId: string): Promise<void> {
    setRevokeError(null)
    const response = await authenticatedFetch("/api/identity/apps", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ grantId }),
    })
    if (!response.ok) {
      setRevokeError("Matchbox could not revoke this app. Please try again.")
      return
    }
    await appsQuery.refetch()
  }

  async function signOut(): Promise<void> {
    await supabase.auth.signOut()
    await appsQuery.refetch()
  }

  const needsSignIn = appsQuery.error?.message === "sign-in-required"
  return (
    <>
      <Head>
        <title>Connected apps · Matchbox ID</title>
        <meta
          name="description"
          content="Review and revoke apps connected to your Matchbox profile."
        />
      </Head>
      <IdentityShell>
        <article className="w-full max-w-3xl rounded-2xl border border-black/10 bg-white p-6 shadow-xl sm:p-8">
          <header className="border-b border-stone-200 pb-6">
            <p className="mb-2 text-sm font-medium text-brand">Matchbox ID</p>
            <h1 className="text-balance text-3xl font-semibold">
              Connected apps
            </h1>
            <p className="mt-2 text-pretty text-stone-600">
              Review who can access your verified Matchbox profile. Revocation
              takes effect immediately.
            </p>
          </header>

          {appsQuery.isLoading ? (
            <section
              className="space-y-3 py-7"
              aria-label="Loading connected apps"
            >
              <div className="h-24 rounded-xl bg-stone-100" />
              <div className="h-24 rounded-xl bg-stone-100" />
            </section>
          ) : needsSignIn ? (
            <section className="py-8">
              <h2 className="text-balance text-xl font-semibold">
                Sign in with your wallet
              </h2>
              <p className="mb-5 mt-2 text-pretty text-sm text-stone-600">
                Use the wallet linked through the Matchbox Discord bot. The
                signature is gasless.
              </p>
              <WalletAuthButton
                inverse={false}
                onAuthenticated={() =>
                  appsQuery.refetch().then(() => undefined)
                }
              />
            </section>
          ) : appsQuery.isError ? (
            <section className="py-8">
              <h2 className="text-xl font-semibold">
                We couldn’t load your apps.
              </h2>
              <button
                type="button"
                className="primary-button mt-4"
                onClick={() => appsQuery.refetch()}
              >
                Try again
              </button>
            </section>
          ) : appsQuery.data ? (
            <>
              <section className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-200 py-4">
                <p className="font-mono text-xs text-stone-500">
                  {appsQuery.data.walletAddress}
                </p>
                <button
                  type="button"
                  className="text-sm font-medium text-stone-600 underline"
                  onClick={signOut}
                >
                  Sign out
                </button>
              </section>
              {appsQuery.data.grants.length === 0 ? (
                <section className="py-10 text-center">
                  <h2 className="text-xl font-semibold">No connected apps</h2>
                  <p className="mx-auto mt-2 max-w-md text-pretty text-sm text-stone-600">
                    When you authorize an app, it will appear here with the
                    exact access you granted.
                  </p>
                  <a
                    className="primary-button mt-5 no-underline"
                    href="https://matchbox.markets"
                  >
                    Return to Matchbox
                  </a>
                </section>
              ) : (
                <ul className="list-none divide-y divide-stone-200 p-0">
                  {appsQuery.data.grants.map((grant) => (
                    <li
                      key={grant.id}
                      className="flex flex-col gap-4 py-6 sm:flex-row sm:items-center"
                    >
                      <span className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-stone-200 bg-stone-100 font-semibold">
                        {grant.app.logoUrl ? (
                          // biome-ignore lint/a11y/useAltText: adjacent app name is the accessible label
                          <img
                            src={grant.app.logoUrl}
                            className="size-full object-cover"
                          />
                        ) : (
                          grant.app.name.slice(0, 1).toUpperCase()
                        )}
                      </span>
                      <div className="min-w-0 flex-1">
                        <h2 className="truncate text-lg font-semibold">
                          {grant.app.name}
                        </h2>
                        <p className="mt-1 text-sm text-stone-600">
                          Profile access · Authorized{" "}
                          {new Date(grant.authorizedAt).toLocaleDateString()}
                        </p>
                        <p className="mt-1 text-xs text-stone-500">
                          {grant.lastAccessedAt
                            ? `Last accessed ${new Date(grant.lastAccessedAt).toLocaleString()}`
                            : "No profile access recorded yet"}
                        </p>
                      </div>
                      <AlertDialog.Root>
                        <AlertDialog.Trigger asChild>
                          <button
                            type="button"
                            className="light-secondary-button"
                          >
                            Revoke
                          </button>
                        </AlertDialog.Trigger>
                        <AlertDialog.Portal>
                          <AlertDialog.Overlay className="fixed inset-0 z-40 bg-black/60" />
                          <AlertDialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-6 shadow-xl">
                            <AlertDialog.Title className="text-balance text-xl font-semibold">
                              Revoke {grant.app.name}?
                            </AlertDialog.Title>
                            <AlertDialog.Description className="mt-2 text-pretty text-sm text-stone-600">
                              The app will immediately lose access to your
                              Matchbox profile. You can authorize it again
                              later.
                            </AlertDialog.Description>
                            <div className="mt-6 flex justify-end gap-3">
                              <AlertDialog.Cancel asChild>
                                <button
                                  type="button"
                                  className="light-secondary-button"
                                >
                                  Keep access
                                </button>
                              </AlertDialog.Cancel>
                              <AlertDialog.Action asChild>
                                <button
                                  type="button"
                                  className="primary-button"
                                  onClick={() => revoke(grant.id)}
                                >
                                  Revoke access
                                </button>
                              </AlertDialog.Action>
                            </div>
                          </AlertDialog.Content>
                        </AlertDialog.Portal>
                      </AlertDialog.Root>
                    </li>
                  ))}
                </ul>
              )}
              {revokeError ? (
                <p className="mt-4 text-sm text-red-700" role="alert">
                  {revokeError}
                </p>
              ) : null}
            </>
          ) : null}
        </article>
      </IdentityShell>
    </>
  )
}
