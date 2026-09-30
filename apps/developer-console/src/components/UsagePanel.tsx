import type {
  App,
  EnvironmentSummary,
  UsageResponse,
} from "@repo/platform-contracts/console"
import type { EnvironmentKind } from "@repo/platform-contracts/network"
import * as Button from "@repo/ui/button"
import * as Card from "@repo/ui/card"
import * as EmptyState from "@repo/ui/empty-state"
import * as Field from "@repo/ui/field"
import * as Fieldset from "@repo/ui/fieldset"
import * as Input from "@repo/ui/input"
import * as KeyValue from "@repo/ui/key-value"
import * as SegmentedControl from "@repo/ui/segmented-control"
import * as Select from "@repo/ui/select"
import * as Skeleton from "@repo/ui/skeleton"
import * as Table from "@repo/ui/table"
import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query"
import { Download, Search } from "lucide-react"
import { type FormEvent, type ReactElement, useMemo, useState } from "react"
import * as api from "../lib/api"
import { errorMessage, isApiError } from "../lib/api-client"
import {
  dash,
  formatCompact,
  formatDateTime,
  formatInteger,
  formatLatency,
  formatPercent,
} from "../lib/format"
import { apiKeysQuery, usageQuery } from "../lib/queries"
import {
  type UsageRange,
  isUsageRange,
  rangeWindow,
  usageRanges,
} from "../lib/usage-range"
import QueryError from "./QueryError"
import StatTile from "./StatTile"
import { LatencyChart, RequestsChart } from "./UsageCharts"

const allKeys = "all"

type UsagePanelProps = {
  apps: App[]
  /** App tab: app and environment are fixed by the route. */
  fixed?: { appId: string; kind: EnvironmentKind }
}

/** Filters, totals, charts, tables, request lookup and CSV export. */
export default function UsagePanel({
  apps,
  fixed,
}: UsagePanelProps): ReactElement {
  const [appId, setAppId] = useState<string>(fixed?.appId ?? apps[0]?.id ?? "")
  const [kind, setKind] = useState<EnvironmentKind>(fixed?.kind ?? "test")
  const [keyId, setKeyId] = useState<string>(allKeys)
  const [range, setRange] = useState<UsageRange>("24h")

  const selectedAppId = fixed?.appId ?? appId
  const selectedKind = fixed?.kind ?? kind
  const app = apps.find((item) => item.id === selectedAppId)
  const environment = app?.environments.find((env) => env.kind === selectedKind)

  if (apps.length === 0 || app === undefined) {
    return (
      <EmptyState.Root>
        <EmptyState.Title>No apps</EmptyState.Title>
      </EmptyState.Root>
    )
  }

  return (
    <div className="flex flex-col gap-8">
      <Fieldset.Root className="flex-row flex-wrap items-end gap-3">
        <Fieldset.Legend hidden>Filters</Fieldset.Legend>
        <Fieldset.Fields className="flex-row flex-wrap items-end gap-3">
          <Field.Root>
            <Field.Label>Range</Field.Label>
            <Field.Control>
              <SegmentedControl.Root
                aria-label="Range"
                value={range}
                onValueChange={(value) => {
                  if (isUsageRange(value)) setRange(value)
                }}
              >
                {Object.entries(usageRanges).map(([value, option]) => (
                  <SegmentedControl.Item key={value} value={value}>
                    {option.label}
                  </SegmentedControl.Item>
                ))}
              </SegmentedControl.Root>
            </Field.Control>
          </Field.Root>
          {fixed === undefined ? (
            <>
              <Field.Root>
                <Field.Label>App</Field.Label>
                <Select.Root
                  value={appId}
                  onValueChange={(value) => {
                    setAppId(value)
                    setKeyId(allKeys)
                  }}
                >
                  <Field.Control>
                    <Select.Trigger className="w-[200px]">
                      <Select.Value />
                    </Select.Trigger>
                  </Field.Control>
                  <Select.Content>
                    {apps.map((item) => (
                      <Select.Item key={item.id} value={item.id}>
                        {item.name}
                      </Select.Item>
                    ))}
                  </Select.Content>
                </Select.Root>
              </Field.Root>
              <Field.Root>
                <Field.Label>Environment</Field.Label>
                <Field.Control>
                  <SegmentedControl.Root
                    aria-label="Environment"
                    value={kind}
                    onValueChange={(value) => {
                      setKind(value === "live" ? "live" : "test")
                      setKeyId(allKeys)
                    }}
                  >
                    <SegmentedControl.Item value="test">
                      Test
                    </SegmentedControl.Item>
                    <SegmentedControl.Item value="live">
                      Live
                    </SegmentedControl.Item>
                  </SegmentedControl.Root>
                </Field.Control>
              </Field.Root>
            </>
          ) : null}
          {environment === undefined ? null : (
            <KeyFilter
              environment={environment}
              value={keyId}
              onChange={setKeyId}
            />
          )}
        </Fieldset.Fields>
      </Fieldset.Root>
      {environment === undefined ? (
        <EmptyState.Root>
          <EmptyState.Title>No {selectedKind} environment</EmptyState.Title>
        </EmptyState.Root>
      ) : (
        <EnvironmentUsage
          key={environment.id}
          environmentId={environment.id}
          range={range}
          apiKeyId={keyId === allKeys ? undefined : keyId}
        />
      )}
    </div>
  )
}

function KeyFilter({
  environment,
  value,
  onChange,
}: {
  environment: EnvironmentSummary
  value: string
  onChange: (value: string) => void
}): ReactElement {
  const keys = useQuery(apiKeysQuery(environment.id))
  return (
    <Field.Root>
      <Field.Label>Key</Field.Label>
      <Select.Root value={value} onValueChange={onChange}>
        <Field.Control>
          <Select.Trigger className="w-[220px]" disabled={keys.isPending}>
            <Select.Value />
          </Select.Trigger>
        </Field.Control>
        <Select.Content>
          <Select.Item value={allKeys}>All keys</Select.Item>
          {(keys.data?.data ?? []).map((key) => (
            <Select.Item key={key.id} value={key.id}>
              {key.name}
            </Select.Item>
          ))}
        </Select.Content>
      </Select.Root>
    </Field.Root>
  )
}

function EnvironmentUsage({
  environmentId,
  range,
  apiKeyId,
}: {
  environmentId: string
  range: UsageRange
  apiKeyId: string | undefined
}): ReactElement {
  const span = useMemo(() => rangeWindow(range), [range])
  const params = { environmentId, ...span, apiKeyId }
  const usage = useQuery({
    ...usageQuery(params),
    placeholderData: keepPreviousData,
  })
  const data = usage.data
  const stale = usage.isPlaceholderData

  return (
    <>
      <section aria-labelledby="usage-totals" className="flex flex-col gap-2">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="usage-totals" className="text-[14px] font-600 text-ink">
            Totals
          </h2>
          <Button.Root variant="secondary" size="sm" asChild>
            <a href={api.environments.usageCsvUrl(params)} download>
              <Download aria-hidden="true" size={13} strokeWidth={1.75} />
              CSV
            </a>
          </Button.Root>
        </header>
        <dl
          aria-busy={usage.isPending || undefined}
          className={`m-0 grid grid-cols-2 gap-x-6 lg:grid-cols-5 ${stale ? "opacity-60" : ""}`}
        >
          <StatTile
            label="Requests"
            loading={usage.isPending}
            value={formatCompact(data?.totals.requests ?? null)}
          />
          <StatTile
            label="Errors"
            loading={usage.isPending}
            value={formatCompact(data?.totals.errors ?? null)}
          />
          <StatTile
            label="Error rate"
            loading={usage.isPending}
            value={formatPercent(data?.totals.errorRate ?? null)}
          />
          <StatTile
            label="p50"
            loading={usage.isPending}
            value={formatLatency(data?.totals.p50LatencyMs ?? null)}
          />
          <StatTile
            label="p95"
            loading={usage.isPending}
            value={formatLatency(data?.totals.p95LatencyMs ?? null)}
          />
        </dl>
        {usage.isError ? (
          <QueryError
            error={usage.error}
            onRetry={() => void usage.refetch()}
          />
        ) : null}
      </section>
      {usage.isPending ? (
        <div aria-busy="true" className="grid grid-cols-1 gap-8 lg:grid-cols-2">
          <Skeleton.Root shape="block" className="h-[206px]" />
          <Skeleton.Root shape="block" className="h-[206px]" />
        </div>
      ) : data === undefined ? null : (
        <UsageDetail data={data} stale={stale} />
      )}
      <RequestLookup environmentId={environmentId} />
    </>
  )
}

function UsageDetail({
  data,
  stale,
}: { data: UsageResponse; stale: boolean }): ReactElement {
  return (
    <>
      <section
        aria-label="Charts"
        className="grid grid-cols-1 gap-8 lg:grid-cols-2"
      >
        <RequestsChart
          points={data.series}
          bucket={data.bucket}
          dimmed={stale}
        />
        <LatencyChart
          points={data.series}
          bucket={data.bucket}
          dimmed={stale}
        />
      </section>
      <details className="group">
        <summary className="cursor-pointer text-[12px] font-600 text-secondary hover:text-ink">
          Data table
        </summary>
        <Table.Root
          density="compact"
          containerClassName="mt-3 max-h-[320px] overflow-y-auto"
        >
          <Table.Header>
            <Table.Row>
              <Table.Head>Bucket</Table.Head>
              <Table.Head numeric>Requests</Table.Head>
              <Table.Head numeric>Errors</Table.Head>
              <Table.Head numeric>p50</Table.Head>
              <Table.Head numeric>p95</Table.Head>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {data.series.map((point) => (
              <Table.Row key={point.start}>
                <Table.Cell mono>{formatDateTime(point.start)}</Table.Cell>
                <Table.Cell numeric>{formatInteger(point.requests)}</Table.Cell>
                <Table.Cell numeric>{formatInteger(point.errors)}</Table.Cell>
                <Table.Cell numeric>
                  {formatLatency(point.p50LatencyMs)}
                </Table.Cell>
                <Table.Cell numeric>
                  {formatLatency(point.p95LatencyMs)}
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table.Root>
      </details>
      <div className="grid grid-cols-1 gap-10 lg:grid-cols-2">
        <Card.Root>
          <Card.Header>
            <Card.Title>Top routes</Card.Title>
          </Card.Header>
          <Table.Root density="compact">
            <Table.Header>
              <Table.Row>
                <Table.Head>Route</Table.Head>
                <Table.Head numeric>Requests</Table.Head>
                <Table.Head numeric>Errors</Table.Head>
                <Table.Head numeric>p95</Table.Head>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {data.topRoutes.length === 0 ? (
                <Table.Row>
                  <Table.Cell colSpan={4} className="text-secondary">
                    No requests
                  </Table.Cell>
                </Table.Row>
              ) : (
                data.topRoutes.map((route) => (
                  <Table.Row key={`${route.method} ${route.route}`}>
                    <Table.Cell
                      mono
                      className="max-w-[260px] truncate text-[11px]"
                    >
                      <span className="text-secondary">{route.method}</span>{" "}
                      {route.route}
                    </Table.Cell>
                    <Table.Cell numeric>
                      {formatInteger(route.requests)}
                    </Table.Cell>
                    <Table.Cell numeric>
                      {formatInteger(route.errors)}
                    </Table.Cell>
                    <Table.Cell numeric>
                      {formatLatency(route.p95LatencyMs)}
                    </Table.Cell>
                  </Table.Row>
                ))
              )}
            </Table.Body>
          </Table.Root>
        </Card.Root>
        <Card.Root>
          <Card.Header>
            <Card.Title>By key</Card.Title>
          </Card.Header>
          <Table.Root density="compact">
            <Table.Header>
              <Table.Row>
                <Table.Head>Key</Table.Head>
                <Table.Head numeric>Requests</Table.Head>
                <Table.Head numeric>Errors</Table.Head>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {data.byKey.length === 0 ? (
                <Table.Row>
                  <Table.Cell colSpan={3} className="text-secondary">
                    No requests
                  </Table.Cell>
                </Table.Row>
              ) : (
                data.byKey.map((row) => (
                  <Table.Row key={row.apiKeyId ?? "unknown"}>
                    <Table.Cell mono className="text-[11px]">
                      {row.displayPrefix ?? dash}
                    </Table.Cell>
                    <Table.Cell numeric>
                      {formatInteger(row.requests)}
                    </Table.Cell>
                    <Table.Cell numeric>{formatInteger(row.errors)}</Table.Cell>
                  </Table.Row>
                ))
              )}
            </Table.Body>
          </Table.Root>
        </Card.Root>
      </div>
    </>
  )
}

function RequestLookup({
  environmentId,
}: { environmentId: string }): ReactElement {
  const [requestId, setRequestId] = useState("")
  const lookup = useMutation({
    mutationFn: (id: string) => api.environments.request(environmentId, id),
  })
  const apiKeys = useQuery(apiKeysQuery(environmentId))

  function submit(event: FormEvent): void {
    event.preventDefault()
    const id = requestId.trim()
    if (id !== "") lookup.mutate(id)
  }

  const entry = lookup.data
  const notFound = lookup.isError && isApiError(lookup.error, "not_found")

  return (
    <section
      aria-labelledby="request-lookup"
      className="flex max-w-2xl flex-col gap-4"
    >
      <h2 id="request-lookup" className="text-[14px] font-600 text-ink">
        Request lookup
      </h2>
      <form onSubmit={submit} noValidate>
        <Fieldset.Root disabled={lookup.isPending}>
          <Fieldset.Legend hidden>Request ID</Fieldset.Legend>
          <Fieldset.Fields>
            <Field.Root>
              <Field.Label>Request ID</Field.Label>
              <span className="flex gap-2">
                <Field.Control>
                  <Input.Root
                    mono
                    placeholder="req_…"
                    autoComplete="off"
                    spellCheck={false}
                    maxLength={64}
                    value={requestId}
                    onChange={(event) => setRequestId(event.target.value)}
                  />
                </Field.Control>
                <Button.Root
                  type="submit"
                  variant="secondary"
                  loading={lookup.isPending}
                  disabled={requestId.trim() === ""}
                >
                  <Search aria-hidden="true" size={13} strokeWidth={1.75} />
                  Find
                </Button.Root>
              </span>
              <Field.Error>
                {notFound
                  ? "Not found"
                  : lookup.isError
                    ? errorMessage(lookup.error)
                    : null}
              </Field.Error>
            </Field.Root>
          </Fieldset.Fields>
        </Fieldset.Root>
      </form>
      {entry === undefined ? null : (
        <KeyValue.Root aria-label={`Request ${entry.requestId}`}>
          <KeyValue.Item>
            <KeyValue.Term>Time</KeyValue.Term>
            <KeyValue.Value>{formatDateTime(entry.timestamp)}</KeyValue.Value>
          </KeyValue.Item>
          <KeyValue.Item>
            <KeyValue.Term>Route</KeyValue.Term>
            <KeyValue.Value mono className="text-[12px]">
              {`${entry.method} ${entry.route}`}
            </KeyValue.Value>
          </KeyValue.Item>
          <KeyValue.Item>
            <KeyValue.Term>Status</KeyValue.Term>
            <KeyValue.Value mono>{entry.status}</KeyValue.Value>
          </KeyValue.Item>
          <KeyValue.Item>
            <KeyValue.Term>Latency</KeyValue.Term>
            <KeyValue.Value mono>
              {formatLatency(entry.latencyMs)}
            </KeyValue.Value>
          </KeyValue.Item>
          <KeyValue.Item>
            <KeyValue.Term>Cache</KeyValue.Term>
            <KeyValue.Value mono>{entry.cacheStatus}</KeyValue.Value>
          </KeyValue.Item>
          <KeyValue.Item>
            <KeyValue.Term>Key</KeyValue.Term>
            <KeyValue.Value mono className="text-[12px]">
              {apiKeys.data?.data.find((key) => key.id === entry.apiKeyId)
                ?.displayPrefix ?? entry.apiKeyId}
            </KeyValue.Value>
          </KeyValue.Item>
          <KeyValue.Item>
            <KeyValue.Term>Colo</KeyValue.Term>
            <KeyValue.Value mono>
              {entry.colo === null
                ? null
                : `${entry.colo}${entry.country === null ? "" : ` · ${entry.country}`}`}
            </KeyValue.Value>
          </KeyValue.Item>
        </KeyValue.Root>
      )}
    </section>
  )
}
