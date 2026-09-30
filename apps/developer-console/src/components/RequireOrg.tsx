import type { OrganizationSummary } from "@repo/platform-contracts/console"
import * as EmptyState from "@repo/ui/empty-state"
import type { ReactElement } from "react"
import { useSession } from "../lib/session"

/** Renders children with the selected organization, or an empty state. */
export default function RequireOrg({
  children,
}: {
  children: (org: OrganizationSummary) => ReactElement
}): ReactElement {
  const { org } = useSession()
  if (org === null) {
    return (
      <EmptyState.Root layout="centered">
        <EmptyState.Title>No organization</EmptyState.Title>
      </EmptyState.Root>
    )
  }
  return children(org)
}
