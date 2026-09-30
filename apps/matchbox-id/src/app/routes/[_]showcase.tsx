import { createFileRoute } from "@tanstack/react-router"
import { type ReactElement, Suspense, lazy } from "react"
import ErrorState from "../components/ErrorState"

// Dev only: in production builds `import.meta.env.DEV` is false, so the
// showcase import is dropped and the route renders the not-found state.
const Showcase = import.meta.env.DEV
  ? lazy(() => import("@repo/ui/showcase"))
  : null

export const Route = createFileRoute("/_showcase")({
  component: ShowcasePage,
})

function ShowcasePage(): ReactElement {
  if (Showcase === null) return <ErrorState code="not_found" />
  return (
    <Suspense fallback={null}>
      <Showcase />
    </Suspense>
  )
}
