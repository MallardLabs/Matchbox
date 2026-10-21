import ActivityPage from "@/features/activity/ActivityPage"
import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/activity")({
  component: ActivityRoute,
})

function ActivityRoute(): ReturnType<typeof ActivityPage> {
  return <ActivityPage />
}
