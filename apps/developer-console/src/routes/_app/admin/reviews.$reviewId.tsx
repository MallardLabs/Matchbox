import type { AuditEvent } from "@repo/platform-contracts/audit"
import type {
  AdminReview,
  ReviewDecision,
} from "@repo/platform-contracts/console"
import {
  type PlatformScope,
  normalizeScopes,
  scopeDefinitions,
} from "@repo/platform-contracts/scopes"
import * as Button from "@repo/ui/button"
import * as Checkbox from "@repo/ui/checkbox"
import { cn } from "@repo/ui/cn"
import * as SegmentedControl from "@repo/ui/segmented-control"
import * as Skeleton from "@repo/ui/skeleton"
import * as Table from "@repo/ui/table"
import * as Textarea from "@repo/ui/textarea"
import * as Toast from "@repo/ui/toast"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router"
import {
  ArrowUpRight,
  Check,
  ChevronLeft,
  ChevronRight,
  Eye,
  FileText,
  Lock,
} from "lucide-react"
import {
  type FormEvent,
  type ReactElement,
  type ReactNode,
  useId,
  useState,
} from "react"
import QueryError from "../../../components/QueryError"
import { Crumb, Crumbs } from "../../../components/shell/Breadcrumbs"
import LockHint from "../../../components/ui/LockHint"
import PageTitle from "../../../components/ui/PageTitle"
import { Pill } from "../../../components/ui/Pill"
import SectionHead from "../../../components/ui/SectionHead"
import {
  AppStatusLabel,
  StatusLabel,
  type StatusTone,
} from "../../../components/ui/Status"
import * as api from "../../../lib/api"
import { errorMessage } from "../../../lib/api-client"
import {
  dash,
  formatDateTime,
  formatHost,
  formatInteger,
  formatMonthDay,
  formatPercent,
  humanize,
} from "../../../lib/format"
import { keys } from "../../../lib/queries"
import {
  developerReviewLabels,
  developerReviewTones,
} from "../../../lib/reviews"
import { isStepUpCancelled, useStepUp } from "../../../lib/step-up"
import { useTitle } from "../../../lib/title"

export const Route = createFileRoute("/_app/admin/reviews/$reviewId")({
  component: ReviewDetailPage,
})

function ReviewDetailPage(): ReactElement {
  const { reviewId } = Route.useParams()
  const review = useQuery({
    queryKey: [...keys.admin, "review", reviewId],
    queryFn: () => api.admin.review(reviewId),
  })
  useTitle(
    review.data === undefined ? "Review" : `Review · ${review.data.app.name}`,
  )
  if (review.isPending) {
    return (
      <div aria-busy="true" className="flex flex-col gap-6">
        <Skeleton.Root className="h-9 w-72" />
        <div className="grid grid-cols-1 gap-8 xl:grid-cols-[minmax(0,1fr)_380px]">
          <Skeleton.Root shape="block" className="h-72" />
          <Skeleton.Root shape="block" className="h-72" />
        </div>
      </div>
    )
  }
  if (review.isError) {
    return (
      <QueryError error={review.error} onRetry={() => void review.refetch()} />
    )
  }
  return <ReviewDetail key={review.data.id} review={review.data} />
}

/** Previous / next open review in queue order. */
function QueueNav({ reviewId }: { reviewId: string }): ReactElement | null {
  const queue = useQuery({
    queryKey: [...keys.adminReviews("open", undefined), "first"],
    queryFn: () => api.admin.reviews({ state: "open" }),
  })
  const ids = queue.data?.data.map((item) => item.id) ?? []
  const index = ids.indexOf(reviewId)
  const previous = index > 0 ? ids[index - 1] : undefined
  const next = index >= 0 ? ids[index + 1] : ids[0]
  return (
    <span className="flex items-center gap-2">
      {previous === undefined ? (
        <Button.Root variant="secondary" disabled>
          <ChevronLeft aria-hidden="true" size={14} strokeWidth={1.75} />
          Previous
        </Button.Root>
      ) : (
        <Button.Root variant="secondary" asChild>
          <Link to="/admin/reviews/$reviewId" params={{ reviewId: previous }}>
            <ChevronLeft aria-hidden="true" size={14} strokeWidth={1.75} />
            Previous
          </Link>
        </Button.Root>
      )}
      {next === undefined || next === reviewId ? (
        <Button.Root variant="secondary" disabled>
          Next
          <ChevronRight aria-hidden="true" size={14} strokeWidth={1.75} />
        </Button.Root>
      ) : (
        <Button.Root variant="secondary" asChild>
          <Link to="/admin/reviews/$reviewId" params={{ reviewId: next }}>
            Next
            <ChevronRight aria-hidden="true" size={14} strokeWidth={1.75} />
          </Link>
        </Button.Root>
      )}
    </span>
  )
}

function Fact({
  term,
  children,
}: {
  term: string
  children: ReactNode
}): ReactElement {
  return (
    <div className="flex min-w-0 items-center gap-3 border-b border-line py-2.5">
      <dt className="shrink-0 text-body-sm text-secondary">{term}</dt>
      <span className="flex-1" />
      <dd className="m-0 min-w-0 truncate text-right text-body-sm text-ink">
        {children}
      </dd>
    </div>
  )
}

function ExternalLink({ href }: { href: string | null }): ReactElement {
  if (href === null) return <span className="text-muted">{dash}</span>
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className="inline-flex items-center gap-1 font-600 text-accent-ink hover:underline"
    >
      {formatHost(href)}
      {new URL(href).pathname.length > 1 ? new URL(href).pathname : ""}
      <ArrowUpRight aria-hidden="true" size={12} strokeWidth={1.75} />
    </a>
  )
}

function ReviewDetail({ review }: { review: AdminReview }): ReactElement {
  const context = useQuery({
    queryKey: [...keys.admin, "review", review.id, "context"],
    queryFn: () => api.admin.reviewContext(review.id),
  })
  const history = useQuery({
    queryKey: [...keys.admin, "audit", "environment", review.environment.id],
    queryFn: () =>
      api.admin.audit({ environmentId: review.environment.id, limit: 50 }),
  })
  const usage = context.data?.testUsage7d ?? null
  const kind = review.environment.kind === "live" ? "Live" : "Test"

  return (
    <div className="flex flex-col gap-6">
      <Crumbs>
        <Crumb>
          <Link to="/admin">Admin</Link>
        </Crumb>
        <Crumb>
          <Link to="/admin">Reviews</Link>
        </Crumb>
        <Crumb current>{review.app.name}</Crumb>
      </Crumbs>
      <PageTitle
        eyebrow={`Review · ${kind} · ${review.organization.name}`}
        title={review.app.name}
        adornment={
          <StatusLabel tone={developerReviewTones[review.state]}>
            {review.state === "open"
              ? "Open"
              : developerReviewLabels[review.state]}
          </StatusLabel>
        }
        actions={<QueueNav reviewId={review.id} />}
      />
      <div className="grid grid-cols-1 gap-8 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex min-w-0 flex-col gap-7">
          <div className="grid grid-cols-1 gap-x-8 md:grid-cols-2">
            <dl className="m-0 flex flex-col">
              <Fact term="Website">
                <ExternalLink href={review.app.websiteUrl} />
              </Fact>
              <Fact term="Privacy">
                <ExternalLink href={review.app.privacyUrl ?? null} />
              </Fact>
              <Fact term="Terms">
                <ExternalLink href={review.app.termsUrl ?? null} />
              </Fact>
              <Fact term="Support">{review.app.supportEmail ?? dash}</Fact>
            </dl>
            <dl className="m-0 flex flex-col">
              <Fact term="Submitter">{review.submitterEmail ?? dash}</Fact>
              <Fact term="Submitted">{formatDateTime(review.createdAt)}</Fact>
              <Fact term="Client ID">
                <span className="font-mono">
                  {`${review.environment.clientId.slice(0, 12)}…${review.environment.clientId.slice(-4)}`}
                </span>
              </Fact>
              <Fact term="App status">
                <AppStatusLabel status={review.app.status} />
              </Fact>
            </dl>
          </div>
          <ScopesTable
            review={review}
            scopeVersion={context.data?.scopeVersion ?? null}
            nextScopeVersion={context.data?.nextScopeVersion ?? null}
          />
          <section
            aria-labelledby="submitter-note"
            className="flex flex-col gap-2"
          >
            <h2 id="submitter-note" className="text-label text-muted">
              Submitter note
            </h2>
            <p className="whitespace-pre-wrap rounded-r-md border-l-2 border-line-2 bg-inset px-3.5 py-3 text-body-sm text-ink">
              {review.submitterNote ?? dash}
            </p>
          </section>
          <dl className="m-0 grid grid-cols-2 gap-4 border-y border-line py-3.5 md:grid-cols-4">
            <ContextFact
              label="Test requests · 7 d"
              value={formatInteger(usage?.requests ?? null)}
            />
            <ContextFact
              label="Errors"
              value={formatPercent(usage?.errorRate ?? null)}
            />
            <ContextFact
              label="Grants · test"
              value={formatInteger(context.data?.testActiveGrants ?? null)}
            />
            <ContextFact
              label="Prior reviews"
              value={formatInteger(context.data?.priorReviews ?? null)}
            />
          </dl>
          <History events={history.data?.data} pending={history.isPending} />
        </div>
        <aside className="flex min-w-0 flex-col">
          {review.state === "open" ? (
            <DecisionForm review={review} />
          ) : (
            <DecidedPanel review={review} />
          )}
        </aside>
      </div>
    </div>
  )
}

function ContextFact({
  label,
  value,
}: {
  label: string
  value: string
}): ReactElement {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <dt className="truncate text-caption text-muted">{label}</dt>
      <dd className="m-0 text-title-sm font-600 tabular-nums text-ink">
        {value}
      </dd>
    </div>
  )
}

function ScopesTable({
  review,
  scopeVersion,
  nextScopeVersion,
}: {
  review: AdminReview
  scopeVersion: number | null
  nextScopeVersion: number | null
}): ReactElement {
  const approved = review.environment.approvedScopes
  const scopes = normalizeScopes([...approved, ...review.requestedScopes])
  const added = review.requestedScopes.filter(
    (scope) => !approved.includes(scope),
  )
  const tick = (on: boolean): ReactElement =>
    on ? (
      <Check aria-label="Yes" size={14} strokeWidth={2} className="text-pos" />
    ) : (
      <span className="text-muted">
        <span aria-hidden="true">—</span>
        <span className="sr-only">No</span>
      </span>
    )
  return (
    <section aria-labelledby="review-scopes" className="flex flex-col">
      <SectionHead id="review-scopes" title="Scopes" className="pb-1">
        <span className="font-mono text-caption text-muted">
          {scopeVersion === null
            ? dash
            : nextScopeVersion === null
              ? `scope v${scopeVersion}`
              : `scope v${scopeVersion} → v${nextScopeVersion}`}
        </span>
      </SectionHead>
      <Table.Root>
        <Table.Header>
          <Table.Row>
            <Table.Head className="pl-2">Scope</Table.Head>
            <Table.Head className="hidden md:table-cell">Claims</Table.Head>
            <Table.Head className="w-[70px]">Now</Table.Head>
            <Table.Head className="w-[90px] pr-2">Requested</Table.Head>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {scopes.map((scope) => {
            const isAdded = added.includes(scope)
            const claims = scopeDefinitions[scope].claims
            return (
              <Table.Row
                key={scope}
                className={cn(isAdded && "bg-accent-soft")}
              >
                <Table.Cell className="py-3 pl-2">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-body-sm text-ink">
                      {scope}
                    </span>
                    {isAdded ? (
                      <Pill className="bg-accent-soft-2 text-accent-ink">
                        Added
                      </Pill>
                    ) : null}
                  </span>
                </Table.Cell>
                <Table.Cell className="hidden md:table-cell">
                  <span className="flex flex-col gap-0.5 font-mono text-caption text-ink-2">
                    {claims.length === 0
                      ? "API keys"
                      : claims.map((claim) => <span key={claim}>{claim}</span>)}
                  </span>
                </Table.Cell>
                <Table.Cell>{tick(approved.includes(scope))}</Table.Cell>
                <Table.Cell className="pr-2">
                  {tick(review.requestedScopes.includes(scope))}
                </Table.Cell>
              </Table.Row>
            )
          })}
        </Table.Body>
      </Table.Root>
    </section>
  )
}

const historyTones: Partial<Record<string, StatusTone>> = {
  "review-submitted": "warn",
  "review-approved": "pos",
  "review-auto-approved": "pos",
  "review-changes-requested": "warn",
  "review-rejected": "neg",
  "review-withdrawn": "neutral",
}

function metadataScopes(value: unknown): string | null {
  if (!Array.isArray(value)) return null
  const scopes = value.filter(
    (item): item is string => typeof item === "string",
  )
  return scopes.length === 0 ? null : scopes.join(" ")
}

function History({
  events,
  pending,
}: {
  events: AuditEvent[] | undefined
  pending: boolean
}): ReactElement {
  const rows = (events ?? []).filter(
    (event) =>
      event.action.startsWith("review-") || event.action === "app-created",
  )
  return (
    <section aria-labelledby="review-history" className="flex flex-col">
      <h2 id="review-history" className="pb-1.5 text-label text-muted">
        History
      </h2>
      {pending ? (
        <Skeleton.Root shape="block" className="h-16" />
      ) : rows.length === 0 ? (
        <p className="border-y border-line py-2.5 text-label text-secondary">
          No history
        </p>
      ) : (
        <ol className="m-0 flex list-none flex-col p-0">
          {rows.map((event) => {
            const scopes = metadataScopes(
              event.metadata.added ??
                event.metadata.approvedScopes ??
                event.metadata.requestedScopes,
            )
            return (
              <li
                key={event.id}
                className="flex min-w-0 items-center gap-3 border-t border-line py-2 last:border-b"
              >
                <time
                  dateTime={event.occurredAt}
                  className="w-12 shrink-0 font-mono text-caption text-muted"
                >
                  {formatMonthDay(event.occurredAt)}
                </time>
                <span className="min-w-0 truncate text-label text-ink-2">
                  {scopes ?? event.action}
                </span>
                <span className="flex-1" />
                <StatusLabel
                  tone={historyTones[event.action] ?? "neutral"}
                  size="xs"
                >
                  {event.action.startsWith("review-")
                    ? humanize(event.action.replace("review-", ""))
                    : "Audit"}
                </StatusLabel>
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}

const decisionLabels: Record<ReviewDecision, string> = {
  approve: "Approve",
  "request-changes": "Request changes",
  reject: "Reject",
}

function isDecision(value: string): value is ReviewDecision {
  return value in decisionLabels
}

function DecisionForm({ review }: { review: AdminReview }): ReactElement {
  const [decision, setDecision] = useState<ReviewDecision>("approve")
  const [note, setNote] = useState("")
  const alreadyApproved = review.environment.approvedScopes
  const [approved, setApproved] = useState<PlatformScope[]>(
    review.requestedScopes,
  )
  const queryClient = useQueryClient()
  const stepUp = useStepUp()
  const navigate = useNavigate()
  const { toast } = Toast.useToast()
  const baseId = useId()
  const decide = useMutation({
    mutationFn: () =>
      stepUp.run(() =>
        api.admin.decide(review.id, {
          decision,
          ...(note.trim() === "" ? {} : { note: note.trim() }),
          ...(decision === "approve" ? { approvedScopes: approved } : {}),
        }),
      ),
    async onSuccess(updated) {
      queryClient.setQueryData([...keys.admin, "review", review.id], updated)
      await queryClient.invalidateQueries({ queryKey: keys.admin })
      toast({ title: `Review ${humanize(updated.state).toLowerCase()}` })
    },
  })
  const needsNote = decision !== "approve" && note.trim() === ""
  const approving = decision === "approve"

  function submit(event: FormEvent): void {
    event.preventDefault()
    if (!needsNote) decide.mutate()
  }

  return (
    <form
      onSubmit={submit}
      aria-labelledby={`${baseId}-title`}
      className="flex flex-col gap-4 rounded-lg border border-line bg-surface px-5 pb-5 pt-[18px]"
      noValidate
    >
      <div className="flex items-center gap-2">
        <h2 id={`${baseId}-title`} className="text-body font-600 text-ink">
          Decision
        </h2>
        <span className="flex-1" />
        <LockHint />
      </div>
      <fieldset
        disabled={decide.isPending}
        className="m-0 flex min-w-0 flex-col gap-4 border-0 p-0"
      >
        <legend className="sr-only">Decision</legend>
        <SegmentedControl.Root
          aria-label="Outcome"
          value={decision}
          onValueChange={(value) => {
            if (isDecision(value)) setDecision(value)
          }}
          className="grid w-full grid-cols-3"
        >
          {(Object.keys(decisionLabels) as ReviewDecision[]).map((option) => (
            <SegmentedControl.Item
              key={option}
              value={option}
              className="px-1.5 text-body-sm"
            >
              {decisionLabels[option]}
            </SegmentedControl.Item>
          ))}
        </SegmentedControl.Root>
        <div className="flex flex-col">
          <h3 className="pb-1.5 text-label font-600 text-ink-2">
            Approved scopes
          </h3>
          <ul className="m-0 flex list-none flex-col p-0">
            {review.requestedScopes.map((scope) => {
              const id = `${baseId}-${scope}`
              const locked = alreadyApproved.includes(scope)
              return (
                <li
                  key={scope}
                  className="flex items-center gap-2.5 border-b border-line py-2"
                >
                  <Checkbox.Root
                    id={id}
                    checked={locked || (approving && approved.includes(scope))}
                    disabled={locked || !approving}
                    onCheckedChange={(checked) =>
                      setApproved((current) =>
                        checked === true
                          ? [...current, scope]
                          : current.filter((item) => item !== scope),
                      )
                    }
                  />
                  <label
                    htmlFor={id}
                    className="min-w-0 flex-1 truncate font-mono text-body-sm text-ink"
                  >
                    {scope}
                  </label>
                  {locked ? (
                    <span className="text-caption text-muted">approved</span>
                  ) : (
                    <Pill className="border border-accent bg-surface text-accent-ink">
                      Requested
                    </Pill>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="flex items-center gap-2">
            <label
              htmlFor={`${baseId}-note`}
              className="text-label font-600 text-ink-2"
            >
              Note to developer
            </label>
            <Pill className="bg-accent-soft text-accent-ink">
              <Eye aria-hidden="true" size={12} strokeWidth={1.75} />
              Shown to developer
            </Pill>
          </span>
          <Textarea.Root
            id={`${baseId}-note`}
            rows={4}
            maxLength={2000}
            required={!approving}
            aria-describedby={`${baseId}-note-hint`}
            value={note}
            className="bg-surface"
            onChange={(event) => setNote(event.target.value)}
          />
          <p id={`${baseId}-note-hint`} className="text-caption text-muted">
            {approving
              ? "Visible on Environments + Overview"
              : "Required · visible on Environments + Overview"}
          </p>
        </div>
      </fieldset>
      {decide.isError && !isStepUpCancelled(decide.error) ? (
        <p role="alert" className="text-label font-500 text-neg">
          {errorMessage(decide.error)}
        </p>
      ) : null}
      <div className="flex items-center gap-2">
        <Button.Root
          variant="ghost"
          disabled={decide.isPending}
          onClick={() => void navigate({ to: "/admin" })}
        >
          Cancel
        </Button.Root>
        <span className="flex-1" />
        <Button.Root
          type="submit"
          variant={decision === "reject" ? "danger" : "primary"}
          loading={decide.isPending}
          disabled={
            needsNote ||
            (approving &&
              approved.filter((scope) => !alreadyApproved.includes(scope))
                .length === 0)
          }
        >
          {decide.isPending ? null : (
            <Lock aria-hidden="true" size={13} strokeWidth={2} />
          )}
          {decisionLabels[decision]}
        </Button.Root>
      </div>
      <p className="flex items-center gap-2 border-t border-line pt-3.5 text-label text-secondary">
        <FileText
          aria-hidden="true"
          size={14}
          strokeWidth={1.75}
          className="text-muted"
        />
        Audit event · review-decided
      </p>
    </form>
  )
}

function DecidedPanel({ review }: { review: AdminReview }): ReactElement {
  return (
    <section
      aria-label="Decision"
      className="flex flex-col gap-3 rounded-lg border border-line bg-surface px-5 py-[18px]"
    >
      <p className="flex items-center gap-2">
        <span className="text-body font-600 text-ink">Decision</span>
        <span className="flex-1" />
        <StatusLabel tone={developerReviewTones[review.state]}>
          {developerReviewLabels[review.state]}
        </StatusLabel>
      </p>
      <dl className="m-0 flex flex-col">
        <Fact term="Decided">{formatDateTime(review.decidedAt)}</Fact>
      </dl>
      {review.reviewerNote === null ? null : (
        <div className="flex flex-col gap-1.5 rounded-r-md border-l-2 border-accent bg-accent-soft px-3.5 py-3">
          <span className="flex items-center gap-1.5 text-caption text-accent-ink">
            <Eye aria-hidden="true" size={12} strokeWidth={1.75} />
            Shown to developer
          </span>
          <p className="whitespace-pre-wrap text-body-sm text-ink">
            {review.reviewerNote}
          </p>
        </div>
      )}
    </section>
  )
}
