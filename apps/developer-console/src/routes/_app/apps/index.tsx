import type { App } from "@repo/platform-contracts/console"
import * as Button from "@repo/ui/button"
import * as Dialog from "@repo/ui/dialog"
import * as EmptyState from "@repo/ui/empty-state"
import * as Field from "@repo/ui/field"
import * as Fieldset from "@repo/ui/fieldset"
import * as Input from "@repo/ui/input"
import * as PageHeader from "@repo/ui/page-header"
import * as Skeleton from "@repo/ui/skeleton"
import * as Table from "@repo/ui/table"
import * as Toast from "@repo/ui/toast"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router"
import { Plus } from "lucide-react"
import { type FormEvent, type ReactElement, useState } from "react"
import { AppStatusBadge, ReviewBadge } from "../../../components/Badges"
import QueryError from "../../../components/QueryError"
import RequireOrg from "../../../components/RequireOrg"
import * as api from "../../../lib/api"
import { ApiError, errorMessage } from "../../../lib/api-client"
import { dash, formatDate } from "../../../lib/format"
import { appsQuery, keys } from "../../../lib/queries"
import { useTitle } from "../../../lib/title"

type AppsSearch = { create?: boolean }

export const Route = createFileRoute("/_app/apps/")({
  validateSearch: (search: Record<string, unknown>): AppsSearch =>
    search.create === true || search.create === "true" ? { create: true } : {},
  component: AppsPage,
})

function AppsPage(): ReactElement {
  useTitle("Apps")
  const { create } = Route.useSearch()
  const navigate = useNavigate()
  const setCreating = (open: boolean): void => {
    void navigate({
      to: "/apps",
      search: open ? { create: true } : {},
      replace: true,
    })
  }
  return (
    <RequireOrg>
      {(org) => (
        <div className="flex flex-col gap-8">
          <PageHeader.Root>
            <PageHeader.Heading>
              <PageHeader.Eyebrow>{org.name}</PageHeader.Eyebrow>
              <PageHeader.Title>Apps</PageHeader.Title>
            </PageHeader.Heading>
            <PageHeader.Actions>
              <Button.Root onClick={() => setCreating(true)}>
                <Plus aria-hidden="true" size={13} strokeWidth={2} />
                New app
              </Button.Root>
            </PageHeader.Actions>
          </PageHeader.Root>
          <AppsTable orgId={org.id} onCreate={() => setCreating(true)} />
          <CreateAppDialog
            orgId={org.id}
            open={create === true}
            onOpenChange={setCreating}
          />
        </div>
      )}
    </RequireOrg>
  )
}

function AppsTable({
  orgId,
  onCreate,
}: {
  orgId: string
  onCreate: () => void
}): ReactElement {
  const apps = useQuery(appsQuery(orgId))
  const navigate = useNavigate()
  if (apps.isPending) {
    return (
      <div aria-busy="true" className="flex flex-col gap-3">
        {["a", "b", "c", "d"].map((key) => (
          <Skeleton.Root key={key} shape="block" />
        ))}
      </div>
    )
  }
  if (apps.isError) {
    return <QueryError error={apps.error} onRetry={() => void apps.refetch()} />
  }
  if (apps.data.data.length === 0) {
    return (
      <EmptyState.Root>
        <EmptyState.Title>No apps</EmptyState.Title>
        <EmptyState.Action>
          <Button.Root onClick={onCreate}>Create app</Button.Root>
        </EmptyState.Action>
      </EmptyState.Root>
    )
  }
  return (
    <Table.Root>
      <Table.Header>
        <Table.Row>
          <Table.Head>Name</Table.Head>
          <Table.Head className="hidden sm:table-cell">Website</Table.Head>
          <Table.Head>Test</Table.Head>
          <Table.Head>Live</Table.Head>
          <Table.Head>Status</Table.Head>
          <Table.Head className="hidden md:table-cell">Created</Table.Head>
        </Table.Row>
      </Table.Header>
      <Table.Body>
        {apps.data.data.map((app: App) => {
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
              <Table.Cell className="hidden max-w-[220px] truncate text-secondary sm:table-cell">
                {app.websiteUrl ?? dash}
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
              <Table.Cell className="hidden text-secondary md:table-cell">
                {formatDate(app.createdAt)}
              </Table.Cell>
            </Table.Row>
          )
        })}
      </Table.Body>
    </Table.Root>
  )
}

function CreateAppDialog({
  orgId,
  open,
  onOpenChange,
}: {
  orgId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}): ReactElement {
  const [name, setName] = useState("")
  const [website, setWebsite] = useState("")
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { toast } = Toast.useToast()
  const create = useMutation({
    mutationFn: () =>
      api.orgs.createApp(orgId, {
        name: name.trim(),
        ...(website.trim() === "" ? {} : { websiteUrl: website.trim() }),
      }),
    async onSuccess(app) {
      await queryClient.invalidateQueries({ queryKey: keys.apps(orgId) })
      toast({ title: "App created" })
      setName("")
      setWebsite("")
      await navigate({ to: "/apps/$appId", params: { appId: app.id } })
    },
  })

  const websiteProblem =
    website.trim() !== "" && !website.trim().startsWith("https://")
      ? "Use https://"
      : null
  const issue = (path: string): string | null =>
    create.error instanceof ApiError ? create.error.issueFor(path) : null
  const generalError =
    create.isError &&
    !(create.error instanceof ApiError && create.error.issues.length > 0)
      ? errorMessage(create.error)
      : null

  function submit(event: FormEvent): void {
    event.preventDefault()
    if (name.trim() === "" || websiteProblem !== null) return
    create.mutate()
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Content size="sm">
        <Dialog.Header>
          <Dialog.Title>New app</Dialog.Title>
          <Dialog.Description>Test + live environments</Dialog.Description>
        </Dialog.Header>
        <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
          <Fieldset.Root disabled={create.isPending}>
            <Fieldset.Legend hidden>App</Fieldset.Legend>
            <Fieldset.Fields>
              <Field.Root required>
                <Field.Label>Name</Field.Label>
                <Field.Control>
                  <Input.Root
                    value={name}
                    maxLength={80}
                    autoComplete="off"
                    onChange={(event) => setName(event.target.value)}
                  />
                </Field.Control>
                <Field.Error>{issue("name")}</Field.Error>
              </Field.Root>
              <Field.Root>
                <Field.Label>Website</Field.Label>
                <Field.Control>
                  <Input.Root
                    type="url"
                    inputMode="url"
                    placeholder="https://example.com"
                    value={website}
                    onChange={(event) => setWebsite(event.target.value)}
                  />
                </Field.Control>
                <Field.Error>
                  {websiteProblem ?? issue("websiteUrl")}
                </Field.Error>
              </Field.Root>
            </Fieldset.Fields>
          </Fieldset.Root>
          {generalError === null ? null : (
            <p role="alert" className="text-[12px] font-500 text-neg">
              {generalError}
            </p>
          )}
          <Dialog.Footer>
            <Dialog.Close asChild>
              <Button.Root variant="secondary">Cancel</Button.Root>
            </Dialog.Close>
            <Button.Root
              type="submit"
              loading={create.isPending}
              disabled={name.trim() === "" || websiteProblem !== null}
            >
              Create
            </Button.Root>
          </Dialog.Footer>
        </form>
      </Dialog.Content>
    </Dialog.Root>
  )
}
