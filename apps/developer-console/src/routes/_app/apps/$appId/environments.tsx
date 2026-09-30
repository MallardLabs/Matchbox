import type { AuditEvent } from "@repo/platform-contracts/audit"
import type { ClientType, Environment } from "@repo/platform-contracts/console"
import { networkNames } from "@repo/platform-contracts/network"
import {
  type PlatformScope,
  normalizeScopes,
  platformScopeSchema,
  scopeDefinitions,
} from "@repo/platform-contracts/scopes"
import * as Badge from "@repo/ui/badge"
import * as Button from "@repo/ui/button"
import * as Card from "@repo/ui/card"
import * as Checkbox from "@repo/ui/checkbox"
import * as CopyField from "@repo/ui/copy-field"
import * as Field from "@repo/ui/field"
import * as Fieldset from "@repo/ui/fieldset"
import * as KeyValue from "@repo/ui/key-value"
import * as Select from "@repo/ui/select"
import * as Textarea from "@repo/ui/textarea"
import * as Toast from "@repo/ui/toast"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { type FormEvent, type ReactElement, useId, useState } from "react"
import { EnvBadge, ReviewBadge } from "../../../../components/Badges"
import ConfirmDialog from "../../../../components/ConfirmDialog"
import EnvironmentGate from "../../../../components/EnvironmentGate"
import UrlListEditor from "../../../../components/UrlListEditor"
import * as api from "../../../../lib/api"
import { errorMessage, isApiError } from "../../../../lib/api-client"
import { useAppRoute } from "../../../../lib/app-route"
import { formatDateTime, humanize } from "../../../../lib/format"
import { keys } from "../../../../lib/queries"
import { isStepUpCancelled, useStepUp } from "../../../../lib/step-up"

export const Route = createFileRoute("/_app/apps/$appId/environments")({
  component: EnvironmentsTab,
})

function EnvironmentsTab(): ReactElement {
  const { appId, kind } = useAppRoute()
  return (
    <EnvironmentGate key={kind} appId={appId} kind={kind}>
      {(environment) => <EnvironmentDetail environment={environment} />}
    </EnvironmentGate>
  )
}

function useEnvironmentUpdate(environment: Environment) {
  const queryClient = useQueryClient()
  return async function apply(updated: Environment): Promise<void> {
    queryClient.setQueryData(
      keys.environment(environment.appId, environment.kind),
      updated,
    )
    await queryClient.invalidateQueries({
      queryKey: keys.app(environment.appId),
    })
  }
}

function EnvironmentDetail({
  environment,
}: {
  environment: Environment
}): ReactElement {
  const apply = useEnvironmentUpdate(environment)
  const stepUp = useStepUp()
  const { toast } = Toast.useToast()
  return (
    <div className="grid grid-cols-1 gap-12 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="flex min-w-0 flex-col gap-12">
        <Credentials environment={environment} />
        <UrlListEditor
          key={`redirects-${environment.updatedAt}`}
          mode="redirect-uri"
          kind={environment.kind}
          values={environment.redirectUris}
          onSave={async (uris) => {
            await apply(
              await stepUp.run(() =>
                api.environments.replaceRedirectUris(environment.id, uris),
              ),
            )
            toast({ title: "Redirect URIs saved" })
          }}
        />
        <UrlListEditor
          key={`origins-${environment.updatedAt}`}
          mode="origin"
          kind={environment.kind}
          values={environment.origins}
          onSave={async (origins) => {
            await apply(
              await stepUp.run(() =>
                api.environments.replaceOrigins(environment.id, origins),
              ),
            )
            toast({ title: "Origins saved" })
          }}
        />
        <ScopesForm
          key={`scopes-${environment.updatedAt}`}
          environment={environment}
        />
      </div>
      <aside className="flex min-w-0 flex-col gap-10">
        <ReviewPanel environment={environment} />
        <ReviewHistory environment={environment} />
      </aside>
    </div>
  )
}

function Credentials({
  environment,
}: { environment: Environment }): ReactElement {
  const apply = useEnvironmentUpdate(environment)
  const stepUp = useStepUp()
  const { toast } = Toast.useToast()
  const [confirmPublic, setConfirmPublic] = useState(false)
  const update = useMutation({
    mutationFn: (clientType: ClientType) =>
      stepUp.run(() => api.environments.update(environment.id, { clientType })),
    async onSuccess(updated) {
      await apply(updated)
      toast({ title: "Client type saved" })
    },
  })
  return (
    <section aria-labelledby="env-credentials" className="flex flex-col gap-4">
      <h2
        id="env-credentials"
        className="flex items-center gap-2 text-[14px] font-600 text-ink"
      >
        Credentials
        <EnvBadge kind={environment.kind} />
      </h2>
      <KeyValue.Root>
        <KeyValue.Item>
          <KeyValue.Term>Network</KeyValue.Term>
          <KeyValue.Value>{networkNames[environment.network]}</KeyValue.Value>
        </KeyValue.Item>
        <KeyValue.Item>
          <KeyValue.Term>Scope version</KeyValue.Term>
          <KeyValue.Value mono>{environment.scopeVersion}</KeyValue.Value>
        </KeyValue.Item>
      </KeyValue.Root>
      <Fieldset.Root disabled={update.isPending}>
        <Fieldset.Legend hidden>Client</Fieldset.Legend>
        <Fieldset.Fields>
          <Field.Root>
            <Field.Label>Client ID</Field.Label>
            <CopyField.Root value={environment.clientId} label="client ID" />
          </Field.Root>
          <Field.Root>
            <Field.Label>Client type</Field.Label>
            <Select.Root
              value={environment.clientType}
              onValueChange={(value) => {
                if (value === "public") setConfirmPublic(true)
                if (value === "confidential") update.mutate(value)
              }}
            >
              <Field.Control>
                <Select.Trigger className="max-w-[240px]">
                  <Select.Value />
                </Select.Trigger>
              </Field.Control>
              <Select.Content>
                <Select.Item value="confidential">Confidential</Select.Item>
                <Select.Item value="public">Public (PKCE only)</Select.Item>
              </Select.Content>
            </Select.Root>
            <Field.Error>
              {update.isError && !isStepUpCancelled(update.error)
                ? errorMessage(update.error)
                : null}
            </Field.Error>
          </Field.Root>
        </Fieldset.Fields>
      </Fieldset.Root>
      <ConfirmDialog
        open={confirmPublic}
        onOpenChange={setConfirmPublic}
        title="Switch to public client?"
        description="Client secrets stop working, issued tokens are revoked and every user must consent again."
        confirmLabel="Switch to public"
        onConfirm={() => update.mutateAsync("public")}
      />
    </section>
  )
}

function ScopesForm({
  environment,
}: { environment: Environment }): ReactElement {
  const [selected, setSelected] = useState<PlatformScope[]>(
    environment.requestedScopes,
  )
  const apply = useEnvironmentUpdate(environment)
  const { toast } = Toast.useToast()
  const baseId = useId()
  const save = useMutation({
    mutationFn: () =>
      api.environments.updateScopes(environment.id, normalizeScopes(selected)),
    async onSuccess(updated) {
      await apply(updated)
      toast({ title: "Scopes saved" })
    },
  })
  const dirty =
    normalizeScopes(selected).join(" ") !==
    normalizeScopes(environment.requestedScopes).join(" ")

  function toggle(scope: PlatformScope, on: boolean): void {
    setSelected((current) =>
      on ? [...current, scope] : current.filter((item) => item !== scope),
    )
  }

  function submit(event: FormEvent): void {
    event.preventDefault()
    save.mutate()
  }

  return (
    <form onSubmit={submit} noValidate>
      <Fieldset.Root disabled={save.isPending}>
        <Fieldset.Legend>Scopes</Fieldset.Legend>
        <ol className="m-0 flex list-none flex-col p-0">
          {platformScopeSchema.options.map((scope) => {
            const definition = scopeDefinitions[scope]
            const id = `${baseId}-${scope}`
            const approved = environment.approvedScopes.includes(scope)
            return (
              <li
                key={scope}
                className="flex items-center gap-3 border-t border-line py-2.5 last:border-b"
              >
                <Checkbox.Root
                  id={id}
                  checked={selected.includes(scope)}
                  onCheckedChange={(checked) => toggle(scope, checked === true)}
                />
                <label htmlFor={id} className="flex min-w-0 flex-1 flex-col">
                  <span className="font-mono text-[12px] text-ink">
                    {scope}
                  </span>
                  <span className="text-[12px] text-secondary">
                    {definition.label}
                  </span>
                </label>
                <span className="flex shrink-0 gap-1.5">
                  {definition.requiresReview ? (
                    <Badge.Root tone="warn">Review</Badge.Root>
                  ) : null}
                  {approved ? (
                    <Badge.Root tone="pos">Approved</Badge.Root>
                  ) : null}
                </span>
              </li>
            )
          })}
        </ol>
        {dirty || save.isError ? (
          <p className="flex flex-wrap items-center justify-end gap-2">
            {save.isError ? (
              <span
                role="alert"
                className="mr-auto text-[12px] font-500 text-neg"
              >
                {errorMessage(save.error)}
              </span>
            ) : null}
            <Button.Root
              variant="ghost"
              onClick={() => setSelected(environment.requestedScopes)}
            >
              Reset
            </Button.Root>
            <Button.Root
              type="submit"
              loading={save.isPending}
              disabled={!dirty}
            >
              Save scopes
            </Button.Root>
          </p>
        ) : null}
      </Fieldset.Root>
    </form>
  )
}

function ReviewPanel({
  environment,
}: { environment: Environment }): ReactElement {
  const [note, setNote] = useState("")
  const apply = useEnvironmentUpdate(environment)
  const queryClient = useQueryClient()
  const { toast } = Toast.useToast()
  const submit = useMutation({
    mutationFn: () =>
      api.environments.submitReview(environment.id, note.trim()),
    async onSuccess(result) {
      await apply(result.environment)
      await queryClient.invalidateQueries({
        queryKey: keys.appAudit(environment.appId),
      })
      setNote("")
      toast({
        title: result.autoApproved ? "Approved" : "Submitted for review",
      })
    },
  })
  const withdraw = useMutation({
    mutationFn: () => api.environments.withdrawReview(environment.id),
    async onSuccess(updated) {
      await apply(updated)
      await queryClient.invalidateQueries({
        queryKey: keys.appAudit(environment.appId),
      })
      toast({ title: "Review withdrawn" })
    },
  })
  const review = environment.openReview
  const pendingScopes = environment.requestedScopes.filter(
    (scope) => !environment.approvedScopes.includes(scope),
  )

  function onSubmit(event: FormEvent): void {
    event.preventDefault()
    submit.mutate()
  }

  return (
    <Card.Root variant="panel">
      <Card.Header>
        <Card.Title>Review</Card.Title>
        <Card.Actions>
          <ReviewBadge state={environment.reviewState} />
        </Card.Actions>
      </Card.Header>
      <Card.Body>
        {review === null ? null : (
          <KeyValue.Root>
            <KeyValue.Item>
              <KeyValue.Term>Submitted</KeyValue.Term>
              <KeyValue.Value>
                {formatDateTime(review.createdAt)}
              </KeyValue.Value>
            </KeyValue.Item>
            <KeyValue.Item>
              <KeyValue.Term>Scopes</KeyValue.Term>
              <KeyValue.Value mono className="text-[12px]">
                {review.requestedScopes.join(" ")}
              </KeyValue.Value>
            </KeyValue.Item>
            {review.submitterNote === null ? null : (
              <KeyValue.Item>
                <KeyValue.Term>Note</KeyValue.Term>
                <KeyValue.Value>{review.submitterNote}</KeyValue.Value>
              </KeyValue.Item>
            )}
          </KeyValue.Root>
        )}
        {review === null ? (
          <form onSubmit={onSubmit} className="flex flex-col gap-3" noValidate>
            <Fieldset.Root disabled={submit.isPending}>
              <Fieldset.Legend hidden>Submit for review</Fieldset.Legend>
              <Fieldset.Fields>
                <Field.Root>
                  <Field.Label>Note to reviewer</Field.Label>
                  <Field.Control>
                    <Textarea.Root
                      rows={3}
                      maxLength={2000}
                      value={note}
                      onChange={(event) => setNote(event.target.value)}
                    />
                  </Field.Control>
                  <Field.Error>
                    {submit.isError ? errorMessage(submit.error) : null}
                  </Field.Error>
                </Field.Root>
              </Fieldset.Fields>
            </Fieldset.Root>
            <Button.Root
              type="submit"
              loading={submit.isPending}
              disabled={pendingScopes.length === 0}
            >
              Submit for review
            </Button.Root>
          </form>
        ) : (
          <>
            <Button.Root
              variant="secondary"
              loading={withdraw.isPending}
              onClick={() => withdraw.mutate()}
            >
              Withdraw
            </Button.Root>
            {withdraw.isError ? (
              <p role="alert" className="text-[12px] font-500 text-neg">
                {errorMessage(withdraw.error)}
              </p>
            ) : null}
          </>
        )}
      </Card.Body>
    </Card.Root>
  )
}

function metadataScopes(value: unknown): string | null {
  if (!Array.isArray(value)) return null
  const scopes = value.filter(
    (item): item is string => typeof item === "string",
  )
  return scopes.length === 0 ? null : scopes.join(" ")
}

function ReviewHistory({
  environment,
}: { environment: Environment }): ReactElement | null {
  const history = useQuery({
    queryKey: [...keys.appAudit(environment.appId), environment.id],
    queryFn: () =>
      api.apps.audit(environment.appId, {
        environmentId: environment.id,
        limit: 50,
      }),
  })
  if (history.isError && isApiError(history.error, "forbidden")) return null
  const events: AuditEvent[] = (history.data?.data ?? []).filter((event) =>
    event.action.startsWith("review-"),
  )
  return (
    <section aria-labelledby="review-history" className="flex flex-col gap-3">
      <h2 id="review-history" className="text-[14px] font-600 text-ink">
        History
      </h2>
      {history.isPending ? (
        <p aria-busy="true" className="text-[12px] text-secondary">
          Loading
        </p>
      ) : events.length === 0 ? (
        <p className="border-t border-line py-3 text-[12px] text-secondary">
          No reviews
        </p>
      ) : (
        <ol className="m-0 flex list-none flex-col p-0">
          {events.map((event) => {
            const scopes = metadataScopes(
              event.metadata.approvedScopes ?? event.metadata.requestedScopes,
            )
            return (
              <li
                key={event.id}
                className="flex flex-col gap-1 border-t border-line py-2.5"
              >
                <span className="flex items-baseline justify-between gap-3 text-[13px]">
                  <span className="text-ink">
                    {humanize(event.action.replace("review-", ""))}
                  </span>
                  <time
                    dateTime={event.occurredAt}
                    className="text-[12px] text-secondary"
                  >
                    {formatDateTime(event.occurredAt)}
                  </time>
                </span>
                {scopes === null ? null : (
                  <span className="font-mono text-[11px] text-secondary">
                    {scopes}
                  </span>
                )}
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}
