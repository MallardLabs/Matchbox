import type {
  AuditAction,
  AuditActorType,
  AuditEvent,
  AuditEventInput,
} from "@repo/platform-contracts/audit"
import type {
  AppStatus,
  ClientType,
  MembershipRole,
  ReviewRecordState,
  ReviewState,
  StaffRole,
} from "@repo/platform-contracts/console"
import type { ApiKeyKind } from "@repo/platform-contracts/credentials"
import type { GrantRevokedReason } from "@repo/platform-contracts/identity"
import type {
  EnvironmentKind,
  NetworkSlug,
} from "@repo/platform-contracts/network"
import type { EndpointClass } from "@repo/platform-contracts/rate-limits"
import type { OidcScope, PlatformScope } from "@repo/platform-contracts/scopes"

/**
 * Storage port for the developer console. Routes depend only on this type;
 * `supabase-store.ts` implements it against the `mbx_dev_*` tables and
 * `memory-store.ts` in memory (tests and `PLATFORM_STORE=memory`).
 *
 * All timestamps are ISO 8601 strings. Methods that "consume" single-use
 * rows are atomic: they only succeed for unconsumed, unexpired rows.
 */

/** Thrown by stores on unique-constraint races; routes answer 409. */
export class StoreConflictError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = "StoreConflictError"
  }
}

export type AccountRecord = {
  id: string
  email: string
  emailVerifiedAt: string | null
  /** Google `sub`; the sign-in identity. Null only for seeded accounts. */
  googleSub: string | null
  /** Google profile picture URL; refreshed at each sign-in. */
  avatarUrl: string | null
  displayName: string
  createdAt: string
  disabledAt: string | null
}

export type SessionRecord = {
  id: string
  accountId: string
  tokenHash: string
  createdAt: string
  expiresAt: string
  lastSeenAt: string | null
  revokedAt: string | null
  userAgent: string | null
  ipPrefix: string | null
  steppedUpAt: string | null
}

export type OrganizationRecord = {
  id: string
  name: string
  slug: string
  createdAt: string
}

export type OrganizationMembershipRecord = OrganizationRecord & {
  role: MembershipRole
}

export type MembershipRecord = {
  organizationId: string
  accountId: string
  role: MembershipRole
  createdAt: string
}

export type MemberRecord = MembershipRecord & {
  email: string
  displayName: string
  avatarUrl: string | null
  emailVerifiedAt: string | null
}

export type InvitationRecord = {
  id: string
  organizationId: string
  email: string
  role: MembershipRole
  tokenHash: string
  invitedBy: string | null
  createdAt: string
  expiresAt: string
  acceptedAt: string | null
  revokedAt: string | null
}

export type AppRecord = {
  id: string
  organizationId: string
  name: string
  slug: string
  description: string | null
  logoUrl: string | null
  websiteUrl: string | null
  privacyUrl: string | null
  termsUrl: string | null
  supportEmail: string | null
  status: AppStatus
  createdAt: string
  updatedAt: string
}

export type AppProfilePatch = {
  name?: string
  slug?: string
  description?: string | null
  logoUrl?: string | null
  websiteUrl?: string | null
  privacyUrl?: string | null
  termsUrl?: string | null
  supportEmail?: string | null
  status?: AppStatus
}

export type EnvironmentRecord = {
  id: string
  appId: string
  kind: EnvironmentKind
  network: NetworkSlug
  clientId: string
  clientType: ClientType
  reviewState: ReviewState
  requestedScopes: PlatformScope[]
  approvedScopes: PlatformScope[]
  /** Requested OIDC scopes users may decline at consent. */
  optionalScopes: OidcScope[]
  scopeVersion: number
  sectorId: string
  createdAt: string
  updatedAt: string
}

export type EnvironmentPatch = {
  clientType?: ClientType
  reviewState?: ReviewState
  requestedScopes?: PlatformScope[]
  approvedScopes?: PlatformScope[]
  /** Written in the same update as `requestedScopes` (DB subset CHECK). */
  optionalScopes?: OidcScope[]
  scopeVersion?: number
}

export type ReviewRecord = {
  id: string
  environmentId: string
  requestedScopes: PlatformScope[]
  state: ReviewRecordState
  submitterId: string | null
  submitterNote: string | null
  reviewerId: string | null
  reviewerNote: string | null
  createdAt: string
  decidedAt: string | null
}

export type AdminReviewRecord = {
  review: ReviewRecord
  environment: EnvironmentRecord
  app: AppRecord
  organization: OrganizationRecord
  submitterEmail: string | null
}

export type ApiKeyRow = {
  id: string
  environmentId: string
  kind: ApiKeyKind
  name: string
  prefix: string
  secretHash: string
  allowedCidrs: string[]
  createdBy: string | null
  createdAt: string
  expiresAt: string | null
  lastUsedAt: string | null
  revokedAt: string | null
  rotatedFrom: string | null
}

export type ClientSecretRow = {
  id: string
  environmentId: string
  secretHash: string
  prefix: string
  createdBy: string | null
  createdAt: string
  expiresAt: string | null
  revokedAt: string | null
}

export type QuotaOverrideRow = {
  id: string
  environmentId: string
  endpointClass: EndpointClass
  perMinute: number
  perDay: number
  reason: string
  createdBy: string | null
  createdAt: string
  expiresAt: string | null
}

export type AuditFilter = {
  organizationId?: string
  appId?: string
  environmentId?: string
  actorType?: AuditActorType
  actorId?: string
  action?: AuditAction
  from?: string
  to?: string
  /** Return events with a bigserial id strictly below this one. */
  beforeId?: string
  limit: number
}

/** Result of `revokeEnvironmentTokens` (Matchbox ID tokens of one env). */
export type EnvironmentTokenRevocation = {
  refreshTokenFamiliesRevoked: number
  accessTokensRevoked: number
  /** The environment's bumped `scope_version` (forces re-consent). */
  scopeVersion: number
}

export type EnvironmentTokenRevocationReason = "client-type-public"

export type OAuthStatsRecord = {
  activeGrants: number
  grantsCreated: number
  revocationsByReason: Record<GrantRevokedReason, number>
  activeGrantsByScope: Record<OidcScope, number>
  /** Active grants consented below the environment's scope version. */
  awaitingReconsent: { count: number; oldestScopeVersion: number | null }
}

/** A review with the app and environment it belongs to. */
export type OrganizationReviewRecord = {
  review: ReviewRecord
  app: AppRecord
  environment: EnvironmentRecord
}

/** Review fields `adminReviewStats` needs, plus the app name. */
export type ReviewStatsRecord = Pick<
  ReviewRecord,
  "id" | "state" | "reviewerId" | "createdAt" | "decidedAt"
> & { appName: string }

export type AdminAppRecord = {
  app: AppRecord
  organization: OrganizationRecord
}

export type Page<Item> = {
  items: Item[]
  hasMore: boolean
}

export type ConsoleStore = {
  // Accounts ---------------------------------------------------------------
  getAccount(id: string): Promise<AccountRecord | null>
  findAccountByEmail(email: string): Promise<AccountRecord | null>
  findAccountByGoogleSub(googleSub: string): Promise<AccountRecord | null>
  createAccount(input: {
    email: string
    displayName: string
    emailVerifiedAt: string | null
    googleSub?: string | null
    avatarUrl?: string | null
  }): Promise<AccountRecord>
  updateAccount(
    id: string,
    patch: {
      displayName?: string
      email?: string
      emailVerifiedAt?: string
      googleSub?: string
      avatarUrl?: string | null
    },
  ): Promise<AccountRecord>
  getStaffRole(accountId: string): Promise<StaffRole | null>
  /** Upserts the staff row; returns the role it held before (null = none). */
  setStaffRole(accountId: string, role: StaffRole): Promise<StaffRole | null>

  // Sessions ---------------------------------------------------------------
  createSession(
    input: Omit<SessionRecord, "id" | "revokedAt" | "lastSeenAt">,
  ): Promise<SessionRecord>
  findSessionByTokenHash(tokenHash: string): Promise<SessionRecord | null>
  listSessions(accountId: string): Promise<SessionRecord[]>
  updateSession(
    id: string,
    patch: {
      lastSeenAt?: string
      expiresAt?: string
      steppedUpAt?: string
      revokedAt?: string
    },
  ): Promise<void>
  /**
   * Revokes every active session of the account except `exceptSessionId`
   * (null = all). Returns how many were revoked.
   */
  revokeOtherSessions(
    accountId: string,
    exceptSessionId: string | null,
    at: string,
  ): Promise<number>

  // Organizations ----------------------------------------------------------
  listOrganizationsForAccount(
    accountId: string,
  ): Promise<OrganizationMembershipRecord[]>
  getOrganization(id: string): Promise<OrganizationRecord | null>
  findOrganizationBySlug(slug: string): Promise<OrganizationRecord | null>
  /** Creates the organization and the owner membership atomically. */
  createOrganization(input: {
    name: string
    slug: string
    ownerId: string
  }): Promise<OrganizationRecord>
  updateOrganization(
    id: string,
    patch: { name?: string; slug?: string },
  ): Promise<OrganizationRecord>
  deleteOrganization(id: string): Promise<void>
  /** True when any owner of the organization has a verified email. */
  organizationHasVerifiedOwner(organizationId: string): Promise<boolean>

  // Members + invitations -------------------------------------------------
  getMembership(
    organizationId: string,
    accountId: string,
  ): Promise<MembershipRecord | null>
  listMembers(organizationId: string): Promise<MemberRecord[]>
  addMember(input: {
    organizationId: string
    accountId: string
    role: MembershipRole
  }): Promise<MembershipRecord>
  updateMemberRole(
    organizationId: string,
    accountId: string,
    role: MembershipRole,
  ): Promise<void>
  removeMember(organizationId: string, accountId: string): Promise<void>
  listInvitations(organizationId: string): Promise<InvitationRecord[]>
  getInvitation(id: string): Promise<InvitationRecord | null>
  findInvitationByTokenHash(tokenHash: string): Promise<InvitationRecord | null>
  createInvitation(
    input: Omit<InvitationRecord, "id" | "acceptedAt" | "revokedAt">,
  ): Promise<InvitationRecord>
  updateInvitation(
    id: string,
    patch: { acceptedAt?: string; revokedAt?: string },
  ): Promise<void>

  // Apps + environments ----------------------------------------------------
  listApps(organizationId: string): Promise<AppRecord[]>
  getApp(id: string): Promise<AppRecord | null>
  findAppBySlug(organizationId: string, slug: string): Promise<AppRecord | null>
  createApp(
    input: Omit<AppRecord, "id" | "createdAt" | "updatedAt" | "status">,
  ): Promise<AppRecord>
  updateApp(id: string, patch: AppProfilePatch): Promise<AppRecord>
  listAdminApps(input: {
    query?: string
    status?: AppStatus
    offset: number
    limit: number
  }): Promise<Page<AdminAppRecord>>
  listEnvironmentsForApps(appIds: string[]): Promise<EnvironmentRecord[]>
  getEnvironment(id: string): Promise<EnvironmentRecord | null>
  getEnvironmentByKind(
    appId: string,
    kind: EnvironmentKind,
  ): Promise<EnvironmentRecord | null>
  createEnvironment(input: {
    appId: string
    kind: EnvironmentKind
    network: NetworkSlug
    clientId: string
    clientType: ClientType
  }): Promise<EnvironmentRecord>
  updateEnvironment(
    id: string,
    patch: EnvironmentPatch,
  ): Promise<EnvironmentRecord>
  listRedirectUris(environmentId: string): Promise<string[]>
  /** Atomically replaces the set (existing rows keep their order). */
  replaceRedirectUris(environmentId: string, uris: string[]): Promise<void>
  listOrigins(environmentId: string): Promise<string[]>
  /** Atomically replaces the set (existing rows keep their order). */
  replaceOrigins(environmentId: string, origins: string[]): Promise<void>
  /**
   * Atomically revokes the environment's active Matchbox ID refresh-token
   * families and access tokens, bumps its `scope_version` (users must
   * re-consent) and writes a `system` audit event.
   */
  revokeEnvironmentTokens(
    environmentId: string,
    reason: EnvironmentTokenRevocationReason,
  ): Promise<EnvironmentTokenRevocation>

  // Reviews ----------------------------------------------------------------
  getReview(id: string): Promise<ReviewRecord | null>
  getOpenReview(environmentId: string): Promise<ReviewRecord | null>
  createReview(
    input: Omit<ReviewRecord, "id" | "createdAt"> & { createdAt?: string },
  ): Promise<ReviewRecord>
  updateReview(
    id: string,
    patch: {
      state: ReviewRecordState
      reviewerId?: string | null
      reviewerNote?: string | null
      decidedAt: string
    },
  ): Promise<ReviewRecord>
  /** Every review of an environment, newest activity first. */
  listEnvironmentReviews(environmentId: string): Promise<ReviewRecord[]>
  /** Reviews across an organization's apps, newest activity first. */
  listOrganizationReviews(input: {
    organizationId: string
    state?: ReviewRecordState | undefined
    limit: number
  }): Promise<OrganizationReviewRecord[]>
  /** Open reviews plus those decided at or after `decidedSince`. */
  listReviewsForStats(input: {
    decidedSince: string
  }): Promise<ReviewStatsRecord[]>
  getAdminReview(id: string): Promise<AdminReviewRecord | null>
  listAdminReviews(input: {
    state: ReviewRecordState
    /** Only reviews requesting this scope. */
    scope?: PlatformScope | undefined
    offset: number
    limit: number
  }): Promise<Page<AdminReviewRecord>>

  // Credentials ------------------------------------------------------------
  listApiKeys(environmentId: string): Promise<ApiKeyRow[]>
  getApiKey(id: string): Promise<ApiKeyRow | null>
  createApiKey(
    input: Omit<ApiKeyRow, "id" | "createdAt" | "lastUsedAt" | "revokedAt">,
  ): Promise<ApiKeyRow>
  updateApiKey(
    id: string,
    patch: {
      name?: string
      allowedCidrs?: string[]
      expiresAt?: string | null
      revokedAt?: string
    },
  ): Promise<ApiKeyRow>
  listClientSecrets(environmentId: string): Promise<ClientSecretRow[]>
  getClientSecret(id: string): Promise<ClientSecretRow | null>
  createClientSecret(
    input: Omit<ClientSecretRow, "id" | "createdAt" | "revokedAt">,
  ): Promise<ClientSecretRow>
  revokeClientSecret(id: string, at: string): Promise<ClientSecretRow>

  // Quota overrides --------------------------------------------------------
  listQuotaOverrides(environmentId: string): Promise<QuotaOverrideRow[]>
  getQuotaOverride(id: string): Promise<QuotaOverrideRow | null>
  createQuotaOverride(
    input: Omit<QuotaOverrideRow, "id" | "createdAt">,
  ): Promise<QuotaOverrideRow>
  expireQuotaOverride(id: string, at: string): Promise<void>

  // OAuth stats (mbx_id_grants) ---------------------------------------------
  oauthStats(input: {
    environmentId: string
    from: string
    to: string
    /** The environment's current scope version (re-consent count). */
    scopeVersion: number
  }): Promise<OAuthStatsRecord>

  // Audit ------------------------------------------------------------------
  recordAudit(event: AuditEventInput): Promise<void>
  searchAudit(filter: AuditFilter): Promise<AuditEvent[]>
}
