import RewardsPage from "@/features/rewards/RewardsPage"
import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/rewards")({ component: RewardsPage })
