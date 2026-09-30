import type {
  AdminReview,
  ReviewDecision,
} from "@repo/platform-contracts/console"
import { type PlatformScope, diffScopes } from "@repo/platform-contracts/scopes"
import * as Badge from "@repo/ui/badge"
import * as Button from "@repo/ui/button"
import * as Card from "@repo/ui/card"
import * as Checkbox from "@repo/ui/checkbox"
import * as CopyField from "@repo/ui/copy-field"
import * as Field from "@repo/ui/field"
import * as Fieldset from "@repo/ui/fieldset"
import * as KeyValue from "@repo/ui/key-value"
import * as SegmentedControl from "@repo/ui/segmented-control"
import * as Skeleton from "@repo/ui/skeleton"
import * as Textarea from "@repo/ui/textarea"
import * as Toast from "@repo/ui/toast"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Link, createFileRoute } from "@tanstack/react-router"
import { ArrowLeft } from "lucide-react"
import { type FormEvent, type ReactElement, useId, useState } from "react"
import {
  AppStatusBadge,
  EnvBadge,
  ReviewBadge,
} from "../../../components/Badges"
import QueryError from "../../../components/QueryError"
import * as api from "../../../lib/api"
import { errorMessage } from "../../../lib/api-client"
import { formatDateTime, humanize } from "../../../lib/format"
import { keys } from "../../../lib/queries"
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
  return (
    <div className="flex flex-col gap-6">
      <Link
        to="/admin"
        className="inline-flex items-center gap-1.5 self-start text-[13px] font-550 text-secondary hover:text-ink"
      >
        <ArrowLeft aria-hidden="true" size={14} strokeWidth={1.75} />
        Reviews
      </Link>
      {review.isPending ? (
        <div aria-busy="true" className="grid grid-cols-1 gap-8 lg:grid-cols-2">
          <Skeleton.Root shape="block" className="h-64" />
          <Skeleton.Root shape="block" className="h-64" />
        </div>
      ) : review.isError ? (
        <QueryError
          error={review.error}
          onRetry={() => void review.refetch()}
        />
      ) : (
        <ReviewDetail review={review.data} />
      )}
    </div>
  )
}

function ScopeDiff({ review }: { review: AdminReview }): ReactElement {
  const diff = diffScopes(
    review.environment.approvedScopes,
    review.requestedScopes,
  )
  const rows: Array<{
    scope: PlatformScope
    change: "added" | "removed" | "unchanged"
  }> = [
    ...diff.added.map((scope) => ({ scope, change: "added" as const })),
    ...diff.unchanged.map((scope) => ({ scope, change: "unchanged" as const })),
    ...diff.removed.map((scope) => ({ scope, change: "removed" as const })),
  ]
  return (
    <ul className="m-0 flex list-none flex-col p-0">
      {rows.map((row) => (
        <li
          key={row.scope}
          className="flex items-center justify-between gap-3 border-t border-line py-2 first:border-t-0"
        >
          <code className="font-mono text-[12px] text-ink">
            <span aria-hidden="true" className="mr-2 text-secondary">
              {row.change === "added"
                ? "+"
                : row.change === "removed"
                  ? "−"
                  : " "}
            </span>
            {row.scope}
          </code>
          <Badge.Root
            tone={
              row.change === "added"
                ? "accent"
                : row.change === "removed"
                  ? "neg"
                  : "neutral"
            }
          >
            {row.change === "added"
              ? "Added"
              : row.change === "removed"
                ? "Removed"
                : "Approved"}
          </Badge.Root>
        </li>
      ))}
    </ul>
  )
}

function History({ review }: { review: AdminReview }): ReactElement {
  const history = useQuery({
    queryKey: [...keys.admin, "audit", "environment", review.environment.id],
    queryFn: () =>
      api.admin.audit({ environmentId: review.environment.id, limit: 50 }),
  })
  const events = (history.data?.data ?? []).filter((event) =>
    event.action.startsWith("review-"),
  )
  return (
    <Card.Root>
      <Card.Header>
        <Card.Title>History</Card.Title>
      </Card.Header>
      {history.isPending ? (
        <Skeleton.Root shape="block" />
      ) : history.isError ? (
        <QueryError
          error={history.error}
          onRetry={() => void history.refetch()}
        />
      ) : events.length === 0 ? (
        <p className="border-t border-line py-3 text-[12px] text-secondary">
          No history
        </p>
      ) : (
        <ol className="m-0 flex list-none flex-col p-0">
          {events.map((event) => (
            <li
              key={event.id}
              className="flex items-baseline justify-between gap-3 border-t border-line py-2 text-[13px]"
            >
              <span className="text-ink">
                {humanize(event.action.replace("review-", ""))}
                <span className="ml-2 text-[11px] text-secondary">
                  {humanize(event.actorType)}
                </span>
              </span>
              <time
                dateTime={event.occurredAt}
                className="shrink-0 text-[12px] text-secondary"
              >
                {formatDateTime(event.occurredAt)}
              </time>
            </li>
          ))}
        </ol>
      )}
    </Card.Root>
  )
}

function DecisionForm({ review }: { review: AdminReview }): ReactElement {
  const [decision, setDecision] = useState<ReviewDecision>("approve")
  const [note, setNote] = useState("")
  const [approved, setApproved] = useState<PlatformScope[]>(
    review.requestedScopes,
  )
  const queryClient = useQueryClient()
  const stepUp = useStepUp()
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

  function submit(event: FormEvent): void {
    event.preventDefault()
    if (!needsNote) decide.mutate()
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <Fieldset.Root disabled={decide.isPending}>
        <Fieldset.Legend>Decision</Fieldset.Legend>
        <Fieldset.Fields>
          <Field.Root>
            <Field.Label>Outcome</Field.Label>
            <Field.Control>
              <SegmentedControl.Root
                aria-label="Outcome"
                value={decision}
                onValueChange={(value) => {
                  if (
                    value === "approve" ||
                    value === "request-changes" ||
                    value === "reject"
                  ) {
                    setDecision(value)
                  }
                }}
                className="self-start"
              >
                <SegmentedControl.Item value="approve">
                  Approve
                </SegmentedControl.Item>
                <SegmentedControl.Item value="request-changes">
                  Changes
                </SegmentedControl.Item>
                <SegmentedControl.Item value="reject">
                  Reject
                </SegmentedControl.Item>
              </SegmentedControl.Root>
            </Field.Control>
          </Field.Root>
          {decision === "approve" ? (
            <Field.Root>
              <Field.Label>Approved scopes</Field.Label>
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                {review.requestedScopes.map((scope) => {
                  const id = `${baseId}-${scope}`
                  return (
                    <li key={scope} className="flex items-center gap-2.5">
                      <Checkbox.Root
                        id={id}
                        checked={approved.includes(scope)}
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
                        className="font-mono text-[12px] text-ink"
                      >
                        {scope}
                      </label>
                    </li>
                  )
                })}
              </ul>
            </Field.Root>
          ) : null}
          <Field.Root required={decision !== "approve"}>
            <Field.Label>Note to developer</Field.Label>
            <Field.Control>
              <Textarea.Root
                rows={4}
                maxLength={2000}
                value={note}
                onChange={(event) => setNote(event.target.value)}
              />
            </Field.Control>
            <Field.Error>
              {decide.isError && !isStepUpCancelled(decide.error)
                ? errorMessage(decide.error)
                : null}
            </Field.Error>
          </Field.Root>
        </Fieldset.Fields>
      </Fieldset.Root>
      <Button.Root
        type="submit"
        variant={decision === "reject" ? "danger" : "primary"}
        loading={decide.isPending}
        disabled={
          needsNote || (decision === "approve" && approved.length === 0)
        }
        className="self-end"
      >
        {decision === "approve"
          ? "Approve"
          : decision === "reject"
            ? "Reject"
            : "Request changes"}
      </Button.Root>
    </form>
  )
}

function ReviewDetail({ review }: { review: AdminReview }): ReactElement {
  return (
    <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="flex min-w-0 flex-col gap-8">
        <header className="flex flex-wrap items-center gap-3">
          <h2 className="text-[22px] font-600 text-ink">{review.app.name}</h2>
          <AppStatusBadge status={review.app.status} />
          <EnvBadge kind={review.environment.kind} />
          <ReviewBadge state={review.state} />
        </header>
        <KeyValue.Root>
          <KeyValue.Item>
            <KeyValue.Term>Organization</KeyValue.Term>
            <KeyValue.Value>{review.organization.name}</KeyValue.Value>
          </KeyValue.Item>
          <KeyValue.Item>
            <KeyValue.Term>Website</KeyValue.Term>
            <KeyValue.Value className="truncate">
              {review.app.websiteUrl === null ? null : (
                <a
                  href={review.app.websiteUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-accent-ink underline-offset-2 hover:underline"
                >
                  {review.app.websiteUrl}
                </a>
              )}
            </KeyValue.Value>
          </KeyValue.Item>
          <KeyValue.Item>
            <KeyValue.Term>Submitter</KeyValue.Term>
            <KeyValue.Value>{review.submitterEmail}</KeyValue.Value>
          </KeyValue.Item>
          <KeyValue.Item>
            <KeyValue.Term>Submitted</KeyValue.Term>
            <KeyValue.Value>{formatDateTime(review.createdAt)}</KeyValue.Value>
          </KeyValue.Item>
          <KeyValue.Item>
            <KeyValue.Term>Decided</KeyValue.Term>
            <KeyValue.Value>
              {review.decidedAt === null
                ? null
                : formatDateTime(review.decidedAt)}
            </KeyValue.Value>
          </KeyValue.Item>
        </KeyValue.Root>
        <CopyField.Root value={review.environment.clientId} label="client ID" />
        <Card.Root>
          <Card.Header>
            <Card.Title>Scopes</Card.Title>
          </Card.Header>
          <ScopeDiff review={review} />
        </Card.Root>
        <Card.Root>
          <Card.Header>
            <Card.Title>Submitter note</Card.Title>
          </Card.Header>
          <p className="whitespace-pre-wrap border-t border-line py-3 text-[13px] text-ink-2">
            {review.submitterNote ?? "—"}
          </p>
        </Card.Root>
        {review.reviewerNote === null ? null : (
          <Card.Root>
            <Card.Header>
              <Card.Title>Reviewer note</Card.Title>
            </Card.Header>
            <p className="whitespace-pre-wrap border-t border-line py-3 text-[13px] text-ink-2">
              {review.reviewerNote}
            </p>
          </Card.Root>
        )}
        <History review={review} />
      </div>
      <aside>
        {review.state === "open" ? (
          <Card.Root variant="panel">
            <Card.Body className="pt-4">
              <DecisionForm review={review} />
            </Card.Body>
          </Card.Root>
        ) : (
          <p className="text-[13px] text-secondary">
            Decided · <ReviewBadge state={review.state} />
          </p>
        )}
      </aside>
    </div>
  )
}
