import ActivityPage from "@/features/activity/ActivityPage"
import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/activity_/$address/tx/$hash")({
  component: ActivityPermalink,
})

function ActivityPermalink(): ReturnType<typeof ActivityPage> {
  const { address, hash } = Route.useParams()
  return (
    <ActivityPage key={`${address}:${hash}`} address={address} txHash={hash} />
  )
}
