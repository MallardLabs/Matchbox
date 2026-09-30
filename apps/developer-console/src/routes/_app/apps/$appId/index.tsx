import { networkNames } from "@repo/platform-contracts/network"
import * as Badge from "@repo/ui/badge"
import * as Card from "@repo/ui/card"
import * as CopyField from "@repo/ui/copy-field"
import * as KeyValue from "@repo/ui/key-value"
import * as Skeleton from "@repo/ui/skeleton"
import { useQuery } from "@tanstack/react-query"
import { Link, createFileRoute } from "@tanstack/react-router"
import type { ReactElement } from "react"
import {
  AppStatusBadge,
  EnvBadge,
  ReviewBadge,
} from "../../../../components/Badges"
import { formatDateTime } from "../../../../lib/format"
import { appQuery } from "../../../../lib/queries"

export const Route = createFileRoute("/_app/apps/$appId/")({
  component: AppOverviewTab,
})

function kindOrder(kind: "test" | "live"): number {
  return kind === "test" ? 0 : 1
}

function AppOverviewTab(): ReactElement {
  const { appId } = Route.useParams()
  const app = useQuery(appQuery(appId))
  if (app.data === undefined) {
    return (
      <div aria-busy="true" className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <Skeleton.Root shape="block" className="h-40" />
        <Skeleton.Root shape="block" className="h-40" />
      </div>
    )
  }
  const data = app.data
  const environments = [...data.environments].sort(
    (left, right) => kindOrder(left.kind) - kindOrder(right.kind),
  )
  return (
    <div className="grid grid-cols-1 gap-10 lg:grid-cols-2">
      <section
        aria-labelledby="app-environments"
        className="flex flex-col gap-4"
      >
        <h2 id="app-environments" className="text-[14px] font-600 text-ink">
          Environments
        </h2>
        <ul className="m-0 flex list-none flex-col gap-5 p-0">
          {environments.map((env) => (
            <li
              key={env.id}
              className="flex flex-col gap-3 border-t border-line pt-4"
            >
              <p className="flex flex-wrap items-center gap-2">
                <EnvBadge kind={env.kind} />
                <span className="text-[12px] text-secondary">
                  {networkNames[env.network]}
                </span>
                <span className="flex-1" />
                <ReviewBadge state={env.reviewState} />
              </p>
              <CopyField.Root
                value={env.clientId}
                label={`${env.kind} client ID`}
              />
              <p className="flex flex-wrap gap-1.5">
                {env.approvedScopes.length === 0 ? (
                  <span className="text-[12px] text-secondary">
                    No approved scopes
                  </span>
                ) : (
                  env.approvedScopes.map((scope) => (
                    <Badge.Root key={scope} mono>
                      {scope}
                    </Badge.Root>
                  ))
                )}
              </p>
              <Link
                to="/apps/$appId/environments"
                params={{ appId }}
                search={env.kind === "live" ? { env: "live" } : {}}
                className="self-start text-[12px] font-600 text-accent-ink"
              >
                Configure
              </Link>
            </li>
          ))}
        </ul>
      </section>
      <Card.Root>
        <Card.Header>
          <Card.Title>Details</Card.Title>
        </Card.Header>
        <KeyValue.Root>
          <KeyValue.Item>
            <KeyValue.Term>Status</KeyValue.Term>
            <KeyValue.Value>
              <AppStatusBadge status={data.status} />
            </KeyValue.Value>
          </KeyValue.Item>
          <KeyValue.Item>
            <KeyValue.Term>Slug</KeyValue.Term>
            <KeyValue.Value mono>{data.slug}</KeyValue.Value>
          </KeyValue.Item>
          <KeyValue.Item>
            <KeyValue.Term>Website</KeyValue.Term>
            <KeyValue.Value className="truncate">
              {data.websiteUrl}
            </KeyValue.Value>
          </KeyValue.Item>
          <KeyValue.Item>
            <KeyValue.Term>Support</KeyValue.Term>
            <KeyValue.Value>{data.supportEmail}</KeyValue.Value>
          </KeyValue.Item>
          <KeyValue.Item>
            <KeyValue.Term>Created</KeyValue.Term>
            <KeyValue.Value>{formatDateTime(data.createdAt)}</KeyValue.Value>
          </KeyValue.Item>
          <KeyValue.Item>
            <KeyValue.Term>Updated</KeyValue.Term>
            <KeyValue.Value>{formatDateTime(data.updatedAt)}</KeyValue.Value>
          </KeyValue.Item>
          <KeyValue.Item>
            <KeyValue.Term>App ID</KeyValue.Term>
            <KeyValue.Value mono className="truncate text-[12px]">
              {data.id}
            </KeyValue.Value>
          </KeyValue.Item>
        </KeyValue.Root>
      </Card.Root>
    </div>
  )
}
