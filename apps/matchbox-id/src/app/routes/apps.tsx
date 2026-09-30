import { createFileRoute } from "@tanstack/react-router"
import type { ReactElement } from "react"
import ConnectedApps from "../components/ConnectedApps"
import PageSkeleton from "../components/PageSkeleton"
import { usePageTitle } from "../lib/page-title"
import { useRequiredAccount } from "../lib/use-required-account"

export const Route = createFileRoute("/apps")({
  component: AppsPage,
})

function AppsPage(): ReactElement {
  usePageTitle("Connected apps")
  const account = useRequiredAccount("/apps")
  if (account === null) return <PageSkeleton />
  return <ConnectedApps headingLevel={1} />
}
