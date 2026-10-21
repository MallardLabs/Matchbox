import type { Environment } from "@repo/platform-contracts/console"
import {
  type EnvironmentKind,
  chainIdForNetwork,
} from "@repo/platform-contracts/network"
import {
  type OidcScope,
  type PlatformScope,
  normalizeScopes,
  oidcScopeSchema,
  platformScopeSchema,
  scopeDefinitions,
  scopeMayBeOptional,
} from "@repo/platform-contracts/scopes"
import * as Button from "@repo/ui/button"
import * as Checkbox from "@repo/ui/checkbox"
import { cn } from "@repo/ui/cn"
import * as CopyField from "@repo/ui/copy-field"
import * as Field from "@repo/ui/field"
import * as Skeleton from "@repo/ui/skeleton"
import * as Switch from "@repo/ui/switch"
import * as Table from "@repo/ui/table"
import * as Textarea from "@repo/ui/textarea"
import * as Toast from "@repo/ui/toast"
import {
  type UseQueryResult,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"
import { Link, createFileRoute } from "@tanstack/react-router"
import { Info } from "lucide-react"
import { type FormEvent, type ReactElement, useId, useState } from "react"
import EnvironmentGate from "../../../../components/EnvironmentGate"
import { Pill, ScopeChip } from "../../../../components/ui/Pill"
import SectionHead from "../../../../components/ui/SectionHead"
import {
  ReviewStatus,
  StatusDot,
  StatusLabel,
  type StatusTone,
} from "../../../../components/ui/Status"
import * as api from "../../../../lib/api"
import { errorMessage, isApiError } from "../../../../lib/api-client"
import { useAppRoute } from "../../../../lib/app-route"
import { dash, formatMonthDay, shortName } from "../../../../lib/format"
import {
  apiKeysQuery,
  environmentQuery,
  environmentReviewsQuery,
  keys,
} from "../../../../lib/queries"
import {
  reviewHistory,
  scopeSummary,
  visibleReviewerNote,
} from "../../../../lib/reviews"

export const Route = createFileRoute("/_app/apps/$appId/environments")({
  component: EnvironmentsTab,
})

const kindLabels: Record<EnvironmentKind, string> = {
  test: "Test",
  live: "Live",
}

function EnvironmentsTab(): ReactElement {
  const { appId, kind } = useAppRoute()
  const test = useQuery(environmentQuery(appId, "test"))
  const live = useQuery(environmentQuery(appId, "live"))
  return (
    <div className="flex flex-col gap-7">
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <EnvironmentCard kind="test" query={test} selected={kind === "test"} />
        <EnvironmentCard kind="live" query={live} selected={kind === "live"} />
      </div>
      <EnvironmentGate key={kind} appId={appId} kind={kind}>
        {(environment) => (
          <div className="grid grid-cols-1 gap-7 xl:grid-cols-[minmax(0,1fr)_380px]">
            <ScopesForm
              key={`scopes-${environment.id}-${environment.updatedAt}`}
              environment={environment}
            />
            <ReviewPanel
              key={`review-${environment.id}`}
              environment={environment}
            />
          </div>
        )}
      </EnvironmentGate>
    </div>
  )
}

function EnvironmentCard({
  kind,
  query,
  selected,
}: {
  kind: EnvironmentKind
  query: UseQueryResult<Environment>
  selected: boolean
}): ReactElement {
  const environment = query.data
  return (
    <article
      aria-label={`${kindLabels[kind]} environment`}
      className={cn(
        "relative flex min-w-0 flex-col rounded-lg border bg-surface px-[18px] pb-1.5 pt-4 transition-colors",
        selected
          ? "border-accent shadow-[0_0_0_0.5px_var(--accent)]"
          : "border-line hover:border-line-2",
      )}
    >
      <header className="flex min-w-0 items-center gap-2.5 pb-3">
        <StatusDot
          tone={kind === "live" ? "pos" : "neutral"}
          className="size-2"
        />
        <h2 className="text-lead font-600 text-ink">
          <Link
            to="."
            search={kind === "live" ? { env: "live" } : {}}
            replace
            aria-current={selected ? "true" : undefined}
            className="outline-none after:absolute after:inset-0 after:rounded-lg focus-visible:after:outline focus-visible:after:outline-2 focus-visible:after:outline-offset-2 focus-visible:after:outline-accent-ink"
          >
            {kindLabels[kind]}
          </Link>
        </h2>
        {environment === undefined ? null : (
          <span className="truncate font-mono text-caption text-muted">
            {`${environment.network} · ${chainIdForNetwork(environment.network)}`}
          </span>
        )}
        <span className="flex-1" />
        {environment === undefined ? null : (
          <ReviewStatus state={environment.reviewState} />
        )}
      </header>
      {query.isPending ? (
        <div aria-busy="true" className="flex flex-col gap-3 pb-3">
          <Skeleton.Root shape="block" />
          <Skeleton.Root className="h-4 w-2/3" />
          <Skeleton.Root className="h-4 w-1/2" />
        </div>
      ) : environment === undefined ? (
        <p className="pb-3 text-body-sm text-secondary">
          {isApiError(query.error, "not_found")
            ? "Not created"
            : errorMessage(query.error)}
        </p>
      ) : (
        <EnvironmentSummary environment={environment} />
      )}
    </article>
  )
}

function EnvironmentSummary({
  environment,
}: {
  environment: Environment
}): ReactElement {
  const apiKeys = useQuery(apiKeysQuery(environment.id))
  const activeKeys = apiKeys.data?.data.filter((key) => key.status === "active")
  return (
    <>
      <CopyField.Root
        value={environment.clientId}
        label={`${environment.kind} client ID`}
        className="relative z-10"
      />
      <dl className="m-0 mt-1 flex flex-col">
        <div className="flex items-center gap-3 border-b border-line py-2.5">
          <dt className="text-body-sm text-secondary">Client type</dt>
          <span className="flex-1" />
          <dd className="m-0 text-body-sm text-ink">
            {environment.clientType === "public"
              ? "Public · PKCE"
              : "Confidential"}
          </dd>
        </div>
        <div className="flex min-h-[41px] items-center gap-3 border-b border-line py-2.5">
          <dt className="shrink-0 text-body-sm text-secondary">
            Approved scopes
          </dt>
          <span className="flex-1" />
          <dd className="m-0 flex flex-wrap justify-end gap-1">
            {environment.approvedScopes.length === 0 ? (
              <span className="text-body-sm text-muted">{dash}</span>
            ) : (
              environment.approvedScopes.map((scope) => (
                <ScopeChip key={scope} scope={scope} />
              ))
            )}
          </dd>
        </div>
      </dl>
      <dl className="m-0 grid grid-cols-3 py-2.5">
        <Count
          label="Keys"
          value={activeKeys === undefined ? dash : String(activeKeys.length)}
        />
        <Count label="Origins" value={String(environment.origins.length)} />
        <Count
          label="Redirects"
          value={String(environment.redirectUris.length)}
        />
      </dl>
    </>
  )
}

function Count({
  label,
  value,
}: {
  label: string
  value: string
}): ReactElement {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-caption text-muted">{label}</dt>
      <dd className="m-0 font-mono text-body-sm text-ink">{value}</dd>
    </div>
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

/** Scope state for the saved environment (design C04a "State"). */
function scopeState(
  scope: PlatformScope,
  environment: Environment,
): { tone: StatusTone; label: string } | "review" | null {
  const approved = environment.approvedScopes.includes(scope)
  const requested = environment.requestedScopes.includes(scope)
  if (approved) return { tone: "pos", label: "Approved" }
  if (requested) {
    switch (environment.reviewState) {
      case "submitted":
        return { tone: "warn", label: "In review" }
      case "changes-requested":
        return { tone: "warn", label: "Changes requested" }
      case "rejected":
        return { tone: "neg", label: "Rejected" }
      default:
        return { tone: "neutral", label: "Not submitted" }
    }
  }
  return scopeDefinitions[scope].requiresReview ? "review" : null
}

function claimsText(scope: PlatformScope): string {
  const claims = scopeDefinitions[scope].claims
  return claims.length === 0 ? "API keys" : claims.join("  ")
}

function isOidcScope(scope: PlatformScope): scope is OidcScope {
  return oidcScopeSchema.safeParse(scope).success
}

function ScopesForm({
  environment,
}: {
  environment: Environment
}): ReactElement {
  const [selected, setSelected] = useState<PlatformScope[]>(
    environment.requestedScopes,
  )
  const supportsOptional = environment.optionalScopes !== undefined
  const [optional, setOptional] = useState<OidcScope[]>(
    environment.optionalScopes ?? [],
  )
  const apply = useEnvironmentUpdate(environment)
  const { toast } = Toast.useToast()
  const baseId = useId()
  const locked = environment.openReview !== null
  const requested = normalizeScopes(selected)
  const optionalChosen = optional.filter(
    (scope) => requested.includes(scope) && scopeMayBeOptional(scope),
  )
  const save = useMutation({
    mutationFn: () =>
      api.environments.updateScopes(
        environment.id,
        requested,
        supportsOptional ? optionalChosen : undefined,
      ),
    async onSuccess(updated) {
      await apply(updated)
      toast({ title: "Scopes saved" })
    },
  })
  const dirty =
    requested.join(" ") !==
      normalizeScopes(environment.requestedScopes).join(" ") ||
    (supportsOptional &&
      [...optionalChosen].sort().join(" ") !==
        [...(environment.optionalScopes ?? [])].sort().join(" "))

  function toggle(scope: PlatformScope, on: boolean): void {
    setSelected((current) =>
      on ? [...current, scope] : current.filter((item) => item !== scope),
    )
  }

  function submit(event: FormEvent): void {
    event.preventDefault()
    if (dirty) save.mutate()
  }

  return (
    <form
      onSubmit={submit}
      aria-labelledby={`${baseId}-title`}
      className="flex min-w-0 flex-col"
      noValidate
    >
      <SectionHead
        id={`${baseId}-title`}
        title={`${kindLabels[environment.kind]} scopes`}
        className="pb-2"
      >
        <span className="font-mono text-caption text-muted">
          {`scope v${environment.scopeVersion}`}
        </span>
      </SectionHead>
      <Table.Root>
        <Table.Header>
          <Table.Row>
            <Table.Head className="w-7">
              <span className="sr-only">Requested</span>
            </Table.Head>
            <Table.Head className="w-[200px]">Scope</Table.Head>
            <Table.Head className="hidden sm:table-cell">Claims</Table.Head>
            {supportsOptional ? (
              <Table.Head className="w-[84px]">Optional</Table.Head>
            ) : null}
            <Table.Head className="w-[140px]">State</Table.Head>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {platformScopeSchema.options.map((scope) => {
            const definition = scopeDefinitions[scope]
            const id = `${baseId}-${scope}`
            const state = scopeState(scope, environment)
            const checked = selected.includes(scope)
            return (
              <Table.Row key={scope}>
                <Table.Cell className="py-2.5">
                  <Checkbox.Root
                    id={id}
                    checked={checked}
                    disabled={locked || save.isPending}
                    onCheckedChange={(value) => toggle(scope, value === true)}
                  />
                </Table.Cell>
                <Table.Cell>
                  <label htmlFor={id} className="flex flex-col gap-0.5">
                    <span className="font-mono text-body-sm text-ink">
                      {scope}
                    </span>
                    <span className="text-caption text-muted">
                      {definition.label}
                    </span>
                  </label>
                </Table.Cell>
                <Table.Cell className="hidden font-mono text-label text-ink-2 sm:table-cell">
                  {claimsText(scope)}
                </Table.Cell>
                {supportsOptional ? (
                  <Table.Cell>
                    {isOidcScope(scope) && scopeMayBeOptional(scope) ? (
                      <Switch.Root
                        aria-label={`${scope} optional at consent`}
                        checked={optional.includes(scope)}
                        disabled={!checked || locked || save.isPending}
                        onCheckedChange={(on) =>
                          setOptional((current) =>
                            on
                              ? [...current, scope]
                              : current.filter((item) => item !== scope),
                          )
                        }
                      />
                    ) : (
                      <span className="text-caption text-muted">Required</span>
                    )}
                  </Table.Cell>
                ) : null}
                <Table.Cell>
                  {state === "review" ? (
                    <Pill className="border border-line bg-surface">
                      Review
                    </Pill>
                  ) : state === null ? (
                    <span className="text-muted">{dash}</span>
                  ) : (
                    <StatusLabel tone={state.tone}>{state.label}</StatusLabel>
                  )}
                </Table.Cell>
              </Table.Row>
            )
          })}
        </Table.Body>
      </Table.Root>
      <div className="flex flex-wrap items-center gap-2 pt-3.5">
        <Info
          aria-hidden="true"
          size={14}
          strokeWidth={1.75}
          className="shrink-0 text-muted"
        />
        <p className="min-w-0 flex-1 text-label text-secondary">
          {locked
            ? "Review open · withdraw to edit scopes"
            : "Approval bumps scope version · users re-consent"}
        </p>
        <Button.Root
          variant="ghost"
          size="sm"
          disabled={!dirty || save.isPending}
          onClick={() => {
            setSelected(environment.requestedScopes)
            setOptional(environment.optionalScopes ?? [])
          }}
        >
          Reset
        </Button.Root>
        <Button.Root
          type="submit"
          variant="secondary"
          size="sm"
          loading={save.isPending}
          disabled={!dirty || locked}
        >
          Save scopes
        </Button.Root>
      </div>
      {save.isError ? (
        <p role="alert" className="pt-2 text-label font-500 text-neg">
          {errorMessage(save.error)}
        </p>
      ) : null}
    </form>
  )
}

function ReviewPanel({
  environment,
}: {
  environment: Environment
}): ReactElement {
  const [note, setNote] = useState("")
  const apply = useEnvironmentUpdate(environment)
  const queryClient = useQueryClient()
  const { toast } = Toast.useToast()
  const noteId = useId()
  const reviews = useQuery(environmentReviewsQuery(environment.id))
  const refresh = async (): Promise<void> => {
    await queryClient.invalidateQueries({
      queryKey: keys.environmentReviews(environment.id),
    })
    await queryClient.invalidateQueries({
      queryKey: keys.appAudit(environment.appId),
    })
  }
  const submit = useMutation({
    mutationFn: () =>
      api.environments.submitReview(environment.id, note.trim()),
    async onSuccess(result) {
      await apply(result.environment)
      await refresh()
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
      await refresh()
      toast({ title: "Review withdrawn" })
    },
  })

  const open = environment.openReview
  const latest = reviews.data?.data[0]
  const reviewerNote = latest === undefined ? null : visibleReviewerNote(latest)
  const pending = environment.requestedScopes.filter(
    (scope) => !environment.approvedScopes.includes(scope),
  )
  const resubmit =
    latest !== undefined &&
    (latest.state === "changes-requested" || latest.state === "rejected")
  const history = reviewHistory(reviews.data?.data ?? []).slice(0, 6)

  function onSubmit(event: FormEvent): void {
    event.preventDefault()
    submit.mutate()
  }

  return (
    <section
      aria-labelledby={`${noteId}-title`}
      className="flex min-w-0 flex-col gap-3.5 self-start rounded-lg border border-line bg-surface px-5 py-[18px]"
    >
      <div className="flex min-w-0 items-center gap-2">
        <h2 id={`${noteId}-title`} className="text-body font-600 text-ink">
          Review
        </h2>
        <span className="truncate font-mono text-caption text-muted">
          {scopeSummary(open?.requestedScopes ?? pending)}
        </span>
        <span className="flex-1" />
        <ReviewStatus state={environment.reviewState} />
      </div>
      {reviewerNote === null || latest === undefined ? null : (
        <div className="flex flex-col gap-1.5 rounded-r-md border-l-2 border-accent bg-accent-soft px-3.5 py-3">
          <p className="flex items-center gap-1.5 text-caption text-accent-ink">
            Reviewer
            <span className="flex-1" />
            <span className="font-mono text-caption">
              {formatMonthDay(latest.decidedAt)}
            </span>
          </p>
          <p className="whitespace-pre-wrap text-body-sm leading-[19px] text-ink">
            {reviewerNote}
          </p>
        </div>
      )}
      {latest === undefined ? null : (
        <dl className="m-0 flex flex-col">
          <div className="flex items-center gap-3 border-b border-line py-2.5">
            <dt className="text-body-sm text-secondary">Submitted</dt>
            <span className="flex-1" />
            <dd className="m-0 truncate text-body-sm text-ink">
              {`${formatMonthDay(latest.createdAt)} · ${shortName(latest.submitterName)}`}
            </dd>
          </div>
          {latest.submitterNote === null ? null : (
            <div className="flex items-start gap-3 border-b border-line py-2.5">
              <dt className="shrink-0 text-body-sm text-secondary">
                Your note
              </dt>
              <span className="flex-1" />
              <dd className="m-0 min-w-0 whitespace-pre-wrap text-right text-body-sm text-ink">
                {latest.submitterNote}
              </dd>
            </div>
          )}
        </dl>
      )}
      {open === null ? (
        <form onSubmit={onSubmit} className="flex flex-col gap-3.5" noValidate>
          <Field.Root>
            <Field.Label>Note to reviewer</Field.Label>
            <Field.Control>
              <Textarea.Root
                rows={3}
                maxLength={2000}
                value={note}
                disabled={submit.isPending}
                onChange={(event) => setNote(event.target.value)}
              />
            </Field.Control>
            <Field.Error>
              {submit.isError ? errorMessage(submit.error) : null}
            </Field.Error>
          </Field.Root>
          <div className="flex items-center justify-end gap-2">
            <Button.Root
              type="submit"
              loading={submit.isPending}
              disabled={pending.length === 0}
            >
              {resubmit ? "Resubmit" : "Submit for review"}
            </Button.Root>
          </div>
        </form>
      ) : (
        <div className="flex items-center gap-2">
          <Button.Root
            variant="ghost"
            loading={withdraw.isPending}
            onClick={() => withdraw.mutate()}
          >
            Withdraw
          </Button.Root>
          <span className="flex-1" />
          <span className="text-label text-secondary">
            {`Open since ${formatMonthDay(open.createdAt)}`}
          </span>
        </div>
      )}
      {withdraw.isError ? (
        <p role="alert" className="text-label font-500 text-neg">
          {errorMessage(withdraw.error)}
        </p>
      ) : null}
      <div className="flex flex-col pt-1.5">
        <h3 className="pb-1.5 text-caption font-400 text-muted">History</h3>
        {reviews.isPending ? (
          <Skeleton.Root shape="block" className="h-16" />
        ) : reviews.isError ? (
          <p className="border-t border-line py-2 text-label text-secondary">
            Unavailable
          </p>
        ) : history.length === 0 ? (
          <p className="border-t border-line py-2 text-label text-secondary">
            No reviews
          </p>
        ) : (
          <ol className="m-0 flex list-none flex-col p-0">
            {history.map((event) => (
              <li
                key={event.key}
                className="flex min-w-0 items-center gap-2.5 border-t border-line py-2"
              >
                <time
                  dateTime={event.at}
                  className="shrink-0 font-mono text-caption text-muted"
                >
                  {formatMonthDay(event.at)}
                </time>
                <span className="min-w-0 truncate text-label text-ink-2">
                  {event.scopes}
                </span>
                <span className="flex-1" />
                <StatusLabel tone={event.tone} size="xs">
                  {event.label}
                </StatusLabel>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  )
}
