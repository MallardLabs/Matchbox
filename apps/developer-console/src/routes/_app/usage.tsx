import * as PageHeader from "@repo/ui/page-header"
import * as Skeleton from "@repo/ui/skeleton"
import { useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import type { ReactElement } from "react"
import QueryError from "../../components/QueryError"
import RequireOrg from "../../components/RequireOrg"
import UsagePanel from "../../components/UsagePanel"
import { appsQuery } from "../../lib/queries"
import { useTitle } from "../../lib/title"

export const Route = createFileRoute("/_app/usage")({
  component: UsagePage,
})

function UsagePage(): ReactElement {
  useTitle("Usage")
  return (
    <RequireOrg>
      {(org) => (
        <div className="flex flex-col gap-8">
          <PageHeader.Root>
            <PageHeader.Heading>
              <PageHeader.Eyebrow>{org.name}</PageHeader.Eyebrow>
              <PageHeader.Title>Usage</PageHeader.Title>
            </PageHeader.Heading>
          </PageHeader.Root>
          <OrgUsage orgId={org.id} />
        </div>
      )}
    </RequireOrg>
  )
}

function OrgUsage({ orgId }: { orgId: string }): ReactElement {
  const apps = useQuery(appsQuery(orgId))
  if (apps.isPending) {
    return (
      <div aria-busy="true" className="flex flex-col gap-4">
        <Skeleton.Root shape="block" className="w-96" />
        <Skeleton.Root shape="block" className="h-24" />
        <Skeleton.Root shape="block" className="h-[206px]" />
      </div>
    )
  }
  if (apps.isError) {
    return <QueryError error={apps.error} onRetry={() => void apps.refetch()} />
  }
  return <UsagePanel apps={apps.data.data} />
}
