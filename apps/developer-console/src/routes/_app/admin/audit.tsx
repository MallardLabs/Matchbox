import {
  type AuditAction,
  type AuditActorType,
  auditActionSchema,
  auditActorTypeSchema,
} from "@repo/platform-contracts/audit"
import * as Button from "@repo/ui/button"
import * as EmptyState from "@repo/ui/empty-state"
import * as Field from "@repo/ui/field"
import * as Fieldset from "@repo/ui/fieldset"
import * as Input from "@repo/ui/input"
import * as Select from "@repo/ui/select"
import * as Skeleton from "@repo/ui/skeleton"
import * as Table from "@repo/ui/table"
import { useInfiniteQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { type FormEvent, type ReactElement, useState } from "react"
import { z } from "zod"
import QueryError from "../../../components/QueryError"
import * as api from "../../../lib/api"
import { formatDateTime, humanize } from "../../../lib/format"
import { keys } from "../../../lib/queries"

export const Route = createFileRoute("/_app/admin/audit")({
  component: AuditPage,
})

const any = "any"

type Filters = {
  actorType?: AuditActorType
  action?: AuditAction
  organizationId?: string
  appId?: string
  environmentId?: string
  actorId?: string
  from?: string
  to?: string
}

type TextFilter = "organizationId" | "appId" | "environmentId" | "actorId"

const textFilters: Array<{ key: TextFilter; label: string; uuid: boolean }> = [
  { key: "organizationId", label: "Organization ID", uuid: true },
  { key: "appId", label: "App ID", uuid: true },
  { key: "environmentId", label: "Environment ID", uuid: true },
  { key: "actorId", label: "Actor ID", uuid: false },
]

function toFilters(draft: Record<string, string>): Filters {
  const filters: Filters = {}
  const actorType = auditActorTypeSchema.safeParse(draft.actorType)
  if (actorType.success) filters.actorType = actorType.data
  const action = auditActionSchema.safeParse(draft.action)
  if (action.success) filters.action = action.data
  for (const { key } of textFilters) {
    const value = draft[key]?.trim() ?? ""
    if (value !== "") filters[key] = value
  }
  if (draft.from !== undefined && draft.from !== "") {
    filters.from = new Date(`${draft.from}T00:00:00Z`).toISOString()
  }
  if (draft.to !== undefined && draft.to !== "") {
    filters.to = new Date(`${draft.to}T23:59:59Z`).toISOString()
  }
  return filters
}

function AuditPage(): ReactElement {
  const [draft, setDraft] = useState<Record<string, string>>({
    actorType: any,
    action: any,
  })
  const [filters, setFilters] = useState<Filters>({})
  const audit = useInfiniteQuery({
    queryKey: [...keys.admin, "audit", filters],
    queryFn: ({ pageParam }) =>
      api.admin.audit({
        ...filters,
        ...(pageParam === undefined ? {} : { cursor: pageParam }),
        limit: 50,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  })
  const rows = (audit.data?.pages ?? []).flatMap((page) => page.data)
  const invalid = textFilters.filter(
    (filter) =>
      filter.uuid &&
      (draft[filter.key] ?? "").trim() !== "" &&
      !z.uuid().safeParse((draft[filter.key] ?? "").trim()).success,
  )

  function set(key: string, value: string): void {
    setDraft((current) => ({ ...current, [key]: value }))
  }

  function submit(event: FormEvent): void {
    event.preventDefault()
    if (invalid.length === 0) setFilters(toFilters(draft))
  }

  return (
    <div className="flex flex-col gap-6">
      <form onSubmit={submit} noValidate className="flex flex-col gap-3">
        <Fieldset.Root>
          <Fieldset.Legend hidden>Filters</Fieldset.Legend>
          <Fieldset.Fields className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Field.Root>
              <Field.Label>Actor type</Field.Label>
              <Select.Root
                value={draft.actorType ?? any}
                onValueChange={(value) => set("actorType", value)}
              >
                <Field.Control>
                  <Select.Trigger>
                    <Select.Value />
                  </Select.Trigger>
                </Field.Control>
                <Select.Content>
                  <Select.Item value={any}>Any</Select.Item>
                  {auditActorTypeSchema.options.map((option) => (
                    <Select.Item key={option} value={option}>
                      {humanize(option)}
                    </Select.Item>
                  ))}
                </Select.Content>
              </Select.Root>
            </Field.Root>
            <Field.Root>
              <Field.Label>Action</Field.Label>
              <Select.Root
                value={draft.action ?? any}
                onValueChange={(value) => set("action", value)}
              >
                <Field.Control>
                  <Select.Trigger>
                    <Select.Value />
                  </Select.Trigger>
                </Field.Control>
                <Select.Content>
                  <Select.Item value={any}>Any</Select.Item>
                  {auditActionSchema.options.map((option) => (
                    <Select.Item key={option} value={option}>
                      {option}
                    </Select.Item>
                  ))}
                </Select.Content>
              </Select.Root>
            </Field.Root>
            <Field.Root>
              <Field.Label>From</Field.Label>
              <Field.Control>
                <Input.Root
                  type="date"
                  value={draft.from ?? ""}
                  onChange={(event) => set("from", event.target.value)}
                />
              </Field.Control>
            </Field.Root>
            <Field.Root>
              <Field.Label>To</Field.Label>
              <Field.Control>
                <Input.Root
                  type="date"
                  value={draft.to ?? ""}
                  onChange={(event) => set("to", event.target.value)}
                />
              </Field.Control>
            </Field.Root>
            {textFilters.map((filter) => (
              <Field.Root key={filter.key} invalid={invalid.includes(filter)}>
                <Field.Label>{filter.label}</Field.Label>
                <Field.Control>
                  <Input.Root
                    mono
                    spellCheck={false}
                    autoComplete="off"
                    value={draft[filter.key] ?? ""}
                    onChange={(event) => set(filter.key, event.target.value)}
                  />
                </Field.Control>
                <Field.Error>
                  {invalid.includes(filter) ? "Expected a UUID" : null}
                </Field.Error>
              </Field.Root>
            ))}
          </Fieldset.Fields>
        </Fieldset.Root>
        <p className="flex justify-end gap-2">
          <Button.Root
            variant="ghost"
            onClick={() => {
              setDraft({ actorType: any, action: any })
              setFilters({})
            }}
          >
            Reset
          </Button.Root>
          <Button.Root type="submit" disabled={invalid.length > 0}>
            Apply
          </Button.Root>
        </p>
      </form>
      {audit.isPending ? (
        <div aria-busy="true" className="flex flex-col gap-2">
          {["a", "b", "c", "d", "e"].map((key) => (
            <Skeleton.Root key={key} shape="block" />
          ))}
        </div>
      ) : audit.isError ? (
        <QueryError error={audit.error} onRetry={() => void audit.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState.Root>
          <EmptyState.Title>No events</EmptyState.Title>
          <EmptyState.Action>
            <Button.Root
              variant="secondary"
              onClick={() => {
                setDraft({ actorType: any, action: any })
                setFilters({})
              }}
            >
              Clear filters
            </Button.Root>
          </EmptyState.Action>
        </EmptyState.Root>
      ) : (
        <Table.Root density="compact">
          <Table.Header>
            <Table.Row>
              <Table.Head>Time</Table.Head>
              <Table.Head>Action</Table.Head>
              <Table.Head>Actor</Table.Head>
              <Table.Head className="hidden lg:table-cell">Target</Table.Head>
              <Table.Head className="hidden xl:table-cell">App</Table.Head>
              <Table.Head className="hidden md:table-cell">Request</Table.Head>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {rows.map((event) => (
              <Table.Row key={event.id}>
                <Table.Cell className="whitespace-nowrap text-secondary">
                  <time dateTime={event.occurredAt}>
                    {formatDateTime(event.occurredAt)}
                  </time>
                </Table.Cell>
                <Table.Cell mono className="text-[11px]">
                  {event.action}
                </Table.Cell>
                <Table.Cell>
                  <span className="block text-[12px]">
                    {humanize(event.actorType)}
                  </span>
                  <span className="block max-w-[160px] truncate font-mono text-[10px] text-secondary">
                    {event.actorId ?? "—"}
                  </span>
                </Table.Cell>
                <Table.Cell className="hidden lg:table-cell">
                  <span className="block text-[12px]">
                    {event.targetType ?? "—"}
                  </span>
                  <span className="block max-w-[160px] truncate font-mono text-[10px] text-secondary">
                    {event.targetId ?? ""}
                  </span>
                </Table.Cell>
                <Table.Cell
                  mono
                  className="hidden max-w-[160px] truncate text-[10px] text-secondary xl:table-cell"
                >
                  {event.appId ?? "—"}
                </Table.Cell>
                <Table.Cell
                  mono
                  className="hidden max-w-[140px] truncate text-[10px] text-secondary md:table-cell"
                >
                  {event.requestId ?? "—"}
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table.Root>
      )}
      {audit.hasNextPage ? (
        <Button.Root
          variant="secondary"
          className="self-start"
          loading={audit.isFetchingNextPage}
          onClick={() => void audit.fetchNextPage()}
        >
          Load more
        </Button.Root>
      ) : null}
    </div>
  )
}
