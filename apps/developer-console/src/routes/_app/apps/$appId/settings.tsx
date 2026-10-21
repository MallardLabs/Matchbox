import type { App, UpdateAppRequest } from "@repo/platform-contracts/console"
import * as Button from "@repo/ui/button"
import * as Field from "@repo/ui/field"
import * as Input from "@repo/ui/input"
import * as Skeleton from "@repo/ui/skeleton"
import * as Textarea from "@repo/ui/textarea"
import * as Toast from "@repo/ui/toast"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { CircleCheck, Lock } from "lucide-react"
import {
  type FormEvent,
  type ReactElement,
  type ReactNode,
  useState,
} from "react"
import ConfirmDialog from "../../../../components/ConfirmDialog"
import AppMark, { appMarkTone } from "../../../../components/ui/AppMark"
import CopyIconButton from "../../../../components/ui/CopyIconButton"
import LockHint from "../../../../components/ui/LockHint"
import { Pill } from "../../../../components/ui/Pill"
import * as api from "../../../../lib/api"
import { ApiError, errorMessage } from "../../../../lib/api-client"
import { formatDate, formatHost } from "../../../../lib/format"
import { appQuery, keys } from "../../../../lib/queries"
import { useSession } from "../../../../lib/session"
import { useStepUp } from "../../../../lib/step-up"

export const Route = createFileRoute("/_app/apps/$appId/settings")({
  component: SettingsTab,
})

function SettingsTab(): ReactElement {
  const { appId } = Route.useParams()
  const app = useQuery(appQuery(appId))
  if (app.data === undefined) {
    return (
      <div aria-busy="true" className="flex max-w-3xl flex-col gap-4">
        {["a", "b", "c", "d", "e"].map((key) => (
          <Skeleton.Root key={key} shape="block" />
        ))}
      </div>
    )
  }
  return <Settings key={app.data.updatedAt} app={app.data} />
}

type Draft = {
  name: string
  description: string
  logoUrl: string
  websiteUrl: string
  privacyUrl: string
  termsUrl: string
  supportEmail: string
}

function draftFrom(app: App): Draft {
  return {
    name: app.name,
    description: app.description ?? "",
    logoUrl: app.logoUrl ?? "",
    websiteUrl: app.websiteUrl ?? "",
    privacyUrl: app.privacyUrl ?? "",
    termsUrl: app.termsUrl ?? "",
    supportEmail: app.supportEmail ?? "",
  }
}

function nullable(value: string): string | null {
  const trimmed = value.trim()
  return trimmed === "" ? null : trimmed
}

function httpsProblem(value: string): string | null {
  const trimmed = value.trim()
  if (trimmed === "") return null
  try {
    return new URL(trimmed).protocol === "https:" ? null : "Use https://"
  } catch {
    return "Not a valid URL"
  }
}

/** Fields whose value differs from the saved app. */
export function changedFields(draft: Draft, app: App): (keyof Draft)[] {
  const saved = draftFrom(app)
  return (Object.keys(draft) as (keyof Draft)[]).filter(
    (key) => draft[key].trim() !== saved[key].trim(),
  )
}

const descriptionMax = 500

function Section({
  title,
  children,
}: {
  title: string
  children: ReactNode
}): ReactElement {
  return (
    <section
      aria-label={title}
      className="grid grid-cols-1 gap-x-8 gap-y-3 border-t border-line pt-5 md:grid-cols-[180px_minmax(0,1fr)]"
    >
      <h2 className="text-body font-600 text-ink">{title}</h2>
      <div className="flex min-w-0 flex-col gap-4">{children}</div>
    </section>
  )
}

function Settings({ app }: { app: App }): ReactElement {
  const [draft, setDraft] = useState<Draft>(() => draftFrom(app))
  const queryClient = useQueryClient()
  const { toast } = Toast.useToast()
  const save = useMutation({
    mutationFn: (body: UpdateAppRequest) => api.apps.update(app.id, body),
    async onSuccess(updated) {
      queryClient.setQueryData(keys.app(app.id), updated)
      await queryClient.invalidateQueries({
        queryKey: keys.apps(updated.organizationId),
      })
      toast({ title: "Saved" })
    },
  })

  function set<Key extends keyof Draft>(key: Key, value: Draft[Key]): void {
    setDraft((current) => ({ ...current, [key]: value }))
  }

  const localErrors: Partial<Record<keyof Draft, string>> = {}
  if (draft.name.trim() === "") localErrors.name = "Required"
  for (const key of [
    "logoUrl",
    "websiteUrl",
    "privacyUrl",
    "termsUrl",
  ] as const) {
    const problem = httpsProblem(draft[key])
    if (problem !== null) localErrors[key] = problem
  }
  const serverIssue = (path: string): string | null =>
    save.error instanceof ApiError ? save.error.issueFor(path) : null
  const errorFor = (key: keyof Draft): string | null =>
    localErrors[key] ?? serverIssue(key)
  const valid = Object.keys(localErrors).length === 0
  const changed = changedFields(draft, app)
  const dirty = changed.length > 0
  const retired = app.status === "retired"

  function submit(event: FormEvent): void {
    event.preventDefault()
    if (!valid || !dirty) return
    save.mutate({
      name: draft.name.trim(),
      description: nullable(draft.description),
      logoUrl: nullable(draft.logoUrl),
      websiteUrl: nullable(draft.websiteUrl),
      privacyUrl: nullable(draft.privacyUrl),
      termsUrl: nullable(draft.termsUrl),
      supportEmail: nullable(draft.supportEmail),
    })
  }

  const urlField = (
    key: "websiteUrl" | "privacyUrl" | "termsUrl",
    label: string,
    hint?: string,
  ): ReactElement => (
    <Field.Root>
      <Field.Label>{label}</Field.Label>
      <Field.Control>
        <Input.Root
          type="url"
          inputMode="url"
          mono
          placeholder="https://"
          value={draft[key]}
          className="h-9 bg-surface text-label"
          onChange={(event) => set(key, event.target.value)}
        />
      </Field.Control>
      {hint === undefined ? null : (
        <Field.Description className="text-caption text-muted">
          {hint}
        </Field.Description>
      )}
      <Field.Error>{errorFor(key)}</Field.Error>
    </Field.Root>
  )

  return (
    <div className="grid grid-cols-1 gap-10 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="flex min-w-0 flex-col gap-6">
        <form onSubmit={submit} className="flex flex-col gap-6" noValidate>
          <fieldset
            disabled={save.isPending || retired}
            className="m-0 flex min-w-0 flex-col gap-6 border-0 p-0 disabled:opacity-60"
          >
            <Section title="Identity">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field.Root required>
                  <Field.Label>Name</Field.Label>
                  <Field.Control>
                    <Input.Root
                      value={draft.name}
                      maxLength={80}
                      className="h-9 bg-surface"
                      onChange={(event) => set("name", event.target.value)}
                    />
                  </Field.Control>
                  <Field.Error>{errorFor("name")}</Field.Error>
                </Field.Root>
                <Field.Root>
                  <Field.Label>Slug</Field.Label>
                  <Field.Control>
                    <Input.Root
                      className="h-9 text-label"
                      mono
                      readOnly
                      value={app.slug}
                    />
                  </Field.Control>
                </Field.Root>
              </div>
              <Field.Root>
                <span className="flex items-center gap-2">
                  <Field.Label>Description</Field.Label>
                  <span className="flex-1" />
                  <span className="font-mono text-caption text-muted">
                    {`${draft.description.length} / ${descriptionMax}`}
                  </span>
                </span>
                <Field.Control>
                  <Textarea.Root
                    rows={3}
                    maxLength={descriptionMax}
                    value={draft.description}
                    className="bg-surface"
                    onChange={(event) => set("description", event.target.value)}
                  />
                </Field.Control>
                <Field.Error>{errorFor("description")}</Field.Error>
              </Field.Root>
              <Field.Root>
                <Field.Label>Logo URL</Field.Label>
                <span className="flex items-center gap-3">
                  <AppMark
                    key={draft.logoUrl}
                    name={draft.name === "" ? app.name : draft.name}
                    logoUrl={
                      errorFor("logoUrl") === null
                        ? nullable(draft.logoUrl)
                        : null
                    }
                    tone="ink"
                    className="size-[34px]"
                  />
                  <Field.Control>
                    <Input.Root
                      type="url"
                      inputMode="url"
                      mono
                      placeholder="https://example.com/logo.png"
                      value={draft.logoUrl}
                      className="h-9 bg-surface text-label"
                      onChange={(event) => set("logoUrl", event.target.value)}
                    />
                  </Field.Control>
                </span>
                <Field.Error>{errorFor("logoUrl")}</Field.Error>
              </Field.Root>
            </Section>
            <Section title="Links">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {urlField("websiteUrl", "Website")}
                <Field.Root>
                  <Field.Label>Support email</Field.Label>
                  <Field.Control>
                    <Input.Root
                      type="email"
                      mono
                      autoComplete="email"
                      value={draft.supportEmail}
                      className="h-9 bg-surface text-label"
                      onChange={(event) =>
                        set("supportEmail", event.target.value)
                      }
                    />
                  </Field.Control>
                  <Field.Error>{errorFor("supportEmail")}</Field.Error>
                </Field.Root>
                {urlField(
                  "privacyUrl",
                  "Privacy policy",
                  "Required for Discord scopes",
                )}
                {urlField("termsUrl", "Terms")}
              </div>
            </Section>
          </fieldset>
          <div className="flex flex-wrap items-center gap-2 md:pl-[212px]">
            <span
              aria-live="polite"
              className="mr-auto text-label text-accent-ink"
            >
              {dirty
                ? `Unsaved · ${changed.length} ${changed.length === 1 ? "field" : "fields"}`
                : ""}
            </span>
            {save.isError &&
            !(
              save.error instanceof ApiError && save.error.issues.length > 0
            ) ? (
              <span role="alert" className="text-label font-500 text-neg">
                {errorMessage(save.error)}
              </span>
            ) : null}
            <Button.Root
              variant="ghost"
              disabled={!dirty || save.isPending}
              onClick={() => setDraft(draftFrom(app))}
            >
              Discard
            </Button.Root>
            <Button.Root
              type="submit"
              loading={save.isPending}
              disabled={!dirty || !valid || retired}
            >
              Save
            </Button.Root>
          </div>
        </form>
        <RetireApp app={app} />
      </div>
      <ConsentCard app={app} draft={draft} />
    </div>
  )
}

function RetireApp({ app }: { app: App }): ReactElement {
  const [open, setOpen] = useState(false)
  const stepUp = useStepUp()
  const queryClient = useQueryClient()
  const { toast } = Toast.useToast()
  const retired = app.status === "retired"

  async function retire(): Promise<void> {
    const updated = await stepUp.run(() => api.apps.retire(app.id))
    queryClient.setQueryData(keys.app(app.id), updated)
    await queryClient.invalidateQueries({
      queryKey: keys.apps(updated.organizationId),
    })
    toast({ title: "App retired" })
  }

  return (
    <Section title="Retire">
      <p className="flex flex-wrap items-center gap-3">
        <span className="mr-auto text-body-sm text-ink-2">
          {retired ? "Retired" : "Keys revoked · grants ended · not reversible"}
        </span>
        <LockHint />
        <Button.Root
          variant="secondary"
          className="border-neg/30 text-neg hover:border-neg/50"
          disabled={retired}
          onClick={() => setOpen(true)}
        >
          Retire app
        </Button.Root>
      </p>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={`Retire ${app.name}?`}
        description="API keys, client secrets and sign-ins for both environments stop working."
        confirmLabel="Retire app"
        onConfirm={retire}
      />
    </Section>
  )
}

function ConsentCard({ app, draft }: { app: App; draft: Draft }): ReactElement {
  const { org } = useSession()
  const verified = app.environments.some(
    (env) => env.kind === "live" && env.reviewState === "approved",
  )
  const website = nullable(draft.websiteUrl)
  const description = nullable(draft.description)
  return (
    <aside aria-label="At consent" className="flex min-w-0 flex-col gap-2">
      <h2 className="text-caption text-muted">At consent</h2>
      <div className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-4">
        <div className="flex items-start gap-3">
          <AppMark
            key={draft.logoUrl}
            name={draft.name === "" ? app.name : draft.name}
            logoUrl={
              httpsProblem(draft.logoUrl) === null
                ? nullable(draft.logoUrl)
                : null
            }
            tone={appMarkTone(app)}
            size="lg"
            className="size-11"
          />
          <div className="flex min-w-0 flex-col gap-1">
            <p className="flex flex-wrap items-center gap-2">
              <span className="min-w-0 break-words text-title-sm font-500 text-ink">
                {draft.name === "" ? app.name : draft.name}
              </span>
              {verified ? (
                <Pill className="bg-pos-soft text-pos">
                  <CircleCheck aria-hidden="true" size={12} strokeWidth={2} />
                  Verified
                </Pill>
              ) : null}
            </p>
            <p className="flex flex-wrap gap-x-3 text-label font-600 text-accent-ink">
              {website === null ? null : <span>{formatHost(website)}</span>}
              {nullable(draft.privacyUrl) === null ? null : (
                <span>Privacy</span>
              )}
              {nullable(draft.termsUrl) === null ? null : <span>Terms</span>}
            </p>
          </div>
        </div>
        {description === null ? null : (
          <p className="text-label text-secondary">{description}</p>
        )}
      </div>
      <dl className="m-0 mt-3 flex flex-col">
        <div className="flex items-center gap-3 border-b border-line py-2.5">
          <dt className="text-body-sm text-secondary">App ID</dt>
          <span className="flex-1" />
          <dd className="m-0 flex items-center gap-1 font-mono text-label text-ink">
            {`${app.id.slice(0, 4)}…${app.id.slice(-4)}`}
            <CopyIconButton value={app.id} label="app ID" />
          </dd>
        </div>
        <div className="flex items-center gap-3 border-b border-line py-2.5">
          <dt className="text-body-sm text-secondary">Created</dt>
          <span className="flex-1" />
          <dd className="m-0 text-body-sm text-ink">
            {formatDate(app.createdAt)}
          </dd>
        </div>
        <div className="flex items-center gap-3 py-2.5">
          <dt className="text-body-sm text-secondary">Owner</dt>
          <span className="flex-1" />
          <dd className="m-0 truncate text-body-sm text-ink">
            {org?.name ?? "—"}
          </dd>
        </div>
      </dl>
      {app.status === "retired" ? (
        <p className="flex items-center gap-1.5 text-caption text-muted">
          <Lock aria-hidden="true" size={11} strokeWidth={1.75} />
          Retired apps are read-only
        </p>
      ) : null}
    </aside>
  )
}
