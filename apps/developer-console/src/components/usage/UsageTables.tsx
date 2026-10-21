import * as Table from "@repo/ui/table"
import type { ReactElement } from "react"
import { shortKeyPrefix } from "../../lib/api-keys"
import { formatInteger, formatLatency } from "../../lib/format"
import SectionHead from "../ui/SectionHead"

type RouteRow = {
  route: string
  method: string
  requests: number
  errors: number
  p95LatencyMs: number | null
}

export function TopRoutes({
  rows,
  id,
}: {
  rows: readonly RouteRow[]
  id: string
}): ReactElement {
  return (
    <section aria-labelledby={id} className="flex min-w-0 flex-col">
      <SectionHead id={id} title="Top routes" className="pb-1.5" />
      <Table.Root>
        <Table.Header>
          <Table.Row>
            <Table.Head>Route</Table.Head>
            <Table.Head numeric className="w-[90px]">
              Requests
            </Table.Head>
            <Table.Head numeric className="hidden w-[70px] sm:table-cell">
              Errors
            </Table.Head>
            <Table.Head numeric className="w-[70px]">
              p95
            </Table.Head>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {rows.length === 0 ? (
            <Table.Row>
              <Table.Cell colSpan={4} className="text-secondary">
                No requests
              </Table.Cell>
            </Table.Row>
          ) : (
            rows.map((row) => (
              <Table.Row key={`${row.method} ${row.route}`}>
                <Table.Cell mono className="max-w-0 truncate py-2 text-label">
                  {`${row.method} ${row.route}`}
                </Table.Cell>
                <Table.Cell numeric>{formatInteger(row.requests)}</Table.Cell>
                <Table.Cell numeric className="hidden sm:table-cell">
                  {formatInteger(row.errors)}
                </Table.Cell>
                <Table.Cell numeric>
                  {formatLatency(row.p95LatencyMs)}
                </Table.Cell>
              </Table.Row>
            ))
          )}
        </Table.Body>
      </Table.Root>
    </section>
  )
}

type KeyRow = {
  apiKeyId: string | null
  displayPrefix: string | null
  /** App name for org-wide rows. */
  appName?: string | null | undefined
  requests: number
  errors: number
}

export function ByKey({
  rows,
  id,
}: {
  rows: readonly KeyRow[]
  id: string
}): ReactElement {
  return (
    <section aria-labelledby={id} className="flex min-w-0 flex-col">
      <SectionHead id={id} title="By key" className="pb-1.5" />
      <Table.Root>
        <Table.Header>
          <Table.Row>
            <Table.Head>Key</Table.Head>
            <Table.Head numeric className="w-[90px]">
              Requests
            </Table.Head>
            <Table.Head numeric className="w-[70px]">
              Errors
            </Table.Head>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {rows.length === 0 ? (
            <Table.Row>
              <Table.Cell colSpan={3} className="text-secondary">
                No requests
              </Table.Cell>
            </Table.Row>
          ) : (
            rows.map((row) => (
              <Table.Row key={row.apiKeyId ?? "unknown"}>
                <Table.Cell className="max-w-0 py-2">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="shrink-0 font-mono text-label text-ink">
                      {row.displayPrefix === null
                        ? "Unknown key"
                        : shortKeyPrefix(row.displayPrefix)}
                    </span>
                    {row.appName === undefined ||
                    row.appName === null ? null : (
                      <span className="truncate text-label text-secondary">
                        {row.appName}
                      </span>
                    )}
                  </span>
                </Table.Cell>
                <Table.Cell numeric>{formatInteger(row.requests)}</Table.Cell>
                <Table.Cell numeric>{formatInteger(row.errors)}</Table.Cell>
              </Table.Row>
            ))
          )}
        </Table.Body>
      </Table.Root>
    </section>
  )
}
