import type { ConnectedAppGrant } from "@repo/platform-contracts/identity"
import { scopeDefinitions } from "@repo/platform-contracts/scopes"
import * as AlertDialog from "@repo/ui/alert-dialog"
import * as Badge from "@repo/ui/badge"
import * as Button from "@repo/ui/button"
import * as Card from "@repo/ui/card"
import * as EmptyState from "@repo/ui/empty-state"
import * as Skeleton from "@repo/ui/skeleton"
import * as Table from "@repo/ui/table"
import * as Toast from "@repo/ui/toast"
import type { ReactElement } from "react"
import { formatDate } from "../lib/format"
import { useGrants, useRevokeGrant } from "../lib/queries"
import AppLogo from "./AppLogo"
import EnvironmentBadge from "./EnvironmentBadge"

function RevokeGrant({ grant }: { grant: ConnectedAppGrant }): ReactElement {
  const revoke = useRevokeGrant()
  const { toast } = Toast.useToast()
  return (
    <AlertDialog.Root>
      <AlertDialog.Trigger asChild>
        <Button.Root
          variant="ghost"
          size="sm"
          loading={revoke.isPending}
          aria-label={`Revoke ${grant.app.name}`}
        >
          Revoke
        </Button.Root>
      </AlertDialog.Trigger>
      <AlertDialog.Content>
        <AlertDialog.Header>
          <AlertDialog.Title>Revoke {grant.app.name}?</AlertDialog.Title>
          <AlertDialog.Description>
            Access and refresh tokens end now.
          </AlertDialog.Description>
        </AlertDialog.Header>
        <AlertDialog.Footer>
          <AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
          <AlertDialog.Action
            onClick={() =>
              revoke.mutate(grant.id, {
                onSuccess: () =>
                  toast({
                    title: `${grant.app.name} revoked`,
                    tone: "success",
                  }),
                onError: () => toast({ title: "Revoke failed", tone: "error" }),
              })
            }
          >
            Revoke
          </AlertDialog.Action>
        </AlertDialog.Footer>
      </AlertDialog.Content>
    </AlertDialog.Root>
  )
}

/** Apps holding an active grant, with scope chips and revoke. */
export default function ConnectedApps({
  headingLevel = 2,
}: {
  headingLevel?: 1 | 2
}): ReactElement {
  const grants = useGrants(true)
  const Heading = headingLevel === 1 ? "h1" : "h2"
  return (
    <Card.Root variant="panel" aria-busy={grants.isPending || undefined}>
      <Card.Header>
        <Card.Title asChild>
          <Heading>Connected apps</Heading>
        </Card.Title>
      </Card.Header>
      <Card.Body>
        {grants.isPending ? (
          <div className="flex flex-col gap-3 py-2">
            <Skeleton.Root shape="block" />
            <Skeleton.Root shape="block" />
          </div>
        ) : grants.isError ? (
          <p role="alert" className="text-[13px] text-neg">
            Couldn’t load apps
          </p>
        ) : grants.data.data.length === 0 ? (
          <EmptyState.Root>
            <EmptyState.Title asChild>
              <p>No connected apps</p>
            </EmptyState.Title>
          </EmptyState.Root>
        ) : (
          <Table.Root containerClassName="-mx-1 px-1">
            <Table.Header>
              <Table.Row>
                <Table.Head>App</Table.Head>
                <Table.Head>Access</Table.Head>
                <Table.Head>Granted</Table.Head>
                <Table.Head>
                  <span className="sr-only">Actions</span>
                </Table.Head>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {grants.data.data.map((grant) => (
                <Table.Row key={grant.id}>
                  <Table.Cell>
                    <span className="flex min-w-[140px] items-center gap-2.5">
                      <AppLogo
                        name={grant.app.name}
                        logoUrl={grant.app.logoUrl}
                        size="md"
                      />
                      <span className="text-[13px] font-600">
                        {grant.app.name}
                      </span>
                      <EnvironmentBadge kind={grant.environmentKind} />
                    </span>
                  </Table.Cell>
                  <Table.Cell>
                    <ul className="m-0 flex min-w-[160px] list-none flex-wrap gap-1 p-0">
                      {grant.scopes.map((scope) => (
                        <li key={scope}>
                          <Badge.Root>
                            {scopeDefinitions[scope].label}
                          </Badge.Root>
                        </li>
                      ))}
                    </ul>
                  </Table.Cell>
                  <Table.Cell className="whitespace-nowrap tabular-nums">
                    <time dateTime={grant.createdAt}>
                      {formatDate(grant.createdAt)}
                    </time>
                  </Table.Cell>
                  <Table.Cell className="text-right">
                    <RevokeGrant grant={grant} />
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table.Root>
        )}
      </Card.Body>
    </Card.Root>
  )
}
