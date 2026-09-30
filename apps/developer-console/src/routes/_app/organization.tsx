import {
  type Member,
  type MembershipRole,
  type OrganizationSummary,
  membershipRoleSchema,
} from "@repo/platform-contracts/console"
import * as Button from "@repo/ui/button"
import * as Card from "@repo/ui/card"
import * as Dialog from "@repo/ui/dialog"
import * as EmptyState from "@repo/ui/empty-state"
import * as Field from "@repo/ui/field"
import * as Fieldset from "@repo/ui/fieldset"
import * as Input from "@repo/ui/input"
import * as PageHeader from "@repo/ui/page-header"
import * as Select from "@repo/ui/select"
import * as Skeleton from "@repo/ui/skeleton"
import * as Table from "@repo/ui/table"
import * as Toast from "@repo/ui/toast"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { Plus } from "lucide-react"
import { type FormEvent, type ReactElement, useState } from "react"
import ConfirmDialog from "../../components/ConfirmDialog"
import QueryError from "../../components/QueryError"
import RequireOrg from "../../components/RequireOrg"
import * as api from "../../lib/api"
import { ApiError, errorMessage } from "../../lib/api-client"
import { formatDate, humanize } from "../../lib/format"
import { keys } from "../../lib/queries"
import { canManage, useSession } from "../../lib/session"
import { isStepUpCancelled, useStepUp } from "../../lib/step-up"
import { useTitle } from "../../lib/title"

export const Route = createFileRoute("/_app/organization")({
  component: OrganizationPage,
})

function isRole(value: string): value is MembershipRole {
  return membershipRoleSchema.safeParse(value).success
}

function OrganizationPage(): ReactElement {
  useTitle("Organization")
  return (
    <RequireOrg>
      {(org) => (
        <div className="flex max-w-4xl flex-col gap-12">
          <PageHeader.Root>
            <PageHeader.Heading>
              <PageHeader.Eyebrow>{humanize(org.role)}</PageHeader.Eyebrow>
              <PageHeader.Title>{org.name}</PageHeader.Title>
            </PageHeader.Heading>
          </PageHeader.Root>
          <OrgSettings key={org.id} org={org} />
          <Members org={org} />
          {canManage(org) ? <Invitations org={org} /> : null}
          {org.role === "owner" ? <DeleteOrg org={org} /> : null}
        </div>
      )}
    </RequireOrg>
  )
}

function OrgSettings({ org }: { org: OrganizationSummary }): ReactElement {
  const [name, setName] = useState(org.name)
  const [slug, setSlug] = useState(org.slug)
  const queryClient = useQueryClient()
  const { toast } = Toast.useToast()
  const save = useMutation({
    mutationFn: () =>
      api.orgs.update(org.id, {
        ...(name.trim() === org.name ? {} : { name: name.trim() }),
        ...(slug.trim() === org.slug ? {} : { slug: slug.trim() }),
      }),
    async onSuccess() {
      await queryClient.invalidateQueries({ queryKey: keys.me })
      toast({ title: "Saved" })
    },
  })
  const editable = canManage(org)
  const slugProblem =
    slug.trim() !== "" && !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug.trim())
      ? "Lower-case letters, numbers and dashes"
      : null
  const dirty = name.trim() !== org.name || slug.trim() !== org.slug
  const issue = (path: string): string | null =>
    save.error instanceof ApiError ? save.error.issueFor(path) : null

  function submit(event: FormEvent): void {
    event.preventDefault()
    if (dirty && slugProblem === null && name.trim() !== "") save.mutate()
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <Fieldset.Root disabled={!editable || save.isPending}>
        <Fieldset.Legend>Settings</Fieldset.Legend>
        <Fieldset.Fields className="sm:flex-row">
          <Field.Root required className="flex-1">
            <Field.Label>Name</Field.Label>
            <Field.Control>
              <Input.Root
                value={name}
                maxLength={80}
                onChange={(event) => setName(event.target.value)}
              />
            </Field.Control>
            <Field.Error>{issue("name")}</Field.Error>
          </Field.Root>
          <Field.Root required className="flex-1">
            <Field.Label>Slug</Field.Label>
            <Field.Control>
              <Input.Root
                mono
                value={slug}
                maxLength={48}
                spellCheck={false}
                onChange={(event) => setSlug(event.target.value)}
              />
            </Field.Control>
            <Field.Error>{slugProblem ?? issue("slug")}</Field.Error>
          </Field.Root>
        </Fieldset.Fields>
      </Fieldset.Root>
      {editable ? (
        <p className="flex items-center justify-end gap-2">
          {save.isError &&
          !(save.error instanceof ApiError && save.error.issues.length > 0) ? (
            <span
              role="alert"
              className="mr-auto text-[12px] font-500 text-neg"
            >
              {errorMessage(save.error)}
            </span>
          ) : null}
          <Button.Root
            type="submit"
            loading={save.isPending}
            disabled={!dirty || slugProblem !== null || name.trim() === ""}
          >
            Save
          </Button.Root>
        </p>
      ) : null}
    </form>
  )
}

function Members({ org }: { org: OrganizationSummary }): ReactElement {
  const { me } = useSession()
  const members = useQuery({
    queryKey: keys.members(org.id),
    queryFn: () => api.orgs.members(org.id),
  })
  const [removing, setRemoving] = useState<Member | null>(null)
  const [roleError, setRoleError] = useState<{
    id: string
    message: string
  } | null>(null)
  const queryClient = useQueryClient()
  const stepUp = useStepUp()
  const { toast } = Toast.useToast()
  const manage = canManage(org)

  async function changeRole(
    member: Member,
    role: MembershipRole,
  ): Promise<void> {
    setRoleError(null)
    try {
      await stepUp.run(() =>
        api.orgs.updateMember(org.id, member.accountId, role),
      )
      await queryClient.invalidateQueries({ queryKey: keys.members(org.id) })
      toast({ title: "Role updated" })
    } catch (error) {
      if (!isStepUpCancelled(error)) {
        setRoleError({ id: member.accountId, message: errorMessage(error) })
      }
    }
  }

  return (
    <Card.Root>
      <Card.Header>
        <Card.Title>Members</Card.Title>
      </Card.Header>
      {members.isPending ? (
        <div aria-busy="true" className="flex flex-col gap-3">
          <Skeleton.Root shape="block" />
          <Skeleton.Root shape="block" />
        </div>
      ) : members.isError ? (
        <QueryError
          error={members.error}
          onRetry={() => void members.refetch()}
        />
      ) : (
        <Table.Root>
          <Table.Header>
            <Table.Row>
              <Table.Head>Name</Table.Head>
              <Table.Head className="hidden sm:table-cell">Email</Table.Head>
              <Table.Head>Role</Table.Head>
              <Table.Head className="hidden md:table-cell">Joined</Table.Head>
              <Table.Head>
                <span className="sr-only">Actions</span>
              </Table.Head>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {members.data.data.map((member) => {
              const self = member.accountId === me.account.id
              return (
                <Table.Row key={member.accountId}>
                  <Table.Cell className="font-600">
                    {member.displayName}
                    {self ? (
                      <span className="ml-1.5 text-secondary">(you)</span>
                    ) : null}
                  </Table.Cell>
                  <Table.Cell className="hidden text-secondary sm:table-cell">
                    {member.email}
                  </Table.Cell>
                  <Table.Cell>
                    {manage && !self ? (
                      <>
                        <Select.Root
                          value={member.role}
                          onValueChange={(value) => {
                            if (isRole(value)) void changeRole(member, value)
                          }}
                        >
                          <Select.Trigger
                            size="sm"
                            className="w-[130px]"
                            aria-label={`Role for ${member.displayName}`}
                            aria-invalid={
                              roleError?.id === member.accountId || undefined
                            }
                          >
                            <Select.Value />
                          </Select.Trigger>
                          <Select.Content>
                            {membershipRoleSchema.options.map((role) => (
                              <Select.Item key={role} value={role}>
                                {humanize(role)}
                              </Select.Item>
                            ))}
                          </Select.Content>
                        </Select.Root>
                        {roleError?.id === member.accountId ? (
                          <p
                            role="alert"
                            className="mt-1 text-[11px] font-500 text-neg"
                          >
                            {roleError.message}
                          </p>
                        ) : null}
                      </>
                    ) : (
                      humanize(member.role)
                    )}
                  </Table.Cell>
                  <Table.Cell className="hidden text-secondary md:table-cell">
                    {formatDate(member.createdAt)}
                  </Table.Cell>
                  <Table.Cell className="text-right">
                    {manage && !self ? (
                      <Button.Root
                        variant="ghost"
                        size="sm"
                        aria-label={`Remove ${member.displayName}`}
                        onClick={() => setRemoving(member)}
                      >
                        Remove
                      </Button.Root>
                    ) : null}
                  </Table.Cell>
                </Table.Row>
              )
            })}
          </Table.Body>
        </Table.Root>
      )}
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => {
          if (!open) setRemoving(null)
        }}
        title="Remove member?"
        description={`${removing?.email ?? ""} loses access to ${org.name}.`}
        confirmLabel="Remove"
        onConfirm={async () => {
          if (removing === null) return
          await stepUp.run(() =>
            api.orgs.removeMember(org.id, removing.accountId),
          )
          await queryClient.invalidateQueries({
            queryKey: keys.members(org.id),
          })
          toast({ title: "Member removed" })
        }}
      />
    </Card.Root>
  )
}

function Invitations({ org }: { org: OrganizationSummary }): ReactElement {
  const invitations = useQuery({
    queryKey: keys.invitations(org.id),
    queryFn: () => api.orgs.invitations(org.id),
  })
  const [inviting, setInviting] = useState(false)
  const [revoking, setRevoking] = useState<{
    id: string
    email: string
  } | null>(null)
  const queryClient = useQueryClient()
  const { toast } = Toast.useToast()
  const now = Date.now()
  const pending = (invitations.data?.data ?? []).filter(
    (invitation) =>
      invitation.acceptedAt === null &&
      invitation.revokedAt === null &&
      Date.parse(invitation.expiresAt) > now,
  )

  return (
    <Card.Root>
      <Card.Header>
        <Card.Title>Invitations</Card.Title>
        <Card.Actions>
          <Button.Root variant="secondary" onClick={() => setInviting(true)}>
            <Plus aria-hidden="true" size={13} strokeWidth={2} />
            Invite
          </Button.Root>
        </Card.Actions>
      </Card.Header>
      {invitations.isPending ? (
        <Skeleton.Root shape="block" />
      ) : invitations.isError ? (
        <QueryError
          error={invitations.error}
          onRetry={() => void invitations.refetch()}
        />
      ) : pending.length === 0 ? (
        <EmptyState.Root>
          <EmptyState.Title>No pending invitations</EmptyState.Title>
          <EmptyState.Action>
            <Button.Root variant="secondary" onClick={() => setInviting(true)}>
              Invite member
            </Button.Root>
          </EmptyState.Action>
        </EmptyState.Root>
      ) : (
        <Table.Root>
          <Table.Header>
            <Table.Row>
              <Table.Head>Email</Table.Head>
              <Table.Head>Role</Table.Head>
              <Table.Head className="hidden sm:table-cell">Expires</Table.Head>
              <Table.Head>
                <span className="sr-only">Actions</span>
              </Table.Head>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {pending.map((invitation) => (
              <Table.Row key={invitation.id}>
                <Table.Cell>{invitation.email}</Table.Cell>
                <Table.Cell>{humanize(invitation.role)}</Table.Cell>
                <Table.Cell className="hidden text-secondary sm:table-cell">
                  {formatDate(invitation.expiresAt)}
                </Table.Cell>
                <Table.Cell className="text-right">
                  <Button.Root
                    variant="ghost"
                    size="sm"
                    aria-label={`Revoke invitation for ${invitation.email}`}
                    onClick={() =>
                      setRevoking({
                        id: invitation.id,
                        email: invitation.email,
                      })
                    }
                  >
                    Revoke
                  </Button.Root>
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table.Root>
      )}
      <InviteDialog org={org} open={inviting} onOpenChange={setInviting} />
      <ConfirmDialog
        open={revoking !== null}
        onOpenChange={(open) => {
          if (!open) setRevoking(null)
        }}
        title="Revoke invitation?"
        description={`The link sent to ${revoking?.email ?? ""} stops working.`}
        confirmLabel="Revoke"
        onConfirm={async () => {
          if (revoking === null) return
          await api.orgs.revokeInvitation(org.id, revoking.id)
          await queryClient.invalidateQueries({
            queryKey: keys.invitations(org.id),
          })
          toast({ title: "Invitation revoked" })
        }}
      />
    </Card.Root>
  )
}

function InviteDialog({
  org,
  open,
  onOpenChange,
}: {
  org: OrganizationSummary
  open: boolean
  onOpenChange: (open: boolean) => void
}): ReactElement {
  const [email, setEmail] = useState("")
  const [role, setRole] = useState<MembershipRole>("developer")
  const queryClient = useQueryClient()
  const stepUp = useStepUp()
  const { toast } = Toast.useToast()
  const invite = useMutation({
    mutationFn: () =>
      stepUp.run(() => api.orgs.invite(org.id, { email: email.trim(), role })),
    async onSuccess() {
      await queryClient.invalidateQueries({
        queryKey: keys.invitations(org.id),
      })
      toast({ title: "Invitation sent" })
      setEmail("")
      onOpenChange(false)
    },
  })

  function submit(event: FormEvent): void {
    event.preventDefault()
    if (email.trim() !== "") invite.mutate()
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Content size="sm" aria-describedby={undefined}>
        <Dialog.Header>
          <Dialog.Title>Invite member</Dialog.Title>
        </Dialog.Header>
        <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
          <Fieldset.Root disabled={invite.isPending}>
            <Fieldset.Legend hidden>Invitation</Fieldset.Legend>
            <Fieldset.Fields>
              <Field.Root required>
                <Field.Label>Email</Field.Label>
                <Field.Control>
                  <Input.Root
                    type="email"
                    autoComplete="off"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                  />
                </Field.Control>
                <Field.Error>
                  {invite.isError && !isStepUpCancelled(invite.error)
                    ? errorMessage(invite.error)
                    : null}
                </Field.Error>
              </Field.Root>
              <Field.Root>
                <Field.Label>Role</Field.Label>
                <Select.Root
                  value={role}
                  onValueChange={(value) => {
                    if (isRole(value)) setRole(value)
                  }}
                >
                  <Field.Control>
                    <Select.Trigger>
                      <Select.Value />
                    </Select.Trigger>
                  </Field.Control>
                  <Select.Content>
                    {membershipRoleSchema.options.map((option) => (
                      <Select.Item key={option} value={option}>
                        {humanize(option)}
                      </Select.Item>
                    ))}
                  </Select.Content>
                </Select.Root>
              </Field.Root>
            </Fieldset.Fields>
          </Fieldset.Root>
          <Dialog.Footer>
            <Dialog.Close asChild>
              <Button.Root variant="secondary">Cancel</Button.Root>
            </Dialog.Close>
            <Button.Root
              type="submit"
              loading={invite.isPending}
              disabled={email.trim() === ""}
            >
              Send invitation
            </Button.Root>
          </Dialog.Footer>
        </form>
      </Dialog.Content>
    </Dialog.Root>
  )
}

function DeleteOrg({ org }: { org: OrganizationSummary }): ReactElement {
  const [open, setOpen] = useState(false)
  const [typed, setTyped] = useState("")
  const stepUp = useStepUp()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { toast } = Toast.useToast()

  return (
    <section
      aria-labelledby="delete-org"
      className="flex flex-col gap-3 rounded-[10px] border border-neg/30 p-4"
    >
      <h2 id="delete-org" className="text-[14px] font-600 text-ink">
        Danger zone
      </h2>
      <p className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-[13px] text-secondary">Delete organization</span>
        <Button.Root variant="danger" onClick={() => setOpen(true)}>
          Delete
        </Button.Root>
      </p>
      <ConfirmDialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next)
          if (!next) setTyped("")
        }}
        title={`Delete ${org.name}?`}
        description="Apps, keys, secrets and memberships are removed. This cannot be undone."
        confirmLabel="Delete organization"
        confirmDisabled={typed !== org.slug}
        onConfirm={async () => {
          await stepUp.run(() => api.orgs.remove(org.id))
          await queryClient.invalidateQueries({ queryKey: keys.me })
          toast({ title: "Organization deleted" })
          await navigate({ to: "/" })
        }}
      >
        <Field.Root>
          <Field.Label>
            Type <span className="font-mono">{org.slug}</span>
          </Field.Label>
          <Field.Control>
            <Input.Root
              mono
              autoComplete="off"
              spellCheck={false}
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
            />
          </Field.Control>
        </Field.Root>
      </ConfirmDialog>
    </section>
  )
}
