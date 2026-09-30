import * as AppShell from "@repo/ui/app-shell"
import * as Skeleton from "@repo/ui/skeleton"
import { useQuery } from "@tanstack/react-query"
import {
  Navigate,
  Outlet,
  createFileRoute,
  useRouterState,
} from "@tanstack/react-router"
import type { ReactElement } from "react"
import QueryError from "../components/QueryError"
import Unavailable from "../components/Unavailable"
import ConsoleShell from "../components/shell/ConsoleShell"
import { isApiError } from "../lib/api-client"
import { meQuery } from "../lib/queries"
import { SessionProvider } from "../lib/session"

export const Route = createFileRoute("/_app")({
  component: AppLayout,
})

function AppLayout(): ReactElement {
  const me = useQuery(meQuery)
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })

  if (me.isPending) return <ShellSkeleton />
  if (me.isError) {
    if (isApiError(me.error, "unauthorized")) {
      if (pathname === "/docs" || pathname.startsWith("/docs/")) {
        return (
          <ConsoleShell>
            <Outlet />
          </ConsoleShell>
        )
      }
      return (
        <Navigate
          to="/sign-in"
          search={pathname === "/" ? {} : { redirect: pathname }}
          replace
        />
      )
    }
    if (isApiError(me.error, "service_disabled")) return <Unavailable />
    return (
      <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center px-4">
        <QueryError error={me.error} onRetry={() => void me.refetch()} />
      </main>
    )
  }
  return (
    <SessionProvider me={me.data}>
      <ConsoleShell>
        <Outlet />
      </ConsoleShell>
    </SessionProvider>
  )
}

function ShellSkeleton(): ReactElement {
  return (
    <AppShell.Root aria-busy="true">
      <AppShell.Sidebar>
        <Skeleton.Root className="h-[25px] w-32" />
        <Skeleton.Root shape="block" className="mt-6 h-11" />
        <span className="mt-9 flex flex-col gap-3">
          {["a", "b", "c", "d"].map((key) => (
            <Skeleton.Root key={key} shape="block" className="h-9" />
          ))}
        </span>
      </AppShell.Sidebar>
      <AppShell.Body>
        <AppShell.TopBar>
          <span className="flex-1" />
          <Skeleton.Root shape="circle" className="size-9" />
        </AppShell.TopBar>
        <AppShell.Main>
          <Skeleton.Root className="h-8 w-48" />
          <Skeleton.Root shape="block" className="mt-8 h-40" />
        </AppShell.Main>
      </AppShell.Body>
    </AppShell.Root>
  )
}
