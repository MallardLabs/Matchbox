import * as Button from "@repo/ui/button"
import * as Card from "@repo/ui/card"
import * as Field from "@repo/ui/field"
import * as Fieldset from "@repo/ui/fieldset"
import * as Input from "@repo/ui/input"
import * as Skeleton from "@repo/ui/skeleton"
import * as Table from "@repo/ui/table"
import * as Toast from "@repo/ui/toast"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { type FormEvent, type ReactElement, useState } from "react"
import QueryError from "../../components/QueryError"
import { Crumb, Crumbs } from "../../components/shell/Breadcrumbs"
import PageTitle from "../../components/ui/PageTitle"
import { StatusLabel } from "../../components/ui/Status"
import * as api from "../../lib/api"
import { errorMessage } from "../../lib/api-client"
import { formatDate, formatRelative } from "../../lib/format"
import { keys, meQuery } from "../../lib/queries"
import { useSession } from "../../lib/session"
import { useTitle } from "../../lib/title"

export const Route = createFileRoute("/_app/account")({
  component: AccountPage,
})

function AccountPage(): ReactElement {
  useTitle("Account")
  const { me } = useSession()
  return (
    <div className="flex max-w-4xl flex-col gap-10">
      <Crumbs>
        <Crumb>Settings</Crumb>
        <Crumb current>Account</Crumb>
      </Crumbs>
      <PageTitle eyebrow={me.account.email} title="Account" />
      <ProfileForm key={me.account.displayName} />
      <Sessions />
    </div>
  )
}

function ProfileForm(): ReactElement {
  const { me } = useSession()
  const [displayName, setDisplayName] = useState(me.account.displayName)
  const queryClient = useQueryClient()
  const { toast } = Toast.useToast()
  const save = useMutation({
    mutationFn: () => api.me.update({ displayName: displayName.trim() }),
    onSuccess(updated) {
      queryClient.setQueryData(meQuery.queryKey, updated)
      toast({ title: "Saved" })
    },
  })
  const dirty = displayName.trim() !== me.account.displayName

  function submit(event: FormEvent): void {
    event.preventDefault()
    if (dirty && displayName.trim() !== "") save.mutate()
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <Fieldset.Root disabled={save.isPending}>
        <Fieldset.Legend>Profile</Fieldset.Legend>
        <Fieldset.Fields className="sm:flex-row">
          <Field.Root required className="flex-1">
            <Field.Label>Display name</Field.Label>
            <Field.Control>
              <Input.Root
                autoComplete="name"
                maxLength={80}
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
              />
            </Field.Control>
            <Field.Error>
              {save.isError ? errorMessage(save.error) : null}
            </Field.Error>
          </Field.Root>
          <Field.Root className="flex-1">
            <Field.Label>Email</Field.Label>
            <Field.Control>
              <Input.Root value={me.account.email} readOnly />
            </Field.Control>
            <Field.Description>
              {me.account.emailVerifiedAt === null ? "Unverified" : "Google"}
            </Field.Description>
          </Field.Root>
        </Fieldset.Fields>
      </Fieldset.Root>
      <p className="flex justify-end">
        <Button.Root
          type="submit"
          loading={save.isPending}
          disabled={!dirty || displayName.trim() === ""}
        >
          Save
        </Button.Root>
      </p>
    </form>
  )
}

function Sessions(): ReactElement {
  const sessions = useQuery({
    queryKey: keys.sessions,
    queryFn: () => api.me.sessions(),
  })
  const queryClient = useQueryClient()
  const { toast } = Toast.useToast()
  const revoke = useMutation({
    mutationFn: (sessionId: string) => api.me.revokeSession(sessionId),
    async onSuccess() {
      await queryClient.invalidateQueries({ queryKey: keys.sessions })
      toast({ title: "Session revoked" })
    },
  })
  const revokeOthers = useMutation({
    mutationFn: () => api.me.revokeOtherSessions(),
    async onSuccess(result) {
      await queryClient.invalidateQueries({ queryKey: keys.sessions })
      toast({
        title:
          result.revoked === 1
            ? "1 session signed out"
            : `${result.revoked} sessions signed out`,
      })
    },
  })
  const others = (sessions.data?.data ?? []).filter(
    (session) => !session.current,
  ).length

  return (
    <Card.Root>
      <Card.Header>
        <Card.Title>Sessions</Card.Title>
        <Card.Actions>
          <Button.Root
            variant="secondary"
            loading={revokeOthers.isPending}
            disabled={others === 0}
            onClick={() => revokeOthers.mutate()}
          >
            Sign out other sessions
          </Button.Root>
        </Card.Actions>
      </Card.Header>
      {sessions.isPending ? (
        <Skeleton.Root shape="block" />
      ) : sessions.isError ? (
        <QueryError
          error={sessions.error}
          onRetry={() => void sessions.refetch()}
        />
      ) : (
        <>
          <Table.Root>
            <Table.Header>
              <Table.Row>
                <Table.Head>Device</Table.Head>
                <Table.Head className="hidden sm:table-cell">
                  Network
                </Table.Head>
                <Table.Head>Last seen</Table.Head>
                <Table.Head className="hidden md:table-cell">
                  Expires
                </Table.Head>
                <Table.Head>
                  <span className="sr-only">Actions</span>
                </Table.Head>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {sessions.data.data.map((session) => (
                <Table.Row key={session.id}>
                  <Table.Cell className="max-w-[260px]">
                    <span
                      className="block truncate"
                      title={session.userAgent ?? undefined}
                    >
                      {summarizeUserAgent(session.userAgent)}
                    </span>
                  </Table.Cell>
                  <Table.Cell
                    mono
                    className="hidden text-caption text-secondary sm:table-cell"
                  >
                    {session.ipPrefix ?? "—"}
                  </Table.Cell>
                  <Table.Cell className="text-secondary">
                    {session.current ? (
                      <StatusLabel tone="pos">This device</StatusLabel>
                    ) : (
                      formatRelative(session.lastSeenAt)
                    )}
                  </Table.Cell>
                  <Table.Cell className="hidden text-secondary md:table-cell">
                    {formatDate(session.expiresAt)}
                  </Table.Cell>
                  <Table.Cell className="text-right">
                    {session.current ? null : (
                      <Button.Root
                        variant="ghost"
                        size="sm"
                        loading={
                          revoke.isPending && revoke.variables === session.id
                        }
                        onClick={() => revoke.mutate(session.id)}
                      >
                        Revoke
                      </Button.Root>
                    )}
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table.Root>
          {revoke.isError || revokeOthers.isError ? (
            <p role="alert" className="text-label font-500 text-neg">
              {errorMessage(revoke.error ?? revokeOthers.error)}
            </p>
          ) : null}
        </>
      )}
    </Card.Root>
  )
}

function summarizeUserAgent(userAgent: string | null): string {
  if (userAgent === null) return "Unknown device"
  const browser = /Edg\//.test(userAgent)
    ? "Edge"
    : /Chrome\//.test(userAgent)
      ? "Chrome"
      : /Firefox\//.test(userAgent)
        ? "Firefox"
        : /Safari\//.test(userAgent)
          ? "Safari"
          : null
  const os = /Windows/.test(userAgent)
    ? "Windows"
    : /Mac OS X/.test(userAgent)
      ? "macOS"
      : /Android/.test(userAgent)
        ? "Android"
        : /iPhone|iPad/.test(userAgent)
          ? "iOS"
          : /Linux/.test(userAgent)
            ? "Linux"
            : null
  if (browser === null && os === null) return userAgent
  return [browser, os].filter((part) => part !== null).join(" · ")
}
