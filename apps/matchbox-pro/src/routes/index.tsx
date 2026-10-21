import OverviewPage from "@/features/overview/OverviewPage"
import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/")({
  component: OverviewPage,
})
