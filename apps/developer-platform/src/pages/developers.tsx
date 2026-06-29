import { DeveloperShell } from "@/components/DeveloperShell"
import { supabase } from "@/config/supabase"
import { authenticatedFetch } from "@/lib/api"
import * as AlertDialog from "@radix-ui/react-alert-dialog"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import Head from "next/head"
import { type FormEvent, useEffect, useState } from "react"
import { z } from "zod"

const appsResponseSchema = z.object({
  organization: z.object({ id: z.uuid(), name: z.string(), slug: z.string() }),
  apps: z.array(
    z.object({
      id: z.uuid(),
      client_id: z.string(),
      name: z.string(),
      status: z.enum(["draft", "pending-review", "approved", "suspended"]),
      approved_scopes: z.array(z.string()),
      requested_scopes: z.array(z.string()),
      created_at: z.string(),
      website_url: z.string().nullable(),
    }),
  ),
})

const keysResponseSchema = z.object({
  keys: z.array(
    z.object({
      id: z.uuid(),
      name: z.string(),
      key_type: z.enum(["publishable", "secret"]),
      key_prefix: z.string(),
      scopes: z.array(z.string()),
      last_used_at: z.string().nullable(),
      revoked_at: z.string().nullable(),
      created_at: z.string(),
    }),
  ),
  usage: z.object({
    gaugeRequests: z.number(),
    profileRequests: z.number(),
    errorRequests: z.number(),
  }),
  usageDays: z.number(),
})

type NewAppForm = {
  name: string
  purpose: string
  websiteUrl: string
  privacyPolicyUrl: string
  termsUrl: string
  redirectUri: string
  origin: string
  profileAccess: boolean
}

const EMPTY_APP: NewAppForm = {
  name: "",
  purpose: "",
  websiteUrl: "",
  privacyPolicyUrl: "",
  termsUrl: "",
  redirectUri: "",
  origin: "",
  profileAccess: true,
}

const APP_TEXT_FIELDS: Array<{
  key: Exclude<keyof NewAppForm, "purpose" | "profileAccess">
  label: string
  type: "text" | "url"
}> = [
  { key: "name", label: "App name", type: "text" },
  { key: "websiteUrl", label: "Website URL", type: "url" },
  { key: "privacyPolicyUrl", label: "Privacy policy URL", type: "url" },
  { key: "termsUrl", label: "Terms URL", type: "url" },
  { key: "redirectUri", label: "Authorization callback URL", type: "url" },
  { key: "origin", label: "Browser origin", type: "url" },
]

export default function DevelopersPage(): JSX.Element {
  const queryClient = useQueryClient()
  const [email, setEmail] = useState("")
  const [authMessage, setAuthMessage] = useState<string | null>(null)
  const [showCreateApp, setShowCreateApp] = useState(false)
  const [newApp, setNewApp] = useState<NewAppForm>(EMPTY_APP)
  const [formError, setFormError] = useState<string | null>(null)
  const [selectedAppId, setSelectedAppId] = useState<string | null>(null)
  const [newSecret, setNewSecret] = useState<string | null>(null)

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange(() => {
      queryClient.invalidateQueries({ queryKey: ["developer-apps"] })
    })
    return () => data.subscription.unsubscribe()
  }, [queryClient])

  const appsQuery = useQuery({
    queryKey: ["developer-apps"],
    retry: false,
    queryFn: async () => {
      const response = await authenticatedFetch("/api/developer/apps")
      if (!response.ok)
        throw new Error(
          response.status === 401 ? "sign-in-required" : "load-failed",
        )
      const rawData: unknown = await response.json()
      return appsResponseSchema.parse(rawData)
    },
  })
  const selectedApp = appsQuery.data?.apps.find(
    (app) => app.id === selectedAppId,
  )
  const keysQuery = useQuery({
    queryKey: ["developer-keys", selectedAppId],
    enabled: !!selectedAppId,
    queryFn: async () => {
      const response = await authenticatedFetch(
        `/api/developer/keys?appId=${selectedAppId}`,
      )
      if (!response.ok) throw new Error("Unable to load API keys")
      const rawData: unknown = await response.json()
      return keysResponseSchema.parse(rawData)
    },
  })

  async function googleSignIn(): Promise<void> {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/developers` },
    })
  }

  async function magicLinkSignIn(event: FormEvent): Promise<void> {
    event.preventDefault()
    setAuthMessage(null)
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/developers` },
    })
    setAuthMessage(
      error ? error.message : "Check your email for a secure sign-in link.",
    )
  }

  async function createApp(event: FormEvent): Promise<void> {
    event.preventDefault()
    setFormError(null)
    const response = await authenticatedFetch("/api/developer/apps", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newApp),
    })
    if (!response.ok) {
      setFormError(
        "Check every field and use HTTPS URLs. The purpose must be at least 20 characters.",
      )
      return
    }
    setNewApp(EMPTY_APP)
    setShowCreateApp(false)
    await appsQuery.refetch()
  }

  async function createKey(keyType: "publishable" | "secret"): Promise<void> {
    if (!selectedApp) return
    setNewSecret(null)
    const scopes =
      keyType === "publishable" ? ["gauges:read"] : selectedApp.approved_scopes
    const response = await authenticatedFetch("/api/developer/keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        appId: selectedApp.id,
        name: keyType === "publishable" ? "Browser key" : "Server key",
        keyType,
        scopes,
        allowedCidrs: [],
      }),
    })
    const rawData: unknown = await response.json()
    const result = z.object({ secret: z.string() }).safeParse(rawData)
    if (!response.ok || !result.success) {
      setFormError(
        "The key could not be created. The app must be approved first.",
      )
      return
    }
    setNewSecret(result.data.secret)
    await keysQuery.refetch()
  }

  async function revokeKey(keyId: string): Promise<void> {
    if (!selectedApp) return
    setFormError(null)
    const response = await authenticatedFetch("/api/developer/keys", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ appId: selectedApp.id, keyId }),
    })
    if (!response.ok) {
      setFormError("The key could not be revoked. Try again.")
      return
    }
    await keysQuery.refetch()
  }

  const needsSignIn = appsQuery.error?.message === "sign-in-required"
  return (
    <>
      <Head>
        <title>Matchbox Developers</title>
        <meta
          name="description"
          content="Build with Matchbox gauge and consented profile data."
        />
      </Head>
      <DeveloperShell>
        {appsQuery.isLoading ? (
          <section
            className="grid gap-4"
            aria-label="Loading developer account"
          >
            <div className="h-24 rounded-xl bg-stone-200" />
            <div className="h-56 rounded-xl bg-stone-200" />
          </section>
        ) : needsSignIn ? (
          <section className="mx-auto max-w-md rounded-2xl border border-stone-200 bg-white p-7 shadow-lg">
            <p className="text-sm font-medium text-brand">Private beta</p>
            <h1 className="mt-2 text-balance text-3xl font-semibold">
              Build on Matchbox
            </h1>
            <p className="mt-3 text-pretty text-stone-600">
              Register an app, request profile access, and ship against a typed
              mainnet API.
            </p>
            <button
              type="button"
              className="light-secondary-button mt-7 w-full"
              onClick={googleSignIn}
            >
              Continue with Google
            </button>
            <div className="my-5 flex items-center gap-3 text-xs text-stone-400">
              <span className="h-px flex-1 bg-stone-200" /> or{" "}
              <span className="h-px flex-1 bg-stone-200" />
            </div>
            <form onSubmit={magicLinkSignIn}>
              <fieldset>
                <legend className="sr-only">Sign in with email</legend>
                <ol className="list-none space-y-3 p-0">
                  <li>
                    <label
                      htmlFor="developer-email"
                      className="mb-1.5 block text-sm font-medium"
                    >
                      Work email
                    </label>
                    <input
                      id="developer-email"
                      className="form-input"
                      type="email"
                      required
                      autoComplete="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                    />
                  </li>
                </ol>
              </fieldset>
              <button type="submit" className="primary-button mt-4 w-full">
                Email me a sign-in link
              </button>
              {authMessage ? (
                <output className="mt-3 block text-sm text-stone-600">
                  {authMessage}
                </output>
              ) : null}
            </form>
          </section>
        ) : appsQuery.isError ? (
          <section>
            <h1 className="text-2xl font-semibold">
              Developer platform unavailable
            </h1>
            <button
              type="button"
              className="primary-button mt-4"
              onClick={() => appsQuery.refetch()}
            >
              Try again
            </button>
          </section>
        ) : appsQuery.data ? (
          <div className="grid gap-7">
            <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
              <div>
                <p className="text-sm font-medium text-brand">
                  {appsQuery.data.organization.name}
                </p>
                <h1 className="mt-1 text-balance text-3xl font-semibold">
                  Applications
                </h1>
                <p className="mt-2 text-pretty text-stone-600">
                  Manage consent, credentials, and access for your integrations.
                </p>
              </div>
              <button
                type="button"
                className="primary-button"
                onClick={() => setShowCreateApp((value) => !value)}
              >
                {showCreateApp ? "Close form" : "Register app"}
              </button>
            </header>

            {showCreateApp ? (
              <form
                className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm"
                onSubmit={createApp}
              >
                <fieldset>
                  <legend className="text-xl font-semibold">
                    Register a private-beta app
                  </legend>
                  <p className="mt-1 text-sm text-stone-600">
                    Profile access requires a privacy policy, exact callback,
                    and Matchbox review.
                  </p>
                  <ol className="mt-6 grid list-none gap-5 p-0 md:grid-cols-2">
                    {APP_TEXT_FIELDS.map(({ key, label, type }) => (
                      <li key={key}>
                        <label
                          htmlFor={`app-${key}`}
                          className="mb-1.5 block text-sm font-medium"
                        >
                          {label}
                        </label>
                        <input
                          id={`app-${key}`}
                          className="form-input"
                          type={type}
                          required
                          value={newApp[key]}
                          onChange={(event) =>
                            setNewApp((current) => ({
                              ...current,
                              [key]: event.target.value,
                            }))
                          }
                        />
                      </li>
                    ))}
                    <li className="md:col-span-2">
                      <label
                        htmlFor="app-purpose"
                        className="mb-1.5 block text-sm font-medium"
                      >
                        What will your app build?
                      </label>
                      <textarea
                        id="app-purpose"
                        className="form-input min-h-28"
                        required
                        minLength={20}
                        value={newApp.purpose}
                        onChange={(event) =>
                          setNewApp((current) => ({
                            ...current,
                            purpose: event.target.value,
                          }))
                        }
                      />
                    </li>
                    <li className="md:col-span-2">
                      <label className="flex items-start gap-3 rounded-xl border border-stone-200 p-4">
                        <input
                          type="checkbox"
                          className="mt-1 size-4 accent-orange-500"
                          checked={newApp.profileAccess}
                          onChange={(event) =>
                            setNewApp((current) => ({
                              ...current,
                              profileAccess: event.target.checked,
                            }))
                          }
                        />
                        <span>
                          <span className="block font-medium">
                            Request consented profile access
                          </span>
                          <span className="mt-1 block text-sm text-stone-600">
                            Users must explicitly authorize this app through
                            Matchbox ID.
                          </span>
                        </span>
                      </label>
                    </li>
                  </ol>
                </fieldset>
                {formError ? (
                  <p className="mt-4 text-sm text-red-700" role="alert">
                    {formError}
                  </p>
                ) : null}
                <button type="submit" className="primary-button mt-6">
                  Submit for review
                </button>
              </form>
            ) : null}

            {appsQuery.data.apps.length === 0 ? (
              <section className="rounded-2xl border border-dashed border-stone-300 bg-white p-10 text-center">
                <h2 className="text-xl font-semibold">
                  Register your first app
                </h2>
                <p className="mx-auto mt-2 max-w-md text-pretty text-stone-600">
                  Create an app to receive a client ID and begin the
                  private-beta review.
                </p>
                <button
                  type="button"
                  className="primary-button mt-5"
                  onClick={() => setShowCreateApp(true)}
                >
                  Register app
                </button>
              </section>
            ) : (
              <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,0.75fr)]">
                <ul className="list-none space-y-3 p-0">
                  {appsQuery.data.apps.map((app) => (
                    <li key={app.id}>
                      <button
                        type="button"
                        className={`w-full rounded-xl border bg-white p-5 text-left transition-colors duration-150 ${selectedAppId === app.id ? "border-brand" : "border-stone-200 hover:border-stone-400"}`}
                        onClick={() => {
                          setSelectedAppId(app.id)
                          setNewSecret(null)
                        }}
                      >
                        <span className="flex items-center justify-between gap-4">
                          <span className="truncate text-lg font-semibold">
                            {app.name}
                          </span>
                          <span className="rounded-full bg-stone-100 px-2.5 py-1 text-xs font-medium text-stone-600">
                            {app.status}
                          </span>
                        </span>
                        <span className="mt-3 block truncate font-mono text-xs text-stone-500">
                          {app.client_id}
                        </span>
                        <span className="mt-3 block text-sm text-stone-600">
                          Requested: {app.requested_scopes.join(", ")}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>

                <aside className="rounded-xl border border-stone-200 bg-white p-5">
                  {selectedApp ? (
                    <>
                      <h2 className="text-xl font-semibold">API keys</h2>
                      <p className="mt-1 text-sm text-stone-600">
                        Secrets are displayed once. Keep server keys out of
                        browser code.
                      </p>
                      {keysQuery.data ? (
                        <dl className="mt-5 grid grid-cols-3 gap-2">
                          {[
                            ["Gauge", keysQuery.data.usage.gaugeRequests],
                            ["Profile", keysQuery.data.usage.profileRequests],
                            ["Errors", keysQuery.data.usage.errorRequests],
                          ].map(([label, value]) => (
                            <div
                              key={label}
                              className="rounded-lg bg-stone-100 p-3"
                            >
                              <dt className="text-xs text-stone-500">
                                {label}
                              </dt>
                              <dd className="mt-1 font-mono text-sm font-semibold">
                                {Number(value).toLocaleString()}
                              </dd>
                            </div>
                          ))}
                        </dl>
                      ) : null}
                      <p className="mt-2 text-xs text-stone-500">
                        Requests over the last 30 days
                      </p>
                      {selectedApp.status === "approved" ? (
                        <div className="mt-5 flex flex-wrap gap-2">
                          <button
                            type="button"
                            className="primary-button"
                            onClick={() => createKey("secret")}
                          >
                            Create server key
                          </button>
                          <button
                            type="button"
                            className="light-secondary-button"
                            onClick={() => createKey("publishable")}
                          >
                            Create browser key
                          </button>
                        </div>
                      ) : (
                        <p className="mt-5 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
                          Keys become available after private-beta approval.
                        </p>
                      )}
                      {newSecret ? (
                        <div className="mt-5 rounded-xl border border-brand bg-orange-50 p-4">
                          <p className="font-semibold">Copy this key now</p>
                          <code className="mt-2 block break-all font-mono text-xs">
                            {newSecret}
                          </code>
                        </div>
                      ) : null}
                      {formError ? (
                        <p className="mt-4 text-sm text-red-700" role="alert">
                          {formError}
                        </p>
                      ) : null}
                      <ul className="mt-5 list-none divide-y divide-stone-200 p-0">
                        {keysQuery.data?.keys.map((key) => (
                          <li
                            key={key.id}
                            className="flex items-start justify-between gap-3 py-3"
                          >
                            <div className="min-w-0">
                              <p className="font-medium">{key.name}</p>
                              <p className="mt-1 truncate font-mono text-xs text-stone-500">
                                {key.key_prefix}&hellip;
                              </p>
                              <p className="mt-1 text-xs text-stone-500">
                                {key.key_type} &middot; {key.scopes.join(", ")}
                              </p>
                              <p className="mt-1 text-xs text-stone-500">
                                {key.revoked_at
                                  ? `Revoked ${new Date(key.revoked_at).toLocaleDateString()}`
                                  : key.last_used_at
                                    ? `Last used ${new Date(key.last_used_at).toLocaleString()}`
                                    : "Never used"}
                              </p>
                            </div>
                            {!key.revoked_at ? (
                              <AlertDialog.Root>
                                <AlertDialog.Trigger asChild>
                                  <button
                                    type="button"
                                    className="text-sm font-medium text-red-700 underline underline-offset-4"
                                  >
                                    Revoke
                                  </button>
                                </AlertDialog.Trigger>
                                <AlertDialog.Portal>
                                  <AlertDialog.Overlay className="fixed inset-0 z-40 bg-black/60" />
                                  <AlertDialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-6 shadow-xl">
                                    <AlertDialog.Title className="text-balance text-xl font-semibold">
                                      Revoke {key.name}?
                                    </AlertDialog.Title>
                                    <AlertDialog.Description className="mt-2 text-pretty text-sm text-stone-600">
                                      Requests using this key will fail
                                      immediately. This cannot be undone.
                                    </AlertDialog.Description>
                                    <div className="mt-6 flex justify-end gap-3">
                                      <AlertDialog.Cancel asChild>
                                        <button
                                          type="button"
                                          className="light-secondary-button"
                                        >
                                          Keep key
                                        </button>
                                      </AlertDialog.Cancel>
                                      <AlertDialog.Action asChild>
                                        <button
                                          type="button"
                                          className="primary-button"
                                          onClick={() => revokeKey(key.id)}
                                        >
                                          Revoke key
                                        </button>
                                      </AlertDialog.Action>
                                    </div>
                                  </AlertDialog.Content>
                                </AlertDialog.Portal>
                              </AlertDialog.Root>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    </>
                  ) : (
                    <div className="py-8 text-center">
                      <h2 className="font-semibold">Select an app</h2>
                      <p className="mt-1 text-sm text-stone-600">
                        Review its status and credentials here.
                      </p>
                    </div>
                  )}
                </aside>
              </section>
            )}
          </div>
        ) : null}
      </DeveloperShell>
    </>
  )
}
