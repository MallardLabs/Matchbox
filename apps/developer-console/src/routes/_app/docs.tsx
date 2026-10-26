import type { App } from "@repo/platform-contracts/console"
import type { EnvironmentKind } from "@repo/platform-contracts/network"
import { cn } from "@repo/ui/cn"
import { useQuery } from "@tanstack/react-query"
import {
  Link,
  Outlet,
  createFileRoute,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router"
import { Package } from "lucide-react"
import { type ReactElement, useMemo } from "react"
import CopyIconButton from "../../components/ui/CopyIconButton"
import {
  DocsContext,
  type DocsControls,
  DocsControlsContext,
} from "../../lib/docs-context"
import type { DocPageSlug } from "../../lib/docs-pages"
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

const sdkPackage = "matchbox-markets"

function DocsLayout(): ReactElement {
  const session = useOptionalSession()
  const { env, app: appParam } = Route.useSearch()
  const kind: EnvironmentKind = env ?? "test"
  const navigate = useNavigate()
  const orgId = session?.org?.id ?? null

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

  const apps = useQuery({
    ...appsQuery(orgId ?? ""),
    enabled: orgId !== null,
  })
  const list: App[] | null = orgId === null ? null : (apps.data?.data ?? [])
  const app = list?.find((item) => item.id === appParam) ?? list?.[0]
  const environment = app?.environments.find((item) => item.kind === kind)
  const apiKeys = useQuery({
    ...apiKeysQuery(environment?.id ?? ""),
    enabled: environment !== undefined,
  })
  const credentials = useMemo((): DocsCredentials => {
    const placeholder = placeholderCredentials(kind)
    const active = (apiKeys.data?.data ?? []).filter(
      (key) => key.status === "active",
    )
    return {
      kind,
      clientId: environment?.clientId ?? placeholder.clientId,
      secretKeyPrefix:
        active.find((key) => key.kind === "secret")?.displayPrefix ??
        placeholder.secretKeyPrefix,
      publishableKeyPrefix:
        active.find((key) => key.kind === "publishable")?.displayPrefix ??
        placeholder.publishableKeyPrefix,
    }
  }, [apiKeys.data, environment, kind])
  const controls: DocsControls = {
    kind,
    setKind: (next) => select({ env: next }),
    apps: list,
    appId: app?.id ?? null,
    setApp: (id) => select({ app: id }),
  }

  return (
    <DocsContext.Provider value={credentials}>
      <DocsControlsContext.Provider value={controls}>
        <div className="grid grid-cols-1 gap-x-9 gap-y-6 lg:grid-cols-[200px_minmax(0,1fr)]">
          <DocsNav />
          <article className="min-w-0">
            <Outlet />
          </article>
        </div>
      </DocsControlsContext.Provider>
    </DocsContext.Provider>
  )
}

type DocsLink =
  | { label: string; to: "/docs" | "/docs/reference" }
  | { label: string; page: DocPageSlug }

const navGroups: Array<{ label: string; links: DocsLink[] }> = [
  {
    label: "Start",
    links: [
      { label: "Quickstart", to: "/docs" },
      { label: "Environments", page: "environments" },
      { label: "Authentication & keys", page: "auth" },
    ],
  },
  {
    label: "Sign in",
    links: [{ label: "Sign in with Matchbox", page: "oidc" }],
  },
  {
    label: "Reference",
    links: [
      { label: "API reference", to: "/docs/reference" },
      { label: "Errors", page: "errors" },
      { label: "Rate limits", page: "rate-limits" },
      { label: "Pagination", page: "pagination" },
    ],
  },
  { label: "Releases", links: [{ label: "Changelog", page: "changelog" }] },
]

function DocsNav(): ReactElement {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })
  const linkClass = (active: boolean): string =>
    cn(
      "flex h-8 shrink-0 items-center whitespace-nowrap rounded-md px-2.5 text-body-sm transition-colors",
      active
        ? "bg-inset font-600 text-ink"
        : "font-500 text-ink-2 hover:bg-inset hover:text-ink",
    )
  return (
    <nav
      aria-label="Docs"
      className="min-w-0 lg:sticky lg:top-24 lg:self-start"
    >
      <ul className="m-0 flex list-none gap-1 overflow-x-auto overflow-y-hidden p-0 lg:flex-col lg:gap-0.5 lg:overflow-visible">
        {navGroups.map((group) => (
          <li key={group.label} className="contents lg:block">
            <p className="hidden px-2.5 pb-1 pt-3.5 text-caption uppercase tracking-[0.04em] text-muted lg:block">
              {group.label}
            </p>
            <ul className="m-0 flex list-none gap-1 p-0 lg:flex-col lg:gap-0.5">
              {group.links.map((link) => {
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
          </li>
        ))}
      </ul>
      <div className="mt-3.5 hidden items-center gap-2 rounded-md border border-line py-1.5 pl-2.5 pr-1 lg:flex">
        <Package
          aria-hidden="true"
          size={14}
          strokeWidth={1.75}
          className="shrink-0 text-muted"
        />
        <code className="min-w-0 flex-1 truncate font-mono text-caption text-ink">
          {sdkPackage}
        </code>
        <CopyIconButton value={sdkPackage} label="package name" />
      </div>
    </nav>
  )
}
