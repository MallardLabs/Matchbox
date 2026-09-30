import * as Button from "@repo/ui/button"
import type { QueryClient } from "@tanstack/react-query"
import {
  Link,
  Outlet,
  createRootRouteWithContext,
} from "@tanstack/react-router"
import type { ReactElement } from "react"
import QueryError from "../components/QueryError"
import Unavailable from "../components/Unavailable"
import { useServiceDisabled } from "../lib/service-status"
import { useTitle } from "../lib/title"

export type RouterContext = { queryClient: QueryClient }

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
  notFoundComponent: NotFound,
  errorComponent: RootError,
})

function RootLayout(): ReactElement {
  const disabled = useServiceDisabled()
  return disabled ? <Unavailable /> : <Outlet />
}

function NotFound(): ReactElement {
  useTitle("Not found")
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-canvas px-4 text-center">
      <h1 className="text-[18px] font-600 text-ink">Not found</h1>
      <Button.Root variant="secondary" asChild>
        <Link to="/">Overview</Link>
      </Button.Root>
    </main>
  )
}

function RootError({ error }: { error: unknown }): ReactElement {
  useTitle("Error")
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-4 bg-canvas px-4">
      <h1 className="text-[18px] font-600 text-ink">Something went wrong</h1>
      <QueryError error={error} onRetry={() => window.location.reload()} />
    </main>
  )
}
