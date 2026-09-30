import type { EnvironmentKind } from "@repo/platform-contracts/network"
import { cn } from "@repo/ui/cn"
import * as PageHeader from "@repo/ui/page-header"
import * as SegmentedControl from "@repo/ui/segmented-control"
import * as Skeleton from "@repo/ui/skeleton"
import { useQuery } from "@tanstack/react-query"
import {
  Link,
  Outlet,
  createFileRoute,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router"
import type { ReactElement } from "react"
import { AppStatusBadge, EnvBadge } from "../../../components/Badges"
import QueryError from "../../../components/QueryError"
import { TopBarContext } from "../../../components/shell/TopBarSlot"
import { appQuery } from "../../../lib/queries"
import { useTitle } from "../../../lib/title"

type AppSearch = { env?: EnvironmentKind }

export const Route = createFileRoute("/_app/apps/$appId")({
  validateSearch: (search: Record<string, unknown>): AppSearch =>
    search.env === "live" ? { env: "live" } : {},
  component: AppLayout,
})

type Tab = {
  to:
    | "/apps/$appId"
    | "/apps/$appId/settings"
    | "/apps/$appId/environments"
    | "/apps/$appId/keys"
    | "/apps/$appId/secrets"
    | "/apps/$appId/oauth"
    | "/apps/$appId/usage"
  label: string
  suffix: string
  perEnvironment: boolean
}

const tabs: Tab[] = [
  { to: "/apps/$appId", label: "Overview", suffix: "", perEnvironment: false },
  {
    to: "/apps/$appId/environments",
    label: "Environments",
    suffix: "/environments",
    perEnvironment: true,
  },
  {
    to: "/apps/$appId/keys",
    label: "API keys",
    suffix: "/keys",
    perEnvironment: true,
  },
  {
    to: "/apps/$appId/secrets",
    label: "Client secrets",
    suffix: "/secrets",
    perEnvironment: true,
  },
  {
    to: "/apps/$appId/oauth",
    label: "OAuth",
    suffix: "/oauth",
    perEnvironment: true,
  },
  {
    to: "/apps/$appId/usage",
    label: "Usage",
    suffix: "/usage",
    perEnvironment: true,
  },
  {
    to: "/apps/$appId/settings",
    label: "Settings",
    suffix: "/settings",
    perEnvironment: false,
  },
]

function AppLayout(): ReactElement {
  const { appId } = Route.useParams()
  const { env } = Route.useSearch()
  const kind: EnvironmentKind = env ?? "test"
  const app = useQuery(appQuery(appId))
  const navigate = useNavigate()
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })
  const base = `/apps/${appId}`
  const active =
    tabs.find(
      (tab) => tab.suffix !== "" && pathname === `${base}${tab.suffix}`,
    ) ?? tabs[0]
  useTitle(
    app.data === undefined
      ? "App"
      : `${app.data.name} · ${active?.label ?? ""}`,
  )

  return (
    <div className="flex flex-col gap-6">
      <TopBarContext>
        <span className="hidden min-w-0 items-center gap-2 text-[13px] sm:flex">
          <Link to="/apps" className="text-secondary hover:text-ink">
            Apps
          </Link>
          <span aria-hidden="true" className="text-muted">
            /
          </span>
          <span className="truncate font-600 text-ink">
            {app.data?.name ?? "…"}
          </span>
          {active?.perEnvironment ? <EnvBadge kind={kind} /> : null}
        </span>
      </TopBarContext>
      <PageHeader.Root>
        <PageHeader.Heading>
          <PageHeader.Eyebrow>App</PageHeader.Eyebrow>
          {app.isPending ? (
            <Skeleton.Root className="h-[34px] w-56" />
          ) : (
            <span className="flex flex-wrap items-center gap-3">
              <PageHeader.Title>{app.data?.name ?? "App"}</PageHeader.Title>
              {app.data === undefined ? null : (
                <AppStatusBadge status={app.data.status} />
              )}
            </span>
          )}
        </PageHeader.Heading>
        {active?.perEnvironment ? (
          <PageHeader.Actions>
            <SegmentedControl.Root
              aria-label="Environment"
              value={kind}
              onValueChange={(value) =>
                void navigate({
                  to: ".",
                  search: value === "live" ? { env: "live" } : {},
                  replace: true,
                })
              }
            >
              <SegmentedControl.Item value="test">Test</SegmentedControl.Item>
              <SegmentedControl.Item value="live">Live</SegmentedControl.Item>
            </SegmentedControl.Root>
          </PageHeader.Actions>
        ) : null}
      </PageHeader.Root>
      <nav aria-label="App sections" className="-mt-2">
        <ul className="m-0 flex min-w-0 list-none gap-5 overflow-x-auto overflow-y-hidden border-b border-line p-0">
          {tabs.map((tab) => {
            const current = tab === active
            return (
              <li key={tab.to}>
                <Link
                  to={tab.to}
                  params={{ appId }}
                  search={
                    tab.perEnvironment && kind === "live" ? { env: "live" } : {}
                  }
                  aria-current={current ? "page" : undefined}
                  className={cn(
                    "relative -mb-px inline-flex h-10 shrink-0 items-center whitespace-nowrap text-[13px] transition-colors after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:rounded-sm",
                    current
                      ? "font-600 text-ink after:bg-accent"
                      : "font-550 text-secondary after:bg-transparent hover:text-ink",
                  )}
                >
                  {tab.label}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>
      {app.isError ? (
        <QueryError error={app.error} onRetry={() => void app.refetch()} />
      ) : (
        <Outlet />
      )}
    </div>
  )
}
