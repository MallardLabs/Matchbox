import type {
  EnvironmentKindFilter,
  OrgUsageEnvironment,
  OrganizationSummary,
} from "@repo/platform-contracts/console"
import type { QuotaWindow } from "@repo/platform-contracts/rate-limits"
import * as Button from "@repo/ui/button"
import { cn } from "@repo/ui/cn"
import * as SegmentedControl from "@repo/ui/segmented-control"
import * as Select from "@repo/ui/select"
import * as Skeleton from "@repo/ui/skeleton"
import * as Table from "@repo/ui/table"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { Link, createFileRoute } from "@tanstack/react-router"
import { Download } from "lucide-react"
import { type ReactElement, useMemo, useState } from "react"
import QueryError from "../../components/QueryError"
import RequireOrg from "../../components/RequireOrg"
import RequestsBarChart from "../../components/charts/RequestsBarChart"
import { Crumb, Crumbs } from "../../components/shell/Breadcrumbs"
import ChipGroup from "../../components/ui/ChipGroup"
import PageTitle from "../../components/ui/PageTitle"
import { EnvPill } from "../../components/ui/Pill"
import QuotaBar, { quotaWarnAt } from "../../components/ui/QuotaBar"
import SectionHead from "../../components/ui/SectionHead"
import StatStrip from "../../components/ui/StatStrip"
import { ByKey, TopRoutes } from "../../components/usage/UsageTables"
import * as api from "../../lib/api"
import {
  dash,
  formatInteger,
  formatLatency,
  formatShare,
} from "../../lib/format"
import { appsQuery, orgQuotasQuery, orgUsageQuery } from "../../lib/queries"
import { quotaFraction, quotaPercent } from "../../lib/quota"
import { useTitle } from "../../lib/title"
import { groupSeries } from "../../lib/usage-chart"
import {
  type UsageRange,
  isUsageRange,
  rangeWindow,
  usageRanges,
} from "../../lib/usage-range"

export const Route = createFileRoute("/_app/usage")({
  component: UsagePage,
})

function UsagePage(): ReactElement {
  useTitle("Usage")
  return <RequireOrg>{(org) => <OrgUsage org={org} />}</RequireOrg>
}

const allApps = "all"
const allKeys = "all"
const ranges: UsageRange[] = ["24h", "7d", "30d", "90d"]

function isKindFilter(value: string): value is EnvironmentKindFilter {
  return value === "live" || value === "test" || value === "both"
}

function OrgUsage({ org }: { org: OrganizationSummary }): ReactElement {
  const [range, setRange] = useState<UsageRange>("7d")
  const [kind, setKind] = useState<EnvironmentKindFilter>("both")
  const [appId, setAppId] = useState<string>(allApps)
  const [keyId, setKeyId] = useState<string>(allKeys)
  const spec = usageRanges[range]
  const window = useMemo(() => rangeWindow(range), [range])
  const base = {
    orgId: org.id,
    ...window,
    environmentKind: kind,
    appId: appId === allApps ? undefined : appId,
  }
  const params = { ...base, apiKeyId: keyId === allKeys ? undefined : keyId }
  const usage = useQuery({
    ...orgUsageQuery(params),
    placeholderData: keepPreviousData,
  })
  // Key choices come from the unfiltered view so picking one keeps the rest.
  const keyOptions = useQuery({
    ...orgUsageQuery({ ...base, apiKeyId: undefined }),
    enabled: keyId !== allKeys,
  })
  const apps = useQuery(appsQuery(org.id))
  const quotas = useQuery(orgQuotasQuery(org.id, "both"))
  const data = usage.data
  const totals = data?.totals
  const loading = usage.isPending
  const stale = usage.isPlaceholderData
  const groups = useMemo(
    () => (data === undefined ? [] : groupSeries(data.series, spec.perBar)),
    [data, spec.perBar],
  )
  const keyRows = (keyId === allKeys ? data : keyOptions.data)?.byKey ?? []
  const dailyByEnvironment = new Map(
    (quotas.data?.data ?? []).map((status) => [
      status.environmentId,
      status.secret?.daily ?? null,
    ]),
  )
  const requests = totals?.requests ?? 0

  return (
    <div className="flex flex-col gap-7">
      <Crumbs>
        <Crumb>
          <Link to="/">{org.name}</Link>
        </Crumb>
        <Crumb current>Usage</Crumb>
      </Crumbs>
      <PageTitle
        eyebrow={org.name}
        title="Usage"
        actions={
          <Button.Root variant="secondary" asChild>
            <a href={api.orgs.usageCsvUrl(params)} download>
              <Download aria-hidden="true" size={14} strokeWidth={1.75} />
              Export CSV
            </a>
          </Button.Root>
        }
      />
      <div className="flex flex-wrap items-center gap-2">
        <Select.Root
          value={appId}
          onValueChange={(value) => {
            setAppId(value)
            setKeyId(allKeys)
          }}
        >
          <Select.Trigger
            aria-label="App"
            size="sm"
            className="h-8 w-auto min-w-[110px] bg-surface"
          >
            <Select.Value />
          </Select.Trigger>
          <Select.Content>
            <Select.Item value={allApps}>All apps</Select.Item>
            {(apps.data?.data ?? []).map((app) => (
              <Select.Item key={app.id} value={app.id}>
                {app.name}
              </Select.Item>
            ))}
          </Select.Content>
        </Select.Root>
        <SegmentedControl.Root
          aria-label="Environment"
          size="sm"
          value={kind}
          onValueChange={(value) => {
            if (isKindFilter(value)) {
              setKind(value)
              setKeyId(allKeys)
            }
          }}
        >
          <SegmentedControl.Item value="live" className="text-body-sm">
            Live
          </SegmentedControl.Item>
          <SegmentedControl.Item value="test" className="text-body-sm">
            Test
          </SegmentedControl.Item>
          <SegmentedControl.Item value="both" className="text-body-sm">
            Both
          </SegmentedControl.Item>
        </SegmentedControl.Root>
        <Select.Root value={keyId} onValueChange={setKeyId}>
          <Select.Trigger
            aria-label="Key"
            size="sm"
            className="h-8 w-auto min-w-[110px] bg-surface"
          >
            <Select.Value />
          </Select.Trigger>
          <Select.Content>
            <Select.Item value={allKeys}>All keys</Select.Item>
            {keyRows
              .filter((row) => row.apiKeyId !== null)
              .map((row) => (
                <Select.Item key={row.apiKeyId} value={row.apiKeyId ?? ""}>
                  {`${row.displayPrefix ?? "Key"}${row.app === null ? "" : ` · ${row.app.name}`}`}
                </Select.Item>
              ))}
          </Select.Content>
        </Select.Root>
        <span className="flex-1" />
        <ChipGroup
          label="Range"
          value={range}
          onChange={(value) => {
            if (isUsageRange(value)) setRange(value)
          }}
          options={ranges.map((value) => ({
            value,
            label: usageRanges[value].label,
            ariaLabel: usageRanges[value].name,
          }))}
        />
      </div>
      <StatStrip
        aria-label="Totals"
        className={cn(stale && "opacity-60")}
        items={[
          {
            key: "requests",
            label: "Requests",
            loading,
            value: formatInteger(totals?.requests ?? null),
            sub: spec.label,
          },
          {
            key: "4xx",
            label: "4xx",
            loading,
            value: formatInteger(totals?.clientErrors ?? null),
            sub: "excl. 429",
          },
          {
            key: "5xx",
            label: "5xx",
            loading,
            tone: (totals?.serverErrors ?? 0) > 0 ? "neg" : "default",
            value: formatInteger(totals?.serverErrors ?? null),
            sub:
              totals === undefined
                ? dash
                : `${formatShare(totals.serverErrors, requests)}%`,
          },
          {
            key: "429",
            label: "429",
            loading,
            tone: (totals?.rateLimited ?? 0) > 0 ? "accent" : "default",
            value: formatInteger(totals?.rateLimited ?? null),
            sub: "rate-limited",
          },
          {
            key: "p95",
            label: "p95",
            loading,
            value: formatLatency(totals?.p95LatencyMs ?? null),
            sub: kind === "both" ? "all envs" : kind,
          },
        ]}
      />
      {usage.isError && data === undefined ? (
        <QueryError error={usage.error} onRetry={() => void usage.refetch()} />
      ) : null}
      <section
        aria-labelledby="org-usage-requests"
        className={cn("flex flex-col gap-3", stale && "opacity-60")}
      >
        <SectionHead
          id="org-usage-requests"
          title={`Requests by ${spec.per}`}
        />
        {loading ? (
          <Skeleton.Root shape="block" className="h-[150px]" />
        ) : data === undefined ? null : (
          <RequestsBarChart
            title={`Requests by ${spec.per}`}
            groups={groups}
            bucket={spec.bucket}
            height={120}
          />
        )}
      </section>
      <section
        aria-labelledby="org-usage-environments"
        className={cn("flex min-w-0 flex-col", stale && "opacity-60")}
      >
        <SectionHead
          id="org-usage-environments"
          title="By app · env"
          className="pb-1.5"
        />
        {data === undefined ? (
          <Skeleton.Root shape="block" className="h-32" />
        ) : (
          <EnvironmentTable
            rows={data.byEnvironment}
            daily={dailyByEnvironment}
            rangeLabel={range === "24h" ? "Days" : "7 d"}
          />
        )}
      </section>
      {data === undefined ? null : (
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
          <TopRoutes id="org-usage-routes" rows={data.topRoutes} />
          <ByKey
            id="org-usage-keys"
            rows={data.byKey.map((row) => ({
              apiKeyId: row.apiKeyId,
              displayPrefix: row.displayPrefix,
              appName: row.app?.name ?? null,
              requests: row.requests,
              errors: row.errors,
            }))}
          />
        </div>
      )}
    </div>
  )
}

function Sparkline({
  points,
}: {
  points: readonly { start: string; requests: number }[]
}): ReactElement {
  const recent = points.slice(-7)
  const max = Math.max(1, ...recent.map((point) => point.requests))
  return (
    <span aria-hidden="true" className="flex h-[26px] items-end gap-[3px]">
      {recent.map((point, index) => (
        <span
          key={point.start}
          className={cn(
            "w-[7px] rounded-t-[2px]",
            index === recent.length - 1 ? "bg-accent" : "bg-line-2",
          )}
          style={{
            height: Math.max(2, Math.round((point.requests / max) * 26)),
          }}
        />
      ))}
    </span>
  )
}

function EnvironmentTable({
  rows,
  daily,
  rangeLabel,
}: {
  rows: readonly OrgUsageEnvironment[]
  daily: ReadonlyMap<string, QuotaWindow | null>
  rangeLabel: string
}): ReactElement {
  const muted = <span className="text-muted">{dash}</span>
  return (
    <Table.Root>
      <Table.Header>
        <Table.Row>
          <Table.Head>App · env</Table.Head>
          <Table.Head className="hidden w-[76px] md:table-cell">
            {rangeLabel}
          </Table.Head>
          <Table.Head numeric className="w-[90px]">
            Requests
          </Table.Head>
          <Table.Head numeric className="hidden w-[56px] sm:table-cell">
            4xx
          </Table.Head>
          <Table.Head numeric className="hidden w-[56px] sm:table-cell">
            5xx
          </Table.Head>
          <Table.Head numeric className="hidden w-[56px] sm:table-cell">
            429
          </Table.Head>
          <Table.Head numeric className="hidden w-[64px] lg:table-cell">
            p95
          </Table.Head>
          <Table.Head className="hidden w-[120px] lg:table-cell">
            Quota today
          </Table.Head>
        </Table.Row>
      </Table.Header>
      <Table.Body>
        {rows.length === 0 ? (
          <Table.Row>
            <Table.Cell colSpan={8} className="py-4 text-secondary">
              No environments
            </Table.Cell>
          </Table.Row>
        ) : (
          rows.map((row) => {
            const { summary } = row
            const quiet = summary.requests === 0
            const quota = daily.get(row.environmentId) ?? null
            return (
              <Table.Row key={row.environmentId}>
                <Table.Cell className="py-2.5">
                  <span className="flex min-w-0 items-center gap-2">
                    <Link
                      to="/apps/$appId/usage"
                      params={{ appId: row.app.id }}
                      search={
                        row.environmentKind === "live" ? { env: "live" } : {}
                      }
                      className="truncate text-body-sm font-600 text-ink hover:underline"
                    >
                      {row.app.name}
                    </Link>
                    <EnvPill kind={row.environmentKind} />
                  </span>
                </Table.Cell>
                <Table.Cell className="hidden md:table-cell">
                  {quiet ? muted : <Sparkline points={row.daily} />}
                </Table.Cell>
                <Table.Cell numeric>
                  {quiet ? muted : formatInteger(summary.requests)}
                </Table.Cell>
                <Table.Cell numeric className="hidden sm:table-cell">
                  {quiet ? muted : formatInteger(summary.clientErrors)}
                </Table.Cell>
                <Table.Cell
                  numeric
                  className={cn(
                    "hidden sm:table-cell",
                    summary.serverErrors > 0 && "text-neg",
                  )}
                >
                  {quiet ? muted : formatInteger(summary.serverErrors)}
                </Table.Cell>
                <Table.Cell
                  numeric
                  className={cn(
                    "hidden sm:table-cell",
                    summary.rateLimited > 0 && "text-accent-ink",
                  )}
                >
                  {quiet ? muted : formatInteger(summary.rateLimited)}
                </Table.Cell>
                <Table.Cell numeric className="hidden lg:table-cell">
                  {quiet ? muted : formatLatency(summary.p95LatencyMs)}
                </Table.Cell>
                <Table.Cell className="hidden lg:table-cell">
                  {quiet ? (
                    <span className="text-label text-secondary">
                      No traffic
                    </span>
                  ) : quota === null ? (
                    muted
                  ) : (
                    <span className="flex items-center gap-2">
                      <QuotaBar
                        fraction={quotaFraction(quota)}
                        label={`${row.app.name} ${row.environmentKind} quota today`}
                        className="w-[70px]"
                      />
                      <span
                        className={cn(
                          "font-mono text-caption",
                          quotaFraction(quota) >= quotaWarnAt
                            ? "text-accent-ink"
                            : "text-secondary",
                        )}
                      >
                        {quotaPercent(quota)}
                      </span>
                    </span>
                  )}
                </Table.Cell>
              </Table.Row>
            )
          })
        )}
      </Table.Body>
    </Table.Root>
  )
}
