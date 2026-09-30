import type { App, UpdateAppRequest } from "@repo/platform-contracts/console"
import * as Button from "@repo/ui/button"
import * as Field from "@repo/ui/field"
import * as Fieldset from "@repo/ui/fieldset"
import * as Input from "@repo/ui/input"
import * as Skeleton from "@repo/ui/skeleton"
import * as Textarea from "@repo/ui/textarea"
import * as Toast from "@repo/ui/toast"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { ImageOff } from "lucide-react"
import { type FormEvent, type ReactElement, useState } from "react"
import ConfirmDialog from "../../../../components/ConfirmDialog"
import * as api from "../../../../lib/api"
import { ApiError, errorMessage } from "../../../../lib/api-client"
import { appQuery, keys } from "../../../../lib/queries"
import { useStepUp } from "../../../../lib/step-up"

export const Route = createFileRoute("/_app/apps/$appId/settings")({
  component: SettingsTab,
})

function SettingsTab(): ReactElement {
  const { appId } = Route.useParams()
  const app = useQuery(appQuery(appId))
  if (app.data === undefined) {
    return (
      <div aria-busy="true" className="flex max-w-2xl flex-col gap-4">
        {["a", "b", "c", "d", "e"].map((key) => (
          <Skeleton.Root key={key} shape="block" />
        ))}
      </div>
    )
  }
  return (
    <div className="flex max-w-2xl flex-col gap-12">
      <ProfileForm key={app.data.updatedAt} app={app.data} />
      <DangerZone app={app.data} />
    </div>
  )
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

type UrlField = "logoUrl" | "websiteUrl" | "privacyUrl" | "termsUrl"

const urlFields: Array<{ key: UrlField; label: string }> = [
  { key: "websiteUrl", label: "Website" },
  { key: "privacyUrl", label: "Privacy policy" },
  { key: "termsUrl", label: "Terms" },
]

function ProfileForm({ app }: { app: App }): ReactElement {
  const [draft, setDraft] = useState<Draft>(() => draftFrom(app))
  const [logoFailed, setLogoFailed] = useState(false)
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
    ...urlFields.map((field) => field.key),
  ] as const) {
    const problem = httpsProblem(draft[key])
    if (problem !== null) localErrors[key] = problem
  }
  const serverIssue = (path: string): string | null =>
    save.error instanceof ApiError ? save.error.issueFor(path) : null
  const errorFor = (key: keyof Draft): string | null =>
    localErrors[key] ?? serverIssue(key)
  const valid = Object.keys(localErrors).length === 0
  const dirty = JSON.stringify(draft) !== JSON.stringify(draftFrom(app))

  function submit(event: FormEvent): void {
    event.preventDefault()
    if (!valid) return
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

  const logo = nullable(draft.logoUrl)
  const disabled = app.status === "retired"

  return (
    <form onSubmit={submit} className="flex flex-col gap-10" noValidate>
      <Fieldset.Root disabled={save.isPending || disabled}>
        <Fieldset.Legend>Identity</Fieldset.Legend>
        <Fieldset.Fields>
          <Field.Root required>
            <Field.Label>Name</Field.Label>
            <Field.Control>
              <Input.Root
                value={draft.name}
                maxLength={80}
                onChange={(event) => set("name", event.target.value)}
              />
            </Field.Control>
            <Field.Error>{errorFor("name")}</Field.Error>
          </Field.Root>
          <Field.Root>
            <Field.Label>Description</Field.Label>
            <Field.Control>
              <Textarea.Root
                rows={3}
                maxLength={500}
                value={draft.description}
                onChange={(event) => set("description", event.target.value)}
              />
            </Field.Control>
            <Field.Description>{`${draft.description.length} / 500`}</Field.Description>
            <Field.Error>{errorFor("description")}</Field.Error>
          </Field.Root>
          <Field.Root>
            <Field.Label>Logo URL</Field.Label>
            <span className="flex items-center gap-3">
              <span
                aria-hidden="true"
                className="flex size-[34px] shrink-0 items-center justify-center overflow-hidden rounded-md border border-line bg-inset"
              >
                {logo !== null &&
                !logoFailed &&
                errorFor("logoUrl") === null ? (
                  <img
                    src={logo}
                    alt=""
                    className="size-full object-cover"
                    onError={() => setLogoFailed(true)}
                  />
                ) : (
                  <ImageOff
                    size={14}
                    strokeWidth={1.75}
                    className="text-muted"
                  />
                )}
              </span>
              <Field.Control>
                <Input.Root
                  type="url"
                  inputMode="url"
                  placeholder="https://example.com/logo.png"
                  value={draft.logoUrl}
                  onChange={(event) => {
                    setLogoFailed(false)
                    set("logoUrl", event.target.value)
                  }}
                />
              </Field.Control>
            </span>
            <Field.Error>
              {errorFor("logoUrl") ??
                (logoFailed ? "Image failed to load" : null)}
            </Field.Error>
          </Field.Root>
        </Fieldset.Fields>
      </Fieldset.Root>

      <Fieldset.Root disabled={save.isPending || disabled}>
        <Fieldset.Legend>Links</Fieldset.Legend>
        <Fieldset.Fields>
          {urlFields.map((field) => (
            <Field.Root key={field.key}>
              <Field.Label>{field.label}</Field.Label>
              <Field.Control>
                <Input.Root
                  type="url"
                  inputMode="url"
                  placeholder="https://"
                  value={draft[field.key]}
                  onChange={(event) => set(field.key, event.target.value)}
                />
              </Field.Control>
              <Field.Error>{errorFor(field.key)}</Field.Error>
            </Field.Root>
          ))}
          <Field.Root>
            <Field.Label>Support email</Field.Label>
            <Field.Control>
              <Input.Root
                type="email"
                autoComplete="email"
                value={draft.supportEmail}
                onChange={(event) => set("supportEmail", event.target.value)}
              />
            </Field.Control>
            <Field.Error>{errorFor("supportEmail")}</Field.Error>
          </Field.Root>
        </Fieldset.Fields>
      </Fieldset.Root>

      <p className="flex flex-wrap items-center justify-end gap-2 border-t border-line pt-4">
        {save.isError &&
        !(save.error instanceof ApiError && save.error.issues.length > 0) ? (
          <span role="alert" className="mr-auto text-[12px] font-500 text-neg">
            {errorMessage(save.error)}
          </span>
        ) : null}
        <Button.Root
          variant="ghost"
          disabled={!dirty || save.isPending}
          onClick={() => setDraft(draftFrom(app))}
        >
          Reset
        </Button.Root>
        <Button.Root
          type="submit"
          loading={save.isPending}
          disabled={!dirty || !valid || disabled}
        >
          Save
        </Button.Root>
      </p>
    </form>
  )
}

function DangerZone({ app }: { app: App }): ReactElement {
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
    <section
      aria-labelledby="danger-zone"
      className="flex flex-col gap-3 rounded-[10px] border border-neg/30 p-4"
    >
      <h2 id="danger-zone" className="text-[14px] font-600 text-ink">
        Danger zone
      </h2>
      <p className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-[13px] text-secondary">
          {retired ? "Retired" : "Retire app"}
        </span>
        <Button.Root
          variant="danger"
          disabled={retired}
          onClick={() => setOpen(true)}
        >
          Retire
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
    </section>
  )
}
