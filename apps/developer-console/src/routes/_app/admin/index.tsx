import {
  type ReviewRecordState,
  reviewRecordStateSchema,
} from "@repo/platform-contracts/console"
import {
  type PlatformScope,
  platformScopeSchema,
} from "@repo/platform-contracts/scopes"
import * as Badge from "@repo/ui/badge"
import * as Button from "@repo/ui/button"
import * as EmptyState from "@repo/ui/empty-state"
import * as Field from "@repo/ui/field"
import * as Fieldset from "@repo/ui/fieldset"
import * as Select from "@repo/ui/select"
import * as Skeleton from "@repo/ui/skeleton"
import * as Table from "@repo/ui/table"
import { useInfiniteQuery } from "@tanstack/react-query"
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router"
import type { ReactElement } from "react"
import { EnvBadge, ReviewBadge } from "../../../components/Badges"
import QueryError from "../../../components/QueryError"
import * as api from "../../../lib/api"
import { formatRelative, humanize } from "../../../lib/format"
import { keys } from "../../../lib/queries"

type QueueSearch = { state?: ReviewRecordState; scope?: PlatformScope }

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

function ReviewQueue(): ReactElement {
  const search = Route.useSearch()
  const state = search.state ?? "open"
  const navigate = useNavigate()
  const reviews = useInfiniteQuery({
    queryKey: [...keys.admin, "reviews", state],
    queryFn: ({ pageParam }) => api.admin.reviews({ state, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  })
  const rows = (reviews.data?.pages ?? [])
    .flatMap((page) => page.data)
    .filter(
      (review) =>
        search.scope === undefined ||
        review.requestedScopes.includes(search.scope),
    )

  function setFilter(next: QueueSearch): void {
    void navigate({
      to: "/admin",
      search: { ...search, ...next },
      replace: true,
    })
  }

  return (
    <div className="flex flex-col gap-6">
      <Fieldset.Root>
        <Fieldset.Legend hidden>Filters</Fieldset.Legend>
        <Fieldset.Fields className="flex-row flex-wrap">
          <Field.Root>
            <Field.Label>State</Field.Label>
            <Select.Root
              value={state}
              onValueChange={(value) => {
                const parsed = reviewRecordStateSchema.safeParse(value)
                if (parsed.success) setFilter({ state: parsed.data })
              }}
            >
              <Field.Control>
                <Select.Trigger className="w-[180px]">
                  <Select.Value />
                </Select.Trigger>
              </Field.Control>
              <Select.Content>
                {reviewRecordStateSchema.options.map((option) => (
                  <Select.Item key={option} value={option}>
                    {humanize(option)}
                  </Select.Item>
                ))}
              </Select.Content>
            </Select.Root>
          </Field.Root>
          <Field.Root>
            <Field.Label>Scope</Field.Label>
            <Select.Root
              value={search.scope ?? anyScope}
              onValueChange={(value) => {
                const parsed = platformScopeSchema.safeParse(value)
                void navigate({
                  to: "/admin",
                  search: {
                    ...(search.state === undefined
                      ? {}
                      : { state: search.state }),
                    ...(parsed.success ? { scope: parsed.data } : {}),
                  },
                  replace: true,
                })
              }}
            >
              <Field.Control>
                <Select.Trigger className="w-[200px]">
                  <Select.Value />
                </Select.Trigger>
              </Field.Control>
              <Select.Content>
                <Select.Item value={anyScope}>Any scope</Select.Item>
                {platformScopeSchema.options.map((option) => (
                  <Select.Item key={option} value={option}>
                    {option}
                  </Select.Item>
                ))}
              </Select.Content>
            </Select.Root>
          </Field.Root>
        </Fieldset.Fields>
      </Fieldset.Root>
      {reviews.isPending ? (
        <div aria-busy="true" className="flex flex-col gap-3">
          {["a", "b", "c", "d"].map((key) => (
            <Skeleton.Root key={key} shape="block" />
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
          <EmptyState.Action>
            <Button.Root
              variant="secondary"
              onClick={() => setFilter({ state: "open" })}
            >
              Open reviews
            </Button.Root>
          </EmptyState.Action>
        </EmptyState.Root>
      ) : (
        <Table.Root>
          <Table.Header>
            <Table.Row>
              <Table.Head>App</Table.Head>
              <Table.Head className="hidden md:table-cell">
                Organization
              </Table.Head>
              <Table.Head>Env</Table.Head>
              <Table.Head>Requested</Table.Head>
              <Table.Head>State</Table.Head>
              <Table.Head className="hidden sm:table-cell">
                Submitted
              </Table.Head>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {rows.map((review) => (
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
                <Table.Cell>
                  <Link
                    to="/admin/reviews/$reviewId"
                    params={{ reviewId: review.id }}
                    className="font-600 text-ink hover:underline"
                    onClick={(event) => event.stopPropagation()}
                  >
                    {review.app.name}
                  </Link>
                </Table.Cell>
                <Table.Cell className="hidden text-secondary md:table-cell">
                  {review.organization.name}
                </Table.Cell>
                <Table.Cell>
                  <EnvBadge kind={review.environment.kind} />
                </Table.Cell>
                <Table.Cell>
                  <span className="flex flex-wrap gap-1">
                    {review.requestedScopes.map((scope) => (
                      <Badge.Root
                        key={scope}
                        mono
                        tone={
                          review.environment.approvedScopes.includes(scope)
                            ? "neutral"
                            : "accent"
                        }
                      >
                        {scope}
                      </Badge.Root>
                    ))}
                  </span>
                </Table.Cell>
                <Table.Cell>
                  <ReviewBadge state={review.state} />
                </Table.Cell>
                <Table.Cell className="hidden text-secondary sm:table-cell">
                  {formatRelative(review.createdAt)}
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table.Root>
      )}
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
