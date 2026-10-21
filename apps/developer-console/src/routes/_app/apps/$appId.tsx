import type { EnvironmentKind } from "@repo/platform-contracts/network"
import { cn } from "@repo/ui/cn"
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
import QueryError from "../../../components/QueryError"
import { Crumb, Crumbs } from "../../../components/shell/Breadcrumbs"
import PageTitle from "../../../components/ui/PageTitle"
import { environmentNames } from "../../../components/ui/Pill"
import { AppStatusLabel } from "../../../components/ui/Status"
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
    | "/apps/$appId/environments"
    | "/apps/$appId/keys"
    | "/apps/$appId/secrets"
    | "/apps/$appId/oauth"
    | "/apps/$appId/usage"
    | "/apps/$appId/settings"
  label: string
  suffix: string
  /** Shows the Test / Live switch in the header. */
  perEnvironment: boolean
}

/** Tab order follows the code order (design note 4). */
const tabs: Tab[] = [
  {
    to: "/apps/$appId/environments",
    label: "Environments",
    suffix: "/environments",
    perEnvironment: false,
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
    tabs.find((tab) => pathname === `${base}${tab.suffix}`) ?? tabs[0]
  const name = app.data?.name ?? "App"
  useTitle(
    app.data === undefined
      ? "App"
      : `${app.data.name} · ${active?.label ?? ""}`,
  )

  return (
    <div className="flex flex-col gap-6">
      <Crumbs>
        <Crumb>
          <Link to="/apps">Apps</Link>
        </Crumb>
        <Crumb>
          <Link to="/apps/$appId/environments" params={{ appId }}>
            {name}
          </Link>
        </Crumb>
        <Crumb current>{active?.label ?? ""}</Crumb>
      </Crumbs>
      <PageTitle
        eyebrow="App"
        title={
          app.isPending ? <Skeleton.Root className="h-[34px] w-56" /> : name
        }
        adornment={
          app.data === undefined ? undefined : (
            <AppStatusLabel status={app.data.status} />
          )
        }
        actions={
          active?.perEnvironment ? (
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
              className="max-w-full"
            >
              {(["test", "live"] as const).map((option) => (
                <SegmentedControl.Item
                  key={option}
                  value={option}
                  className="px-3.5 text-body-sm"
                >
                  {environmentNames[option]}
                </SegmentedControl.Item>
              ))}
            </SegmentedControl.Root>
          ) : undefined
        }
      />
      <nav aria-label="App sections">
        <ul className="m-0 flex min-w-0 list-none gap-6 overflow-x-auto overflow-y-hidden border-b border-line p-0">
          {tabs.map((tab) => {
            const current = tab === active
            return (
              <li key={tab.to} className="shrink-0">
                <Link
                  to={tab.to}
                  params={{ appId }}
                  search={kind === "live" ? { env: "live" } : {}}
                  aria-current={current ? "page" : undefined}
                  className={cn(
                    "relative -mb-px inline-flex h-11 items-center whitespace-nowrap text-body-sm transition-colors after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:rounded-sm",
                    current
                      ? "font-600 text-ink after:bg-accent"
                      : "font-500 text-secondary after:bg-transparent hover:text-ink",
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
