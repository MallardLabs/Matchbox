import type {
  AuditEvent,
  AuditEventInput,
} from "@repo/platform-contracts/audit"
import { auditEventInputSchema } from "@repo/platform-contracts/audit"
import { grantRevokedReasonSchema } from "@repo/platform-contracts/identity"
import { oidcScopeSchema } from "@repo/platform-contracts/scopes"
import type { OidcScope } from "@repo/platform-contracts/scopes"
import {
  type AccountRecord,
  type AdminReviewRecord,
  type ApiKeyRow,
  type AppRecord,
  type ClientSecretRow,
  type ConsoleStore,
  type EmailChallengeRecord,
  type EnvironmentRecord,
  type InvitationRecord,
  type MembershipRecord,
  type OAuthStatsRecord,
  type OrganizationRecord,
  type PasskeyRecord,
  type QuotaOverrideRow,
  type ReviewRecord,
  type SessionRecord,
  StoreConflictError,
  type WebauthnChallengeRecord,
} from "./console-store"

/** A grant row as the memory store keeps it (for OAuth stats only). */
export type MemoryGrant = {
  id: string
  environmentId: string
  scopes: OidcScope[]
  createdAt: string
  revokedAt: string | null
  revokedReason: string | null
}

/** A Matchbox ID refresh or access token row (for revocation tests). */
export type MemoryOAuthToken = {
  id: string
  kind: "refresh" | "access"
  grantId: string
  familyId: string | null
  expiresAt: string
  revokedAt: string | null
}

export type MemoryConsoleStore = ConsoleStore & {
  /** Test/seed helpers that have no production equivalent. */
  seedStaff(accountId: string, role: "reviewer" | "operator"): void
  /** Returns the new grant id. */
  seedGrant(grant: Omit<MemoryGrant, "id">): string
  seedOAuthToken(token: Omit<MemoryOAuthToken, "id" | "revokedAt">): string
  oauthTokens(): MemoryOAuthToken[]
  auditEvents(): AuditEvent[]
  emailChallenges(): EmailChallengeRecord[]
  sessions(): SessionRecord[]
}

function missing(entity: string): Error {
  return new Error(`${entity} not found`)
}

function copy<Value>(value: Value): Value {
  return structuredClone(value)
}

/** In-memory `ConsoleStore` for tests and `PLATFORM_STORE=memory`. */
export default function createMemoryStore(
  now: () => Date = () => new Date(),
): MemoryConsoleStore {
  const accounts = new Map<string, AccountRecord>()
  const staff = new Map<string, "reviewer" | "operator">()
  const passkeys = new Map<string, PasskeyRecord>()
  const emailChallenges = new Map<string, EmailChallengeRecord>()
  const webauthnChallenges = new Map<string, WebauthnChallengeRecord>()
  const sessions = new Map<string, SessionRecord>()
  const organizations = new Map<string, OrganizationRecord>()
  const memberships: MembershipRecord[] = []
  const invitations = new Map<string, InvitationRecord>()
  const apps = new Map<string, AppRecord>()
  const environments = new Map<string, EnvironmentRecord>()
  const redirectUris = new Map<string, string[]>()
  const origins = new Map<string, string[]>()
  const reviews = new Map<string, ReviewRecord>()
  const apiKeys = new Map<string, ApiKeyRow>()
  const clientSecrets = new Map<string, ClientSecretRow>()
  const quotaOverrides = new Map<string, QuotaOverrideRow>()
  const grants: MemoryGrant[] = []
  const oauthTokens: MemoryOAuthToken[] = []
  const audit: AuditEvent[] = []

  function timestamp(): string {
    return now().toISOString()
  }

  function adminReview(review: ReviewRecord): AdminReviewRecord | null {
    const environment = environments.get(review.environmentId)
    const app =
      environment === undefined ? undefined : apps.get(environment.appId)
    const organization =
      app === undefined ? undefined : organizations.get(app.organizationId)
    if (
      environment === undefined ||
      app === undefined ||
      organization === undefined
    ) {
      return null
    }
    const submitter =
      review.submitterId === null ? undefined : accounts.get(review.submitterId)
    return copy({
      review,
      environment,
      app,
      organization,
      submitterEmail: submitter?.email ?? null,
    })
  }

  function deleteEnvironmentCascade(environmentId: string): void {
    environments.delete(environmentId)
    redirectUris.delete(environmentId)
    origins.delete(environmentId)
    for (const [id, review] of reviews) {
      if (review.environmentId === environmentId) reviews.delete(id)
    }
    for (const [id, key] of apiKeys) {
      if (key.environmentId === environmentId) apiKeys.delete(id)
    }
    for (const [id, secret] of clientSecrets) {
      if (secret.environmentId === environmentId) clientSecrets.delete(id)
    }
    for (const [id, override] of quotaOverrides) {
      if (override.environmentId === environmentId) quotaOverrides.delete(id)
    }
  }

  const store: MemoryConsoleStore = {
    async getAccount(id) {
      const account = accounts.get(id)
      return account === undefined ? null : copy(account)
    },
    async findAccountByEmail(email) {
      for (const account of accounts.values()) {
        if (account.email === email) return copy(account)
      }
      return null
    },
    async createAccount(input) {
      if (await store.findAccountByEmail(input.email)) {
        throw new StoreConflictError("Account email already exists")
      }
      const account: AccountRecord = {
        id: crypto.randomUUID(),
        email: input.email,
        emailVerifiedAt: input.emailVerifiedAt,
        displayName: input.displayName,
        createdAt: timestamp(),
        disabledAt: null,
      }
      accounts.set(account.id, account)
      return copy(account)
    },
    async updateAccount(id, patch) {
      const account = accounts.get(id)
      if (account === undefined) throw missing("Account")
      if (patch.displayName !== undefined) {
        account.displayName = patch.displayName
      }
      if (patch.emailVerifiedAt !== undefined) {
        account.emailVerifiedAt = patch.emailVerifiedAt
      }
      return copy(account)
    },
    async getStaffRole(accountId) {
      return staff.get(accountId) ?? null
    },

    async listPasskeys(accountId) {
      return copy(
        [...passkeys.values()]
          .filter((passkey) => passkey.accountId === accountId)
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
      )
    },
    async findPasskeyByCredentialId(credentialId) {
      for (const passkey of passkeys.values()) {
        if (passkey.credentialId === credentialId) return copy(passkey)
      }
      return null
    },
    async createPasskey(input) {
      if (await store.findPasskeyByCredentialId(input.credentialId)) {
        throw new StoreConflictError("Credential already registered")
      }
      const passkey: PasskeyRecord = {
        ...copy(input),
        id: crypto.randomUUID(),
        createdAt: timestamp(),
        stepUpBlockedUntil: input.stepUpBlockedUntil ?? null,
      }
      passkeys.set(passkey.id, passkey)
      return copy(passkey)
    },
    async updatePasskey(id, patch) {
      const passkey = passkeys.get(id)
      if (passkey === undefined) throw missing("Passkey")
      if (patch.name !== undefined) passkey.name = patch.name
      if (patch.counter !== undefined) passkey.counter = patch.counter
      if (patch.backedUp !== undefined) passkey.backedUp = patch.backedUp
      if (patch.lastUsedAt !== undefined) passkey.lastUsedAt = patch.lastUsedAt
    },
    async deletePasskey(id) {
      passkeys.delete(id)
    },

    async createEmailChallenge(input) {
      const challenge: EmailChallengeRecord = {
        ...input,
        attempts: 0,
        consumedAt: null,
      }
      emailChallenges.set(challenge.id, challenge)
      return copy(challenge)
    },
    async getEmailChallenge(id) {
      const challenge = emailChallenges.get(id)
      return challenge === undefined ? null : copy(challenge)
    },
    async incrementEmailChallengeAttempts(id) {
      const challenge = emailChallenges.get(id)
      if (challenge === undefined) throw missing("Email challenge")
      challenge.attempts += 1
      return challenge.attempts
    },
    async consumeEmailChallenge(id, at) {
      const challenge = emailChallenges.get(id)
      if (
        challenge === undefined ||
        challenge.consumedAt !== null ||
        Date.parse(challenge.expiresAt) <= Date.parse(at)
      ) {
        return false
      }
      challenge.consumedAt = at
      return true
    },
    async createWebauthnChallenge(input) {
      const challenge: WebauthnChallengeRecord = {
        ...input,
        id: crypto.randomUUID(),
        consumedAt: null,
      }
      webauthnChallenges.set(challenge.id, challenge)
      return copy(challenge)
    },
    async consumeWebauthnChallenge(id, at) {
      const challenge = webauthnChallenges.get(id)
      if (
        challenge === undefined ||
        challenge.consumedAt !== null ||
        Date.parse(challenge.expiresAt) <= Date.parse(at)
      ) {
        return null
      }
      challenge.consumedAt = at
      return copy(challenge)
    },

    async createSession(input) {
      const session: SessionRecord = {
        ...input,
        id: crypto.randomUUID(),
        lastSeenAt: input.createdAt,
        revokedAt: null,
      }
      sessions.set(session.id, session)
      return copy(session)
    },
    async findSessionByTokenHash(tokenHash) {
      for (const session of sessions.values()) {
        if (session.tokenHash === tokenHash) return copy(session)
      }
      return null
    },
    async listSessions(accountId) {
      return copy(
        [...sessions.values()]
          .filter((session) => session.accountId === accountId)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      )
    },
    async updateSession(id, patch) {
      const session = sessions.get(id)
      if (session === undefined) throw missing("Session")
      Object.assign(session, patch)
    },
    async revokeOtherSessions(accountId, exceptSessionId, at) {
      let revoked = 0
      for (const session of sessions.values()) {
        if (
          session.accountId !== accountId ||
          session.id === exceptSessionId ||
          session.revokedAt !== null ||
          Date.parse(session.expiresAt) <= Date.parse(at)
        ) {
          continue
        }
        session.revokedAt = at
        revoked += 1
      }
      return revoked
    },

    async listOrganizationsForAccount(accountId) {
      return copy(
        memberships
          .filter((membership) => membership.accountId === accountId)
          .flatMap((membership) => {
            const organization = organizations.get(membership.organizationId)
            return organization === undefined
              ? []
              : [{ ...organization, role: membership.role }]
          })
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
      )
    },
    async getOrganization(id) {
      const organization = organizations.get(id)
      return organization === undefined ? null : copy(organization)
    },
    async findOrganizationBySlug(slug) {
      for (const organization of organizations.values()) {
        if (organization.slug === slug) return copy(organization)
      }
      return null
    },
    async createOrganization(input) {
      if (await store.findOrganizationBySlug(input.slug)) {
        throw new StoreConflictError("Organization slug already exists")
      }
      const organization: OrganizationRecord = {
        id: crypto.randomUUID(),
        name: input.name,
        slug: input.slug,
        createdAt: timestamp(),
      }
      organizations.set(organization.id, organization)
      memberships.push({
        organizationId: organization.id,
        accountId: input.ownerId,
        role: "owner",
        createdAt: organization.createdAt,
      })
      return copy(organization)
    },
    async updateOrganization(id, patch) {
      const organization = organizations.get(id)
      if (organization === undefined) throw missing("Organization")
      if (patch.slug !== undefined && patch.slug !== organization.slug) {
        if (await store.findOrganizationBySlug(patch.slug)) {
          throw new StoreConflictError("Organization slug already exists")
        }
        organization.slug = patch.slug
      }
      if (patch.name !== undefined) organization.name = patch.name
      return copy(organization)
    },
    async deleteOrganization(id) {
      organizations.delete(id)
      for (let index = memberships.length - 1; index >= 0; index--) {
        if (memberships[index]?.organizationId === id) {
          memberships.splice(index, 1)
        }
      }
      for (const [invitationId, invitation] of invitations) {
        if (invitation.organizationId === id) invitations.delete(invitationId)
      }
      for (const [appId, app] of apps) {
        if (app.organizationId !== id) continue
        apps.delete(appId)
        for (const environment of [...environments.values()]) {
          if (environment.appId === appId) {
            deleteEnvironmentCascade(environment.id)
          }
        }
      }
    },
    async organizationHasVerifiedOwner(organizationId) {
      return memberships.some(
        (membership) =>
          membership.organizationId === organizationId &&
          membership.role === "owner" &&
          (accounts.get(membership.accountId)?.emailVerifiedAt ?? null) !==
            null,
      )
    },

    async getMembership(organizationId, accountId) {
      const membership = memberships.find(
        (candidate) =>
          candidate.organizationId === organizationId &&
          candidate.accountId === accountId,
      )
      return membership === undefined ? null : copy(membership)
    },
    async listMembers(organizationId) {
      return copy(
        memberships
          .filter((membership) => membership.organizationId === organizationId)
          .flatMap((membership) => {
            const account = accounts.get(membership.accountId)
            return account === undefined
              ? []
              : [
                  {
                    ...membership,
                    email: account.email,
                    displayName: account.displayName,
                    emailVerifiedAt: account.emailVerifiedAt,
                  },
                ]
          })
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
      )
    },
    async addMember(input) {
      if (await store.getMembership(input.organizationId, input.accountId)) {
        throw new StoreConflictError("Membership already exists")
      }
      const membership: MembershipRecord = { ...input, createdAt: timestamp() }
      memberships.push(membership)
      return copy(membership)
    },
    async updateMemberRole(organizationId, accountId, role) {
      const membership = memberships.find(
        (candidate) =>
          candidate.organizationId === organizationId &&
          candidate.accountId === accountId,
      )
      if (membership === undefined) throw missing("Membership")
      membership.role = role
    },
    async removeMember(organizationId, accountId) {
      const index = memberships.findIndex(
        (candidate) =>
          candidate.organizationId === organizationId &&
          candidate.accountId === accountId,
      )
      if (index >= 0) memberships.splice(index, 1)
    },
    async listInvitations(organizationId) {
      return copy(
        [...invitations.values()]
          .filter((invitation) => invitation.organizationId === organizationId)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      )
    },
    async getInvitation(id) {
      const invitation = invitations.get(id)
      return invitation === undefined ? null : copy(invitation)
    },
    async findInvitationByTokenHash(tokenHash) {
      for (const invitation of invitations.values()) {
        if (invitation.tokenHash === tokenHash) return copy(invitation)
      }
      return null
    },
    async createInvitation(input) {
      const invitation: InvitationRecord = {
        ...input,
        id: crypto.randomUUID(),
        acceptedAt: null,
        revokedAt: null,
      }
      invitations.set(invitation.id, invitation)
      return copy(invitation)
    },
    async updateInvitation(id, patch) {
      const invitation = invitations.get(id)
      if (invitation === undefined) throw missing("Invitation")
      Object.assign(invitation, patch)
    },

    async listApps(organizationId) {
      return copy(
        [...apps.values()]
          .filter((app) => app.organizationId === organizationId)
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
      )
    },
    async getApp(id) {
      const app = apps.get(id)
      return app === undefined ? null : copy(app)
    },
    async findAppBySlug(organizationId, slug) {
      for (const app of apps.values()) {
        if (app.organizationId === organizationId && app.slug === slug) {
          return copy(app)
        }
      }
      return null
    },
    async createApp(input) {
      if (await store.findAppBySlug(input.organizationId, input.slug)) {
        throw new StoreConflictError("App slug already exists")
      }
      const at = timestamp()
      const app: AppRecord = {
        ...input,
        id: crypto.randomUUID(),
        status: "active",
        createdAt: at,
        updatedAt: at,
      }
      apps.set(app.id, app)
      return copy(app)
    },
    async updateApp(id, patch) {
      const app = apps.get(id)
      if (app === undefined) throw missing("App")
      if (patch.slug !== undefined && patch.slug !== app.slug) {
        if (await store.findAppBySlug(app.organizationId, patch.slug)) {
          throw new StoreConflictError("App slug already exists")
        }
      }
      Object.assign(app, patch, { updatedAt: timestamp() })
      return copy(app)
    },
    async listAdminApps(input) {
      const query = input.query?.toLowerCase()
      const matching = [...apps.values()]
        .filter(
          (app) =>
            (input.status === undefined || app.status === input.status) &&
            (query === undefined ||
              query.length === 0 ||
              app.name.toLowerCase().includes(query) ||
              app.slug.includes(query)),
        )
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      const page = matching.slice(input.offset, input.offset + input.limit)
      return {
        items: copy(
          page.flatMap((app) => {
            const organization = organizations.get(app.organizationId)
            return organization === undefined ? [] : [{ app, organization }]
          }),
        ),
        hasMore: matching.length > input.offset + input.limit,
      }
    },
    async listEnvironmentsForApps(appIds) {
      const wanted = new Set(appIds)
      return copy(
        [...environments.values()]
          .filter((environment) => wanted.has(environment.appId))
          .sort((a, b) => a.kind.localeCompare(b.kind) * -1),
      )
    },
    async getEnvironment(id) {
      const environment = environments.get(id)
      return environment === undefined ? null : copy(environment)
    },
    async getEnvironmentByKind(appId, kind) {
      for (const environment of environments.values()) {
        if (environment.appId === appId && environment.kind === kind) {
          return copy(environment)
        }
      }
      return null
    },
    async createEnvironment(input) {
      if (await store.getEnvironmentByKind(input.appId, input.kind)) {
        throw new StoreConflictError("Environment already exists")
      }
      const at = timestamp()
      const id = crypto.randomUUID()
      const environment: EnvironmentRecord = {
        ...input,
        id,
        reviewState: "development",
        requestedScopes: [],
        approvedScopes: [],
        scopeVersion: 1,
        sectorId: id,
        createdAt: at,
        updatedAt: at,
      }
      environments.set(id, environment)
      return copy(environment)
    },
    async updateEnvironment(id, patch) {
      const environment = environments.get(id)
      if (environment === undefined) throw missing("Environment")
      Object.assign(environment, copy(patch), { updatedAt: timestamp() })
      return copy(environment)
    },
    async listRedirectUris(environmentId) {
      return copy(redirectUris.get(environmentId) ?? [])
    },
    async replaceRedirectUris(environmentId, uris) {
      redirectUris.set(environmentId, [...uris])
    },
    async listOrigins(environmentId) {
      return copy(origins.get(environmentId) ?? [])
    },
    async replaceOrigins(environmentId, values) {
      origins.set(environmentId, [...values])
    },
    async revokeEnvironmentTokens(environmentId, reason) {
      const environment = environments.get(environmentId)
      if (environment === undefined) throw missing("Environment")
      const at = timestamp()
      environment.scopeVersion += 1
      environment.updatedAt = at
      const grantIds = new Set(
        grants
          .filter((grant) => grant.environmentId === environmentId)
          .map((grant) => grant.id),
      )
      const active = (token: MemoryOAuthToken) =>
        grantIds.has(token.grantId) &&
        token.revokedAt === null &&
        Date.parse(token.expiresAt) > Date.parse(at)
      const families = new Set(
        oauthTokens
          .filter((token) => token.kind === "refresh" && active(token))
          .map((token) => token.familyId),
      )
      let accessTokensRevoked = 0
      for (const token of oauthTokens) {
        if (token.revokedAt !== null) continue
        if (token.kind === "refresh" && families.has(token.familyId)) {
          token.revokedAt = at
        } else if (token.kind === "access" && active(token)) {
          token.revokedAt = at
          accessTokensRevoked += 1
        }
      }
      const result = {
        refreshTokenFamiliesRevoked: families.size,
        accessTokensRevoked,
        scopeVersion: environment.scopeVersion,
      }
      await store.recordAudit({
        actorType: "system",
        actorId: null,
        organizationId: apps.get(environment.appId)?.organizationId ?? null,
        appId: environment.appId,
        environmentId,
        action: "oauth-tokens-revoked",
        targetType: "environment",
        targetId: environmentId,
        metadata: { reason, ...result },
      })
      return result
    },

    async getReview(id) {
      const review = reviews.get(id)
      return review === undefined ? null : copy(review)
    },
    async getOpenReview(environmentId) {
      for (const review of reviews.values()) {
        if (review.environmentId === environmentId && review.state === "open") {
          return copy(review)
        }
      }
      return null
    },
    async createReview(input) {
      if (
        input.state === "open" &&
        (await store.getOpenReview(input.environmentId)) !== null
      ) {
        throw new StoreConflictError("An open review already exists")
      }
      const review: ReviewRecord = {
        ...copy(input),
        id: crypto.randomUUID(),
        createdAt: input.createdAt ?? timestamp(),
      }
      reviews.set(review.id, review)
      return copy(review)
    },
    async updateReview(id, patch) {
      const review = reviews.get(id)
      if (review === undefined) throw missing("Review")
      Object.assign(review, patch)
      return copy(review)
    },
    async getAdminReview(id) {
      const review = reviews.get(id)
      return review === undefined ? null : adminReview(review)
    },
    async listAdminReviews(input) {
      const matching = [...reviews.values()]
        .filter((review) => review.state === input.state)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      const page = matching.slice(input.offset, input.offset + input.limit)
      return {
        items: page.flatMap((review) => {
          const record = adminReview(review)
          return record === null ? [] : [record]
        }),
        hasMore: matching.length > input.offset + input.limit,
      }
    },

    async listApiKeys(environmentId) {
      return copy(
        [...apiKeys.values()]
          .filter((key) => key.environmentId === environmentId)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      )
    },
    async getApiKey(id) {
      const key = apiKeys.get(id)
      return key === undefined ? null : copy(key)
    },
    async createApiKey(input) {
      const key: ApiKeyRow = {
        ...copy(input),
        id: crypto.randomUUID(),
        createdAt: timestamp(),
        lastUsedAt: null,
        revokedAt: null,
      }
      apiKeys.set(key.id, key)
      return copy(key)
    },
    async updateApiKey(id, patch) {
      const key = apiKeys.get(id)
      if (key === undefined) throw missing("API key")
      Object.assign(key, copy(patch))
      return copy(key)
    },
    async listClientSecrets(environmentId) {
      return copy(
        [...clientSecrets.values()]
          .filter((secret) => secret.environmentId === environmentId)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      )
    },
    async getClientSecret(id) {
      const secret = clientSecrets.get(id)
      return secret === undefined ? null : copy(secret)
    },
    async createClientSecret(input) {
      const secret: ClientSecretRow = {
        ...input,
        id: crypto.randomUUID(),
        createdAt: timestamp(),
        revokedAt: null,
      }
      clientSecrets.set(secret.id, secret)
      return copy(secret)
    },
    async revokeClientSecret(id, at) {
      const secret = clientSecrets.get(id)
      if (secret === undefined) throw missing("Client secret")
      secret.revokedAt = at
      return copy(secret)
    },

    async listQuotaOverrides(environmentId) {
      return copy(
        [...quotaOverrides.values()]
          .filter((override) => override.environmentId === environmentId)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      )
    },
    async getQuotaOverride(id) {
      const override = quotaOverrides.get(id)
      return override === undefined ? null : copy(override)
    },
    async createQuotaOverride(input) {
      const override: QuotaOverrideRow = {
        ...input,
        id: crypto.randomUUID(),
        createdAt: timestamp(),
      }
      quotaOverrides.set(override.id, override)
      return copy(override)
    },
    async expireQuotaOverride(id, at) {
      const override = quotaOverrides.get(id)
      if (override === undefined) throw missing("Quota override")
      override.expiresAt = at
    },

    async oauthStats(input) {
      const from = Date.parse(input.from)
      const to = Date.parse(input.to)
      const inRange = (value: string) => {
        const time = Date.parse(value)
        return time >= from && time < to
      }
      const environmentGrants = grants.filter(
        (grant) => grant.environmentId === input.environmentId,
      )
      const active = environmentGrants.filter(
        (grant) => grant.revokedAt === null,
      )
      const stats: OAuthStatsRecord = {
        activeGrants: active.length,
        grantsCreated: environmentGrants.filter((grant) =>
          inRange(grant.createdAt),
        ).length,
        revocationsByReason: {
          "user-revoked": 0,
          "app-suspended": 0,
          "discord-link-changed": 0,
          "scope-changed": 0,
          "account-disabled": 0,
        },
        activeGrantsByScope: {
          openid: 0,
          wallet: 0,
          "discord:id": 0,
          "discord:profile": 0,
        },
      }
      for (const grant of environmentGrants) {
        if (grant.revokedAt === null || !inRange(grant.revokedAt)) continue
        const reason = grantRevokedReasonSchema.safeParse(grant.revokedReason)
        if (reason.success) stats.revocationsByReason[reason.data] += 1
      }
      for (const grant of active) {
        for (const scope of oidcScopeSchema.options) {
          if (grant.scopes.includes(scope)) {
            stats.activeGrantsByScope[scope] += 1
          }
        }
      }
      return stats
    },

    async recordAudit(event: AuditEventInput) {
      const parsed = auditEventInputSchema.parse(event)
      audit.push({
        ...parsed,
        id: String(audit.length + 1),
        occurredAt: timestamp(),
      })
    },
    async searchAudit(filter) {
      const from = filter.from === undefined ? null : Date.parse(filter.from)
      const to = filter.to === undefined ? null : Date.parse(filter.to)
      const beforeId =
        filter.beforeId === undefined ? null : BigInt(filter.beforeId)
      return copy(
        [...audit]
          .reverse()
          .filter(
            (event) =>
              (filter.organizationId === undefined ||
                event.organizationId === filter.organizationId) &&
              (filter.appId === undefined || event.appId === filter.appId) &&
              (filter.environmentId === undefined ||
                event.environmentId === filter.environmentId) &&
              (filter.actorType === undefined ||
                event.actorType === filter.actorType) &&
              (filter.actorId === undefined ||
                event.actorId === filter.actorId) &&
              (filter.action === undefined || event.action === filter.action) &&
              (from === null || Date.parse(event.occurredAt) >= from) &&
              (to === null || Date.parse(event.occurredAt) < to) &&
              (beforeId === null || BigInt(event.id) < beforeId),
          )
          .slice(0, filter.limit),
      )
    },

    seedStaff(accountId, role) {
      staff.set(accountId, role)
    },
    seedGrant(grant) {
      const id = crypto.randomUUID()
      grants.push({ ...grant, id })
      return id
    },
    seedOAuthToken(token) {
      const id = crypto.randomUUID()
      oauthTokens.push({ ...token, id, revokedAt: null })
      return id
    },
    oauthTokens() {
      return copy(oauthTokens)
    },
    auditEvents() {
      return copy(audit)
    },
    emailChallenges() {
      return copy([...emailChallenges.values()])
    },
    sessions() {
      return copy([...sessions.values()])
    },
  }
  return store
}
