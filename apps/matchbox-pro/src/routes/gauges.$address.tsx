import GaugeDetailPage from "@/features/gauges/GaugeDetailPage"
import { createFileRoute } from "@tanstack/react-router"
import type { ReactElement } from "react"

export const Route = createFileRoute("/gauges/$address")({
  component: GaugeDetailRoute,
})

function GaugeDetailRoute(): ReactElement {
  const { address } = Route.useParams()
  // Keyed so a gauge-to-gauge navigation starts with fresh sheet state.
  return <GaugeDetailPage key={address.toLowerCase()} address={address} />
}
