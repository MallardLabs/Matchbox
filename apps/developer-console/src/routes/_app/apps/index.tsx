import type { App, OrganizationSummary } from "@repo/platform-contracts/console"
import * as Button from "@repo/ui/button"
import { cn } from "@repo/ui/cn"
import * as Dialog from "@repo/ui/dialog"
import * as EmptyState from "@repo/ui/empty-state"
import * as Field from "@repo/ui/field"
import * as Fieldset from "@repo/ui/fieldset"
import * as Input from "@repo/ui/input"
import * as Skeleton from "@repo/ui/skeleton"
import * as Table from "@repo/ui/table"
import * as Toast from "@repo/ui/toast"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router"
import { Plus, Search } from "lucide-react"
import { type FormEvent, type ReactElement, useMemo, useState } from "react"
import QueryError from "../../../components/QueryError"
import RequireOrg from "../../../components/RequireOrg"
import { Crumb, Crumbs } from "../../../components/shell/Breadcrumbs"
import AppMark, { appMarkTone } from "../../../components/ui/AppMark"
import ChipGroup from "../../../components/ui/ChipGroup"
import PageTitle from "../../../components/ui/PageTitle"
import { Pill, ScopeChip } from "../../../components/ui/Pill"
import { ReviewStatus } from "../../../components/ui/Status"
import * as api from "../../../lib/api"
import { ApiError, errorMessage } from "../../../lib/api-client"
import {
  dash,
  formatHost,
  formatInteger,
  formatMonthDay,
} from "../../../lib/format"
import { appsQuery, keys, orgUsageQuery } from "../../../lib/queries"
import { useTitle } from "../../../lib/title"
import { rangeWindow } from "../../../lib/usage-range"

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
        <div className="flex flex-col gap-7">
          <Crumbs>
            <Crumb>
              <Link to="/">{org.name}</Link>
            </Crumb>
            <Crumb current>Apps</Crumb>
          </Crumbs>
          <PageTitle
            eyebrow={org.name}
            title="Apps"
            actions={
              <Button.Root onClick={() => setCreating(true)}>
                <Plus aria-hidden="true" size={14} strokeWidth={2} />
                New app
              </Button.Root>
            }
          />
          <AppsTable org={org} onCreate={() => setCreating(true)} />
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

type StatusFilter = "all" | "active" | "retired"

function isStatusFilter(value: string): value is StatusFilter {
  return value === "all" || value === "active" || value === "retired"
}

/** Case-insensitive name/slug/website match. */
export function matchesAppFilter(app: App, query: string): boolean {
  const needle = query.trim().toLowerCase()
  if (needle === "") return true
  return [app.name, app.slug, app.websiteUrl ?? ""].some((value) =>
    value.toLowerCase().includes(needle),
  )
}

function AppsTable({
  org,
  onCreate,
}: {
  org: OrganizationSummary
  onCreate: () => void
}): ReactElement {
  const apps = useQuery(appsQuery(org.id))
  const week = useMemo(() => rangeWindow("7d"), [])
  const usage = useQuery(
    orgUsageQuery({ orgId: org.id, ...week, environmentKind: "both" }),
  )
  const [status, setStatus] = useState<StatusFilter>("all")
  const [query, setQuery] = useState("")
  const navigate = useNavigate()

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

  if (apps.isPending) {
    return (
      <div aria-busy="true" className="flex flex-col gap-3">
        {["a", "b", "c", "d"].map((key) => (
          <Skeleton.Root key={key} shape="block" className="h-12" />
        ))}
      </div>
    )
  }
  if (apps.isError) {
    return <QueryError error={apps.error} onRetry={() => void apps.refetch()} />
  }
  const all = apps.data.data
  if (all.length === 0) {
    return (
      <EmptyState.Root>
        <EmptyState.Title>No apps</EmptyState.Title>
        <EmptyState.Action>
          <Button.Root onClick={onCreate}>Create app</Button.Root>
        </EmptyState.Action>
      </EmptyState.Root>
    )
  }
  const retiredCount = all.filter((app) => app.status === "retired").length
  const rows = all.filter(
    (app) =>
      (status === "all" ||
        (status === "retired"
          ? app.status === "retired"
          : app.status !== "retired")) &&
      matchesAppFilter(app, query),
  )

  return (
    <section aria-label="Apps" className="flex min-w-0 flex-col">
      <div className="flex flex-wrap items-center gap-2 pb-4">
        <ChipGroup
          label="Status"
          value={status}
          onChange={(value) => {
            if (isStatusFilter(value)) setStatus(value)
          }}
          options={[
            { value: "all", label: `All · ${all.length}` },
            { value: "active", label: `Active · ${all.length - retiredCount}` },
            { value: "retired", label: `Retired · ${retiredCount}` },
          ]}
        />
        <span className="flex-1" />
        <Input.Group size="sm" className="w-full bg-surface sm:w-[240px]">
          <Input.Adornment>
            <Search aria-hidden="true" size={14} strokeWidth={1.75} />
          </Input.Adornment>
          <Input.Root
            type="search"
            aria-label="Filter apps"
            placeholder="Filter apps"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </Input.Group>
      </div>
      {rows.length === 0 ? (
        <EmptyState.Root>
          <EmptyState.Title>No matching apps</EmptyState.Title>
          <EmptyState.Action>
            <Button.Root
              variant="secondary"
              onClick={() => {
                setQuery("")
                setStatus("all")
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
              <Table.Head className="hidden w-[130px] xl:table-cell">
                Website
              </Table.Head>
              <Table.Head className="hidden w-[110px] md:table-cell">
                Test
              </Table.Head>
              <Table.Head className="w-[140px]">Live</Table.Head>
              <Table.Head className="hidden w-[290px] lg:table-cell">
                Live scopes
              </Table.Head>
              <Table.Head numeric className="hidden w-[100px] sm:table-cell">
                Requests · 7 d
              </Table.Head>
              <Table.Head
                numeric
                className="hidden w-[64px] min-[1100px]:table-cell"
              >
                Created
              </Table.Head>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {rows.map((app) => (
              <AppRow
                key={app.id}
                app={app}
                requests={requestsByApp.get(app.id)}
                onOpen={() =>
                  void navigate({
                    to: "/apps/$appId",
                    params: { appId: app.id },
                  })
                }
              />
            ))}
          </Table.Body>
        </Table.Root>
      )}
      <ul
        aria-label="Scope legend"
        className="m-0 flex list-none flex-wrap items-center gap-4 p-0 pt-3.5 text-label text-secondary"
      >
        <li className="flex items-center gap-1.5">
          <ScopeChip scope="scope" />
          Approved
        </li>
        <li className="flex items-center gap-1.5">
          <ScopeChip scope="scope" pending />
          Pending review
        </li>
      </ul>
    </section>
  )
}

function AppRow({
  app,
  requests,
  onOpen,
}: {
  app: App
  requests: number | undefined
  onOpen: () => void
}): ReactElement {
  const retired = app.status === "retired"
  const test = app.environments.find((env) => env.kind === "test")
  const live = app.environments.find((env) => env.kind === "live")
  const liveScopes =
    live === undefined
      ? []
      : [
          ...live.approvedScopes.map((scope) => ({ scope, pending: false })),
          ...pendingLiveScopes(app).map((scope) => ({
            scope,
            pending: true,
          })),
        ]
  const muted = <span className="text-body-sm text-muted">{dash}</span>
  return (
    <Table.Row interactive onClick={onOpen}>
      <Table.Cell className="py-3.5">
        <span className="flex min-w-0 items-center gap-3">
          <AppMark
            name={app.name}
            logoUrl={app.logoUrl}
            tone={appMarkTone(app)}
          />
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="flex min-w-0 items-center gap-2">
              <Link
                to="/apps/$appId"
                params={{ appId: app.id }}
                onClick={(event) => event.stopPropagation()}
                className={cn(
                  "truncate text-body font-600 hover:underline",
                  retired ? "text-secondary" : "text-ink",
                )}
              >
                {app.name}
              </Link>
              {retired ? <Pill>Retired</Pill> : null}
            </span>
            <span className="truncate font-mono text-caption text-muted">
              {app.slug}
            </span>
          </span>
        </span>
      </Table.Cell>
      <Table.Cell className="hidden max-w-[130px] truncate text-body-sm text-secondary xl:table-cell">
        {app.websiteUrl === null ? muted : formatHost(app.websiteUrl)}
      </Table.Cell>
      <Table.Cell className="hidden md:table-cell">
        {retired || test === undefined ? (
          muted
        ) : (
          <ReviewStatus state={test.reviewState} />
        )}
      </Table.Cell>
      <Table.Cell>
        {retired || live === undefined ? (
          muted
        ) : (
          <ReviewStatus state={live.reviewState} />
        )}
      </Table.Cell>
      <Table.Cell className="hidden lg:table-cell">
        {retired || liveScopes.length === 0 ? (
          muted
        ) : (
          <span className="flex flex-wrap gap-1">
            {liveScopes.map((item) => (
              <ScopeChip
                key={item.scope}
                scope={item.scope}
                pending={item.pending}
              />
            ))}
          </span>
        )}
      </Table.Cell>
      <Table.Cell numeric className="hidden sm:table-cell">
        {retired || requests === undefined ? muted : formatInteger(requests)}
      </Table.Cell>
      <Table.Cell
        numeric
        className="hidden font-sans text-label text-secondary min-[1100px]:table-cell"
      >
        {formatMonthDay(app.createdAt)}
      </Table.Cell>
    </Table.Row>
  )
}

/** Live scopes requested but not yet approved (outlined chips). */
function pendingLiveScopes(app: App): string[] {
  const live = app.environments.find((env) => env.kind === "live")
  if (live === undefined) return []
  return (live.requestedScopes ?? live.approvedScopes).filter(
    (scope) => !live.approvedScopes.includes(scope),
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
            <p role="alert" className="text-label font-500 text-neg">
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
