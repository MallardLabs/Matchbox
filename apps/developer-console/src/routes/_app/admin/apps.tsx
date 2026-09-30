import {
  type AppStatus,
  appStatusSchema,
} from "@repo/platform-contracts/console"
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
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query"
import { Link, createFileRoute } from "@tanstack/react-router"
import { Search } from "lucide-react"
import { type FormEvent, type ReactElement, useState } from "react"
import { AppStatusBadge, EnvBadge } from "../../../components/Badges"
import QueryError from "../../../components/QueryError"
import * as api from "../../../lib/api"
import { errorMessage } from "../../../lib/api-client"
import { formatDate, humanize } from "../../../lib/format"
import { keys } from "../../../lib/queries"
import { useSession } from "../../../lib/session"
import { isStepUpCancelled, useStepUp } from "../../../lib/step-up"

export const Route = createFileRoute("/_app/admin/apps")({
  component: AdminAppsPage,
})

const anyStatus = "any"

type Target = { id: string; name: string; status: AppStatus }

function AdminAppsPage(): ReactElement {
  const [draft, setDraft] = useState("")
  const [query, setQuery] = useState("")
  const [status, setStatus] = useState<AppStatus | undefined>(undefined)
  const [target, setTarget] = useState<Target | null>(null)
  const operator = useSession().me.staffRole === "operator"
  const apps = useInfiniteQuery({
    queryKey: [...keys.admin, "apps", query, status ?? anyStatus],
    queryFn: ({ pageParam }) =>
      api.admin.apps({
        query: query === "" ? undefined : query,
        status,
        cursor: pageParam,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  })
  const rows = (apps.data?.pages ?? []).flatMap((page) => page.data)

  function submit(event: FormEvent): void {
    event.preventDefault()
    setQuery(draft.trim())
  }

  return (
    <div className="flex flex-col gap-6">
      <form onSubmit={submit} noValidate>
        <Fieldset.Root>
          <Fieldset.Legend hidden>Search</Fieldset.Legend>
          <Fieldset.Fields className="flex-row flex-wrap items-end">
            <Field.Root>
              <Field.Label>Search</Field.Label>
              <span className="flex gap-2">
                <Field.Control>
                  <Input.Root
                    type="search"
                    className="w-[240px]"
                    placeholder="Name or slug"
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                  />
                </Field.Control>
                <Button.Root type="submit" variant="secondary">
                  <Search aria-hidden="true" size={13} strokeWidth={1.75} />
                  Search
                </Button.Root>
              </span>
            </Field.Root>
            <Field.Root>
              <Field.Label>Status</Field.Label>
              <Select.Root
                value={status ?? anyStatus}
                onValueChange={(value) => {
                  const parsed = appStatusSchema.safeParse(value)
                  setStatus(parsed.success ? parsed.data : undefined)
                }}
              >
                <Field.Control>
                  <Select.Trigger className="w-[160px]">
                    <Select.Value />
                  </Select.Trigger>
                </Field.Control>
                <Select.Content>
                  <Select.Item value={anyStatus}>Any status</Select.Item>
                  {appStatusSchema.options.map((option) => (
                    <Select.Item key={option} value={option}>
                      {humanize(option)}
                    </Select.Item>
                  ))}
                </Select.Content>
              </Select.Root>
            </Field.Root>
          </Fieldset.Fields>
        </Fieldset.Root>
      </form>
      {apps.isPending ? (
        <div aria-busy="true" className="flex flex-col gap-3">
          {["a", "b", "c"].map((key) => (
            <Skeleton.Root key={key} shape="block" />
          ))}
        </div>
      ) : apps.isError ? (
        <QueryError error={apps.error} onRetry={() => void apps.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState.Root>
          <EmptyState.Title>No apps</EmptyState.Title>
          <EmptyState.Action>
            <Button.Root
              variant="secondary"
              onClick={() => {
                setDraft("")
                setQuery("")
                setStatus(undefined)
              }}
            >
              Clear filters
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
              <Table.Head>Environments</Table.Head>
              <Table.Head>Status</Table.Head>
              <Table.Head className="hidden lg:table-cell">Created</Table.Head>
              <Table.Head>
                <span className="sr-only">Actions</span>
              </Table.Head>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {rows.map((app) => (
              <Table.Row key={app.id}>
                <Table.Cell>
                  <span className="block font-600">{app.name}</span>
                  <span className="block font-mono text-[11px] text-secondary">
                    {app.slug}
                  </span>
                </Table.Cell>
                <Table.Cell className="hidden text-secondary md:table-cell">
                  {app.organization.name}
                </Table.Cell>
                <Table.Cell>
                  <span className="flex flex-wrap gap-1.5">
                    {app.environments.map((env) => (
                      <Link
                        key={env.id}
                        to="/admin/quotas"
                        search={{ environment: env.id }}
                        aria-label={`Quotas for ${app.name} ${env.kind}`}
                      >
                        <EnvBadge kind={env.kind} />
                      </Link>
                    ))}
                  </span>
                </Table.Cell>
                <Table.Cell>
                  <AppStatusBadge status={app.status} />
                </Table.Cell>
                <Table.Cell className="hidden text-secondary lg:table-cell">
                  {formatDate(app.createdAt)}
                </Table.Cell>
                <Table.Cell className="text-right">
                  {operator ? (
                    <Button.Root
                      variant="ghost"
                      size="sm"
                      aria-label={`Change status of ${app.name}`}
                      onClick={() =>
                        setTarget({
                          id: app.id,
                          name: app.name,
                          status: app.status,
                        })
                      }
                    >
                      Status
                    </Button.Root>
                  ) : null}
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table.Root>
      )}
      {apps.hasNextPage ? (
        <Button.Root
          variant="secondary"
          className="self-start"
          loading={apps.isFetchingNextPage}
          onClick={() => void apps.fetchNextPage()}
        >
          Load more
        </Button.Root>
      ) : null}
      <StatusDialog target={target} onClose={() => setTarget(null)} />
    </div>
  )
}

const statusActions: Record<AppStatus, string> = {
  active: "Reactivate",
  restricted: "Restrict",
  suspended: "Suspend",
  retired: "Retire",
}

function StatusDialog({
  target,
  onClose,
}: {
  target: Target | null
  onClose: () => void
}): ReactElement {
  const [status, setStatus] = useState<AppStatus>("restricted")
  const [reason, setReason] = useState("")
  const queryClient = useQueryClient()
  const stepUp = useStepUp()
  const { toast } = Toast.useToast()
  const change = useMutation({
    mutationFn: (appId: string) =>
      stepUp.run(() =>
        api.admin.changeAppStatus(appId, { status, reason: reason.trim() }),
      ),
    async onSuccess(app) {
      await queryClient.invalidateQueries({ queryKey: keys.admin })
      toast({ title: `${app.name}: ${humanize(app.status)}` })
      setReason("")
      onClose()
    },
  })

  function submit(event: FormEvent): void {
    event.preventDefault()
    if (target !== null && reason.trim() !== "") change.mutate(target.id)
  }

  return (
    <Dialog.Root
      open={target !== null}
      onOpenChange={(open) => {
        if (!open) {
          change.reset()
          onClose()
        }
      }}
    >
      <Dialog.Content size="sm">
        <Dialog.Header>
          <Dialog.Title>App status</Dialog.Title>
          <Dialog.Description>
            {target === null
              ? ""
              : `${target.name} · ${humanize(target.status)}`}
          </Dialog.Description>
        </Dialog.Header>
        <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
          <Fieldset.Root disabled={change.isPending}>
            <Fieldset.Legend hidden>Status change</Fieldset.Legend>
            <Fieldset.Fields>
              <Field.Root>
                <Field.Label>New status</Field.Label>
                <Select.Root
                  value={status}
                  onValueChange={(value) => {
                    const parsed = appStatusSchema.safeParse(value)
                    if (parsed.success) setStatus(parsed.data)
                  }}
                >
                  <Field.Control>
                    <Select.Trigger>
                      <Select.Value />
                    </Select.Trigger>
                  </Field.Control>
                  <Select.Content>
                    {appStatusSchema.options.map((option) => (
                      <Select.Item
                        key={option}
                        value={option}
                        disabled={option === target?.status}
                      >
                        {statusActions[option]}
                      </Select.Item>
                    ))}
                  </Select.Content>
                </Select.Root>
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
                  {change.isError && !isStepUpCancelled(change.error)
                    ? errorMessage(change.error)
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
              variant={status === "active" ? "primary" : "danger"}
              loading={change.isPending}
              disabled={reason.trim() === "" || status === target?.status}
            >
              {statusActions[status]}
            </Button.Root>
          </Dialog.Footer>
        </form>
      </Dialog.Content>
    </Dialog.Root>
  )
}
