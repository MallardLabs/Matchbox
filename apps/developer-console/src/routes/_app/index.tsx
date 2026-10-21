import type {
  App,
  OrgReview,
  OrganizationSummary,
} from "@repo/platform-contracts/console"
import * as Button from "@repo/ui/button"
import { cn } from "@repo/ui/cn"
import * as EmptyState from "@repo/ui/empty-state"
import * as Skeleton from "@repo/ui/skeleton"
import * as Table from "@repo/ui/table"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { Link, createFileRoute } from "@tanstack/react-router"
import { ArrowRight, Plus } from "lucide-react"
import { type ReactElement, type ReactNode, useMemo, useState } from "react"
import QueryError from "../../components/QueryError"
import RequireOrg from "../../components/RequireOrg"
import RequestsBarChart from "../../components/charts/RequestsBarChart"
import OrgQuotaCard from "../../components/quota/OrgQuotaCard"
import { Crumb, Crumbs } from "../../components/shell/Breadcrumbs"
import ChipGroup from "../../components/ui/ChipGroup"
import PageTitle from "../../components/ui/PageTitle"
import { ScopeChip } from "../../components/ui/Pill"
import SectionHead from "../../components/ui/SectionHead"
import StatStrip, { type StatItem } from "../../components/ui/StatStrip"
import { ReviewStatus, StatusLabel } from "../../components/ui/Status"
import { changelog } from "../../lib/changelog"
import {
  dash,
  formatAgo,
  formatDecimalString,
  formatInteger,
  formatLatency,
  formatMonthDay,
  formatPercent,
  formatShare,
  humanize,
} from "../../lib/format"
import {
  chainHealth,
  healthLabels,
  healthTones,
  productHealth,
} from "../../lib/health"
import {
  appsQuery,
  healthQuery,
  orgReviewsQuery,
  orgUsageQuery,
} from "../../lib/queries"
import {
  addedScopes,
  developerReviewLabels,
  developerReviewTones,
  visibleReviewerNote,
} from "../../lib/reviews"
import { useTitle } from "../../lib/title"
import { groupSeries } from "../../lib/usage-chart"
import { rangeWindow, usageRanges } from "../../lib/usage-range"

export const Route = createFileRoute("/_app/")({
  component: OverviewPage,
})

function OverviewPage(): ReactElement {
  useTitle("Overview")
  return <RequireOrg>{(org) => <Overview org={org} />}</RequireOrg>
}

const wideSplit =
  "grid grid-cols-1 gap-x-10 gap-y-7 min-[1360px]:grid-cols-[minmax(0,1fr)_360px]"

function Overview({ org }: { org: OrganizationSummary }): ReactElement {
  const apps = useQuery(appsQuery(org.id))
  return (
    <div className="flex flex-col gap-7">
      <Crumbs>
        <Crumb>
          <Link to="/">{org.name}</Link>
        </Crumb>
        <Crumb current>Overview</Crumb>
      </Crumbs>
      <PageTitle
        eyebrow={org.name}
        title="Overview"
        actions={
          <Button.Root asChild>
            <Link to="/apps" search={{ create: true }}>
              <Plus aria-hidden="true" size={14} strokeWidth={2} />
              New app
            </Link>
          </Button.Root>
        }
      />
      <PlatformStatus />
      <div className={wideSplit}>
        <UsageSummary orgId={org.id} />
        <OrgQuotaCard
          orgId={org.id}
          apps={apps.data?.data}
          className="self-start"
        />
      </div>
      <div className={wideSplit}>
        <AppsSummary
          orgId={org.id}
          apps={apps.data?.data}
          pending={apps.isPending}
          error={apps.error}
          onRetry={() => void apps.refetch()}
        />
        <div className="flex min-w-0 flex-col gap-7">
          <Reviews orgId={org.id} apps={apps.data?.data} />
          <Changelog />
        </div>
      </div>
    </div>
  )
}

function Mono({ children }: { children: ReactNode }): ReactElement {
  return <span className="font-mono text-caption">{children}</span>
}

/** Status strip: API + ID health and chain-sync freshness per network. */
function PlatformStatus(): ReactElement {
  const health = useQuery(healthQuery)
  const data = health.data
  const loading = health.isPending
  const failed = health.isError
  const local = data?.source === "local" ? " · local" : ""
  const versionLabel = (version: string | null): string | null =>
    version === null ? null : /^\d/.test(version) ? `v${version}` : version

  function product(
    key: "gauge-profile-api" | "matchbox-id",
    label: string,
    sub: string,
  ): StatItem {
    const item = productHealth(data, key)
    return {
      key,
      label,
      loading,
      value:
        item === null || item.status === "unknown" ? (
          <span className="text-muted">{dash}</span>
        ) : (
          <StatusLabel tone={healthTones[item.status]} size="md">
            {healthLabels[item.status]}
          </StatusLabel>
        ),
      sub: failed ? "Unavailable" : <Mono>{`${sub}${local}`}</Mono>,
    }
  }

  function chain(network: "mezo" | "mezo-testnet", label: string): StatItem {
    const item = chainHealth(data, network)
    const lag = item?.lagSeconds ?? null
    return {
      key: network,
      label,
      loading,
      tone:
        lag === null
          ? "muted"
          : item?.status === "down"
            ? "neg"
            : item?.status === "degraded"
              ? "accent"
              : "default",
      value: formatAgo(lag),
      sub: failed ? (
        "Unavailable"
      ) : (
        <Mono>{`block ${formatDecimalString(item?.blockNumber ?? null)}`}</Mono>
      ),
    }
  }

  const version = versionLabel(
    productHealth(data, "gauge-profile-api")?.version ?? null,
  )
  return (
    <StatStrip
      aria-label="Platform status"
      size="sm"
      items={[
        product(
          "gauge-profile-api",
          "Gauge Profile API",
          version === null || version === "local" ? "api" : `api · ${version}`,
        ),
        product("matchbox-id", "Matchbox ID", "id · OIDC"),
        chain("mezo", "Chain sync · Mezo"),
        chain("mezo-testnet", "Chain sync · Testnet"),
      ]}
    />
  )
}

type OverviewRange = "24h" | "7d" | "30d"

const overviewRanges: OverviewRange[] = ["24h", "7d", "30d"]

function isOverviewRange(value: string): value is OverviewRange {
  return value === "24h" || value === "7d" || value === "30d"
}

function Figure({
  label,
  value,
  sub,
  tone = "default",
  loading,
  className,
}: {
  label: string
  value: ReactNode
  sub: ReactNode
  tone?: "default" | "accent"
  loading: boolean
  className?: string
}): ReactElement {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1", className)}>
      <dt className="text-label text-muted">{label}</dt>
      <dd
        className={cn(
          "m-0 truncate text-metric font-600 tabular-nums",
          tone === "accent" ? "text-accent-ink" : "text-ink",
        )}
      >
        {loading ? <Skeleton.Root className="my-1 h-5 w-16" /> : value}
      </dd>
      <dd className="m-0 truncate text-label text-secondary">
        {loading ? null : sub}
      </dd>
    </div>
  )
}

function UsageSummary({ orgId }: { orgId: string }): ReactElement {
  const [range, setRange] = useState<OverviewRange>("7d")
  const window = useMemo(() => rangeWindow(range), [range])
  const usage = useQuery({
    ...orgUsageQuery({ orgId, ...window, environmentKind: "both" }),
    placeholderData: keepPreviousData,
  })
  const totals = usage.data?.totals
  const loading = usage.isPending
  const spec = usageRanges[range]
  const groups = useMemo(
    () =>
      usage.data === undefined
        ? []
        : groupSeries(usage.data.series, usageRanges[range].perBar),
    [usage.data, range],
  )
  const missing = usage.isError && usage.data === undefined
  const stale = usage.isPlaceholderData

  return (
    <section
      aria-labelledby="overview-usage"
      className="flex min-w-0 flex-col gap-[18px]"
    >
      <SectionHead id="overview-usage" title="Usage">
        <ChipGroup
          label="Range"
          value={range}
          onChange={(value) => {
            if (isOverviewRange(value)) setRange(value)
          }}
          options={overviewRanges.map((value) => ({
            value,
            label: usageRanges[value].label,
            ariaLabel: usageRanges[value].name,
          }))}
        />
      </SectionHead>
      <dl
        aria-busy={loading || undefined}
        className={cn(
          "m-0 flex flex-wrap items-end gap-x-6 gap-y-4",
          stale && "opacity-60",
        )}
      >
        <div className="flex min-w-[180px] flex-1 flex-col gap-1">
          <dt className="text-label text-muted">Requests</dt>
          <dd className="m-0 truncate text-hero font-600 tabular-nums tracking-[-0.01em] text-ink">
            {loading ? (
              <Skeleton.Root className="my-2 h-8 w-40" />
            ) : (
              formatInteger(totals?.requests ?? null)
            )}
          </dd>
          <dd className="m-0 text-label text-secondary">
            {missing ? "Unavailable" : "all apps · both envs"}
          </dd>
        </div>
        <Figure
          label="Error rate"
          className="w-[150px]"
          loading={loading}
          value={formatPercent(totals?.errorRate ?? null)}
          sub={
            totals === undefined
              ? dash
              : `4xx ${formatShare(totals.clientErrors, totals.requests)} · 5xx ${formatShare(totals.serverErrors, totals.requests)}`
          }
        />
        <Figure
          label="p95 latency"
          className="w-[130px]"
          loading={loading}
          value={formatLatency(totals?.p95LatencyMs ?? null)}
          sub={`p50 ${formatLatency(totals?.p50LatencyMs ?? null)}`}
        />
        <Figure
          label="Rate-limited"
          className="w-[120px]"
          loading={loading}
          tone={(totals?.rateLimited ?? 0) > 0 ? "accent" : "default"}
          value={formatInteger(totals?.rateLimited ?? null)}
          sub={`429 · ${spec.label}`}
        />
      </dl>
      {loading ? (
        <Skeleton.Root shape="block" className="h-[180px]" />
      ) : missing ? (
        <QueryError error={usage.error} onRetry={() => void usage.refetch()} />
      ) : (
        <RequestsBarChart
          title={`Requests, ${spec.name.toLowerCase()}`}
          groups={groups}
          bucket={spec.bucket}
          className={stale ? "opacity-60" : undefined}
        />
      )}
    </section>
  )
}

function AppsSummary({
  orgId,
  apps,
  pending,
  error,
  onRetry,
}: {
  orgId: string
  apps: App[] | undefined
  pending: boolean
  error: unknown
  onRetry: () => void
}): ReactElement {
  const week = useMemo(() => rangeWindow("7d"), [])
  const usage = useQuery(
    orgUsageQuery({ orgId, ...week, environmentKind: "both" }),
  )
  const requestsByApp = useMemo(() => {
    const totals = new Map<string, number>()
    for (const row of usage.data?.byEnvironment ?? []) {
      totals.set(
        row.app.id,
        (totals.get(row.app.id) ?? 0) + row.summary.requests,
      )
    }
    return totals
  }, [usage.data])

  return (
    <section aria-labelledby="overview-apps" className="flex min-w-0 flex-col">
      <SectionHead
        id="overview-apps"
        title="Apps"
        count={apps?.length}
        className="pb-2"
      >
        <Button.Root variant="ghost" size="sm" asChild>
          <Link to="/apps">
            All apps
            <ArrowRight aria-hidden="true" size={13} strokeWidth={1.75} />
          </Link>
        </Button.Root>
      </SectionHead>
      {pending ? (
        <div aria-busy="true" className="flex flex-col gap-3">
          {["a", "b", "c"].map((key) => (
            <Skeleton.Root key={key} shape="block" />
          ))}
        </div>
      ) : apps === undefined ? (
        <QueryError error={error} onRetry={onRetry} />
      ) : apps.length === 0 ? (
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
      ) : (
        <Table.Root>
          <Table.Header>
            <Table.Row>
              <Table.Head>App</Table.Head>
              <Table.Head className="hidden w-[150px] sm:table-cell">
                Test · Mezo testnet
              </Table.Head>
              <Table.Head className="w-[150px]">Live · Mezo</Table.Head>
              <Table.Head numeric className="hidden w-[110px] sm:table-cell">
                Requests · 7 d
              </Table.Head>
              <Table.Head className="hidden w-[80px] md:table-cell">
                Status
              </Table.Head>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {apps.map((app) => {
              const test = app.environments.find((env) => env.kind === "test")
              const live = app.environments.find((env) => env.kind === "live")
              const requests = requestsByApp.get(app.id)
              return (
                <Table.Row key={app.id}>
                  <Table.Cell className="py-[11px]">
                    <Link
                      to="/apps/$appId"
                      params={{ appId: app.id }}
                      className="text-body-sm font-600 text-ink hover:underline"
                    >
                      {app.name}
                    </Link>
                  </Table.Cell>
                  <Table.Cell className="hidden sm:table-cell">
                    {test === undefined ? (
                      dash
                    ) : (
                      <ReviewStatus state={test.reviewState} />
                    )}
                  </Table.Cell>
                  <Table.Cell>
                    {live === undefined ? (
                      dash
                    ) : (
                      <ReviewStatus state={live.reviewState} />
                    )}
                  </Table.Cell>
                  <Table.Cell numeric className="hidden sm:table-cell">
                    {requests === undefined ? (
                      <span className="text-muted">{dash}</span>
                    ) : (
                      formatInteger(requests)
                    )}
                  </Table.Cell>
                  <Table.Cell className="hidden text-body-sm text-secondary md:table-cell">
                    {humanize(app.status)}
                  </Table.Cell>
                </Table.Row>
              )
            })}
          </Table.Body>
        </Table.Root>
      )}
    </section>
  )
}

function Reviews({
  orgId,
  apps,
}: {
  orgId: string
  apps: App[] | undefined
}): ReactElement {
  const reviews = useQuery(orgReviewsQuery(orgId))
  const rows = (reviews.data?.data ?? [])
    .filter((review) => review.state !== "withdrawn")
    .slice(0, 3)
  return (
    <section aria-labelledby="overview-reviews" className="flex flex-col">
      <SectionHead
        id="overview-reviews"
        title="Reviews"
        count={reviews.data === undefined ? undefined : rows.length}
        className="pb-1"
      />
      {reviews.isPending ? (
        <div aria-busy="true" className="flex flex-col gap-3 py-3">
          <Skeleton.Root shape="block" className="h-14" />
          <Skeleton.Root shape="block" className="h-14" />
        </div>
      ) : reviews.isError ? (
        <p className="border-b border-line py-3 text-body-sm text-secondary">
          Unavailable
        </p>
      ) : rows.length === 0 ? (
        <p className="border-b border-line py-3 text-body-sm text-secondary">
          No reviews
        </p>
      ) : (
        <ul className="m-0 flex list-none flex-col p-0">
          {rows.map((review) => (
            <ReviewItem key={review.id} review={review} apps={apps} />
          ))}
        </ul>
      )}
    </section>
  )
}

function ReviewItem({
  review,
  apps,
}: {
  review: OrgReview
  apps: App[] | undefined
}): ReactElement {
  const environment = apps
    ?.find((app) => app.id === review.app.id)
    ?.environments.find((env) => env.id === review.environmentId)
  const scopes = addedScopes(
    review.requestedScopes,
    environment?.approvedScopes ?? [],
  )
  const note = visibleReviewerNote(review)
  return (
    <li className="flex flex-col gap-2 border-b border-line py-3">
      <p className="flex min-w-0 items-center gap-2">
        <Link
          to="/apps/$appId/environments"
          params={{ appId: review.app.id }}
          search={review.environmentKind === "live" ? { env: "live" } : {}}
          className="truncate text-body-sm font-600 text-ink hover:underline"
        >
          {review.app.name}
        </Link>
        <span className="text-label text-muted">
          {review.environmentKind === "live" ? "Live" : "Test"}
        </span>
        <span className="flex-1" />
        <StatusLabel tone={developerReviewTones[review.state]}>
          {developerReviewLabels[review.state]}
        </StatusLabel>
      </p>
      <p className="flex min-w-0 items-center gap-1.5">
        <span className="flex min-w-0 flex-wrap gap-1">
          {scopes.map((scope) => (
            <ScopeChip key={scope} scope={scope} />
          ))}
        </span>
        <span className="flex-1" />
        <span className="shrink-0 text-caption text-muted">
          {review.state === "open"
            ? `Submitted ${formatMonthDay(review.createdAt)}`
            : formatMonthDay(review.decidedAt)}
        </span>
      </p>
      {note === null ? null : (
        <div className="flex flex-col gap-[3px] rounded-r-md border-l-2 border-accent bg-accent-soft px-3 py-2.5">
          <span className="text-caption font-600 text-accent-ink">
            Reviewer
          </span>
          <p className="whitespace-pre-wrap text-label leading-[17px] text-ink">
            {note}
          </p>
        </div>
      )}
    </li>
  )
}

function Changelog(): ReactElement {
  return (
    <section aria-labelledby="overview-changelog" className="flex flex-col">
      <SectionHead id="overview-changelog" title="Changelog" className="pb-1">
        <Button.Root variant="ghost" size="sm" asChild>
          <Link to="/docs/$page" params={{ page: "changelog" }}>
            All
          </Link>
        </Button.Root>
      </SectionHead>
      <ol className="m-0 flex list-none flex-col p-0">
        {changelog.slice(0, 3).map((entry) => (
          <li
            key={entry.version}
            className="flex items-center gap-2.5 border-t border-line py-2.5"
          >
            <span className="min-w-0 flex-1 truncate text-body-sm font-600 text-ink">
              {entry.title}
            </span>
            <span className="font-mono text-label text-secondary">
              {entry.version}
            </span>
            <time dateTime={entry.date} className="text-label text-muted">
              {formatMonthDay(`${entry.date}T12:00:00`)}
            </time>
          </li>
        ))}
      </ol>
    </section>
  )
}
