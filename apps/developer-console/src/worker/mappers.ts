import {
  type ApiKeyRecord,
  type App,
  type ClientSecretRecord,
  type DeveloperAccount,
  type Environment,
  type EnvironmentSummary,
  type Invitation,
  type MeResponse,
  type Member,
  type Organization,
  type QuotaOverrideRecord,
  type Review,
  credentialStatus,
} from "@repo/platform-contracts/console"
import {
  apiKeyDisplayPrefix,
  clientSecretDisplayPrefix,
} from "@repo/platform-contracts/credentials"
import type { z } from "zod"
import {
  type AuthContext,
  type ConsoleContext,
  deps,
  steppedUpUntil,
} from "./context"
import type {
  AccountRecord,
  ApiKeyRow,
  AppRecord,
  ClientSecretRow,
  EnvironmentRecord,
  InvitationRecord,
  MemberRecord,
  OrganizationMembershipRecord,
  PasskeyRecord,
  QuotaOverrideRow,
  ReviewRecord,
  SessionRecord,
} from "./store/console-store"

/** Validates a response body against its contract schema, then sends it. */
export function respond<Schema extends z.ZodType>(
  c: ConsoleContext,
  schema: Schema,
  body: z.input<Schema>,
  status: 200 | 201 = 200,
): Response {
  return c.json(schema.parse(body), status, { "Cache-Control": "no-store" })
}

export function toAccount(account: AccountRecord): DeveloperAccount {
  return {
    id: account.id,
    email: account.email,
    emailVerifiedAt: account.emailVerifiedAt,
    displayName: account.displayName,
    createdAt: account.createdAt,
  }
}

export function toPasskey(passkey: PasskeyRecord) {
  return {
    id: passkey.id,
    name: passkey.name,
    deviceType: passkey.deviceType,
    backedUp: passkey.backedUp,
    transports: passkey.transports,
    createdAt: passkey.createdAt,
    lastUsedAt: passkey.lastUsedAt,
  }
}

export function toConsoleSession(session: SessionRecord, currentId: string) {
  return {
    id: session.id,
    createdAt: session.createdAt,
    lastSeenAt: session.lastSeenAt,
    expiresAt: session.expiresAt,
    userAgent: session.userAgent,
    ipPrefix: session.ipPrefix,
    current: session.id === currentId,
  }
}

export function toOrganization(
  organization: OrganizationMembershipRecord,
): Organization {
  return {
    id: organization.id,
    name: organization.name,
    slug: organization.slug,
    role: organization.role,
    createdAt: organization.createdAt,
  }
}

export function toMember(member: MemberRecord): Member {
  return {
    accountId: member.accountId,
    email: member.email,
    displayName: member.displayName,
    role: member.role,
    createdAt: member.createdAt,
  }
}

export function toInvitation(invitation: InvitationRecord): Invitation {
  return {
    id: invitation.id,
    email: invitation.email,
    role: invitation.role,
    invitedBy: invitation.invitedBy,
    createdAt: invitation.createdAt,
    expiresAt: invitation.expiresAt,
    acceptedAt: invitation.acceptedAt,
    revokedAt: invitation.revokedAt,
  }
}

export function toEnvironmentSummary(
  environment: EnvironmentRecord,
): EnvironmentSummary {
  return {
    id: environment.id,
    kind: environment.kind,
    network: environment.network,
    clientId: environment.clientId,
    reviewState: environment.reviewState,
    approvedScopes: environment.approvedScopes,
  }
}

export function toApp(app: AppRecord, environments: EnvironmentRecord[]): App {
  return {
    id: app.id,
    organizationId: app.organizationId,
    name: app.name,
    slug: app.slug,
    description: app.description,
    logoUrl: app.logoUrl,
    websiteUrl: app.websiteUrl,
    privacyUrl: app.privacyUrl,
    termsUrl: app.termsUrl,
    supportEmail: app.supportEmail,
    status: app.status,
    environments: environments
      .filter((environment) => environment.appId === app.id)
      .sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "test" ? -1 : 1))
      .map(toEnvironmentSummary),
    createdAt: app.createdAt,
    updatedAt: app.updatedAt,
  }
}

export function toReview(review: ReviewRecord): Review {
  return {
    id: review.id,
    environmentId: review.environmentId,
    requestedScopes: review.requestedScopes,
    state: review.state,
    submitterId: review.submitterId,
    submitterNote: review.submitterNote,
    reviewerId: review.reviewerId,
    reviewerNote: review.reviewerNote,
    createdAt: review.createdAt,
    decidedAt: review.decidedAt,
  }
}

/** Loads redirect URIs, origins and the open review for the response. */
export async function loadEnvironment(
  c: ConsoleContext,
  environment: EnvironmentRecord,
): Promise<Environment> {
  const { store } = deps(c)
  const [redirectUris, origins, openReview] = await Promise.all([
    store.listRedirectUris(environment.id),
    store.listOrigins(environment.id),
    store.getOpenReview(environment.id),
  ])
  return {
    id: environment.id,
    appId: environment.appId,
    kind: environment.kind,
    network: environment.network,
    clientId: environment.clientId,
    clientType: environment.clientType,
    reviewState: environment.reviewState,
    requestedScopes: environment.requestedScopes,
    approvedScopes: environment.approvedScopes,
    scopeVersion: environment.scopeVersion,
    redirectUris,
    origins,
    openReview: openReview === null ? null : toReview(openReview),
    createdAt: environment.createdAt,
    updatedAt: environment.updatedAt,
  }
}

export function toApiKey(
  key: ApiKeyRow,
  environment: Pick<EnvironmentRecord, "kind">,
  now: Date,
): ApiKeyRecord {
  return {
    id: key.id,
    environmentId: key.environmentId,
    kind: key.kind,
    name: key.name,
    displayPrefix: apiKeyDisplayPrefix({
      kind: key.kind,
      environmentKind: environment.kind,
      prefix: key.prefix,
    }),
    allowedCidrs: key.allowedCidrs,
    status: credentialStatus(key, now),
    createdBy: key.createdBy,
    createdAt: key.createdAt,
    expiresAt: key.expiresAt,
    lastUsedAt: key.lastUsedAt,
    revokedAt: key.revokedAt,
    rotatedFrom: key.rotatedFrom,
  }
}

export function toClientSecret(
  secret: ClientSecretRow,
  now: Date,
): ClientSecretRecord {
  return {
    id: secret.id,
    environmentId: secret.environmentId,
    displayPrefix: clientSecretDisplayPrefix(secret.prefix),
    status: credentialStatus(secret, now),
    createdBy: secret.createdBy,
    createdAt: secret.createdAt,
    expiresAt: secret.expiresAt,
    revokedAt: secret.revokedAt,
  }
}

export function toQuotaOverride(row: QuotaOverrideRow): QuotaOverrideRecord {
  return {
    id: row.id,
    environmentId: row.environmentId,
    endpointClass: row.endpointClass,
    perMinute: row.perMinute,
    perDay: row.perDay,
    reason: row.reason,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
  }
}

export async function buildMe(
  c: ConsoleContext,
  auth: AuthContext,
): Promise<MeResponse> {
  const { store, now } = deps(c)
  const [organizations, staffRole] = await Promise.all([
    store.listOrganizationsForAccount(auth.account.id),
    store.getStaffRole(auth.account.id),
  ])
  return {
    account: toAccount(auth.account),
    organizations: organizations.map((organization) => ({
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      role: organization.role,
    })),
    staffRole,
    session: {
      id: auth.session.id,
      expiresAt: auth.session.expiresAt,
      steppedUpUntil: steppedUpUntil(auth.session, now()),
    },
  }
}
