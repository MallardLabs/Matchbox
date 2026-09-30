import {
  type ClientSecretRecord,
  type Environment,
  maxActiveClientSecrets,
} from "@repo/platform-contracts/console"
import * as Button from "@repo/ui/button"
import * as EmptyState from "@repo/ui/empty-state"
import * as Skeleton from "@repo/ui/skeleton"
import * as Table from "@repo/ui/table"
import * as Toast from "@repo/ui/toast"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Link, createFileRoute } from "@tanstack/react-router"
import { Plus, RotateCw } from "lucide-react"
import { type ReactElement, useState } from "react"
import { CredentialBadge } from "../../../../components/Badges"
import ConfirmDialog from "../../../../components/ConfirmDialog"
import EnvironmentGate from "../../../../components/EnvironmentGate"
import QueryError from "../../../../components/QueryError"
import RevealSecretDialog from "../../../../components/RevealSecretDialog"
import * as api from "../../../../lib/api"
import { errorMessage } from "../../../../lib/api-client"
import { useAppRoute } from "../../../../lib/app-route"
import { formatDate } from "../../../../lib/format"
import { keys } from "../../../../lib/queries"
import { isStepUpCancelled, useStepUp } from "../../../../lib/step-up"

export const Route = createFileRoute("/_app/apps/$appId/secrets")({
  component: SecretsTab,
})

function SecretsTab(): ReactElement {
  const { appId, kind } = useAppRoute()
  return (
    <EnvironmentGate key={kind} appId={appId} kind={kind}>
      {(environment) =>
        environment.clientType === "public" ? (
          <EmptyState.Root>
            <EmptyState.Title>Public client · no secrets</EmptyState.Title>
            <EmptyState.Action>
              <Button.Root variant="secondary" asChild>
                <Link
                  to="/apps/$appId/environments"
                  params={{ appId }}
                  search={kind === "live" ? { env: "live" } : {}}
                >
                  Client type
                </Link>
              </Button.Root>
            </EmptyState.Action>
          </EmptyState.Root>
        ) : (
          <SecretsPanel environment={environment} />
        )
      }
    </EnvironmentGate>
  )
}

function SecretsPanel({
  environment,
}: { environment: Environment }): ReactElement {
  const queryKey = keys.clientSecrets(environment.id)
  const list = useQuery({
    queryKey,
    queryFn: () => api.environments.clientSecrets(environment.id),
  })
  const [revealed, setRevealed] = useState<string | null>(null)
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
      setRevealed(result.secret)
      await queryClient.invalidateQueries({ queryKey })
    },
  })

  const active = (list.data?.data ?? []).filter(
    (secret) => secret.status === "active",
  )
  const atLimit = active.length >= maxActiveClientSecrets
  const createLabel = active.length === 0 ? "New secret" : "Rotate"

  return (
    <section aria-label="Client secrets" className="flex flex-col gap-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[14px] font-600 text-ink">
          Client secrets
          <span className="ml-2 font-mono text-[12px] font-400 text-secondary">
            {`${active.length}/${maxActiveClientSecrets} active`}
          </span>
        </h2>
        <Button.Root
          loading={create.isPending}
          disabled={atLimit || list.isPending}
          onClick={() => create.mutate()}
        >
          {active.length === 0 ? (
            <Plus aria-hidden="true" size={13} strokeWidth={2} />
          ) : (
            <RotateCw aria-hidden="true" size={13} strokeWidth={2} />
          )}
          {createLabel}
        </Button.Root>
      </header>
      {create.isError && !isStepUpCancelled(create.error) ? (
        <p role="alert" className="text-[12px] font-500 text-neg">
          {errorMessage(create.error)}
        </p>
      ) : null}
      {list.isPending ? (
        <div aria-busy="true" className="flex flex-col gap-3">
          <Skeleton.Root shape="block" />
          <Skeleton.Root shape="block" />
        </div>
      ) : list.isError ? (
        <QueryError error={list.error} onRetry={() => void list.refetch()} />
      ) : list.data.data.length === 0 ? (
        <EmptyState.Root>
          <EmptyState.Title>No client secrets</EmptyState.Title>
          <EmptyState.Action>
            <Button.Root
              loading={create.isPending}
              onClick={() => create.mutate()}
            >
              Create secret
            </Button.Root>
          </EmptyState.Action>
        </EmptyState.Root>
      ) : (
        <Table.Root density="compact">
          <Table.Header>
            <Table.Row>
              <Table.Head>Prefix</Table.Head>
              <Table.Head>Created</Table.Head>
              <Table.Head className="hidden sm:table-cell">Expires</Table.Head>
              <Table.Head>Status</Table.Head>
              <Table.Head>
                <span className="sr-only">Actions</span>
              </Table.Head>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {list.data.data.map((secret) => (
              <Table.Row key={secret.id}>
                <Table.Cell mono className="text-[11px]">
                  {secret.displayPrefix}
                </Table.Cell>
                <Table.Cell className="text-secondary">
                  {formatDate(secret.createdAt)}
                </Table.Cell>
                <Table.Cell className="hidden text-secondary sm:table-cell">
                  {secret.expiresAt === null
                    ? "Never"
                    : formatDate(secret.expiresAt)}
                </Table.Cell>
                <Table.Cell>
                  <CredentialBadge status={secret.status} />
                </Table.Cell>
                <Table.Cell className="text-right">
                  {secret.status === "active" ? (
                    <Button.Root
                      variant="ghost"
                      size="sm"
                      onClick={() => setRevoking(secret)}
                      aria-label={`Revoke ${secret.displayPrefix}`}
                    >
                      Revoke
                    </Button.Root>
                  ) : null}
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table.Root>
      )}
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
        noun="secret"
        secret={revealed}
        title="Client secret"
        label="Client secret"
        onDone={() => {
          setRevealed(null)
          toast({ title: "Secret ready" })
        }}
      />
    </section>
  )
}
