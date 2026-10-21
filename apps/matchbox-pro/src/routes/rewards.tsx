import RewardsPage from "@/features/rewards/RewardsPage"
import {
  type RewardsSearch,
  parseRewardsSearch,
} from "@/features/rewards/rewardsSearch"
import { createFileRoute } from "@tanstack/react-router"
import type { ReactElement } from "react"

export const Route = createFileRoute("/rewards")({
  validateSearch: (search: Record<string, unknown>): RewardsSearch =>
    parseRewardsSearch(search),
  component: RewardsRoute,
})

function RewardsRoute(): ReactElement {
  // Read ours strictly; other params (e.g. `watch`) stay in the URL.
  const search = parseRewardsSearch(Route.useSearch())
  const navigate = Route.useNavigate()
  return (
    <RewardsPage
      search={search}
      onSearchChange={(next) =>
        void navigate({
          search: (previous) => ({ ...previous, period: next.period }),
          replace: true,
        })
      }
    />
  )
}
