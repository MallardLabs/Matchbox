import type { Environment } from "@repo/platform-contracts/console"
import { grantRevokedReasonSchema } from "@repo/platform-contracts/identity"
import {
  type OidcClaim,
  type PlatformScope,
  oidcScopeSchema,
  scopeDefinitions,
} from "@repo/platform-contracts/scopes"
import * as Button from "@repo/ui/button"
import * as SegmentedControl from "@repo/ui/segmented-control"
import * as Skeleton from "@repo/ui/skeleton"
import * as Table from "@repo/ui/table"
import * as Toast from "@repo/ui/toast"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Link, createFileRoute } from "@tanstack/react-router"
import { ArrowRight } from "lucide-react"
import { type ReactElement, useMemo, useState } from "react"
import ConsentPreview, {
  type ConsentAudience,
} from "../../../../components/ConsentPreview"
import EnvironmentGate from "../../../../components/EnvironmentGate"
import QueryError from "../../../../components/QueryError"
import UrlListEditor from "../../../../components/UrlListEditor"
import SectionHead from "../../../../components/ui/SectionHead"
import StatStrip from "../../../../components/ui/StatStrip"
import { StatusLabel } from "../../../../components/ui/Status"
import * as api from "../../../../lib/api"
import { useAppRoute } from "../../../../lib/app-route"
import { dash, formatInteger } from "../../../../lib/format"
import { keys } from "../../../../lib/queries"
import { useStepUp } from "../../../../lib/step-up"
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

/** "Shown at consent" copy per claim (C04d). */
const consentCopy: Record<OidcClaim, string> = {
  sub: "Unique to this app",
  wallet_address: "Address",
  wallet_network: "Network",
  discord_id: "Discord ID",
  discord_username: "Username",
  discord_display_name: "Display name",
  discord_avatar_url: "Avatar",
}

function OAuthPanel({
  environment,
}: {
  environment: Environment
}): ReactElement {
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
  const [audience, setAudience] = useState<ConsentAudience>("new")
  const queryClient = useQueryClient()
  const stepUp = useStepUp()
  const { toast } = Toast.useToast()
  const { appId } = useAppRoute()
  const reconsent = stats.data?.awaitingReconsent
  const loading = stats.isPending

  return (
    <div className="flex flex-col gap-7">
      <StatStrip
        aria-label="Grants"
        items={[
          {
            key: "active",
            label: "Active grants",
            loading,
            value: formatInteger(stats.data?.activeGrants ?? null),
          },
          {
            key: "new",
            label: "New · 30 d",
            loading,
            value: formatInteger(stats.data?.grantsCreated ?? null),
          },
          {
            key: "revoked",
            label: "Revoked · 30 d",
            loading,
            value: formatInteger(stats.data?.revocations.total ?? null),
          },
          {
            key: "reconsent",
            label: "Awaiting re-consent",
            loading,
            tone:
              reconsent === undefined
                ? "muted"
                : reconsent.count > 0
                  ? "accent"
                  : "default",
            value:
              reconsent === undefined ? dash : formatInteger(reconsent.count),
            sub:
              reconsent === undefined
                ? "Unavailable"
                : reconsent.oldestScopeVersion === null
                  ? `scope v${reconsent.currentScopeVersion}`
                  : `scope v${reconsent.oldestScopeVersion} → v${reconsent.currentScopeVersion}`,
          },
        ]}
      />
      {stats.isError ? (
        <QueryError error={stats.error} onRetry={() => void stats.refetch()} />
      ) : null}
      <div className="grid grid-cols-1 gap-8 xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="flex min-w-0 flex-col gap-7">
          <UrlListEditor
            key={`redirects-${environment.updatedAt}`}
            mode="redirect-uri"
            kind={environment.kind}
            values={environment.redirectUris}
            onSave={async (uris) => {
              const updated = await stepUp.run(() =>
                api.environments.replaceRedirectUris(environment.id, uris),
              )
              queryClient.setQueryData(
                keys.environment(environment.appId, environment.kind),
                updated,
              )
              await queryClient.invalidateQueries({
                queryKey: keys.app(environment.appId),
              })
              toast({ title: "Redirect URIs saved" })
            }}
          />
          <section aria-labelledby="oauth-claims" className="flex flex-col">
            <SectionHead id="oauth-claims" title="Claims" className="pb-1.5">
              <Button.Root variant="ghost" size="sm" asChild>
                <Link
                  to="/apps/$appId/environments"
                  params={{ appId }}
                  search={environment.kind === "live" ? { env: "live" } : {}}
                >
                  Scopes
                  <ArrowRight aria-hidden="true" size={13} strokeWidth={1.75} />
                </Link>
              </Button.Root>
            </SectionHead>
            <ClaimsTable environment={environment} />
          </section>
          <section
            aria-labelledby="oauth-revocations"
            className="flex flex-col"
          >
            <SectionHead
              id="oauth-revocations"
              title="Revocations"
              className="pb-1.5"
            >
              <span className="text-caption text-muted">30 d</span>
            </SectionHead>
            {stats.data === undefined ? (
              <Skeleton.Root shape="block" className="h-32" />
            ) : (
              <Revocations byReason={stats.data.revocations.byReason} />
            )}
          </section>
        </div>
        <section
          aria-labelledby="consent-preview"
          className="flex min-w-0 flex-col gap-3"
        >
          <SectionHead id="consent-preview" title="Consent preview">
            <SegmentedControl.Root
              aria-label="Visitor"
              size="sm"
              value={audience}
              onValueChange={(value) =>
                setAudience(value === "returning" ? "returning" : "new")
              }
            >
              <SegmentedControl.Item value="new" className="text-body-sm">
                New
              </SegmentedControl.Item>
              <SegmentedControl.Item value="returning" className="text-body-sm">
                Returning
              </SegmentedControl.Item>
            </SegmentedControl.Root>
          </SectionHead>
          {preview.isPending ? (
            <Skeleton.Root shape="block" className="h-[520px]" />
          ) : preview.isError ? (
            <QueryError
              error={preview.error}
              onRetry={() => void preview.refetch()}
            />
          ) : (
            <ConsentPreview
              request={returningView(preview.data, environment, audience)}
              audience={audience}
              verified={
                environment.kind === "live" &&
                environment.approvedScopes.length > 0
              }
            />
          )}
        </section>
      </div>
    </div>
  )
}

/** Returning visitors already granted the approved scopes. */
function returningView(
  request: Awaited<ReturnType<typeof api.environments.consentPreview>>,
  environment: Environment,
  audience: ConsentAudience,
): Awaited<ReturnType<typeof api.environments.consentPreview>> {
  if (audience === "new") return request
  return {
    ...request,
    scopes: request.scopes.map((scope) => ({
      ...scope,
      previouslyGranted: environment.approvedScopes.includes(scope.scope),
    })),
  }
}

function ClaimsTable({
  environment,
}: {
  environment: Environment
}): ReactElement {
  const rows = oidcScopeSchema.options.flatMap((scope) =>
    scopeDefinitions[scope].claims.map((claim) => ({ claim, scope })),
  )
  function state(scope: PlatformScope): ReactElement {
    if (environment.approvedScopes.includes(scope)) {
      return <StatusLabel tone="pos">Approved</StatusLabel>
    }
    if (environment.requestedScopes.includes(scope)) {
      return <StatusLabel tone="warn">Pending</StatusLabel>
    }
    return <span className="text-label text-muted">{dash}</span>
  }
  return (
    <Table.Root>
      <Table.Header>
        <Table.Row>
          <Table.Head className="w-[180px]">Claim</Table.Head>
          <Table.Head className="hidden w-[130px] sm:table-cell">
            Scope
          </Table.Head>
          <Table.Head className="hidden md:table-cell">
            Shown at consent
          </Table.Head>
          <Table.Head className="w-[120px]">State</Table.Head>
        </Table.Row>
      </Table.Header>
      <Table.Body>
        {rows.map((row) => (
          <Table.Row key={row.claim}>
            <Table.Cell mono className="py-[9px] text-label">
              {row.claim}
            </Table.Cell>
            <Table.Cell
              mono
              className="hidden text-label text-ink-2 sm:table-cell"
            >
              {row.scope}
            </Table.Cell>
            <Table.Cell className="hidden text-label text-secondary md:table-cell">
              {consentCopy[row.claim]}
            </Table.Cell>
            <Table.Cell>{state(row.scope)}</Table.Cell>
          </Table.Row>
        ))}
      </Table.Body>
    </Table.Root>
  )
}

function Revocations({
  byReason,
}: {
  byReason: Partial<Record<string, number>>
}): ReactElement {
  const counts = grantRevokedReasonSchema.options.map((reason) => ({
    reason,
    count: byReason[reason] ?? 0,
  }))
  const max = Math.max(1, ...counts.map((item) => item.count))
  return (
    <ul className="m-0 flex list-none flex-col p-0">
      {counts.map((item) => (
        <li
          key={item.reason}
          className="flex items-center gap-4 border-t border-line py-2 last:border-b"
        >
          <span className="min-w-0 flex-1 truncate font-mono text-label text-ink">
            {item.reason}
          </span>
          <span
            aria-hidden="true"
            className="h-1.5 w-[120px] shrink-0 overflow-hidden rounded-[3px] bg-inset"
          >
            <span
              className="block h-full rounded-[3px] bg-ink-2"
              style={{ width: `${(item.count / max) * 100}%` }}
            />
          </span>
          <span className="w-10 shrink-0 text-right font-mono text-label text-ink">
            {formatInteger(item.count)}
          </span>
        </li>
      ))}
    </ul>
  )
}
