import {
  type RequestLogEntry,
  type RequestStatusFilter,
  requestStatusFilterFor,
} from "@repo/platform-contracts/console"
import * as Button from "@repo/ui/button"
import { cn } from "@repo/ui/cn"
import * as Input from "@repo/ui/input"
import * as Skeleton from "@repo/ui/skeleton"
import * as Table from "@repo/ui/table"
import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query"
import { Search, X } from "lucide-react"
import { type FormEvent, type ReactElement, useId, useState } from "react"
import * as api from "../../lib/api"
import { errorMessage, isApiError } from "../../lib/api-client"
import { shortKeyPrefix } from "../../lib/api-keys"
import { dash, formatLatency } from "../../lib/format"
import { keys } from "../../lib/queries"
import QueryError from "../QueryError"
import ChipGroup from "../ui/ChipGroup"

type LogFilter = "all" | RequestStatusFilter

const filters: Array<{ value: LogFilter; label: string; name: string }> = [
  { value: "all", label: "All", name: "All statuses" },
  { value: "success", label: "2xx", name: "Successful" },
  { value: "client-error", label: "4xx", name: "Client errors excluding 429" },
  { value: "server-error", label: "5xx", name: "Server errors" },
  { value: "rate-limited", label: "429", name: "Rate-limited" },
]

function isLogFilter(value: string): value is LogFilter {
  return filters.some((filter) => filter.value === value)
}

/** Server status class for a filter; 4xx and 429 share client-error. */
function statusClassFor(
  filter: LogFilter,
): "success" | "client-error" | "server-error" | undefined {
  if (filter === "all") return undefined
  if (filter === "rate-limited") return "client-error"
  return filter
}

/** Rows matching a filter (429 has its own chip, 4xx excludes it). */
export function matchesLogFilter(
  entry: Pick<RequestLogEntry, "status">,
  filter: LogFilter,
): boolean {
  return filter === "all" || requestStatusFilterFor(entry.status) === filter
}

const timeFormat = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
})

function statusClass(status: number): string {
  if (status === 429) return "text-accent-ink"
  if (status >= 400) return "text-neg"
  return "text-ink"
}

/** Recent requests with status chips and request-ID lookup (C04e). */
export default function RequestLog({
  environmentId,
  from,
  to,
  apiKeyId,
  prefixes,
}: {
  environmentId: string
  from: string
  to: string
  apiKeyId: string | undefined
  /** api key id → display prefix. */
  prefixes: ReadonlyMap<string, string>
}): ReactElement {
  const [filter, setFilter] = useState<LogFilter>("all")
  const [requestId, setRequestId] = useState("")
  const searchId = useId()
  const params = {
    environmentId,
    from,
    to,
    statusClass: statusClassFor(filter),
    apiKeyId,
    limit: 50,
  }
  const log = useQuery({
    queryKey: keys.requests(params),
    queryFn: () => api.environments.requests(params),
    placeholderData: keepPreviousData,
  })
  const lookup = useMutation({
    mutationFn: (id: string) => api.environments.request(environmentId, id),
  })
  const rows =
    lookup.data !== undefined
      ? [lookup.data]
      : (log.data?.data ?? []).filter((entry) =>
          matchesLogFilter(entry, filter),
        )

  function search(event: FormEvent): void {
    event.preventDefault()
    const id = requestId.trim()
    if (id !== "") lookup.mutate(id)
  }

  function clear(): void {
    setRequestId("")
    lookup.reset()
  }

  const notFound = lookup.isError && isApiError(lookup.error, "not_found")

  return (
    <section
      aria-labelledby={`${searchId}-title`}
      className="flex min-w-0 flex-col"
    >
      <div className="flex flex-wrap items-center gap-2 pb-2.5">
        <h2
          id={`${searchId}-title`}
          className="pr-2 text-body font-600 text-ink"
        >
          Requests
        </h2>
        <ChipGroup
          label="Status"
          value={filter}
          onChange={(value) => {
            if (isLogFilter(value)) {
              setFilter(value)
              lookup.reset()
            }
          }}
          options={filters.map((option) => ({
            value: option.value,
            label: option.label,
            ariaLabel: option.name,
          }))}
          className="[&_button]:h-7"
        />
        <span className="flex-1" />
        <form onSubmit={search} className="w-full sm:w-[220px]" noValidate>
          <Input.Group size="sm" className="bg-surface">
            <Input.Adornment>
              <Search aria-hidden="true" size={14} strokeWidth={1.75} />
            </Input.Adornment>
            <Input.Root
              mono
              aria-label="Find request ID"
              aria-describedby={`${searchId}-status`}
              placeholder="req_…"
              autoComplete="off"
              spellCheck={false}
              maxLength={64}
              value={requestId}
              onChange={(event) => setRequestId(event.target.value)}
            />
            {lookup.data !== undefined || lookup.isError ? (
              <button
                type="button"
                aria-label="Clear request search"
                onClick={clear}
                className="flex size-5 items-center justify-center rounded text-muted hover:text-ink"
              >
                <X aria-hidden="true" size={13} strokeWidth={1.75} />
              </button>
            ) : null}
          </Input.Group>
        </form>
      </div>
      <p id={`${searchId}-status`} aria-live="polite" className="sr-only">
        {lookup.isPending
          ? "Searching"
          : notFound
            ? "Request not found"
            : lookup.data !== undefined
              ? "Request found"
              : ""}
      </p>
      {lookup.isError ? (
        <p role="alert" className="pb-2 text-label font-500 text-neg">
          {notFound ? "Not found" : errorMessage(lookup.error)}
        </p>
      ) : null}
      {log.isPending ? (
        <div aria-busy="true" className="flex flex-col gap-2">
          {["a", "b", "c", "d"].map((key) => (
            <Skeleton.Root key={key} shape="block" className="h-8" />
          ))}
        </div>
      ) : log.isError && lookup.data === undefined ? (
        <QueryError error={log.error} onRetry={() => void log.refetch()} />
      ) : (
        <Table.Root className={cn(log.isPlaceholderData && "opacity-60")}>
          <Table.Header>
            <Table.Row>
              <Table.Head className="w-[72px]">Time</Table.Head>
              <Table.Head className="hidden w-[170px] md:table-cell">
                Request ID
              </Table.Head>
              <Table.Head>Route</Table.Head>
              <Table.Head className="w-[120px]">Status</Table.Head>
              <Table.Head numeric className="hidden w-[64px] sm:table-cell">
                Latency
              </Table.Head>
              <Table.Head className="hidden w-[100px] xl:table-cell">
                Cache
              </Table.Head>
              <Table.Head className="hidden w-[110px] xl:table-cell">
                Key
              </Table.Head>
              <Table.Head className="hidden w-[44px] lg:table-cell">
                Colo
              </Table.Head>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {rows.length === 0 ? (
              <Table.Row>
                <Table.Cell colSpan={8} className="py-4 text-secondary">
                  No requests
                </Table.Cell>
              </Table.Row>
            ) : (
              rows.map((entry) => (
                <Table.Row key={entry.requestId}>
                  <Table.Cell mono className="py-2 text-label text-ink-2">
                    <time dateTime={entry.timestamp}>
                      {timeFormat.format(new Date(entry.timestamp))}
                    </time>
                  </Table.Cell>
                  <Table.Cell mono className="hidden text-label md:table-cell">
                    {entry.requestId}
                  </Table.Cell>
                  <Table.Cell mono className="max-w-0 truncate text-caption">
                    {`${entry.method} ${entry.route}`}
                  </Table.Cell>
                  <Table.Cell className="whitespace-nowrap">
                    <span
                      className={cn(
                        "font-mono text-label font-600",
                        statusClass(entry.status),
                      )}
                    >
                      {entry.status}
                    </span>
                    {entry.errorCode == null ? null : (
                      <span className="ml-1.5 text-caption text-muted">
                        {entry.errorCode}
                      </span>
                    )}
                  </Table.Cell>
                  <Table.Cell
                    numeric
                    className="hidden text-label sm:table-cell"
                  >
                    {formatLatency(entry.latencyMs)}
                  </Table.Cell>
                  <Table.Cell
                    mono
                    className="hidden text-label text-secondary xl:table-cell"
                  >
                    {entry.cacheStatus ?? dash}
                  </Table.Cell>
                  <Table.Cell
                    mono
                    className="hidden text-caption text-secondary xl:table-cell"
                  >
                    {entry.apiKeyId === null
                      ? dash
                      : shortKeyPrefix(prefixes.get(entry.apiKeyId) ?? null)}
                  </Table.Cell>
                  <Table.Cell
                    mono
                    className="hidden text-caption text-muted lg:table-cell"
                  >
                    {entry.colo ?? dash}
                  </Table.Cell>
                </Table.Row>
              ))
            )}
          </Table.Body>
        </Table.Root>
      )}
      {lookup.data === undefined ? null : (
        <Button.Root
          variant="ghost"
          size="sm"
          className="mt-2 self-start"
          onClick={clear}
        >
          Show recent requests
        </Button.Root>
      )}
    </section>
  )
}
