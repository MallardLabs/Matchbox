import {
  type ReviewRecordState,
  reviewRecordStateSchema,
} from "@repo/platform-contracts/console"
import {
  type PlatformScope,
  platformScopeSchema,
  scopeDefinitions,
} from "@repo/platform-contracts/scopes"
import * as Button from "@repo/ui/button"
import { cn } from "@repo/ui/cn"
import * as EmptyState from "@repo/ui/empty-state"
import * as Select from "@repo/ui/select"
import * as Skeleton from "@repo/ui/skeleton"
import * as Table from "@repo/ui/table"
import { useInfiniteQuery, useQuery } from "@tanstack/react-query"
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router"
import { Info } from "lucide-react"
import type { ReactElement } from "react"
import QueryError from "../../../components/QueryError"
import ChipGroup from "../../../components/ui/ChipGroup"
import { ScopeChip } from "../../../components/ui/Pill"
import StatStrip from "../../../components/ui/StatStrip"
import * as api from "../../../lib/api"
import { dash, formatMonthDay, formatSpan } from "../../../lib/format"
import { keys } from "../../../lib/queries"
import { developerReviewLabels } from "../../../lib/reviews"

type QueueSearch = { state?: ReviewRecordState; scope?: PlatformScope }

/** Queue filters, most actionable first. */
const stateOrder = [
  "open",
  "changes-requested",
  "approved",
  "rejected",
  "withdrawn",
] as const satisfies readonly ReviewRecordState[]

export const Route = createFileRoute("/_app/admin/")({
  validateSearch: (search: Record<string, unknown>): QueueSearch => {
    const state = reviewRecordStateSchema.safeParse(search.state)
    const scope = platformScopeSchema.safeParse(search.scope)
    return {
      ...(state.success ? { state: state.data } : {}),
      ...(scope.success ? { scope: scope.data } : {}),
    }
  },
  component: ReviewQueue,
})

const anyScope = "any"

const stateLabels: Record<ReviewRecordState, string> = {
  ...developerReviewLabels,
  open: "Open",
}

/** Short wait like "5d" / "19h" (whole units). */
function shortSpan(seconds: number): string {
  return formatSpan(seconds).split(" ")[0] ?? dash
}

/** Reviews waiting longer than this read as overdue. */
const overdueSeconds = 3 * 86_400

function ReviewQueue(): ReactElement {
  const search = Route.useSearch()
  const state = search.state ?? "open"
  const navigate = useNavigate()
  const stats = useQuery({
    queryKey: keys.adminReviewStats,
    queryFn: () => api.admin.reviewStats(),
  })
  const reviews = useInfiniteQuery({
    queryKey: keys.adminReviews(state, search.scope),
    queryFn: ({ pageParam }) =>
      api.admin.reviews({ state, scope: search.scope, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  })
  const rows = (reviews.data?.pages ?? []).flatMap((page) => page.data)
  const now = Date.now()
  const data = stats.data
  const oldestWait =
    data?.oldestOpen == null
      ? null
      : (now - Date.parse(data.oldestOpen.createdAt)) / 1000

  function setFilter(next: QueueSearch): void {
    void navigate({
      to: "/admin",
      search: { ...search, ...next },
      replace: true,
    })
  }

  return (
    <div className="flex flex-col gap-6">
      <StatStrip
        aria-label="Review queue"
        items={[
          {
            key: "open",
            label: "Open",
            loading: stats.isPending,
            value: data === undefined ? dash : String(data.open),
          },
          {
            key: "oldest",
            label: "Oldest",
            loading: stats.isPending,
            tone:
              oldestWait === null
                ? "muted"
                : oldestWait > overdueSeconds
                  ? "accent"
                  : "default",
            value: oldestWait === null ? dash : shortSpan(oldestWait),
            sub: data?.oldestOpen?.appName ?? "None waiting",
          },
          {
            key: "decided",
            label: "Decided · 7 d",
            loading: stats.isPending,
            value: data === undefined ? dash : String(data.decided7d.total),
            sub:
              data === undefined
                ? dash
                : `${data.decided7d.approved} approved · ${data.decided7d.changesRequested} changes · ${data.decided7d.rejected} rejected`,
          },
          {
            key: "median",
            label: "Median wait",
            loading: stats.isPending,
            value:
              data?.medianWaitSeconds == null
                ? dash
                : shortSpan(data.medianWaitSeconds),
          },
        ]}
      />
      <div className="flex flex-wrap items-center gap-2">
        <ChipGroup
          label="State"
          value={state}
          onChange={(value) => {
            const parsed = reviewRecordStateSchema.safeParse(value)
            if (parsed.success) setFilter({ state: parsed.data })
          }}
          options={stateOrder.map((option) => ({
            value: option,
            label:
              option === "open" && data !== undefined
                ? `Open · ${data.open}`
                : stateLabels[option],
          }))}
        />
        <span className="flex-1" />
        <Select.Root
          value={search.scope ?? anyScope}
          onValueChange={(value) => {
            const parsed = platformScopeSchema.safeParse(value)
            void navigate({
              to: "/admin",
              search: {
                ...(search.state === undefined ? {} : { state: search.state }),
                ...(parsed.success ? { scope: parsed.data } : {}),
              },
              replace: true,
            })
          }}
        >
          <Select.Trigger
            aria-label="Scope"
            size="sm"
            className="h-8 w-auto min-w-[120px] bg-surface"
          >
            <Select.Value />
          </Select.Trigger>
          <Select.Content align="end">
            <Select.Item value={anyScope}>Any scope</Select.Item>
            {platformScopeSchema.options.map((option) => (
              <Select.Item key={option} value={option}>
                {option}
              </Select.Item>
            ))}
          </Select.Content>
        </Select.Root>
      </div>
      {reviews.isPending ? (
        <div aria-busy="true" className="flex flex-col gap-3">
          {["a", "b", "c", "d"].map((key) => (
            <Skeleton.Root key={key} shape="block" className="h-12" />
          ))}
        </div>
      ) : reviews.isError ? (
        <QueryError
          error={reviews.error}
          onRetry={() => void reviews.refetch()}
        />
      ) : rows.length === 0 ? (
        <EmptyState.Root>
          <EmptyState.Title>No reviews</EmptyState.Title>
          {state === "open" ? null : (
            <EmptyState.Action>
              <Button.Root
                variant="secondary"
                onClick={() => setFilter({ state: "open" })}
              >
                Open reviews
              </Button.Root>
            </EmptyState.Action>
          )}
        </EmptyState.Root>
      ) : (
        <Table.Root>
          <Table.Header>
            <Table.Row>
              <Table.Head className="pl-2.5">App</Table.Head>
              <Table.Head className="hidden w-[60px] sm:table-cell">
                Env
              </Table.Head>
              <Table.Head>Requested</Table.Head>
              <Table.Head className="hidden lg:table-cell">
                Approved now
              </Table.Head>
              <Table.Head className="hidden w-[90px] md:table-cell">
                Submitted
              </Table.Head>
              <Table.Head numeric className="w-[70px] pr-2.5">
                {state === "open" ? "Waiting" : "Decided"}
              </Table.Head>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {rows.map((review) => {
              const approved = review.environment.approvedScopes
              const added = review.requestedScopes.filter(
                (scope) => !approved.includes(scope),
              )
              const wait =
                (now -
                  Date.parse(
                    state === "open"
                      ? review.createdAt
                      : (review.decidedAt ?? review.createdAt),
                  )) /
                1000
              return (
                <Table.Row
                  key={review.id}
                  interactive
                  onClick={() =>
                    void navigate({
                      to: "/admin/reviews/$reviewId",
                      params: { reviewId: review.id },
                    })
                  }
                >
                  <Table.Cell className="py-2.5 pl-2.5">
                    <span className="flex min-w-0 flex-col">
                      <Link
                        to="/admin/reviews/$reviewId"
                        params={{ reviewId: review.id }}
                        onClick={(event) => event.stopPropagation()}
                        className="truncate text-body-sm font-600 text-ink hover:underline"
                      >
                        {review.app.name}
                      </Link>
                      <span className="truncate text-label text-secondary">
                        {review.organization.name}
                      </span>
                    </span>
                  </Table.Cell>
                  <Table.Cell className="hidden text-body-sm text-ink-2 sm:table-cell">
                    {review.environment.kind === "live" ? "Live" : "Test"}
                  </Table.Cell>
                  <Table.Cell>
                    <span className="flex flex-wrap gap-1">
                      {(added.length > 0 ? added : review.requestedScopes).map(
                        (scope) => (
                          <ScopeChip
                            key={scope}
                            scope={scope}
                            pending={scopeDefinitions[scope].requiresReview}
                          />
                        ),
                      )}
                    </span>
                  </Table.Cell>
                  <Table.Cell className="hidden lg:table-cell">
                    {approved.length === 0 ? (
                      <span className="text-muted">{dash}</span>
                    ) : (
                      <span className="flex flex-wrap gap-1">
                        {approved.map((scope) => (
                          <ScopeChip key={scope} scope={scope} />
                        ))}
                      </span>
                    )}
                  </Table.Cell>
                  <Table.Cell className="hidden text-label text-ink-2 md:table-cell">
                    {formatMonthDay(review.createdAt)}
                  </Table.Cell>
                  <Table.Cell
                    numeric
                    className={cn(
                      "pr-2.5 font-sans text-body-sm",
                      state === "open" && wait > overdueSeconds
                        ? "font-600 text-accent-ink"
                        : "text-ink",
                    )}
                  >
                    {shortSpan(Math.max(0, wait))}
                  </Table.Cell>
                </Table.Row>
              )
            })}
          </Table.Body>
        </Table.Root>
      )}
      <p className="flex items-center gap-2 text-label text-secondary">
        <Info
          aria-hidden="true"
          size={14}
          strokeWidth={1.75}
          className="text-muted"
        />
        gauge-profiles:read auto-approves · discord:* needs review
      </p>
      {reviews.hasNextPage ? (
        <Button.Root
          variant="secondary"
          className="self-start"
          loading={reviews.isFetchingNextPage}
          onClick={() => void reviews.fetchNextPage()}
        >
          Load more
        </Button.Root>
      ) : null}
    </div>
  )
}
