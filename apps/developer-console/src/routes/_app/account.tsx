import type { Passkey } from "@repo/platform-contracts/console"
import * as Badge from "@repo/ui/badge"
import * as Button from "@repo/ui/button"
import * as Card from "@repo/ui/card"
import * as Dialog from "@repo/ui/dialog"
import * as Field from "@repo/ui/field"
import * as Fieldset from "@repo/ui/fieldset"
import * as Input from "@repo/ui/input"
import * as PageHeader from "@repo/ui/page-header"
import * as Skeleton from "@repo/ui/skeleton"
import * as Table from "@repo/ui/table"
import * as Toast from "@repo/ui/toast"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { Fingerprint } from "lucide-react"
import { type FormEvent, type ReactElement, useState } from "react"
import ConfirmDialog from "../../components/ConfirmDialog"
import QueryError from "../../components/QueryError"
import * as api from "../../lib/api"
import { errorMessage } from "../../lib/api-client"
import { formatDate, formatRelative } from "../../lib/format"
import { keys, meQuery } from "../../lib/queries"
import { useSession } from "../../lib/session"
import { isStepUpCancelled, useStepUp } from "../../lib/step-up"
import { useTitle } from "../../lib/title"
import { PasskeyError, createPasskey } from "../../lib/webauthn"

export const Route = createFileRoute("/_app/account")({
  component: AccountPage,
})

function AccountPage(): ReactElement {
  useTitle("Account")
  const { me } = useSession()
  return (
    <div className="flex max-w-4xl flex-col gap-12">
      <PageHeader.Root>
        <PageHeader.Heading>
          <PageHeader.Eyebrow>{me.account.email}</PageHeader.Eyebrow>
          <PageHeader.Title>Account</PageHeader.Title>
        </PageHeader.Heading>
      </PageHeader.Root>
      <ProfileForm key={me.account.displayName} />
      <Passkeys />
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
              {me.account.emailVerifiedAt === null ? "Unverified" : "Verified"}
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

function Passkeys(): ReactElement {
  const passkeys = useQuery({
    queryKey: keys.passkeys,
    queryFn: () => api.me.passkeys(),
  })
  const [renaming, setRenaming] = useState<Passkey | null>(null)
  const [deleting, setDeleting] = useState<Passkey | null>(null)
  const [newName, setNewName] = useState("")
  const [adding, setAdding] = useState(false)
  const queryClient = useQueryClient()
  const stepUp = useStepUp()
  const { toast } = Toast.useToast()
  const add = useMutation({
    mutationFn: async (name: string) => {
      const { challengeId, options } = await stepUp.run(() =>
        api.me.passkeyOptions(),
      )
      const credential = await createPasskey(options)
      return api.auth.registerPasskey({
        challengeId,
        credential,
        ...(name === "" ? {} : { name }),
      })
    },
    async onSuccess() {
      await queryClient.invalidateQueries({ queryKey: keys.passkeys })
      toast({ title: "Passkey added" })
      setNewName("")
      setAdding(false)
    },
  })
  const list = passkeys.data?.data ?? []
  const addCancelled =
    (add.error instanceof PasskeyError && add.error.reason === "cancelled") ||
    isStepUpCancelled(add.error)

  return (
    <Card.Root>
      <Card.Header>
        <Card.Title>Passkeys</Card.Title>
        <Card.Actions>
          <Button.Root variant="secondary" onClick={() => setAdding(true)}>
            <Fingerprint aria-hidden="true" size={13} strokeWidth={1.75} />
            Add passkey
          </Button.Root>
        </Card.Actions>
      </Card.Header>
      {passkeys.isPending ? (
        <Skeleton.Root shape="block" />
      ) : passkeys.isError ? (
        <QueryError
          error={passkeys.error}
          onRetry={() => void passkeys.refetch()}
        />
      ) : (
        <Table.Root>
          <Table.Header>
            <Table.Row>
              <Table.Head>Name</Table.Head>
              <Table.Head className="hidden sm:table-cell">Type</Table.Head>
              <Table.Head className="hidden md:table-cell">Added</Table.Head>
              <Table.Head>Last used</Table.Head>
              <Table.Head>
                <span className="sr-only">Actions</span>
              </Table.Head>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {list.map((passkey) => (
              <Table.Row key={passkey.id}>
                <Table.Cell className="font-600">
                  {passkey.name ?? "Passkey"}
                </Table.Cell>
                <Table.Cell className="hidden sm:table-cell">
                  <Badge.Root>
                    {passkey.backedUp ? "Synced" : "Device-bound"}
                  </Badge.Root>
                </Table.Cell>
                <Table.Cell className="hidden text-secondary md:table-cell">
                  {formatDate(passkey.createdAt)}
                </Table.Cell>
                <Table.Cell className="text-secondary">
                  {formatRelative(passkey.lastUsedAt)}
                </Table.Cell>
                <Table.Cell className="whitespace-nowrap text-right">
                  <Button.Root
                    variant="ghost"
                    size="sm"
                    aria-label={`Rename ${passkey.name ?? "passkey"}`}
                    onClick={() => setRenaming(passkey)}
                  >
                    Rename
                  </Button.Root>
                  <Button.Root
                    variant="ghost"
                    size="sm"
                    disabled={list.length <= 1}
                    aria-label={`Delete ${passkey.name ?? "passkey"}`}
                    onClick={() => setDeleting(passkey)}
                  >
                    Delete
                  </Button.Root>
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table.Root>
      )}
      <Dialog.Root
        open={adding}
        onOpenChange={(open) => {
          setAdding(open)
          if (!open) add.reset()
        }}
      >
        <Dialog.Content size="sm" aria-describedby={undefined}>
          <Dialog.Header>
            <Dialog.Title>Add passkey</Dialog.Title>
          </Dialog.Header>
          <form
            className="flex flex-col gap-4"
            noValidate
            onSubmit={(event) => {
              event.preventDefault()
              add.mutate(newName.trim())
            }}
          >
            <Fieldset.Root disabled={add.isPending}>
              <Fieldset.Legend hidden>Passkey</Fieldset.Legend>
              <Fieldset.Fields>
                <Field.Root>
                  <Field.Label>Name</Field.Label>
                  <Field.Control>
                    <Input.Root
                      maxLength={64}
                      placeholder="Laptop"
                      value={newName}
                      onChange={(event) => setNewName(event.target.value)}
                    />
                  </Field.Control>
                  <Field.Error>
                    {add.isError && !addCancelled
                      ? errorMessage(add.error)
                      : null}
                  </Field.Error>
                </Field.Root>
              </Fieldset.Fields>
            </Fieldset.Root>
            <Dialog.Footer>
              <Dialog.Close asChild>
                <Button.Root variant="secondary">Cancel</Button.Root>
              </Dialog.Close>
              <Button.Root type="submit" loading={add.isPending}>
                Create passkey
              </Button.Root>
            </Dialog.Footer>
          </form>
        </Dialog.Content>
      </Dialog.Root>
      <RenameDialog passkey={renaming} onClose={() => setRenaming(null)} />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null)
        }}
        title="Delete passkey?"
        description={`${deleting?.name ?? "This passkey"} can no longer sign in.`}
        confirmLabel="Delete"
        onConfirm={async () => {
          if (deleting === null) return
          await stepUp.run(() => api.me.deletePasskey(deleting.id))
          await queryClient.invalidateQueries({ queryKey: keys.passkeys })
          toast({ title: "Passkey deleted" })
        }}
      />
    </Card.Root>
  )
}

function RenameDialog({
  passkey,
  onClose,
}: {
  passkey: Passkey | null
  onClose: () => void
}): ReactElement {
  const [name, setName] = useState("")
  const queryClient = useQueryClient()
  const stepUp = useStepUp()
  const rename = useMutation({
    mutationFn: (input: { id: string; name: string }) =>
      stepUp.run(() => api.me.renamePasskey(input.id, input.name)),
    async onSuccess() {
      await queryClient.invalidateQueries({ queryKey: keys.passkeys })
      onClose()
    },
  })

  return (
    <Dialog.Root
      open={passkey !== null}
      onOpenChange={(open) => {
        if (open) return
        rename.reset()
        onClose()
      }}
    >
      <Dialog.Content
        size="sm"
        aria-describedby={undefined}
        onOpenAutoFocus={() => setName(passkey?.name ?? "")}
      >
        <Dialog.Header>
          <Dialog.Title>Rename passkey</Dialog.Title>
        </Dialog.Header>
        <form
          className="flex flex-col gap-4"
          noValidate
          onSubmit={(event) => {
            event.preventDefault()
            if (passkey !== null && name.trim() !== "") {
              rename.mutate({ id: passkey.id, name: name.trim() })
            }
          }}
        >
          <Fieldset.Root disabled={rename.isPending}>
            <Fieldset.Legend hidden>Passkey name</Fieldset.Legend>
            <Fieldset.Fields>
              <Field.Root required>
                <Field.Label>Name</Field.Label>
                <Field.Control>
                  <Input.Root
                    maxLength={64}
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                  />
                </Field.Control>
                <Field.Error>
                  {rename.isError && !isStepUpCancelled(rename.error)
                    ? errorMessage(rename.error)
                    : null}
                </Field.Error>
              </Field.Root>
            </Fieldset.Fields>
          </Fieldset.Root>
          <Dialog.Footer>
            <Dialog.Close asChild>
              <Button.Root variant="secondary">Cancel</Button.Root>
            </Dialog.Close>
            <Button.Root
              type="submit"
              loading={rename.isPending}
              disabled={name.trim() === ""}
            >
              Save
            </Button.Root>
          </Dialog.Footer>
        </form>
      </Dialog.Content>
    </Dialog.Root>
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
                    className="hidden text-[11px] text-secondary sm:table-cell"
                  >
                    {session.ipPrefix ?? "—"}
                  </Table.Cell>
                  <Table.Cell className="text-secondary">
                    {session.current ? (
                      <Badge.Root tone="pos" dot>
                        This device
                      </Badge.Root>
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
            <p role="alert" className="text-[12px] font-500 text-neg">
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
