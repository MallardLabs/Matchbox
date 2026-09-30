import type { App } from "@repo/platform-contracts/console"
import type { EnvironmentKind } from "@repo/platform-contracts/network"
import { cn } from "@repo/ui/cn"
import * as PageHeader from "@repo/ui/page-header"
import * as SegmentedControl from "@repo/ui/segmented-control"
import * as Select from "@repo/ui/select"
import { useQuery } from "@tanstack/react-query"
import {
  Link,
  Outlet,
  createFileRoute,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router"
import type { ReactElement, ReactNode } from "react"
import { DocsContext } from "../../lib/docs-context"
import { docPages } from "../../lib/docs-pages"
import {
  type DocsCredentials,
  placeholderCredentials,
} from "../../lib/docs-snippets"
import { apiKeysQuery, appsQuery } from "../../lib/queries"
import { useOptionalSession } from "../../lib/session"

type DocsSearch = { app?: string; env?: EnvironmentKind }

export const Route = createFileRoute("/_app/docs")({
  validateSearch: (search: Record<string, unknown>): DocsSearch => ({
    ...(typeof search.app === "string" ? { app: search.app } : {}),
    ...(search.env === "live" ? { env: "live" as const } : {}),
  }),
  component: DocsLayout,
})

function DocsLayout(): ReactElement {
  const session = useOptionalSession()
  const { env } = Route.useSearch()
  const kind: EnvironmentKind = env ?? "test"
  const content = (
    credentials: DocsCredentials,
    picker: ReactNode,
  ): ReactElement => (
    <DocsContext.Provider value={credentials}>
      <DocsFrame picker={picker} />
    </DocsContext.Provider>
  )
  if (session === null || session.org === null) {
    return content(placeholderCredentials(kind), null)
  }
  return <SignedInDocs orgId={session.org.id} kind={kind} render={content} />
}

function SignedInDocs({
  orgId,
  kind,
  render,
}: {
  orgId: string
  kind: EnvironmentKind
  render: (credentials: DocsCredentials, picker: ReactNode) => ReactElement
}): ReactElement {
  const { app: appId } = Route.useSearch()
  const navigate = useNavigate()
  const apps = useQuery(appsQuery(orgId))
  const list: App[] = apps.data?.data ?? []
  const app = list.find((item) => item.id === appId) ?? list[0]
  const environment = app?.environments.find((item) => item.kind === kind)
  const apiKeys = useQuery({
    ...apiKeysQuery(environment?.id ?? ""),
    enabled: environment !== undefined,
  })
  const active = (apiKeys.data?.data ?? []).filter(
    (key) => key.status === "active",
  )
  const placeholder = placeholderCredentials(kind)
  const credentials: DocsCredentials = {
    kind,
    clientId: environment?.clientId ?? placeholder.clientId,
    secretKeyPrefix:
      active.find((key) => key.kind === "secret")?.displayPrefix ??
      placeholder.secretKeyPrefix,
    publishableKeyPrefix:
      active.find((key) => key.kind === "publishable")?.displayPrefix ??
      placeholder.publishableKeyPrefix,
  }

  function select(next: { app?: string; env?: EnvironmentKind }): void {
    void navigate({
      to: ".",
      search: (previous: DocsSearch) => {
        const merged = { ...previous, ...next }
        return {
          ...(merged.app === undefined ? {} : { app: merged.app }),
          ...(merged.env === "live" ? { env: "live" as const } : {}),
        }
      },
      replace: true,
    })
  }

  const picker =
    app === undefined ? null : (
      <fieldset className="m-0 flex flex-wrap items-center gap-2 border-0 p-0">
        <legend className="sr-only">Docs context</legend>
        <Select.Root
          value={app.id}
          onValueChange={(value) => select({ app: value })}
        >
          <Select.Trigger className="w-[180px]" aria-label="App">
            <Select.Value />
          </Select.Trigger>
          <Select.Content>
            {list.map((item) => (
              <Select.Item key={item.id} value={item.id}>
                {item.name}
              </Select.Item>
            ))}
          </Select.Content>
        </Select.Root>
        <SegmentedControl.Root
          aria-label="Environment"
          value={kind}
          onValueChange={(value) =>
            select({ env: value === "live" ? "live" : "test" })
          }
        >
          <SegmentedControl.Item value="test">Test</SegmentedControl.Item>
          <SegmentedControl.Item value="live">Live</SegmentedControl.Item>
        </SegmentedControl.Root>
      </fieldset>
    )
  return render(credentials, picker)
}

type DocsLink =
  | { label: string; to: "/docs" | "/docs/reference" }
  | { label: string; page: string }

const docsLinks: DocsLink[] = [
  { label: "Quickstart", to: "/docs" },
  { label: "API reference", to: "/docs/reference" },
  ...docPages.map((page) => ({ label: page.title, page: page.slug })),
]

function DocsFrame({ picker }: { picker: ReactNode }): ReactElement {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })
  const linkClass = (active: boolean): string =>
    cn(
      "flex h-8 shrink-0 items-center whitespace-nowrap rounded-md px-2.5 text-[13px] transition-colors",
      active
        ? "bg-inset font-600 text-ink"
        : "font-500 text-secondary hover:bg-inset hover:text-ink",
    )
  return (
    <div className="flex flex-col gap-8">
      <PageHeader.Root>
        <PageHeader.Heading>
          <PageHeader.Eyebrow>Matchbox API</PageHeader.Eyebrow>
          <PageHeader.Title>Docs</PageHeader.Title>
        </PageHeader.Heading>
        {picker === null ? null : (
          <PageHeader.Actions>{picker}</PageHeader.Actions>
        )}
      </PageHeader.Root>
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[200px_minmax(0,1fr)]">
        <nav aria-label="Docs">
          <ul className="m-0 flex list-none gap-1 overflow-x-auto overflow-y-hidden p-0 lg:sticky lg:top-24 lg:flex-col">
            {docsLinks.map((link) => {
              if ("to" in link) {
                const active = pathname === link.to
                return (
                  <li key={link.label}>
                    <Link
                      to={link.to}
                      search={(previous: DocsSearch) => previous}
                      aria-current={active ? "page" : undefined}
                      className={linkClass(active)}
                    >
                      {link.label}
                    </Link>
                  </li>
                )
              }
              const active = pathname === `/docs/${link.page}`
              return (
                <li key={link.label}>
                  <Link
                    to="/docs/$page"
                    params={{ page: link.page }}
                    search={(previous: DocsSearch) => previous}
                    aria-current={active ? "page" : undefined}
                    className={linkClass(active)}
                  >
                    {link.label}
                  </Link>
                </li>
              )
            })}
          </ul>
        </nav>
        <article className="min-w-0 max-w-4xl">
          <Outlet />
        </article>
      </div>
    </div>
  )
}
