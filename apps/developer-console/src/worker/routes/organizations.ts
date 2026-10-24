import { okResponseSchema } from "@repo/platform-contracts/common"
import {
  type MembershipRole,
  acceptInvitationRequestSchema,
  auditSearchQuerySchema,
  consolePaths,
  createInvitationRequestSchema,
  createOrganizationRequestSchema,
  invitationListResponseSchema,
  invitationSchema,
  memberListResponseSchema,
  memberSchema,
  organizationListResponseSchema,
  organizationSchema,
  updateMemberRequestSchema,
  updateOrganizationRequestSchema,
} from "@repo/platform-contracts/console"
import {
  PlatformError,
  generateOpaqueToken,
  hmacHex,
  jsonBody,
  pathParams,
  queryParams,
} from "@repo/platform-server"
import { organizationAccess, roleAtLeast } from "../access"
import { limitByAccount } from "../auth/limits"
import {
  type ConsoleApp,
  type ConsoleContext,
  audit,
  deps,
  logger,
  nowIso,
  requireAuth,
  requireStepUp,
} from "../context"
import { invitationEmail } from "../email/templates"
import { respond, toInvitation, toMember, toOrganization } from "../mappers"
import { slugify, uniqueSlug } from "../slugs"
import type {
  AccountRecord,
  OrganizationMembershipRecord,
} from "../store/console-store"
import { auditSearch } from "./audit-search"

export const invitationLifetimeMs = 7 * 24 * 60 * 60_000

export function invitationTokenHash(pepper: string, token: string) {
  return hmacHex(pepper, `invitation:${token}`)
}

/** Creates an organization owned by `account` with a unique slug. */
export async function createOrganizationWithOwner(
  c: ConsoleContext,
  account: AccountRecord,
  input: { name: string; slug?: string },
): Promise<OrganizationMembershipRecord> {
  const { store } = deps(c)
  let slug: string
  if (input.slug !== undefined) {
    if ((await store.findOrganizationBySlug(input.slug)) !== null) {
      throw new PlatformError("conflict", { message: "Slug already in use." })
    }
    slug = input.slug
  } else {
    slug = await uniqueSlug(
      slugify(input.name, "org"),
      async (candidate) =>
        (await store.findOrganizationBySlug(candidate)) !== null,
    )
  }
  const organization = await store.createOrganization({
    name: input.name,
    slug,
    ownerId: account.id,
  })
  await audit(c, {
    action: "organization-created",
    organizationId: organization.id,
    targetType: "organization",
    targetId: organization.id,
    metadata: { name: organization.name, slug: organization.slug },
    actorId: account.id,
  })
  return { ...organization, role: "owner" }
}

export type InvitationAcceptance =
  | { ok: true; organization: OrganizationMembershipRecord }
  | { ok: false; reason: "invalid" | "email-mismatch" }

/** Accepts an invitation token for `account` (email must match + verified). */
export async function acceptInvitation(
  c: ConsoleContext,
  account: AccountRecord,
  token: string,
): Promise<InvitationAcceptance> {
  const { store, now, config } = deps(c)
  const invitation = await store.findInvitationByTokenHash(
    await invitationTokenHash(config.sessionPepper, token),
  )
  if (
    invitation === null ||
    invitation.acceptedAt !== null ||
    invitation.revokedAt !== null ||
    Date.parse(invitation.expiresAt) <= now().getTime()
  ) {
    return { ok: false, reason: "invalid" }
  }
  if (invitation.email !== account.email || account.emailVerifiedAt === null) {
    return { ok: false, reason: "email-mismatch" }
  }
  const organization = await store.getOrganization(invitation.organizationId)
  if (organization === null) return { ok: false, reason: "invalid" }
  const existing = await store.getMembership(organization.id, account.id)
  if (existing === null) {
    await store.addMember({
      organizationId: organization.id,
      accountId: account.id,
      role: invitation.role,
    })
  }
  await store.updateInvitation(invitation.id, { acceptedAt: nowIso(c) })
  await audit(c, {
    action: "invitation-accepted",
    organizationId: organization.id,
    targetType: "invitation",
    targetId: invitation.id,
    metadata: { role: invitation.role, alreadyMember: existing !== null },
    actorId: account.id,
  })
  return {
    ok: true,
    organization: { ...organization, role: existing?.role ?? invitation.role },
  }
}

function assertOwnerRemains(
  owners: number,
  target: { role: MembershipRole },
  nextRole: MembershipRole | null,
): void {
  if (target.role === "owner" && nextRole !== "owner" && owners <= 1) {
    throw new PlatformError("conflict", {
      message: "An organization needs at least one owner.",
    })
  }
}

export default function registerOrganizationRoutes(app: ConsoleApp): void {
  app.get("/api/orgs", async (c) => {
    const auth = requireAuth(c)
    const organizations = await deps(c).store.listOrganizationsForAccount(
      auth.account.id,
    )
    return respond(c, organizationListResponseSchema, {
      data: organizations.map(toOrganization),
    })
  })

  app.post("/api/orgs", async (c) => {
    const auth = requireAuth(c)
    const body = await jsonBody(c, createOrganizationRequestSchema)
    const organization = await createOrganizationWithOwner(c, auth.account, {
      name: body.name,
      ...(body.slug === undefined ? {} : { slug: body.slug }),
    })
    return respond(c, organizationSchema, toOrganization(organization), 201)
  })

  app.get("/api/orgs/:orgId", async (c) => {
    const { orgId } = pathParams(c, consolePaths.orgId)
    const access = await organizationAccess(c, orgId, "developer")
    return respond(
      c,
      organizationSchema,
      toOrganization({ ...access.organization, role: access.membership.role }),
    )
  })

  app.patch("/api/orgs/:orgId", async (c) => {
    const { orgId } = pathParams(c, consolePaths.orgId)
    const access = await organizationAccess(c, orgId, "admin")
    const body = await jsonBody(c, updateOrganizationRequestSchema)
    const { store } = deps(c)
    if (body.slug !== undefined && body.slug !== access.organization.slug) {
      if ((await store.findOrganizationBySlug(body.slug)) !== null) {
        throw new PlatformError("conflict", { message: "Slug already in use." })
      }
    }
    const organization = await store.updateOrganization(orgId, {
      ...(body.name === undefined ? {} : { name: body.name }),
      ...(body.slug === undefined ? {} : { slug: body.slug }),
    })
    await audit(c, {
      action: "organization-updated",
      organizationId: orgId,
      targetType: "organization",
      targetId: orgId,
      metadata: { name: body.name ?? null, slug: body.slug ?? null },
    })
    return respond(
      c,
      organizationSchema,
      toOrganization({ ...organization, role: access.membership.role }),
    )
  })

  app.delete("/api/orgs/:orgId", async (c) => {
    const { orgId } = pathParams(c, consolePaths.orgId)
    const access = await organizationAccess(c, orgId, "owner")
    requireStepUp(c)
    await deps(c).store.deleteOrganization(orgId)
    await audit(c, {
      action: "organization-deleted",
      organizationId: orgId,
      targetType: "organization",
      targetId: orgId,
      metadata: {
        name: access.organization.name,
        slug: access.organization.slug,
      },
    })
    return respond(c, okResponseSchema, { ok: true })
  })

  // Members ---------------------------------------------------------------

  app.get("/api/orgs/:orgId/members", async (c) => {
    const { orgId } = pathParams(c, consolePaths.orgId)
    await organizationAccess(c, orgId, "developer")
    const members = await deps(c).store.listMembers(orgId)
    return respond(c, memberListResponseSchema, {
      data: members.map(toMember),
    })
  })

  app.patch("/api/orgs/:orgId/members/:accountId", async (c) => {
    const { orgId, accountId } = pathParams(c, consolePaths.member)
    const access = await organizationAccess(c, orgId, "admin")
    const body = await jsonBody(c, updateMemberRequestSchema)
    const { store } = deps(c)
    const members = await store.listMembers(orgId)
    const target = members.find((member) => member.accountId === accountId)
    if (target === undefined) throw new PlatformError("not_found")
    if (
      (target.role === "owner" || body.role === "owner") &&
      access.membership.role !== "owner"
    ) {
      throw new PlatformError("forbidden", {
        message: "Only owners can change ownership.",
      })
    }
    assertOwnerRemains(
      members.filter((member) => member.role === "owner").length,
      target,
      body.role,
    )
    requireStepUp(c)
    if (target.role !== body.role) {
      await store.updateMemberRole(orgId, accountId, body.role)
      await audit(c, {
        action: "member-role-changed",
        organizationId: orgId,
        targetType: "account",
        targetId: accountId,
        metadata: { from: target.role, to: body.role },
      })
    }
    return respond(c, memberSchema, toMember({ ...target, role: body.role }))
  })

  app.delete("/api/orgs/:orgId/members/:accountId", async (c) => {
    const { orgId, accountId } = pathParams(c, consolePaths.member)
    const self = requireAuth(c).account.id === accountId
    const access = await organizationAccess(
      c,
      orgId,
      self ? "developer" : "admin",
    )
    const { store } = deps(c)
    const members = await store.listMembers(orgId)
    const target = members.find((member) => member.accountId === accountId)
    if (target === undefined) throw new PlatformError("not_found")
    if (
      !self &&
      target.role === "owner" &&
      access.membership.role !== "owner"
    ) {
      throw new PlatformError("forbidden", {
        message: "Only owners can remove owners.",
      })
    }
    assertOwnerRemains(
      members.filter((member) => member.role === "owner").length,
      target,
      null,
    )
    requireStepUp(c)
    await store.removeMember(orgId, accountId)
    await audit(c, {
      action: "member-removed",
      organizationId: orgId,
      targetType: "account",
      targetId: accountId,
      metadata: { role: target.role, self },
    })
    return respond(c, okResponseSchema, { ok: true })
  })

  // Invitations -----------------------------------------------------------

  app.get("/api/orgs/:orgId/invitations", async (c) => {
    const { orgId } = pathParams(c, consolePaths.orgId)
    await organizationAccess(c, orgId, "admin")
    const invitations = await deps(c).store.listInvitations(orgId)
    return respond(c, invitationListResponseSchema, {
      data: invitations.map(toInvitation),
    })
  })

  app.post("/api/orgs/:orgId/invitations", async (c) => {
    const { orgId } = pathParams(c, consolePaths.orgId)
    const access = await organizationAccess(c, orgId, "admin")
    const body = await jsonBody(c, createInvitationRequestSchema)
    if (
      body.role === "owner" &&
      !roleAtLeast(access.membership.role, "owner")
    ) {
      throw new PlatformError("forbidden", {
        message: "Only owners can invite owners.",
      })
    }
    const { store, now, config, email } = deps(c)
    const members = await store.listMembers(orgId)
    if (members.some((member) => member.email === body.email)) {
      throw new PlatformError("conflict", { message: "Already a member." })
    }
    requireStepUp(c)
    await limitByAccount(c, "invite", access.account.id)
    const current = now()
    for (const pending of await store.listInvitations(orgId)) {
      if (
        pending.email === body.email &&
        pending.acceptedAt === null &&
        pending.revokedAt === null
      ) {
        await store.updateInvitation(pending.id, {
          revokedAt: current.toISOString(),
        })
      }
    }
    const token = generateOpaqueToken()
    const invitation = await store.createInvitation({
      organizationId: orgId,
      email: body.email,
      role: body.role,
      tokenHash: await invitationTokenHash(config.sessionPepper, token),
      invitedBy: access.account.id,
      createdAt: current.toISOString(),
      expiresAt: new Date(
        current.getTime() + invitationLifetimeMs,
      ).toISOString(),
    })
    await audit(c, {
      action: "invitation-created",
      organizationId: orgId,
      targetType: "invitation",
      targetId: invitation.id,
      metadata: { email: body.email, role: body.role },
    })
    try {
      await email.send({
        to: body.email,
        ...invitationEmail({
          organizationName: access.organization.name,
          inviterName: access.account.displayName,
          role: body.role,
          link: `${config.consoleOrigin}/invite/${token}`,
        }),
      })
    } catch (error) {
      logger(c).error({
        message: "Invitation email failed",
        invitationId: invitation.id,
        error,
      })
    }
    return respond(c, invitationSchema, toInvitation(invitation), 201)
  })

  app.delete("/api/orgs/:orgId/invitations/:invitationId", async (c) => {
    const { orgId, invitationId } = pathParams(c, consolePaths.invitation)
    await organizationAccess(c, orgId, "admin")
    const { store } = deps(c)
    const invitation = await store.getInvitation(invitationId)
    if (invitation === null || invitation.organizationId !== orgId) {
      throw new PlatformError("not_found")
    }
    if (invitation.acceptedAt === null && invitation.revokedAt === null) {
      await store.updateInvitation(invitationId, { revokedAt: nowIso(c) })
      await audit(c, {
        action: "invitation-revoked",
        organizationId: orgId,
        targetType: "invitation",
        targetId: invitationId,
        metadata: { email: invitation.email },
      })
    }
    return respond(c, okResponseSchema, { ok: true })
  })

  app.post("/api/invitations/accept", async (c) => {
    const auth = requireAuth(c)
    const body = await jsonBody(c, acceptInvitationRequestSchema)
    const result = await acceptInvitation(c, auth.account, body.token)
    if (!result.ok) {
      throw result.reason === "email-mismatch"
        ? new PlatformError("forbidden", {
            message: "Sign in with the invited email address.",
          })
        : new PlatformError("not_found", {
            message: "Invitation not found or expired.",
          })
    }
    return respond(c, organizationSchema, toOrganization(result.organization))
  })

  app.get("/api/orgs/:orgId/audit", async (c) => {
    const { orgId } = pathParams(c, consolePaths.orgId)
    await organizationAccess(c, orgId, "admin")
    const query = queryParams(c, auditSearchQuerySchema)
    return auditSearch(c, { ...query, organizationId: orgId })
  })
}
