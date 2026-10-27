import * as AppShell from "@repo/ui/app-shell"
import { cn } from "@repo/ui/cn"
import * as TrelliumMark from "@repo/ui/trellium-mark"
import { Outlet, createRootRoute, useRouterState } from "@tanstack/react-router"
import type { ReactElement } from "react"
import ErrorState from "../components/ErrorState"
import IdHeader from "../components/shell/IdHeader"
import { isApiError } from "../lib/api"
import { useSession } from "../lib/queries"

export const Route = createRootRoute({
  component: RootLayout,
  notFoundComponent: NotFound,
})

function NotFound(): ReactElement {
  return <ErrorState code="not_found" />
}

/** Page ground: sign-in glows, consent sits on inset, the rest on canvas. */
function pageTone(pathname: string): string {
  if (pathname === "/sign-in") return "bg-canvas id-glow"
  if (pathname === "/authorize") return "bg-surface md:bg-inset"
  return "bg-canvas"
}

function RootLayout(): ReactElement {
  const session = useSession()
  const disabled = isApiError(session.error, "service_disabled")
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })

  return (
    <div className={cn("flex min-h-dvh flex-col text-ink", pageTone(pathname))}>
      <AppShell.SkipLink />
      <IdHeader
        account={session.data?.account ?? null}
        transparent={pathname === "/sign-in"}
      />
      <main
        id={AppShell.MAIN_ID}
        tabIndex={-1}
        className="flex min-w-0 flex-1 flex-col overflow-x-clip outline-none"
      >
        {disabled ? <ErrorState code="service_disabled" /> : <Outlet />}
      </main>
      <footer className="flex items-center px-4 pb-4 pt-3 md:px-12 md:pb-7">
        <a
          href="https://trellium.org"
          target="_blank"
          rel="noreferrer noopener"
          aria-label="Trellium (opens in a new tab)"
          className="rounded-sm text-ink opacity-30 transition-opacity hover:opacity-60"
        >
          <TrelliumMark.Root title="" />
        </a>
      </footer>
    </div>
  )
}
