import type { Environment } from "@repo/platform-contracts/console"
import * as Button from "@repo/ui/button"
import { cn } from "@repo/ui/cn"
import * as Select from "@repo/ui/select"
import * as Skeleton from "@repo/ui/skeleton"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { Download } from "lucide-react"
import { type ReactElement, useMemo, useState } from "react"
import EnvironmentGate from "../../../../components/EnvironmentGate"
import QueryError from "../../../../components/QueryError"
import ErrorsBarChart, {
  ErrorsLegend,
} from "../../../../components/charts/ErrorsBarChart"
import RequestsBarChart from "../../../../components/charts/RequestsBarChart"
import EnvironmentQuotaPanel from "../../../../components/quota/EnvironmentQuotaPanel"
import ChipGroup from "../../../../components/ui/ChipGroup"
import SectionHead from "../../../../components/ui/SectionHead"
import StatStrip from "../../../../components/ui/StatStrip"
import RequestLog from "../../../../components/usage/RequestLog"
import { ByKey, TopRoutes } from "../../../../components/usage/UsageTables"
import * as api from "../../../../lib/api"
import { useAppRoute } from "../../../../lib/app-route"
import {
  formatInteger,
  formatLatency,
  formatShare,
} from "../../../../lib/format"
import { apiKeysQuery, usageQuery } from "../../../../lib/queries"
import { groupSeries } from "../../../../lib/usage-chart"
import {
  type UsageRange,
  isUsageRange,
  rangeWindow,
  usageRanges,
} from "../../../../lib/usage-range"

export const Route = createFileRoute("/_app/apps/$appId/usage")({
  component: AppUsageTab,
})

function AppUsageTab(): ReactElement {
  const { appId, kind } = useAppRoute()
  return (
    <EnvironmentGate key={kind} appId={appId} kind={kind}>
      {(environment) => <EnvironmentUsage environment={environment} />}
    </EnvironmentGate>
  )
}

const allKeys = "all"
const ranges: UsageRange[] = ["1h", "24h", "7d", "30d", "90d"]

function EnvironmentUsage({
  environment,
}: {
  environment: Environment
}): ReactElement {
  const [range, setRange] = useState<UsageRange>("7d")
  const [keyId, setKeyId] = useState<string>(allKeys)
  const spec = usageRanges[range]
  const window = useMemo(() => rangeWindow(range), [range])
  const apiKeyId = keyId === allKeys ? undefined : keyId
  const params = { environmentId: environment.id, ...window, apiKeyId }
  const usage = useQuery({
    ...usageQuery(params),
    placeholderData: keepPreviousData,
  })
  const apiKeys = useQuery(apiKeysQuery(environment.id))
  const prefixes = useMemo(
    () =>
      new Map(
        (apiKeys.data?.data ?? []).map((key) => [key.id, key.displayPrefix]),
      ),
    [apiKeys.data],
  )
  const data = usage.data
  const totals = data?.totals
  const loading = usage.isPending
  const stale = usage.isPlaceholderData
  const groups = useMemo(
    () => (data === undefined ? [] : groupSeries(data.series, spec.perBar)),
    [data, spec.perBar],
  )
  const split =
    totals?.clientErrors === undefined ||
    totals.rateLimited === undefined ||
    totals.serverErrors === undefined
      ? null
      : {
          clientErrors: totals.clientErrors,
          rateLimited: totals.rateLimited,
          serverErrors: totals.serverErrors,
        }
  const requests = totals?.requests ?? 0

  return (
    <div className="flex flex-col gap-7">
      <div className="flex flex-wrap items-center gap-2">
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
        <span className="flex-1" />
        <Select.Root value={keyId} onValueChange={setKeyId}>
          <Select.Trigger
            aria-label="Key"
            size="sm"
            className="h-8 w-auto min-w-[110px] bg-surface"
            disabled={apiKeys.isPending}
          >
            <Select.Value />
          </Select.Trigger>
          <Select.Content align="end">
            <Select.Item value={allKeys}>All keys</Select.Item>
            {(apiKeys.data?.data ?? []).map((key) => (
              <Select.Item key={key.id} value={key.id}>
                {key.name}
              </Select.Item>
            ))}
          </Select.Content>
        </Select.Root>
        <Button.Root variant="secondary" asChild>
          <a href={api.environments.usageCsvUrl(params)} download>
            <Download aria-hidden="true" size={14} strokeWidth={1.75} />
            Export CSV
          </a>
        </Button.Root>
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
            value: formatInteger(split?.clientErrors ?? null),
            sub:
              split === null
                ? "Unavailable"
                : `${formatShare(split.clientErrors, requests)}% · excl. 429`,
          },
          {
            key: "5xx",
            label: "5xx",
            loading,
            tone: (split?.serverErrors ?? 0) > 0 ? "neg" : "default",
            value: formatInteger(split?.serverErrors ?? null),
            sub:
              split === null
                ? "Unavailable"
                : `${formatShare(split.serverErrors, requests)}%`,
          },
          {
            key: "429",
            label: "429",
            loading,
            tone: (split?.rateLimited ?? 0) > 0 ? "accent" : "default",
            value: formatInteger(split?.rateLimited ?? null),
            sub: "rate-limited",
          },
          {
            key: "p50",
            label: "p50",
            loading,
            value: formatLatency(totals?.p50LatencyMs ?? null),
            sub: "latency",
          },
          {
            key: "p95",
            label: "p95",
            loading,
            value: formatLatency(totals?.p95LatencyMs ?? null),
            sub: "latency",
          },
        ]}
      />
      {usage.isError && data === undefined ? (
        <QueryError error={usage.error} onRetry={() => void usage.refetch()} />
      ) : null}
      <div className="grid grid-cols-1 gap-8 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div
          className={cn("flex min-w-0 flex-col gap-7", stale && "opacity-60")}
        >
          <section
            aria-labelledby="usage-requests"
            className="flex flex-col gap-3"
          >
            <SectionHead
              id="usage-requests"
              title={`Requests by ${spec.per}`}
            />
            {loading ? (
              <Skeleton.Root shape="block" className="h-[150px]" />
            ) : data === undefined ? null : (
              <RequestsBarChart
                title={`Requests by ${spec.per}`}
                groups={groups}
                bucket={spec.bucket}
                height={130}
              />
            )}
          </section>
          <section
            aria-labelledby="usage-errors"
            className="flex flex-col gap-3"
          >
            <SectionHead id="usage-errors" title={`Errors by ${spec.per}`}>
              <ErrorsLegend />
            </SectionHead>
            {loading ? (
              <Skeleton.Root shape="block" className="h-[80px]" />
            ) : data === undefined ? null : (
              <ErrorsBarChart
                title={`Errors by ${spec.per}`}
                groups={groups}
                bucket={spec.bucket}
              />
            )}
          </section>
        </div>
        <EnvironmentQuotaPanel
          environmentId={environment.id}
          kind={environment.kind}
        />
      </div>
      <RequestLog
        environmentId={environment.id}
        from={window.from}
        to={window.to}
        apiKeyId={apiKeyId}
        prefixes={prefixes}
      />
      {data === undefined ? null : (
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
          <TopRoutes id="usage-routes" rows={data.topRoutes} />
          <ByKey id="usage-keys" rows={data.byKey} />
        </div>
      )}
    </div>
  )
}
