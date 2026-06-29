import { IdentityShell } from "@/components/IdentityShell"
import { PermissionRow } from "@/components/PermissionRow"
import { WalletAuthButton } from "@/components/WalletAuthButton"
import { authenticatedFetch } from "@/lib/api"
import { useQuery } from "@tanstack/react-query"
import Head from "next/head"
import { useRouter } from "next/router"
import { useState } from "react"
import { z } from "zod"

const contextSchema = z.object({
  app: z.object({
    clientId: z.string(),
    name: z.string(),
    description: z.string(),
    purpose: z.string(),
    logoUrl: z.string().nullable(),
    websiteUrl: z.string().nullable(),
    privacyPolicyUrl: z.string().nullable(),
    termsUrl: z.string().nullable(),
  }),
  profile: z
    .object({
      walletAddress: z.string(),
      discordUserId: z.string(),
      username: z.string().nullable(),
      displayName: z.string().nullable(),
      avatarUrl: z.string().nullable(),
      verifiedAt: z.string(),
    })
    .nullable(),
})

function singleQuery(value: string | string[] | undefined): string {
  return typeof value === "string" ? value : ""
}

export default function AuthorizePage(): JSX.Element {
  const router = useRouter()
  const clientId = singleQuery(router.query.client_id)
  const redirectUri = singleQuery(router.query.redirect_uri)
  const state = singleQuery(router.query.state)
  const [actionError, setActionError] = useState<string | null>(null)
  const [isAuthorizing, setIsAuthorizing] = useState(false)

  const contextQuery = useQuery({
    queryKey: ["authorization-context", clientId, redirectUri],
    enabled: router.isReady && !!clientId && !!redirectUri,
    queryFn: async () => {
      const query = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        state,
      })
      const response = await authenticatedFetch(
        `/api/identity/authorize?${query}`,
      )
      if (!response.ok)
        throw new Error("This authorization request is invalid or unavailable.")
      const rawData: unknown = await response.json()
      return contextSchema.parse(rawData)
    },
  })

  async function authorize(): Promise<void> {
    setActionError(null)
    setIsAuthorizing(true)
    try {
      const response = await authenticatedFetch("/api/identity/authorize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, redirectUri, state }),
      })
      const rawData: unknown = await response.json()
      const result = z.object({ redirectTo: z.url() }).safeParse(rawData)
      if (!response.ok || !result.success) {
        throw new Error(
          response.status === 409
            ? "This wallet is not linked to a Matchbox Discord profile. Link it through the Matchbox bot first."
            : "Matchbox could not authorize this app.",
        )
      }
      window.location.assign(result.data.redirectTo)
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "Authorization failed.",
      )
      setIsAuthorizing(false)
    }
  }

  function cancel(): void {
    if (!redirectUri) return
    const redirect = new URL(redirectUri)
    redirect.searchParams.set("error", "access_denied")
    if (state) redirect.searchParams.set("state", state)
    window.location.assign(redirect.toString())
  }

  const context = contextQuery.data
  return (
    <>
      <Head>
        <title>
          {context ? `Authorize ${context.app.name}` : "Authorize app"} ·
          Matchbox ID
        </title>
        <meta
          name="description"
          content="Securely authorize an app with your Matchbox profile."
        />
      </Head>
      <IdentityShell>
        <article className="w-full max-w-lg overflow-hidden rounded-2xl border border-black/10 bg-ink text-white shadow-xl">
          {contextQuery.isLoading ? (
            <div
              className="space-y-5 p-7"
              aria-label="Loading authorization request"
            >
              <div className="h-6 w-40 rounded bg-white/10" />
              <div className="h-10 w-4/5 rounded bg-white/10" />
              <div className="h-24 rounded bg-white/10" />
            </div>
          ) : contextQuery.isError || !context ? (
            <div className="p-7">
              <p className="mb-2 text-sm font-medium text-brand">
                Authorization unavailable
              </p>
              <h1 className="text-balance text-2xl font-semibold">
                This request cannot be verified.
              </h1>
              <p className="mt-3 text-pretty text-white/65">
                Return to the app and start again. Matchbox only accepts
                approved apps and exact callback URLs.
              </p>
            </div>
          ) : (
            <>
              <header className="border-b border-white/10 p-7">
                <div className="mb-6 flex items-center gap-3">
                  <span className="flex size-12 items-center justify-center overflow-hidden rounded-xl border border-white/15 bg-white/10 text-xl font-semibold">
                    {context.app.logoUrl ? (
                      // biome-ignore lint/a11y/useAltText: app name is announced alongside the logo
                      <img
                        src={context.app.logoUrl}
                        className="size-full object-cover"
                      />
                    ) : (
                      context.app.name.slice(0, 1).toUpperCase()
                    )}
                  </span>
                  <p className="text-sm text-white/60">Approved Matchbox app</p>
                </div>
                <h1 className="text-balance text-3xl font-semibold leading-tight">
                  Allow {context.app.name} to access your Matchbox profile?
                </h1>
                <p className="mt-3 text-pretty text-sm leading-6 text-white/65">
                  {context.app.purpose || context.app.description}
                </p>
              </header>

              <section className="p-7">
                {context.profile ? (
                  <div className="mb-6 flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-3">
                    {context.profile.avatarUrl ? (
                      // biome-ignore lint/a11y/useAltText: adjacent text identifies the profile
                      <img
                        src={context.profile.avatarUrl}
                        className="size-10 rounded-full"
                      />
                    ) : (
                      <span className="flex size-10 items-center justify-center rounded-full bg-white/10">
                        M
                      </span>
                    )}
                    <div className="min-w-0">
                      <p className="truncate font-medium">
                        {context.profile.displayName ??
                          context.profile.username ??
                          "Discord profile"}
                      </p>
                      <p className="truncate font-mono text-xs text-white/55">
                        {context.profile.walletAddress}
                      </p>
                    </div>
                  </div>
                ) : null}

                <h2 className="text-sm font-semibold">
                  This app will be able to
                </h2>
                <ul className="mt-2 list-none p-0">
                  <PermissionRow allowed>
                    View your wallet address and verified Discord user ID.
                  </PermissionRow>
                  <PermissionRow allowed>
                    View your Discord username, display name, avatar, and
                    verification time.
                  </PermissionRow>
                </ul>
                <h2 className="mt-5 text-sm font-semibold">
                  This app will not be able to
                </h2>
                <ul className="mt-2 list-none p-0">
                  <PermissionRow allowed={false}>
                    Control Discord, read guild roles, sign transactions, or
                    access wallet balances.
                  </PermissionRow>
                </ul>

                {!context.profile ? (
                  <div className="mt-6">
                    <WalletAuthButton
                      onAuthenticated={() =>
                        contextQuery.refetch().then(() => undefined)
                      }
                    />
                    <p className="mt-3 text-pretty text-xs leading-5 text-white/50">
                      Signing in is gasless. It cannot submit a transaction or
                      move funds.
                    </p>
                  </div>
                ) : (
                  <div className="mt-7 grid gap-3 sm:grid-cols-[1fr_1.5fr]">
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={cancel}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="primary-button"
                      disabled={isAuthorizing}
                      onClick={authorize}
                    >
                      {isAuthorizing ? "Authorizing…" : "Authorize app"}
                    </button>
                  </div>
                )}
                {actionError ? (
                  <p className="mt-3 text-sm text-red-300" role="alert">
                    {actionError}
                  </p>
                ) : null}

                <footer className="mt-6 flex flex-wrap gap-x-4 gap-y-2 text-xs text-white/45">
                  {context.app.privacyPolicyUrl ? (
                    <a href={context.app.privacyPolicyUrl}>Privacy policy</a>
                  ) : null}
                  {context.app.termsUrl ? (
                    <a href={context.app.termsUrl}>Terms</a>
                  ) : null}
                  <a href="https://matchbox.markets">About Matchbox</a>
                </footer>
              </section>
            </>
          )}
        </article>
      </IdentityShell>
    </>
  )
}
