import {
  type ClientSecretRecord,
  type ClientType,
  type Environment,
  maxActiveClientSecrets,
} from "@repo/platform-contracts/console"
import type { EnvironmentKind } from "@repo/platform-contracts/network"
import * as Button from "@repo/ui/button"
import { cn } from "@repo/ui/cn"
import * as CopyField from "@repo/ui/copy-field"
import * as Field from "@repo/ui/field"
import * as SegmentedControl from "@repo/ui/segmented-control"
import * as Skeleton from "@repo/ui/skeleton"
import * as Table from "@repo/ui/table"
import * as Toast from "@repo/ui/toast"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Link, createFileRoute } from "@tanstack/react-router"
import { Lock, RotateCw } from "lucide-react"
import { type ReactElement, useState } from "react"
import ConfirmDialog from "../../../../components/ConfirmDialog"
import EnvironmentGate from "../../../../components/EnvironmentGate"
import QueryError from "../../../../components/QueryError"
import RevealSecretDialog from "../../../../components/RevealSecretDialog"
import LockHint from "../../../../components/ui/LockHint"
import { Pill } from "../../../../components/ui/Pill"
import SectionHead from "../../../../components/ui/SectionHead"
import {
  CredentialStatusLabel,
  StatusDot,
} from "../../../../components/ui/Status"
import * as api from "../../../../lib/api"
import { errorMessage, isApiError } from "../../../../lib/api-client"
import { keyExpiry } from "../../../../lib/api-keys"
import { useAppRoute } from "../../../../lib/app-route"
import { idIssuer } from "../../../../lib/docs-snippets"
import {
  dash,
  formatDate,
  formatMonthDay,
  shortName,
} from "../../../../lib/format"
import { appQuery, environmentQuery, keys } from "../../../../lib/queries"
import { isStepUpCancelled, useStepUp } from "../../../../lib/step-up"

export const Route = createFileRoute("/_app/apps/$appId/secrets")({
  component: SecretsTab,
})

const tokenEndpoint = `${idIssuer}/oauth/token`

function SecretsTab(): ReactElement {
  const { appId, kind } = useAppRoute()
  return (
    <EnvironmentGate key={kind} appId={appId} kind={kind}>
      {(environment) => (
        <div className="flex flex-col gap-7">
          <ClientRow environment={environment} />
          {environment.clientType === "public" ? (
            <p className="rounded-lg bg-inset px-5 py-4 text-body-sm text-secondary">
              Public client · PKCE only · no client secrets
            </p>
          ) : (
            <SecretsTable environment={environment} />
          )}
          <OtherEnvironment
            appId={appId}
            kind={kind === "live" ? "test" : "live"}
          />
        </div>
      )}
    </EnvironmentGate>
  )
}

const clientTypeLabels: Record<ClientType, string> = {
  confidential: "Confidential",
  public: "Public · PKCE",
}

function ClientRow({
  environment,
}: {
  environment: Environment
}): ReactElement {
  const queryClient = useQueryClient()
  const stepUp = useStepUp()
  const { toast } = Toast.useToast()
  const [confirmPublic, setConfirmPublic] = useState(false)
  const update = useMutation({
    mutationFn: (clientType: ClientType) =>
      stepUp.run(() => api.environments.update(environment.id, { clientType })),
    async onSuccess(updated) {
      queryClient.setQueryData(
        keys.environment(environment.appId, environment.kind),
        updated,
      )
      await queryClient.invalidateQueries({
        queryKey: keys.app(environment.appId),
      })
      toast({ title: "Client type saved" })
    },
  })
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_300px_minmax(0,300px)]">
      <Field.Root>
        <Field.Label>Client ID</Field.Label>
        <CopyField.Root
          value={environment.clientId}
          label="client ID"
          className="h-9"
        />
      </Field.Root>
      <Field.Root>
        <Field.Label>Client type</Field.Label>
        <Field.Control>
          <SegmentedControl.Root
            aria-label="Client type"
            value={environment.clientType}
            disabled={update.isPending}
            onValueChange={(value) => {
              if (value === "public") setConfirmPublic(true)
              if (value === "confidential") update.mutate("confidential")
            }}
            className="grid w-full grid-cols-2"
          >
            {(["confidential", "public"] as const).map((type) => (
              <SegmentedControl.Item
                key={type}
                value={type}
                className="text-body-sm"
              >
                {clientTypeLabels[type]}
              </SegmentedControl.Item>
            ))}
          </SegmentedControl.Root>
        </Field.Control>
        <Field.Error>
          {update.isError && !isStepUpCancelled(update.error)
            ? errorMessage(update.error)
            : null}
        </Field.Error>
      </Field.Root>
      <Field.Root>
        <Field.Label>Token endpoint</Field.Label>
        <CopyField.Root
          value={tokenEndpoint}
          display={tokenEndpoint.replace(/^https:\/\//, "")}
          label="token endpoint"
          className="h-9"
        />
      </Field.Root>
      <ConfirmDialog
        open={confirmPublic}
        onOpenChange={setConfirmPublic}
        title="Switch to public client?"
        description="Client secrets stop working, issued tokens are revoked and every user must consent again."
        confirmLabel="Switch to public"
        onConfirm={() => update.mutateAsync("public")}
      />
    </div>
  )
}

function SecretsTable({
  environment,
}: {
  environment: Environment
}): ReactElement {
  const queryKey = keys.clientSecrets(environment.id)
  const list = useQuery({
    queryKey,
    queryFn: () => api.environments.clientSecrets(environment.id),
  })
  const app = useQuery(appQuery(environment.appId))
  const orgId = app.data?.organizationId
  const members = useQuery({
    queryKey: keys.members(orgId ?? ""),
    queryFn: () => api.orgs.members(orgId ?? ""),
    enabled: orgId !== undefined,
  })
  const [revealed, setRevealed] = useState<ClientSecretRecord | null>(null)
  const [secret, setSecret] = useState<string | null>(null)
  const [revoking, setRevoking] = useState<ClientSecretRecord | null>(null)
  const queryClient = useQueryClient()
  const stepUp = useStepUp()
  const { toast } = Toast.useToast()
  const create = useMutation({
    mutationFn: () =>
      stepUp.run(() =>
        api.environments.createClientSecret(environment.id, null),
      ),
    async onSuccess(result) {
      setRevealed(result.clientSecret)
      setSecret(result.secret)
      await queryClient.invalidateQueries({ queryKey })
    },
  })
  const now = Date.now()
  const records = list.data?.data ?? []
  const active = records.filter((record) => record.status === "active")
  const atLimit = active.length >= maxActiveClientSecrets
  const byName = (accountId: string | null): string =>
    shortName(
      members.data?.data.find((member) => member.accountId === accountId)
        ?.displayName ?? null,
    )

  return (
    <section aria-labelledby="client-secrets" className="flex min-w-0 flex-col">
      <SectionHead
        id="client-secrets"
        title="Secrets"
        count={list.data === undefined ? undefined : records.length}
        className="pb-3"
      >
        <span className="hidden text-label text-muted sm:inline">
          {`${maxActiveClientSecrets} active max`}
        </span>
        <Button.Root
          loading={create.isPending}
          disabled={atLimit || list.isPending}
          onClick={() => create.mutate()}
        >
          {create.isPending ? null : (
            <Lock aria-hidden="true" size={13} strokeWidth={2} />
          )}
          New secret
        </Button.Root>
      </SectionHead>
      {create.isError && !isStepUpCancelled(create.error) ? (
        <p role="alert" className="pb-2 text-label font-500 text-neg">
          {errorMessage(create.error)}
        </p>
      ) : null}
      {list.isPending ? (
        <div aria-busy="true" className="flex flex-col gap-3">
          <Skeleton.Root shape="block" className="h-11" />
          <Skeleton.Root shape="block" className="h-11" />
        </div>
      ) : list.isError ? (
        <QueryError error={list.error} onRetry={() => void list.refetch()} />
      ) : records.length === 0 ? (
        <p className="border-y border-line py-4 text-body-sm text-secondary">
          No client secrets
        </p>
      ) : (
        <Table.Root>
          <Table.Header>
            <Table.Row>
              <Table.Head>Prefix</Table.Head>
              <Table.Head className="hidden w-[120px] sm:table-cell">
                Created
              </Table.Head>
              <Table.Head className="hidden w-[120px] md:table-cell">
                By
              </Table.Head>
              <Table.Head className="hidden w-[120px] sm:table-cell">
                Expires
              </Table.Head>
              <Table.Head className="w-[90px]">Status</Table.Head>
              <Table.Head className="w-[80px]">
                <span className="sr-only">Actions</span>
              </Table.Head>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {records.map((record) => {
              const expiry = keyExpiry(record.expiresAt, now)
              const isActive = record.status === "active"
              return (
                <Table.Row key={record.id}>
                  <Table.Cell
                    mono
                    className={cn(
                      "py-3 text-body-sm",
                      isActive ? "text-ink" : "text-muted",
                    )}
                  >
                    {record.displayPrefix}
                  </Table.Cell>
                  <Table.Cell className="hidden text-body-sm text-ink-2 sm:table-cell">
                    {formatMonthDay(record.createdAt)}
                  </Table.Cell>
                  <Table.Cell className="hidden text-body-sm text-ink-2 md:table-cell">
                    {byName(record.createdBy)}
                  </Table.Cell>
                  <Table.Cell
                    className={cn(
                      "hidden text-body-sm sm:table-cell",
                      !isActive
                        ? "text-muted"
                        : expiry.soon
                          ? "font-600 text-accent-ink"
                          : "text-ink-2",
                    )}
                  >
                    {isActive ? expiry.label : dash}
                  </Table.Cell>
                  <Table.Cell>
                    <CredentialStatusLabel status={record.status} />
                  </Table.Cell>
                  <Table.Cell className="text-right">
                    {isActive ? (
                      <Button.Root
                        variant="secondary"
                        size="sm"
                        className="border-neg/30 text-neg hover:border-neg/50"
                        aria-label={`Revoke ${record.displayPrefix}`}
                        onClick={() => setRevoking(record)}
                      >
                        Revoke
                      </Button.Root>
                    ) : null}
                  </Table.Cell>
                </Table.Row>
              )
            })}
          </Table.Body>
        </Table.Root>
      )}
      <p className="flex items-center gap-2 pt-3.5 text-label text-secondary">
        <RotateCw
          aria-hidden="true"
          size={13}
          strokeWidth={1.75}
          className="text-muted"
        />
        Rotation · new secret, then expire the old one
        <span className="flex-1" />
        <LockHint />
      </p>
      <ConfirmDialog
        open={revoking !== null}
        onOpenChange={(open) => {
          if (!open) setRevoking(null)
        }}
        title="Revoke secret?"
        description={
          <>
            <span className="font-mono text-ink">
              {revoking?.displayPrefix}
            </span>{" "}
            stops authenticating token requests.
          </>
        }
        confirmLabel="Revoke"
        onConfirm={async () => {
          if (revoking === null) return
          await api.clientSecrets.revoke(revoking.id)
          await queryClient.invalidateQueries({ queryKey })
          toast({ title: "Secret revoked" })
        }}
      />
      <RevealSecretDialog
        secret={secret}
        title="Secret created"
        label="Client secret"
        copyLabel="Copy secret"
        envVar="MATCHBOX_CLIENT_SECRET"
        environmentKind={environment.kind}
        facts={
          revealed === null
            ? []
            : [
                { term: "Prefix", value: revealed.displayPrefix },
                {
                  term: "Expires",
                  value:
                    revealed.expiresAt === null
                      ? "Never"
                      : formatDate(revealed.expiresAt),
                },
              ]
        }
        onDone={() => {
          setSecret(null)
          setRevealed(null)
          toast({ title: "Secret ready" })
        }}
      />
    </section>
  )
}

/** Summary of the other environment's secrets, with a switch link. */
function OtherEnvironment({
  appId,
  kind,
}: {
  appId: string
  kind: EnvironmentKind
}): ReactElement | null {
  const environment = useQuery(environmentQuery(appId, kind))
  const secrets = useQuery({
    queryKey: keys.clientSecrets(environment.data?.id ?? ""),
    queryFn: () => api.environments.clientSecrets(environment.data?.id ?? ""),
    enabled:
      environment.data !== undefined &&
      environment.data.clientType === "confidential",
  })
  if (environment.isError && isApiError(environment.error, "not_found")) {
    return null
  }
  const data = environment.data
  const active = (secrets.data?.data ?? []).filter(
    (record) => record.status === "active",
  ).length
  return (
    <section
      aria-label={`${kind === "live" ? "Live" : "Test"} environment secrets`}
      className="flex flex-col gap-2.5 rounded-lg bg-inset px-5 py-4"
    >
      <p className="flex min-w-0 items-center gap-2.5">
        <StatusDot
          tone={kind === "live" ? "pos" : "neutral"}
          className="size-2"
        />
        <Link
          to="."
          search={kind === "live" ? { env: "live" } : {}}
          replace
          className="text-body font-600 text-ink hover:underline"
        >
          {kind === "live" ? "Live" : "Test"}
        </Link>
        {data === undefined ? null : (
          <span className="font-mono text-caption text-muted">
            {data.network}
          </span>
        )}
        <span className="flex-1" />
        {data === undefined ? null : (
          <Pill className="bg-surface">
            {clientTypeLabels[data.clientType]}
          </Pill>
        )}
      </p>
      <p className="text-body-sm text-secondary">
        {data === undefined
          ? dash
          : data.clientType === "public"
            ? "No client secrets"
            : secrets.data === undefined
              ? dash
              : active === 0
                ? "No client secrets"
                : `${active} active ${active === 1 ? "secret" : "secrets"}`}
      </p>
    </section>
  )
}
