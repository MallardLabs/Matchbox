import type { Environment } from "@repo/platform-contracts/console"
import { grantRevokedReasonSchema } from "@repo/platform-contracts/identity"
import * as Card from "@repo/ui/card"
import * as Skeleton from "@repo/ui/skeleton"
import * as Table from "@repo/ui/table"
import { useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { type ReactElement, useMemo } from "react"
import ConsentPreview from "../../../../components/ConsentPreview"
import EnvironmentGate from "../../../../components/EnvironmentGate"
import QueryError from "../../../../components/QueryError"
import StatTile from "../../../../components/StatTile"
import * as api from "../../../../lib/api"
import { useAppRoute } from "../../../../lib/app-route"
import { formatInteger, humanize } from "../../../../lib/format"
import { keys } from "../../../../lib/queries"
import { rangeWindow } from "../../../../lib/usage-range"

export const Route = createFileRoute("/_app/apps/$appId/oauth")({
  component: OAuthTab,
})

function OAuthTab(): ReactElement {
  const { appId, kind } = useAppRoute()
  return (
    <EnvironmentGate key={kind} appId={appId} kind={kind}>
      {(environment) => <OAuthPanel environment={environment} />}
    </EnvironmentGate>
  )
}

function OAuthPanel({
  environment,
}: { environment: Environment }): ReactElement {
  const window30 = useMemo(() => rangeWindow("30d"), [])
  const stats = useQuery({
    queryKey: keys.oauth(environment.id, window30.from),
    queryFn: () =>
      api.environments.oauth(environment.id, {
        from: window30.from,
        to: window30.to,
      }),
  })
  const preview = useQuery({
    queryKey: keys.consentPreview(environment.id),
    queryFn: () => api.environments.consentPreview(environment.id),
  })

  return (
    <div className="grid grid-cols-1 gap-12 xl:grid-cols-[minmax(0,1fr)_440px]">
      <div className="flex min-w-0 flex-col gap-10">
        <section aria-labelledby="oauth-grants">
          <h2 id="oauth-grants" className="mb-2 text-[14px] font-600 text-ink">
            Grants
          </h2>
          <dl
            aria-busy={stats.isPending || undefined}
            className="m-0 grid grid-cols-3 gap-x-6"
          >
            <StatTile
              label="Active"
              loading={stats.isPending}
              value={formatInteger(stats.data?.activeGrants ?? null)}
            />
            <StatTile
              label="New · 30 d"
              loading={stats.isPending}
              value={formatInteger(stats.data?.grantsCreated ?? null)}
            />
            <StatTile
              label="Revoked · 30 d"
              loading={stats.isPending}
              value={formatInteger(stats.data?.revocations.total ?? null)}
            />
          </dl>
          {stats.isError ? (
            <QueryError
              error={stats.error}
              onRetry={() => void stats.refetch()}
            />
          ) : null}
        </section>
        {stats.data === undefined ? null : (
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-2">
            <Card.Root>
              <Card.Header>
                <Card.Title>By scope</Card.Title>
              </Card.Header>
              <Table.Root density="compact">
                <Table.Header>
                  <Table.Row>
                    <Table.Head>Scope</Table.Head>
                    <Table.Head numeric>Active</Table.Head>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {stats.data.grantsByScope.length === 0 ? (
                    <Table.Row>
                      <Table.Cell colSpan={2} className="text-secondary">
                        No grants
                      </Table.Cell>
                    </Table.Row>
                  ) : (
                    stats.data.grantsByScope.map((row) => (
                      <Table.Row key={row.scope}>
                        <Table.Cell mono>{row.scope}</Table.Cell>
                        <Table.Cell numeric>
                          {formatInteger(row.activeGrants)}
                        </Table.Cell>
                      </Table.Row>
                    ))
                  )}
                </Table.Body>
              </Table.Root>
            </Card.Root>
            <Card.Root>
              <Card.Header>
                <Card.Title>Revocations</Card.Title>
              </Card.Header>
              <Table.Root density="compact">
                <Table.Header>
                  <Table.Row>
                    <Table.Head>Reason</Table.Head>
                    <Table.Head numeric>30 d</Table.Head>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {grantRevokedReasonSchema.options.map((reason) => (
                    <Table.Row key={reason}>
                      <Table.Cell>{humanize(reason)}</Table.Cell>
                      <Table.Cell numeric>
                        {formatInteger(
                          stats.data.revocations.byReason[reason] ?? 0,
                        )}
                      </Table.Cell>
                    </Table.Row>
                  ))}
                </Table.Body>
              </Table.Root>
            </Card.Root>
          </div>
        )}
      </div>
      <section
        aria-labelledby="consent-preview"
        className="flex flex-col gap-3"
      >
        <h2 id="consent-preview" className="text-[14px] font-600 text-ink">
          Consent preview
        </h2>
        {preview.isPending ? (
          <Skeleton.Root shape="block" className="h-[420px] max-w-[440px]" />
        ) : preview.isError ? (
          <QueryError
            error={preview.error}
            onRetry={() => void preview.refetch()}
          />
        ) : (
          <ConsentPreview request={preview.data} />
        )}
      </section>
    </div>
  )
}
