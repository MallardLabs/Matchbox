import type { AuditEvent } from "@repo/platform-contracts/audit"
import type { App, UsageResponse } from "@repo/platform-contracts/console"
import * as Button from "@repo/ui/button"
import * as Card from "@repo/ui/card"
import * as EmptyState from "@repo/ui/empty-state"
import * as PageHeader from "@repo/ui/page-header"
import * as Skeleton from "@repo/ui/skeleton"
import * as Table from "@repo/ui/table"
import { useQueries, useQuery } from "@tanstack/react-query"
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router"
import { Plus } from "lucide-react"
import { type ReactElement, useMemo } from "react"
import { AppStatusBadge, ReviewBadge } from "../../components/Badges"
import QueryError from "../../components/QueryError"
import RequireOrg from "../../components/RequireOrg"
import StatTile from "../../components/StatTile"
import { isApiError } from "../../lib/api-client"
import { changelog } from "../../lib/changelog"
import {
  dash,
  formatCompact,
  formatDate,
  formatLatency,
  formatPercent,
  formatRelative,
  humanize,
} from "../../lib/format"
import { appsQuery, orgAuditQuery, usageQuery } from "../../lib/queries"
import { useTitle } from "../../lib/title"
import { rangeWindow } from "../../lib/usage-range"

export const Route = createFileRoute("/_app/")({
  component: OverviewPage,
})

function OverviewPage(): ReactElement {
  useTitle("Overview")
  return (
    <RequireOrg>
      {(org) => (
        <div className="flex flex-col gap-10">
          <PageHeader.Root>
            <PageHeader.Heading>
              <PageHeader.Eyebrow>{org.name}</PageHeader.Eyebrow>
              <PageHeader.Title>Overview</PageHeader.Title>
            </PageHeader.Heading>
            <PageHeader.Actions>
              <Button.Root asChild>
                <Link to="/apps" search={{ create: true }}>
                  <Plus aria-hidden="true" size={13} strokeWidth={2} />
                  New app
                </Link>
              </Button.Root>
            </PageHeader.Actions>
          </PageHeader.Root>
          <OrgOverview orgId={org.id} />
        </div>
      )}
    </RequireOrg>
  )
}

const maxEnvironments = 12

type Totals = {
  requests: number
  errors: number
  p95: number | null
}

function sumUsage(responses: Array<UsageResponse | undefined>): Totals {
  let requests = 0
  let errors = 0
  let p95: number | null = null
  for (const response of responses) {
    if (response === undefined) continue
    requests += response.totals.requests
    errors += response.totals.errors
    const latency = response.totals.p95LatencyMs
    if (latency !== null) p95 = p95 === null ? latency : Math.max(p95, latency)
  }
  return { requests, errors, p95 }
}

function OrgOverview({ orgId }: { orgId: string }): ReactElement {
  const apps = useQuery(appsQuery(orgId))
  const environmentIds = useMemo(
    () =>
      (apps.data?.data ?? [])
        .flatMap((app) => app.environments.map((env) => env.id))
        .slice(0, maxEnvironments),
    [apps.data],
  )
  const day = useMemo(() => rangeWindow("24h"), [])
  const week = useMemo(() => rangeWindow("7d"), [])

  const dayUsage = useQueries({
    queries: environmentIds.map((environmentId) =>
      usageQuery({ environmentId, ...day }),
    ),
  })
  const weekUsage = useQueries({
    queries: environmentIds.map((environmentId) =>
      usageQuery({ environmentId, ...week, bucket: "day" }),
    ),
  })

  const loading =
    apps.isPending ||
    dayUsage.some((query) => query.isPending) ||
    weekUsage.some((query) => query.isPending)
  const usageFailed =
    dayUsage.length > 0 && dayUsage.every((query) => query.isError)
  const dayTotals = sumUsage(dayUsage.map((query) => query.data))
  const weekTotals = sumUsage(weekUsage.map((query) => query.data))
  const noTraffic = environmentIds.length === 0

  return (
    <>
      <section aria-labelledby="overview-usage">
        <h2 id="overview-usage" className="sr-only">
          Usage
        </h2>
        <dl
          aria-busy={loading || undefined}
          className="m-0 grid grid-cols-2 gap-x-6 lg:grid-cols-4"
        >
          <StatTile
            label="Requests · 24 h"
            loading={loading}
            value={
              usageFailed || noTraffic
                ? dash
                : formatCompact(dayTotals.requests)
            }
          />
          <StatTile
            label="Requests · 7 d"
            loading={loading}
            value={
              usageFailed || noTraffic
                ? dash
                : formatCompact(weekTotals.requests)
            }
          />
          <StatTile
            label="Error rate · 7 d"
            loading={loading}
            value={formatPercent(
              weekTotals.requests === 0
                ? null
                : weekTotals.errors / weekTotals.requests,
            )}
          />
          <StatTile
            label="p95 latency · 7 d"
            loading={loading}
            value={formatLatency(weekTotals.p95)}
            {...(environmentIds.length > 1 ? { detail: "max" } : {})}
          />
        </dl>
        {usageFailed ? (
          <QueryError error={dayUsage[0]?.error} className="mt-2" />
        ) : null}
      </section>

      <div className="grid grid-cols-1 gap-10 xl:grid-cols-[minmax(0,1fr)_340px]">
        <Card.Root>
          <Card.Header>
            <Card.Title>Apps</Card.Title>
            <Card.Actions>
              <Button.Root variant="ghost" size="sm" asChild>
                <Link to="/apps">All apps</Link>
              </Button.Root>
            </Card.Actions>
          </Card.Header>
          <AppsSummary
            apps={apps.data?.data}
            pending={apps.isPending}
            error={apps.error}
            onRetry={() => void apps.refetch()}
          />
        </Card.Root>
        <div className="flex flex-col gap-10">
          <RecentActivity orgId={orgId} />
          <Changelog />
        </div>
      </div>
    </>
  )
}

function AppsSummary({
  apps,
  pending,
  error,
  onRetry,
}: {
  apps: App[] | undefined
  pending: boolean
  error: unknown
  onRetry: () => void
}): ReactElement {
  const navigate = useNavigate()
  if (pending) {
    return (
      <div aria-busy="true" className="flex flex-col gap-3">
        {["a", "b", "c"].map((key) => (
          <Skeleton.Root key={key} shape="block" />
        ))}
      </div>
    )
  }
  if (apps === undefined) return <QueryError error={error} onRetry={onRetry} />
  if (apps.length === 0) {
    return (
      <EmptyState.Root>
        <EmptyState.Title>No apps</EmptyState.Title>
        <EmptyState.Action>
          <Button.Root asChild>
            <Link to="/apps" search={{ create: true }}>
              Create app
            </Link>
          </Button.Root>
        </EmptyState.Action>
      </EmptyState.Root>
    )
  }
  return (
    <Table.Root>
      <Table.Header>
        <Table.Row>
          <Table.Head>Name</Table.Head>
          <Table.Head>Test</Table.Head>
          <Table.Head>Live</Table.Head>
          <Table.Head>Status</Table.Head>
        </Table.Row>
      </Table.Header>
      <Table.Body>
        {apps.map((app) => {
          const test = app.environments.find((env) => env.kind === "test")
          const live = app.environments.find((env) => env.kind === "live")
          return (
            <Table.Row
              key={app.id}
              interactive
              onClick={() =>
                void navigate({ to: "/apps/$appId", params: { appId: app.id } })
              }
            >
              <Table.Cell>
                <Link
                  to="/apps/$appId"
                  params={{ appId: app.id }}
                  className="font-600 text-ink hover:underline"
                  onClick={(event) => event.stopPropagation()}
                >
                  {app.name}
                </Link>
              </Table.Cell>
              <Table.Cell>
                {test === undefined ? (
                  dash
                ) : (
                  <ReviewBadge state={test.reviewState} />
                )}
              </Table.Cell>
              <Table.Cell>
                {live === undefined ? (
                  dash
                ) : (
                  <ReviewBadge state={live.reviewState} />
                )}
              </Table.Cell>
              <Table.Cell>
                <AppStatusBadge status={app.status} />
              </Table.Cell>
            </Table.Row>
          )
        })}
      </Table.Body>
    </Table.Root>
  )
}

function RecentActivity({ orgId }: { orgId: string }): ReactElement | null {
  const audit = useQuery(orgAuditQuery(orgId, 8))
  if (audit.isError && isApiError(audit.error, "forbidden")) return null
  return (
    <Card.Root>
      <Card.Header>
        <Card.Title>Activity</Card.Title>
      </Card.Header>
      {audit.isPending ? (
        <div aria-busy="true" className="flex flex-col gap-3">
          {["a", "b", "c", "d"].map((key) => (
            <Skeleton.Root key={key} />
          ))}
        </div>
      ) : audit.isError ? (
        <QueryError error={audit.error} onRetry={() => void audit.refetch()} />
      ) : audit.data.data.length === 0 ? (
        <p className="border-t border-line py-4 text-[13px] text-secondary">
          No activity
        </p>
      ) : (
        <ol className="m-0 flex list-none flex-col p-0">
          {audit.data.data.map((event) => (
            <ActivityRow key={event.id} event={event} />
          ))}
        </ol>
      )}
    </Card.Root>
  )
}

function ActivityRow({ event }: { event: AuditEvent }): ReactElement {
  return (
    <li className="flex items-baseline justify-between gap-3 border-t border-line py-2.5 text-[13px]">
      <span className="min-w-0 truncate text-ink">
        {humanize(event.action)}
      </span>
      <time
        dateTime={event.occurredAt}
        title={event.occurredAt}
        className="shrink-0 text-[12px] text-secondary"
      >
        {formatRelative(event.occurredAt)}
      </time>
    </li>
  )
}

function Changelog(): ReactElement {
  return (
    <Card.Root>
      <Card.Header>
        <Card.Title>Changelog</Card.Title>
        <Card.Actions>
          <Button.Root variant="ghost" size="sm" asChild>
            <Link to="/docs/$page" params={{ page: "changelog" }}>
              All
            </Link>
          </Button.Root>
        </Card.Actions>
      </Card.Header>
      <ol className="m-0 flex list-none flex-col p-0">
        {changelog.slice(0, 3).map((entry) => (
          <li
            key={entry.version}
            className="flex flex-col gap-1 border-t border-line py-2.5"
          >
            <span className="flex items-baseline justify-between gap-3">
              <span className="text-[13px] font-600 text-ink">
                {entry.title}
              </span>
              <span className="font-mono text-[11px] text-secondary">
                {entry.version}
              </span>
            </span>
            <time dateTime={entry.date} className="text-[12px] text-secondary">
              {formatDate(entry.date)}
            </time>
          </li>
        ))}
      </ol>
    </Card.Root>
  )
}
