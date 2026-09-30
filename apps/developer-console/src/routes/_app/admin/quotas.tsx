import type { QuotaOverrideRecord } from "@repo/platform-contracts/console"
import {
  type EndpointClass,
  endpointClassSchema,
} from "@repo/platform-contracts/rate-limits"
import * as Button from "@repo/ui/button"
import * as Dialog from "@repo/ui/dialog"
import * as EmptyState from "@repo/ui/empty-state"
import * as Field from "@repo/ui/field"
import * as Fieldset from "@repo/ui/fieldset"
import * as Input from "@repo/ui/input"
import * as Select from "@repo/ui/select"
import * as Skeleton from "@repo/ui/skeleton"
import * as Table from "@repo/ui/table"
import * as Textarea from "@repo/ui/textarea"
import * as Toast from "@repo/ui/toast"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { Plus } from "lucide-react"
import { type FormEvent, type ReactElement, useState } from "react"
import { z } from "zod"
import ConfirmDialog from "../../../components/ConfirmDialog"
import QueryError from "../../../components/QueryError"
import * as api from "../../../lib/api"
import { errorMessage } from "../../../lib/api-client"
import { formatDate, formatInteger } from "../../../lib/format"
import { keys } from "../../../lib/queries"
import { useSession } from "../../../lib/session"
import { isStepUpCancelled, useStepUp } from "../../../lib/step-up"

type QuotaSearch = { environment?: string }

export const Route = createFileRoute("/_app/admin/quotas")({
  validateSearch: (search: Record<string, unknown>): QuotaSearch => {
    const parsed = z.uuid().safeParse(search.environment)
    return parsed.success ? { environment: parsed.data } : {}
  },
  component: QuotasPage,
})

function QuotasPage(): ReactElement {
  const { environment } = Route.useSearch()
  const [draft, setDraft] = useState(environment ?? "")
  const navigate = useNavigate()
  const valid = z.uuid().safeParse(draft.trim()).success

  function submit(event: FormEvent): void {
    event.preventDefault()
    if (valid) {
      void navigate({
        to: "/admin/quotas",
        search: { environment: draft.trim() },
      })
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <form onSubmit={submit} noValidate>
        <Fieldset.Root>
          <Fieldset.Legend hidden>Environment</Fieldset.Legend>
          <Fieldset.Fields>
            <Field.Root invalid={draft.trim() !== "" && !valid}>
              <Field.Label>Environment ID</Field.Label>
              <span className="flex max-w-xl gap-2">
                <Field.Control>
                  <Input.Root
                    mono
                    spellCheck={false}
                    autoComplete="off"
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                  />
                </Field.Control>
                <Button.Root
                  type="submit"
                  variant="secondary"
                  disabled={!valid}
                >
                  Load
                </Button.Root>
              </span>
              <Field.Error>
                {draft.trim() !== "" && !valid ? "Expected a UUID" : null}
              </Field.Error>
            </Field.Root>
          </Fieldset.Fields>
        </Fieldset.Root>
      </form>
      {environment === undefined ? (
        <EmptyState.Root>
          <EmptyState.Title>No environment selected</EmptyState.Title>
          <EmptyState.Action>
            <Button.Root
              variant="secondary"
              onClick={() => void navigate({ to: "/admin/apps" })}
            >
              Apps directory
            </Button.Root>
          </EmptyState.Action>
        </EmptyState.Root>
      ) : (
        <Overrides key={environment} environmentId={environment} />
      )}
    </div>
  )
}

type Editing =
  | { mode: "create" }
  | { mode: "edit"; record: QuotaOverrideRecord }

function Overrides({ environmentId }: { environmentId: string }): ReactElement {
  const queryKey = [...keys.admin, "quotas", environmentId]
  const overrides = useQuery({
    queryKey,
    queryFn: () => api.admin.quotaOverrides(environmentId),
  })
  const [editing, setEditing] = useState<Editing | null>(null)
  const [expiring, setExpiring] = useState<QuotaOverrideRecord | null>(null)
  const queryClient = useQueryClient()
  const stepUp = useStepUp()
  const { toast } = Toast.useToast()
  const operator = useSession().me.staffRole === "operator"
  const now = Date.now()

  return (
    <section aria-label="Quota overrides" className="flex flex-col gap-4">
      <header className="flex items-center justify-between gap-3">
        <h2 className="text-[14px] font-600 text-ink">Overrides</h2>
        {operator ? (
          <Button.Root onClick={() => setEditing({ mode: "create" })}>
            <Plus aria-hidden="true" size={13} strokeWidth={2} />
            New override
          </Button.Root>
        ) : null}
      </header>
      {overrides.isPending ? (
        <Skeleton.Root shape="block" />
      ) : overrides.isError ? (
        <QueryError
          error={overrides.error}
          onRetry={() => void overrides.refetch()}
        />
      ) : overrides.data.data.length === 0 ? (
        <EmptyState.Root>
          <EmptyState.Title>Default limits</EmptyState.Title>
          {operator ? (
            <EmptyState.Action>
              <Button.Root
                variant="secondary"
                onClick={() => setEditing({ mode: "create" })}
              >
                Add override
              </Button.Root>
            </EmptyState.Action>
          ) : null}
        </EmptyState.Root>
      ) : (
        <Table.Root density="compact">
          <Table.Header>
            <Table.Row>
              <Table.Head>Class</Table.Head>
              <Table.Head numeric>/ min</Table.Head>
              <Table.Head numeric>/ day</Table.Head>
              <Table.Head className="hidden md:table-cell">Reason</Table.Head>
              <Table.Head>Expires</Table.Head>
              <Table.Head>
                <span className="sr-only">Actions</span>
              </Table.Head>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {overrides.data.data.map((record) => {
              const expired =
                record.expiresAt !== null && Date.parse(record.expiresAt) <= now
              return (
                <Table.Row
                  key={record.id}
                  className={expired ? "opacity-60" : undefined}
                >
                  <Table.Cell mono>{record.endpointClass}</Table.Cell>
                  <Table.Cell numeric>
                    {formatInteger(record.perMinute)}
                  </Table.Cell>
                  <Table.Cell numeric>
                    {formatInteger(record.perDay)}
                  </Table.Cell>
                  <Table.Cell className="hidden max-w-[240px] truncate text-secondary md:table-cell">
                    {record.reason}
                  </Table.Cell>
                  <Table.Cell className="text-secondary">
                    {record.expiresAt === null
                      ? "Never"
                      : formatDate(record.expiresAt)}
                  </Table.Cell>
                  <Table.Cell className="whitespace-nowrap text-right">
                    {expired || !operator ? null : (
                      <>
                        <Button.Root
                          variant="ghost"
                          size="sm"
                          onClick={() => setEditing({ mode: "edit", record })}
                        >
                          Edit
                        </Button.Root>
                        <Button.Root
                          variant="ghost"
                          size="sm"
                          onClick={() => setExpiring(record)}
                        >
                          Expire
                        </Button.Root>
                      </>
                    )}
                  </Table.Cell>
                </Table.Row>
              )
            })}
          </Table.Body>
        </Table.Root>
      )}
      <OverrideDialog
        key={
          editing === null
            ? "closed"
            : editing.mode === "edit"
              ? editing.record.id
              : "new"
        }
        environmentId={environmentId}
        editing={editing}
        onClose={() => setEditing(null)}
        onSaved={async () => {
          await queryClient.invalidateQueries({ queryKey })
          toast({ title: "Override saved" })
          setEditing(null)
        }}
      />
      <ConfirmDialog
        open={expiring !== null}
        onOpenChange={(open) => {
          if (!open) setExpiring(null)
        }}
        title="Expire override?"
        description={`${expiring?.endpointClass ?? ""} returns to default limits within 60 s.`}
        confirmLabel="Expire"
        onConfirm={async () => {
          if (expiring === null) return
          await stepUp.run(() => api.admin.expireQuotaOverride(expiring.id))
          await queryClient.invalidateQueries({ queryKey })
          toast({ title: "Override expired" })
        }}
      />
    </section>
  )
}

function OverrideDialog({
  environmentId,
  editing,
  onClose,
  onSaved,
}: {
  environmentId: string
  editing: Editing | null
  onClose: () => void
  onSaved: () => Promise<void>
}): ReactElement {
  const initial = editing?.mode === "edit" ? editing.record : null
  const [endpointClass, setEndpointClass] = useState<EndpointClass>(
    initial?.endpointClass ?? "gauge-profiles",
  )
  const [perMinute, setPerMinute] = useState(String(initial?.perMinute ?? 600))
  const [perDay, setPerDay] = useState(String(initial?.perDay ?? 200_000))
  const [reason, setReason] = useState(initial?.reason ?? "")
  const [expiresOn, setExpiresOn] = useState(
    initial?.expiresAt?.slice(0, 10) ?? "",
  )
  const stepUp = useStepUp()
  const save = useMutation({
    mutationFn: async () => {
      await stepUp.run(() =>
        api.admin.createQuotaOverride(environmentId, {
          endpointClass,
          perMinute: Number(perMinute),
          perDay: Number(perDay),
          reason: reason.trim(),
          expiresAt:
            expiresOn === ""
              ? null
              : new Date(`${expiresOn}T23:59:59Z`).toISOString(),
        }),
      )
      if (initial !== null) {
        await stepUp.run(() => api.admin.expireQuotaOverride(initial.id))
      }
    },
    onSuccess: onSaved,
  })
  const minuteValid = /^[1-9][0-9]*$/.test(perMinute)
  const dayValid = /^[1-9][0-9]*$/.test(perDay)
  const valid = minuteValid && dayValid && reason.trim() !== ""

  function submit(event: FormEvent): void {
    event.preventDefault()
    if (valid) save.mutate()
  }

  return (
    <Dialog.Root
      open={editing !== null}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <Dialog.Content size="sm" aria-describedby={undefined}>
        <Dialog.Header>
          <Dialog.Title>
            {initial === null ? "New override" : "Edit override"}
          </Dialog.Title>
        </Dialog.Header>
        <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
          <Fieldset.Root disabled={save.isPending}>
            <Fieldset.Legend hidden>Override</Fieldset.Legend>
            <Fieldset.Fields>
              <Field.Root>
                <Field.Label>Endpoint class</Field.Label>
                <Select.Root
                  value={endpointClass}
                  onValueChange={(value) => {
                    const parsed = endpointClassSchema.safeParse(value)
                    if (parsed.success) setEndpointClass(parsed.data)
                  }}
                >
                  <Field.Control>
                    <Select.Trigger>
                      <Select.Value />
                    </Select.Trigger>
                  </Field.Control>
                  <Select.Content>
                    {endpointClassSchema.options.map((option) => (
                      <Select.Item key={option} value={option}>
                        {option}
                      </Select.Item>
                    ))}
                  </Select.Content>
                </Select.Root>
              </Field.Root>
              <Field.Root required invalid={!minuteValid}>
                <Field.Label>Per minute</Field.Label>
                <Field.Control>
                  <Input.Root
                    mono
                    inputMode="numeric"
                    value={perMinute}
                    onChange={(event) => setPerMinute(event.target.value)}
                  />
                </Field.Control>
                <Field.Error>
                  {minuteValid ? null : "Positive integer"}
                </Field.Error>
              </Field.Root>
              <Field.Root required invalid={!dayValid}>
                <Field.Label>Per day</Field.Label>
                <Field.Control>
                  <Input.Root
                    mono
                    inputMode="numeric"
                    value={perDay}
                    onChange={(event) => setPerDay(event.target.value)}
                  />
                </Field.Control>
                <Field.Error>
                  {dayValid ? null : "Positive integer"}
                </Field.Error>
              </Field.Root>
              <Field.Root>
                <Field.Label>Expires</Field.Label>
                <Field.Control>
                  <Input.Root
                    type="date"
                    value={expiresOn}
                    onChange={(event) => setExpiresOn(event.target.value)}
                  />
                </Field.Control>
              </Field.Root>
              <Field.Root required>
                <Field.Label>Reason</Field.Label>
                <Field.Control>
                  <Textarea.Root
                    rows={3}
                    maxLength={2000}
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                  />
                </Field.Control>
                <Field.Error>
                  {save.isError && !isStepUpCancelled(save.error)
                    ? errorMessage(save.error)
                    : null}
                </Field.Error>
              </Field.Root>
            </Fieldset.Fields>
          </Fieldset.Root>
          <Dialog.Footer>
            <Dialog.Close asChild>
              <Button.Root variant="secondary">Cancel</Button.Root>
            </Dialog.Close>
            <Button.Root
              type="submit"
              loading={save.isPending}
              disabled={!valid}
            >
              Save
            </Button.Root>
          </Dialog.Footer>
        </form>
      </Dialog.Content>
    </Dialog.Root>
  )
}
