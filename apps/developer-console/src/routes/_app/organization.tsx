import type { AuditEvent } from "@repo/platform-contracts/audit"
import {
  type Member,
  type MembershipRole,
  type OrganizationSummary,
  membershipRoleSchema,
} from "@repo/platform-contracts/console"
import * as Button from "@repo/ui/button"
import { cn } from "@repo/ui/cn"
import * as Dialog from "@repo/ui/dialog"
import * as DropdownMenu from "@repo/ui/dropdown-menu"
import * as Field from "@repo/ui/field"
import * as Fieldset from "@repo/ui/fieldset"
import * as Input from "@repo/ui/input"
import * as SegmentedControl from "@repo/ui/segmented-control"
import * as Select from "@repo/ui/select"
import * as Skeleton from "@repo/ui/skeleton"
import * as Table from "@repo/ui/table"
import * as Toast from "@repo/ui/toast"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { Lock, MoreHorizontal, Settings } from "lucide-react"
import { type FormEvent, type ReactElement, useState } from "react"
import ConfirmDialog from "../../components/ConfirmDialog"
import QueryError from "../../components/QueryError"
import RequireOrg from "../../components/RequireOrg"
import { Crumb, Crumbs } from "../../components/shell/Breadcrumbs"
import { initials } from "../../components/ui/AppMark"
import LockHint from "../../components/ui/LockHint"
import PageTitle from "../../components/ui/PageTitle"
import { Pill } from "../../components/ui/Pill"
import SectionHead from "../../components/ui/SectionHead"
import * as api from "../../lib/api"
import { ApiError, errorMessage, isApiError } from "../../lib/api-client"
import { keyExpiry } from "../../lib/api-keys"
import {
  formatMonthDay,
  formatRelative,
  humanize,
  shortName,
} from "../../lib/format"
import { keys, orgAuditQuery } from "../../lib/queries"
import { canManage, useSession } from "../../lib/session"
import { isStepUpCancelled, useStepUp } from "../../lib/step-up"
import { useTitle } from "../../lib/title"

export const Route = createFileRoute("/_app/organization")({
  component: OrganizationPage,
})

function isRole(value: string): value is MembershipRole {
  return membershipRoleSchema.safeParse(value).success
}

const roleSummaries: Record<MembershipRole, string> = {
  owner: "Everything · delete org · ownership",
  admin: "Apps · live keys · secrets · members",
  developer: "View all · test keys",
}

function OrganizationPage(): ReactElement {
  useTitle("Organization")
  return <RequireOrg>{(org) => <Organization org={org} />}</RequireOrg>
}

function Organization({ org }: { org: OrganizationSummary }): ReactElement {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const manage = canManage(org)
  return (
    <div className="flex flex-col gap-7">
      <Crumbs>
        <Crumb>Organization</Crumb>
        <Crumb current>Members</Crumb>
      </Crumbs>
      <PageTitle
        eyebrow="Organization"
        title={org.name}
        adornment={
          <span className="font-mono text-label text-muted">{org.slug}</span>
        }
        actions={
          <Button.Root
            variant="secondary"
            onClick={() => setSettingsOpen(true)}
          >
            <Settings aria-hidden="true" size={14} strokeWidth={1.75} />
            Settings
          </Button.Root>
        }
      />
      <div className="grid grid-cols-1 gap-8 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-8">
          <Members org={org} />
          {manage ? <Invitations org={org} /> : null}
          <Activity orgId={org.id} />
        </div>
        <aside className="flex min-w-0 flex-col gap-6">
          {manage ? <InviteCard org={org} /> : null}
          <section aria-labelledby="org-roles" className="flex flex-col">
            <h2 id="org-roles" className="pb-1.5 text-caption text-muted">
              Roles
            </h2>
            <dl className="m-0 flex flex-col">
              {(["owner", "admin", "developer"] as const).map((role) => (
                <div
                  key={role}
                  className="flex gap-4 border-t border-line py-2"
                >
                  <dt className="w-[76px] shrink-0 text-label font-600 text-ink">
                    {humanize(role)}
                  </dt>
                  <dd className="m-0 text-label text-secondary">
                    {roleSummaries[role]}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        </aside>
      </div>
      <SettingsDialog
        key={`${org.id}-${org.name}-${org.slug}`}
        org={org}
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
      />
    </div>
  )
}

function Avatar({
  name,
  self,
}: {
  name: string
  self: boolean
}): ReactElement {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex size-7 shrink-0 items-center justify-center rounded-full text-micro font-700",
        self ? "bg-ink text-surface" : "bg-inset text-ink-2",
      )}
    >
      {initials(name)}
    </span>
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
    <section aria-labelledby="org-members" className="flex min-w-0 flex-col">
      <SectionHead
        id="org-members"
        title="Members"
        count={members.data?.data.length}
        className="pb-1"
      />
      {members.isPending ? (
        <div aria-busy="true" className="flex flex-col gap-3">
          <Skeleton.Root shape="block" className="h-12" />
          <Skeleton.Root shape="block" className="h-12" />
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
              <Table.Head>Member</Table.Head>
              <Table.Head className="w-[150px]">Role</Table.Head>
              <Table.Head className="hidden w-[100px] sm:table-cell">
                Joined
              </Table.Head>
              <Table.Head className="w-10">
                <span className="sr-only">Actions</span>
              </Table.Head>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {members.data.data.map((member) => {
              const self = member.accountId === me.account.id
              const editable = manage && !self
              return (
                <Table.Row key={member.accountId}>
                  <Table.Cell className="py-2.5">
                    <span className="flex min-w-0 items-center gap-3">
                      <Avatar name={member.displayName} self={self} />
                      <span className="flex min-w-0 flex-col">
                        <span className="flex min-w-0 items-center gap-2">
                          <span className="truncate text-body-sm font-600 text-ink">
                            {member.displayName}
                          </span>
                          {self ? <Pill>You</Pill> : null}
                        </span>
                        <span className="truncate text-label text-secondary">
                          {member.email}
                        </span>
                      </span>
                    </span>
                  </Table.Cell>
                  <Table.Cell>
                    {editable ? (
                      <>
                        <Select.Root
                          value={member.role}
                          onValueChange={(value) => {
                            if (isRole(value)) void changeRole(member, value)
                          }}
                        >
                          <Select.Trigger
                            size="sm"
                            className="w-auto min-w-[110px] bg-surface"
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
                            className="mt-1 text-caption font-500 text-neg"
                          >
                            {roleError.message}
                          </p>
                        ) : null}
                      </>
                    ) : (
                      <span className="inline-flex h-8 items-center gap-1.5 rounded-[7px] border border-line bg-inset px-2.5 text-label text-secondary">
                        {humanize(member.role)}
                        {self ? (
                          <Lock
                            aria-label="Your own role"
                            size={11}
                            strokeWidth={1.75}
                          />
                        ) : null}
                      </span>
                    )}
                  </Table.Cell>
                  <Table.Cell className="hidden text-label text-ink-2 sm:table-cell">
                    {formatMonthDay(member.createdAt)}
                  </Table.Cell>
                  <Table.Cell className="text-right">
                    {editable ? (
                      <DropdownMenu.Root>
                        <DropdownMenu.Trigger asChild>
                          <Button.Root
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Actions for ${member.displayName}`}
                          >
                            <MoreHorizontal
                              aria-hidden="true"
                              size={15}
                              strokeWidth={1.75}
                            />
                          </Button.Root>
                        </DropdownMenu.Trigger>
                        <DropdownMenu.Content>
                          <DropdownMenu.Item
                            tone="danger"
                            onSelect={() => setRemoving(member)}
                          >
                            Remove
                          </DropdownMenu.Item>
                        </DropdownMenu.Content>
                      </DropdownMenu.Root>
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
    </section>
  )
}

function Invitations({ org }: { org: OrganizationSummary }): ReactElement {
  const invitations = useQuery({
    queryKey: keys.invitations(org.id),
    queryFn: () => api.orgs.invitations(org.id),
  })
  const members = useQuery({
    queryKey: keys.members(org.id),
    queryFn: () => api.orgs.members(org.id),
  })
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
  const inviter = (accountId: string | null): string =>
    shortName(
      members.data?.data.find((member) => member.accountId === accountId)
        ?.displayName ?? null,
    )

  return (
    <section
      aria-labelledby="org-invitations"
      className="flex min-w-0 flex-col"
    >
      <SectionHead
        id="org-invitations"
        title="Invitations"
        count={invitations.data === undefined ? undefined : pending.length}
        className="pb-1"
      />
      {invitations.isPending ? (
        <Skeleton.Root shape="block" className="h-12" />
      ) : invitations.isError ? (
        <QueryError
          error={invitations.error}
          onRetry={() => void invitations.refetch()}
        />
      ) : pending.length === 0 ? (
        <p className="border-y border-line py-3 text-body-sm text-secondary">
          No pending invitations
        </p>
      ) : (
        <Table.Root>
          <Table.Header>
            <Table.Row>
              <Table.Head>Email</Table.Head>
              <Table.Head className="w-[100px]">Role</Table.Head>
              <Table.Head className="hidden w-[100px] md:table-cell">
                Invited by
              </Table.Head>
              <Table.Head className="hidden w-[80px] sm:table-cell">
                Expires
              </Table.Head>
              <Table.Head className="w-[70px]">
                <span className="sr-only">Actions</span>
              </Table.Head>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {pending.map((invitation) => {
              const expiry = keyExpiry(invitation.expiresAt, now)
              return (
                <Table.Row key={invitation.id}>
                  <Table.Cell className="max-w-0 truncate py-3 text-body-sm">
                    {invitation.email}
                  </Table.Cell>
                  <Table.Cell className="text-body-sm text-ink-2">
                    {humanize(invitation.role)}
                  </Table.Cell>
                  <Table.Cell className="hidden text-body-sm text-ink-2 md:table-cell">
                    {inviter(invitation.invitedBy)}
                  </Table.Cell>
                  <Table.Cell
                    className={cn(
                      "hidden text-body-sm sm:table-cell",
                      Date.parse(invitation.expiresAt) - now < 3 * 86_400_000
                        ? "font-600 text-accent-ink"
                        : "text-ink-2",
                    )}
                  >
                    {expiry.label}
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
              )
            })}
          </Table.Body>
        </Table.Root>
      )}
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
    </section>
  )
}

function InviteCard({ org }: { org: OrganizationSummary }): ReactElement {
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
    },
  })
  // Least access first, as in the frame.
  const roles = [...membershipRoleSchema.options]
    .reverse()
    .filter((option) => org.role === "owner" || option !== "owner")

  function submit(event: FormEvent): void {
    event.preventDefault()
    if (email.trim() !== "") invite.mutate()
  }

  return (
    <form
      onSubmit={submit}
      aria-labelledby="invite-member"
      className="flex flex-col gap-4 rounded-lg border border-line bg-surface px-5 pb-5 pt-[18px]"
      noValidate
    >
      <h2 id="invite-member" className="text-body font-600 text-ink">
        Invite member
      </h2>
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
                className="h-9 bg-surface"
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
            <Field.Control>
              <SegmentedControl.Root
                aria-label="Role"
                value={role}
                onValueChange={(value) => {
                  if (isRole(value)) setRole(value)
                }}
                className="grid w-full"
                style={{
                  gridTemplateColumns: `repeat(${roles.length}, minmax(0, 1fr))`,
                }}
              >
                {roles.map((option) => (
                  <SegmentedControl.Item
                    key={option}
                    value={option}
                    className="text-body-sm"
                  >
                    {humanize(option)}
                  </SegmentedControl.Item>
                ))}
              </SegmentedControl.Root>
            </Field.Control>
          </Field.Root>
        </Fieldset.Fields>
      </Fieldset.Root>
      <div className="flex items-center gap-2">
        <LockHint />
        <span className="flex-1" />
        <Button.Root
          type="submit"
          loading={invite.isPending}
          disabled={email.trim() === ""}
        >
          {invite.isPending ? null : (
            <Lock aria-hidden="true" size={13} strokeWidth={2} />
          )}
          Send invite
        </Button.Root>
      </div>
    </form>
  )
}

function Activity({ orgId }: { orgId: string }): ReactElement | null {
  const audit = useQuery(orgAuditQuery(orgId, 8))
  if (audit.isError && isApiError(audit.error, "forbidden")) return null
  return (
    <section aria-labelledby="org-activity" className="flex min-w-0 flex-col">
      <SectionHead id="org-activity" title="Activity" className="pb-1" />
      {audit.isPending ? (
        <div aria-busy="true" className="flex flex-col gap-2">
          {["a", "b", "c"].map((key) => (
            <Skeleton.Root key={key} />
          ))}
        </div>
      ) : audit.isError ? (
        <QueryError error={audit.error} onRetry={() => void audit.refetch()} />
      ) : audit.data.data.length === 0 ? (
        <p className="border-y border-line py-3 text-body-sm text-secondary">
          No activity
        </p>
      ) : (
        <ol className="m-0 flex list-none flex-col p-0">
          {audit.data.data.map((event: AuditEvent) => (
            <li
              key={event.id}
              className="flex items-baseline justify-between gap-3 border-t border-line py-2 text-body-sm last:border-b"
            >
              <span className="min-w-0 truncate text-ink">
                {humanize(event.action)}
              </span>
              <time
                dateTime={event.occurredAt}
                title={event.occurredAt}
                className="shrink-0 text-label text-muted"
              >
                {formatRelative(event.occurredAt)}
              </time>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

function SettingsDialog({
  org,
  open,
  onOpenChange,
}: {
  org: OrganizationSummary
  open: boolean
  onOpenChange: (open: boolean) => void
}): ReactElement {
  const [name, setName] = useState(org.name)
  const [slug, setSlug] = useState(org.slug)
  const [deleting, setDeleting] = useState(false)
  const [typed, setTyped] = useState("")
  const queryClient = useQueryClient()
  const stepUp = useStepUp()
  const navigate = useNavigate()
  const { toast } = Toast.useToast()
  const editable = canManage(org)
  const save = useMutation({
    mutationFn: () =>
      api.orgs.update(org.id, {
        ...(name.trim() === org.name ? {} : { name: name.trim() }),
        ...(slug.trim() === org.slug ? {} : { slug: slug.trim() }),
      }),
    async onSuccess() {
      await queryClient.invalidateQueries({ queryKey: keys.me })
      toast({ title: "Saved" })
      onOpenChange(false)
    },
  })
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
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Content size="md" aria-describedby={undefined}>
        <Dialog.Header>
          <Dialog.Title>Organization settings</Dialog.Title>
        </Dialog.Header>
        <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
          <Fieldset.Root disabled={!editable || save.isPending}>
            <Fieldset.Legend hidden>Settings</Fieldset.Legend>
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
          {save.isError &&
          !(save.error instanceof ApiError && save.error.issues.length > 0) ? (
            <p role="alert" className="text-label font-500 text-neg">
              {errorMessage(save.error)}
            </p>
          ) : null}
          {editable ? (
            <Dialog.Footer>
              <Dialog.Close asChild>
                <Button.Root variant="secondary">Cancel</Button.Root>
              </Dialog.Close>
              <Button.Root
                type="submit"
                loading={save.isPending}
                disabled={!dirty || slugProblem !== null || name.trim() === ""}
              >
                Save
              </Button.Root>
            </Dialog.Footer>
          ) : null}
        </form>
        {org.role === "owner" ? (
          <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
            <span className="mr-auto text-body-sm text-ink-2">
              Delete organization
            </span>
            <LockHint />
            <Button.Root
              variant="secondary"
              className="border-neg/30 text-neg hover:border-neg/50"
              onClick={() => setDeleting(true)}
            >
              Delete
            </Button.Root>
          </div>
        ) : null}
        <ConfirmDialog
          open={deleting}
          onOpenChange={(next) => {
            setDeleting(next)
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
            onOpenChange(false)
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
      </Dialog.Content>
    </Dialog.Root>
  )
}
