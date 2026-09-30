import * as Skeleton from "@repo/ui/skeleton"
import { useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import type { ReactElement } from "react"
import UsagePanel from "../../../../components/UsagePanel"
import { useAppRoute } from "../../../../lib/app-route"
import { appQuery } from "../../../../lib/queries"

export const Route = createFileRoute("/_app/apps/$appId/usage")({
  component: AppUsageTab,
})

function AppUsageTab(): ReactElement {
  const { appId, kind } = useAppRoute()
  const app = useQuery(appQuery(appId))
  if (app.data === undefined) {
    return <Skeleton.Root shape="block" className="h-40" />
  }
  return <UsagePanel key={kind} apps={[app.data]} fixed={{ appId, kind }} />
}
