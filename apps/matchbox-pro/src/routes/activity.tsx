import ActivityPage from "@/features/activity/ActivityPage"
import {
  type ActivitySearch,
  parseActivitySearch,
} from "@/features/activity/activitySearch"
import { createFileRoute } from "@tanstack/react-router"
import type { ReactElement } from "react"

export const Route = createFileRoute("/activity")({
  validateSearch: (search: Record<string, unknown>): ActivitySearch =>
    parseActivitySearch(search),
  component: ActivityRoute,
})

function ActivityRoute(): ReactElement {
  // The root route passes raw params through (e.g. `watch`, or a junk
  // `size`), so read ours strictly and leave the others in place.
  const search = parseActivitySearch(Route.useSearch())
  const navigate = Route.useNavigate()
  return (
    <ActivityPage
      search={search}
      onSearchChange={(next) =>
        void navigate({
          search: (previous) => ({
            ...previous,
            scope: next.scope,
            kind: next.kind,
            range: next.range,
            size: next.size,
          }),
          replace: true,
        })
      }
    />
  )
}
