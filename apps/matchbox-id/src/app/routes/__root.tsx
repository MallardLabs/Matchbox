import * as AppShell from "@repo/ui/app-shell"
import { Outlet, createRootRoute } from "@tanstack/react-router"
import type { ReactElement } from "react"
import ErrorState from "../components/ErrorState"
import TopBar from "../components/TopBar"
import { isApiError } from "../lib/api"
import { useSession } from "../lib/queries"

export const Route = createRootRoute({
  component: RootLayout,
  notFoundComponent: NotFound,
})

function NotFound(): ReactElement {
  return <ErrorState code="not_found" />
}

function RootLayout(): ReactElement {
  const session = useSession()
  const disabled = isApiError(session.error, "service_disabled")

  return (
    <AppShell.Root>
      <AppShell.SkipLink />
      <AppShell.Body>
        <TopBar account={session.data?.account ?? null} />
        <AppShell.Main className="mx-auto flex w-full max-w-[760px] flex-col pb-16 md:pb-16">
          {disabled ? <ErrorState code="service_disabled" /> : <Outlet />}
        </AppShell.Main>
      </AppShell.Body>
    </AppShell.Root>
  )
}
