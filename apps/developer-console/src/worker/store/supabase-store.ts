import {
  auditActionSchema,
  auditActorTypeSchema,
  auditMetadataSchema,
} from "@repo/platform-contracts/audit"
import {
  appStatusSchema,
  clientTypeSchema,
  emailChallengePurposeSchema,
  membershipRoleSchema,
  passkeyDeviceTypeSchema,
  reviewRecordStateSchema,
  reviewStateSchema,
  staffRoleSchema,
  webauthnChallengePurposeSchema,
} from "@repo/platform-contracts/console"
import { authenticatorTransportSchema } from "@repo/platform-contracts/console"
import { apiKeyKindSchema } from "@repo/platform-contracts/credentials"
import { grantRevokedReasonSchema } from "@repo/platform-contracts/identity"
import {
  environmentKindSchema,
  networkSlugSchema,
} from "@repo/platform-contracts/network"
import { endpointClassSchema } from "@repo/platform-contracts/rate-limits"
import {
  oidcScopeSchema,
  platformScopeSchema,
} from "@repo/platform-contracts/scopes"
import {
  auditTable,
  recordAudit as insertAuditEvent,
} from "@repo/platform-server"
import type { SupabaseClient } from "@supabase/supabase-js"
import { z } from "zod"
import {
  type AdminReviewRecord,
  type AppProfilePatch,
  type ConsoleStore,
  type EnvironmentPatch,
  type OAuthStatsRecord,
  StoreConflictError,
} from "./console-store"

/** `ConsoleStore` over the `mbx_dev_*` tables (service role). */

type PostgrestError = { code?: string; message: string } | null

class StoreQueryError extends Error {
  constructor(context: string, cause: unknown) {
    super(`Supabase query failed: ${context}`, { cause })
    this.name = "StoreQueryError"
  }
}

function fail(context: string, error: PostgrestError): never {
  if (error?.code === "23505") {
    throw new StoreConflictError(`Unique constraint: ${context}`, {
      cause: error,
    })
  }
  throw new StoreQueryError(context, error)
}

const timestampSchema = z.string().transform((value, context) => {
  const time = Date.parse(value)
  if (Number.isNaN(time)) {
    context.addIssue({ code: "custom", message: "Invalid timestamp" })
    return z.NEVER
  }
  return new Date(time).toISOString()
})

const nullableTimestamp = timestampSchema.nullable()

const accountRow = z
  .object({
    id: z.string(),
    email: z.string(),
    email_verified_at: nullableTimestamp,
    display_name: z.string(),
    created_at: timestampSchema,
    disabled_at: nullableTimestamp,
  })
  .transform((row) => ({
    id: row.id,
    email: row.email,
    emailVerifiedAt: row.email_verified_at,
    displayName: row.display_name,
    createdAt: row.created_at,
    disabledAt: row.disabled_at,
  }))

const passkeyRow = z
  .object({
    id: z.string(),
    account_id: z.string(),
    credential_id: z.string(),
    public_key: z.string(),
    counter: z.coerce.number().int().nonnegative(),
    transports: z.array(authenticatorTransportSchema),
    device_type: passkeyDeviceTypeSchema,
    backed_up: z.boolean(),
    name: z.string().nullable(),
    created_at: timestampSchema,
    last_used_at: nullableTimestamp,
    // Added by 20260930000002; absent until that migration is applied.
    step_up_blocked_until: nullableTimestamp.default(null),
  })
  .transform((row) => ({
    id: row.id,
    accountId: row.account_id,
    credentialId: row.credential_id,
    publicKey: row.public_key,
    counter: row.counter,
    transports: row.transports,
    deviceType: row.device_type,
    backedUp: row.backed_up,
    name: row.name,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
    stepUpBlockedUntil: row.step_up_blocked_until,
  }))

const emailChallengeRow = z
  .object({
    id: z.string(),
    email: z.string(),
    purpose: emailChallengePurposeSchema,
    code_hash: z.string(),
    attempts: z.number().int(),
    expires_at: timestampSchema,
    consumed_at: nullableTimestamp,
    created_at: timestampSchema,
  })
  .transform((row) => ({
    id: row.id,
    email: row.email,
    purpose: row.purpose,
    codeHash: row.code_hash,
    attempts: row.attempts,
    expiresAt: row.expires_at,
    consumedAt: row.consumed_at,
    createdAt: row.created_at,
  }))

const webauthnChallengeRow = z
  .object({
    id: z.string(),
    challenge: z.string(),
    purpose: webauthnChallengePurposeSchema,
    account_id: z.string().nullable(),
    expires_at: timestampSchema,
    consumed_at: nullableTimestamp,
    created_at: timestampSchema,
  })
  .transform((row) => ({
    id: row.id,
    challenge: row.challenge,
    purpose: row.purpose,
    accountId: row.account_id,
    expiresAt: row.expires_at,
    consumedAt: row.consumed_at,
    createdAt: row.created_at,
  }))

const sessionRow = z
  .object({
    id: z.string(),
    account_id: z.string(),
    token_hash: z.string(),
    created_at: timestampSchema,
    expires_at: timestampSchema,
    last_seen_at: nullableTimestamp,
    revoked_at: nullableTimestamp,
    user_agent: z.string().nullable(),
    ip_prefix: z.string().nullable(),
    stepped_up_at: nullableTimestamp,
  })
  .transform((row) => ({
    id: row.id,
    accountId: row.account_id,
    tokenHash: row.token_hash,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    lastSeenAt: row.last_seen_at,
    revokedAt: row.revoked_at,
    userAgent: row.user_agent,
    ipPrefix: row.ip_prefix,
    steppedUpAt: row.stepped_up_at,
  }))

const organizationFields = {
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  created_at: timestampSchema,
}

const organizationRow = z.object(organizationFields).transform((row) => ({
  id: row.id,
  name: row.name,
  slug: row.slug,
  createdAt: row.created_at,
}))

const membershipFields = {
  organization_id: z.string(),
  account_id: z.string(),
  role: membershipRoleSchema,
  created_at: timestampSchema,
}

const membershipRow = z.object(membershipFields).transform((row) => ({
  organizationId: row.organization_id,
  accountId: row.account_id,
  role: row.role,
  createdAt: row.created_at,
}))

const memberRow = z
  .object({
    ...membershipFields,
    account: z.object({
      email: z.string(),
      display_name: z.string(),
      email_verified_at: nullableTimestamp,
    }),
  })
  .transform((row) => ({
    organizationId: row.organization_id,
    accountId: row.account_id,
    role: row.role,
    createdAt: row.created_at,
    email: row.account.email,
    displayName: row.account.display_name,
    emailVerifiedAt: row.account.email_verified_at,
  }))

const invitationRow = z
  .object({
    id: z.string(),
    organization_id: z.string(),
    email: z.string(),
    role: membershipRoleSchema,
    token_hash: z.string(),
    invited_by: z.string().nullable(),
    created_at: timestampSchema,
    expires_at: timestampSchema,
    accepted_at: nullableTimestamp,
    revoked_at: nullableTimestamp,
  })
  .transform((row) => ({
    id: row.id,
    organizationId: row.organization_id,
    email: row.email,
    role: row.role,
    tokenHash: row.token_hash,
    invitedBy: row.invited_by,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    acceptedAt: row.accepted_at,
    revokedAt: row.revoked_at,
  }))

const appFields = {
  id: z.string(),
  organization_id: z.string(),
  name: z.string(),
  slug: z.string(),
  description: z.string().nullable(),
  logo_url: z.string().nullable(),
  website_url: z.string().nullable(),
  privacy_url: z.string().nullable(),
  terms_url: z.string().nullable(),
  support_email: z.string().nullable(),
  status: appStatusSchema,
  created_at: timestampSchema,
  updated_at: timestampSchema,
}

type AppRowInput = z.output<z.ZodObject<typeof appFields>>

function mapApp(row: AppRowInput) {
  return {
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    logoUrl: row.logo_url,
    websiteUrl: row.website_url,
    privacyUrl: row.privacy_url,
    termsUrl: row.terms_url,
    supportEmail: row.support_email,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

const appRow = z.object(appFields).transform(mapApp)

const environmentFields = {
  id: z.string(),
  app_id: z.string(),
  kind: environmentKindSchema,
  network: networkSlugSchema,
  client_id: z.string(),
  client_type: clientTypeSchema,
  review_state: reviewStateSchema,
  requested_scopes: z.array(platformScopeSchema),
  approved_scopes: z.array(platformScopeSchema),
  scope_version: z.number().int(),
  sector_id: z.string(),
  created_at: timestampSchema,
  updated_at: timestampSchema,
}

type EnvironmentRowInput = z.output<z.ZodObject<typeof environmentFields>>

function mapEnvironment(row: EnvironmentRowInput) {
  return {
    id: row.id,
    appId: row.app_id,
    kind: row.kind,
    network: row.network,
    clientId: row.client_id,
    clientType: row.client_type,
    reviewState: row.review_state,
    requestedScopes: row.requested_scopes,
    approvedScopes: row.approved_scopes,
    scopeVersion: row.scope_version,
    sectorId: row.sector_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

const environmentRow = z.object(environmentFields).transform(mapEnvironment)

const reviewFields = {
  id: z.string(),
  environment_id: z.string(),
  requested_scopes: z.array(platformScopeSchema),
  state: reviewRecordStateSchema,
  submitter_id: z.string().nullable(),
  submitter_note: z.string().nullable(),
  reviewer_id: z.string().nullable(),
  reviewer_note: z.string().nullable(),
  created_at: timestampSchema,
  decided_at: nullableTimestamp,
}

type ReviewRowInput = z.output<z.ZodObject<typeof reviewFields>>

function mapReview(row: ReviewRowInput) {
  return {
    id: row.id,
    environmentId: row.environment_id,
    requestedScopes: row.requested_scopes,
    state: row.state,
    submitterId: row.submitter_id,
    submitterNote: row.submitter_note,
    reviewerId: row.reviewer_id,
    reviewerNote: row.reviewer_note,
    createdAt: row.created_at,
    decidedAt: row.decided_at,
  }
}

const reviewRow = z.object(reviewFields).transform(mapReview)

const adminReviewSelect =
  "*, environment:mbx_dev_environments!inner(*, app:mbx_dev_apps!inner(*, organization:mbx_dev_organizations!inner(*))), submitter:mbx_dev_accounts!submitter_id(email)"

const adminReviewRow = z
  .object({
    ...reviewFields,
    environment: z.object({
      ...environmentFields,
      app: z.object({
        ...appFields,
        organization: z.object(organizationFields),
      }),
    }),
    submitter: z.object({ email: z.string() }).nullable(),
  })
  .transform(
    (row): AdminReviewRecord => ({
      review: mapReview(row),
      environment: mapEnvironment(row.environment),
      app: mapApp(row.environment.app),
      organization: {
        id: row.environment.app.organization.id,
        name: row.environment.app.organization.name,
        slug: row.environment.app.organization.slug,
        createdAt: row.environment.app.organization.created_at,
      },
      submitterEmail: row.submitter?.email ?? null,
    }),
  )

const apiKeyRow = z
  .object({
    id: z.string(),
    environment_id: z.string(),
    kind: apiKeyKindSchema,
    name: z.string(),
    prefix: z.string(),
    secret_hash: z.string(),
    allowed_cidrs: z.array(z.string()),
    created_by: z.string().nullable(),
    created_at: timestampSchema,
    expires_at: nullableTimestamp,
    last_used_at: nullableTimestamp,
    revoked_at: nullableTimestamp,
    rotated_from: z.string().nullable(),
  })
  .transform((row) => ({
    id: row.id,
    environmentId: row.environment_id,
    kind: row.kind,
    name: row.name,
    prefix: row.prefix,
    secretHash: row.secret_hash,
    allowedCidrs: row.allowed_cidrs,
    createdBy: row.created_by,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    lastUsedAt: row.last_used_at,
    revokedAt: row.revoked_at,
    rotatedFrom: row.rotated_from,
  }))

const clientSecretRow = z
  .object({
    id: z.string(),
    environment_id: z.string(),
    secret_hash: z.string(),
    prefix: z.string(),
    created_by: z.string().nullable(),
    created_at: timestampSchema,
    expires_at: nullableTimestamp,
    revoked_at: nullableTimestamp,
  })
  .transform((row) => ({
    id: row.id,
    environmentId: row.environment_id,
    secretHash: row.secret_hash,
    prefix: row.prefix,
    createdBy: row.created_by,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
  }))

const quotaOverrideRow = z
  .object({
    id: z.string(),
    environment_id: z.string(),
    endpoint_class: endpointClassSchema,
    per_minute: z.number().int(),
    per_day: z.number().int(),
    reason: z.string(),
    created_by: z.string().nullable(),
    created_at: timestampSchema,
    expires_at: nullableTimestamp,
  })
  .transform((row) => ({
    id: row.id,
    environmentId: row.environment_id,
    endpointClass: row.endpoint_class,
    perMinute: row.per_minute,
    perDay: row.per_day,
    reason: row.reason,
    createdBy: row.created_by,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  }))

const auditSelect =
  "id::text, occurred_at, actor_type, actor_id, organization_id, app_id, environment_id, action, target_type, target_id, metadata, ip_prefix, request_id"

const auditRowSchema = z
  .object({
    id: z.string().regex(/^[0-9]+$/),
    occurred_at: timestampSchema,
    actor_type: auditActorTypeSchema,
    actor_id: z.string().nullable(),
    organization_id: z.string().nullable(),
    app_id: z.string().nullable(),
    environment_id: z.string().nullable(),
    action: auditActionSchema,
    target_type: z.string().nullable(),
    target_id: z.string().nullable(),
    metadata: auditMetadataSchema,
    ip_prefix: z.string().nullable(),
    request_id: z.string().nullable(),
  })
  .transform((row) => ({
    id: row.id,
    occurredAt: row.occurred_at,
    actorType: row.actor_type,
    actorId: row.actor_id,
    organizationId: row.organization_id,
    appId: row.app_id,
    environmentId: row.environment_id,
    action: row.action,
    targetType: row.target_type,
    targetId: row.target_id,
    metadata: row.metadata,
    ipPrefix: row.ip_prefix,
    requestId: row.request_id,
  }))

const environmentTokenRevocationSchema = z.object({
  refreshTokenFamiliesRevoked: z.number().int().nonnegative(),
  accessTokensRevoked: z.number().int().nonnegative(),
  scopeVersion: z.number().int().positive(),
})

function one<Schema extends z.ZodType>(
  schema: Schema,
  context: string,
  result: { data: unknown; error: PostgrestError },
): z.output<Schema> {
  if (result.error !== null) fail(context, result.error)
  return schema.parse(result.data)
}

function maybe<Schema extends z.ZodType>(
  schema: Schema,
  context: string,
  result: { data: unknown; error: PostgrestError },
): z.output<Schema> | null {
  if (result.error !== null) fail(context, result.error)
  if (result.data === null) return null
  return schema.parse(result.data)
}

function many<Schema extends z.ZodType>(
  schema: Schema,
  context: string,
  result: { data: unknown; error: PostgrestError },
): z.output<Schema>[] {
  if (result.error !== null) fail(context, result.error)
  return z.array(schema).parse(result.data ?? [])
}

function done(context: string, result: { error: PostgrestError }): void {
  if (result.error !== null) fail(context, result.error)
}

function countOf(
  context: string,
  result: { count: number | null; error: PostgrestError },
): number {
  if (result.error !== null) fail(context, result.error)
  return result.count ?? 0
}

/** Keeps only characters that are safe inside a PostgREST `or` filter. */
function sanitizeSearch(query: string): string {
  return query.replace(/[^\p{L}\p{N} _-]/gu, "").trim()
}

function appPatchRow(patch: AppProfilePatch) {
  const row: Record<string, string | null> = {}
  if (patch.name !== undefined) row.name = patch.name
  if (patch.slug !== undefined) row.slug = patch.slug
  if (patch.description !== undefined) row.description = patch.description
  if (patch.logoUrl !== undefined) row.logo_url = patch.logoUrl
  if (patch.websiteUrl !== undefined) row.website_url = patch.websiteUrl
  if (patch.privacyUrl !== undefined) row.privacy_url = patch.privacyUrl
  if (patch.termsUrl !== undefined) row.terms_url = patch.termsUrl
  if (patch.supportEmail !== undefined) row.support_email = patch.supportEmail
  if (patch.status !== undefined) row.status = patch.status
  return row
}

function environmentPatchRow(patch: EnvironmentPatch) {
  const row: Record<string, string | number | string[]> = {}
  if (patch.clientType !== undefined) row.client_type = patch.clientType
  if (patch.reviewState !== undefined) row.review_state = patch.reviewState
  if (patch.requestedScopes !== undefined) {
    row.requested_scopes = patch.requestedScopes
  }
  if (patch.approvedScopes !== undefined) {
    row.approved_scopes = patch.approvedScopes
  }
  if (patch.scopeVersion !== undefined) row.scope_version = patch.scopeVersion
  return row
}

export default function createSupabaseStore(
  supabase: SupabaseClient,
): ConsoleStore {
  const store: ConsoleStore = {
    async getAccount(id) {
      return maybe(
        accountRow,
        "get account",
        await supabase
          .from("mbx_dev_accounts")
          .select("*")
          .eq("id", id)
          .maybeSingle(),
      )
    },
    async findAccountByEmail(email) {
      return maybe(
        accountRow,
        "find account",
        await supabase
          .from("mbx_dev_accounts")
          .select("*")
          .eq("email", email)
          .maybeSingle(),
      )
    },
    async createAccount(input) {
      return one(
        accountRow,
        "create account",
        await supabase
          .from("mbx_dev_accounts")
          .insert({
            email: input.email,
            display_name: input.displayName,
            email_verified_at: input.emailVerifiedAt,
          })
          .select("*")
          .single(),
      )
    },
    async updateAccount(id, patch) {
      const row: Record<string, string> = {}
      if (patch.displayName !== undefined) row.display_name = patch.displayName
      if (patch.emailVerifiedAt !== undefined) {
        row.email_verified_at = patch.emailVerifiedAt
      }
      return one(
        accountRow,
        "update account",
        await supabase
          .from("mbx_dev_accounts")
          .update(row)
          .eq("id", id)
          .select("*")
          .single(),
      )
    },
    async getStaffRole(accountId) {
      const row = maybe(
        z.object({ role: staffRoleSchema }),
        "get staff",
        await supabase
          .from("mbx_dev_staff")
          .select("role")
          .eq("account_id", accountId)
          .maybeSingle(),
      )
      return row?.role ?? null
    },

    async listPasskeys(accountId) {
      return many(
        passkeyRow,
        "list passkeys",
        await supabase
          .from("mbx_dev_passkeys")
          .select("*")
          .eq("account_id", accountId)
          .order("created_at"),
      )
    },
    async findPasskeyByCredentialId(credentialId) {
      return maybe(
        passkeyRow,
        "find passkey",
        await supabase
          .from("mbx_dev_passkeys")
          .select("*")
          .eq("credential_id", credentialId)
          .maybeSingle(),
      )
    },
    async createPasskey(input) {
      return one(
        passkeyRow,
        "create passkey",
        await supabase
          .from("mbx_dev_passkeys")
          .insert({
            account_id: input.accountId,
            credential_id: input.credentialId,
            public_key: input.publicKey,
            counter: input.counter,
            transports: input.transports,
            device_type: input.deviceType,
            backed_up: input.backedUp,
            name: input.name,
            last_used_at: input.lastUsedAt,
            ...((input.stepUpBlockedUntil ?? null) === null
              ? {}
              : { step_up_blocked_until: input.stepUpBlockedUntil }),
          })
          .select("*")
          .single(),
      )
    },
    async updatePasskey(id, patch) {
      const row: Record<string, string | number | boolean> = {}
      if (patch.name !== undefined) row.name = patch.name
      if (patch.counter !== undefined) row.counter = patch.counter
      if (patch.backedUp !== undefined) row.backed_up = patch.backedUp
      if (patch.lastUsedAt !== undefined) row.last_used_at = patch.lastUsedAt
      done(
        "update passkey",
        await supabase.from("mbx_dev_passkeys").update(row).eq("id", id),
      )
    },
    async deletePasskey(id) {
      done(
        "delete passkey",
        await supabase.from("mbx_dev_passkeys").delete().eq("id", id),
      )
    },

    async createEmailChallenge(input) {
      return one(
        emailChallengeRow,
        "create email challenge",
        await supabase
          .from("mbx_dev_email_challenges")
          .insert({
            id: input.id,
            email: input.email,
            purpose: input.purpose,
            code_hash: input.codeHash,
            expires_at: input.expiresAt,
            created_at: input.createdAt,
          })
          .select("*")
          .single(),
      )
    },
    async getEmailChallenge(id) {
      return maybe(
        emailChallengeRow,
        "get email challenge",
        await supabase
          .from("mbx_dev_email_challenges")
          .select("*")
          .eq("id", id)
          .maybeSingle(),
      )
    },
    async incrementEmailChallengeAttempts(id) {
      // Optimistic compare-and-set; a lost race counts as exhausted.
      const current = await store.getEmailChallenge(id)
      if (current === null) throw new StoreQueryError("attempts", null)
      const next = current.attempts + 1
      const updated = many(
        z.object({ attempts: z.number().int() }),
        "increment attempts",
        await supabase
          .from("mbx_dev_email_challenges")
          .update({ attempts: Math.min(next, 10) })
          .eq("id", id)
          .eq("attempts", current.attempts)
          .select("attempts"),
      )
      return updated[0]?.attempts ?? Number.MAX_SAFE_INTEGER
    },
    async consumeEmailChallenge(id, now) {
      const rows = many(
        z.object({ id: z.string() }),
        "consume email challenge",
        await supabase
          .from("mbx_dev_email_challenges")
          .update({ consumed_at: now })
          .eq("id", id)
          .is("consumed_at", null)
          .gt("expires_at", now)
          .select("id"),
      )
      return rows.length === 1
    },
    async createWebauthnChallenge(input) {
      return one(
        webauthnChallengeRow,
        "create webauthn challenge",
        await supabase
          .from("mbx_dev_webauthn_challenges")
          .insert({
            challenge: input.challenge,
            purpose: input.purpose,
            account_id: input.accountId,
            expires_at: input.expiresAt,
            created_at: input.createdAt,
          })
          .select("*")
          .single(),
      )
    },
    async consumeWebauthnChallenge(id, now) {
      const rows = many(
        webauthnChallengeRow,
        "consume webauthn challenge",
        await supabase
          .from("mbx_dev_webauthn_challenges")
          .update({ consumed_at: now })
          .eq("id", id)
          .is("consumed_at", null)
          .gt("expires_at", now)
          .select("*"),
      )
      return rows[0] ?? null
    },

    async createSession(input) {
      return one(
        sessionRow,
        "create session",
        await supabase
          .from("mbx_dev_sessions")
          .insert({
            account_id: input.accountId,
            token_hash: input.tokenHash,
            created_at: input.createdAt,
            expires_at: input.expiresAt,
            last_seen_at: input.createdAt,
            user_agent: input.userAgent,
            ip_prefix: input.ipPrefix,
            stepped_up_at: input.steppedUpAt,
          })
          .select("*")
          .single(),
      )
    },
    async findSessionByTokenHash(tokenHash) {
      return maybe(
        sessionRow,
        "find session",
        await supabase
          .from("mbx_dev_sessions")
          .select("*")
          .eq("token_hash", tokenHash)
          .maybeSingle(),
      )
    },
    async listSessions(accountId) {
      return many(
        sessionRow,
        "list sessions",
        await supabase
          .from("mbx_dev_sessions")
          .select("*")
          .eq("account_id", accountId)
          .order("created_at", { ascending: false })
          .limit(100),
      )
    },
    async updateSession(id, patch) {
      const row: Record<string, string> = {}
      if (patch.lastSeenAt !== undefined) row.last_seen_at = patch.lastSeenAt
      if (patch.expiresAt !== undefined) row.expires_at = patch.expiresAt
      if (patch.steppedUpAt !== undefined) row.stepped_up_at = patch.steppedUpAt
      if (patch.revokedAt !== undefined) row.revoked_at = patch.revokedAt
      done(
        "update session",
        await supabase.from("mbx_dev_sessions").update(row).eq("id", id),
      )
    },
    async revokeOtherSessions(accountId, exceptSessionId, at) {
      let query = supabase
        .from("mbx_dev_sessions")
        .update({ revoked_at: at })
        .eq("account_id", accountId)
        .is("revoked_at", null)
        .gt("expires_at", at)
      if (exceptSessionId !== null) query = query.neq("id", exceptSessionId)
      const rows = many(
        z.object({ id: z.string() }),
        "revoke other sessions",
        await query.select("id"),
      )
      return rows.length
    },

    async listOrganizationsForAccount(accountId) {
      const rows = many(
        z.object({
          role: membershipRoleSchema,
          organization: z.object(organizationFields),
        }),
        "list organizations",
        await supabase
          .from("mbx_dev_memberships")
          .select("role, organization:mbx_dev_organizations!inner(*)")
          .eq("account_id", accountId),
      )
      return rows
        .map((row) => ({
          id: row.organization.id,
          name: row.organization.name,
          slug: row.organization.slug,
          createdAt: row.organization.created_at,
          role: row.role,
        }))
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    },
    async getOrganization(id) {
      return maybe(
        organizationRow,
        "get organization",
        await supabase
          .from("mbx_dev_organizations")
          .select("*")
          .eq("id", id)
          .maybeSingle(),
      )
    },
    async findOrganizationBySlug(slug) {
      return maybe(
        organizationRow,
        "find organization",
        await supabase
          .from("mbx_dev_organizations")
          .select("*")
          .eq("slug", slug)
          .maybeSingle(),
      )
    },
    async createOrganization(input) {
      // Organization + owner membership in one transaction.
      const organizationId = one(
        z.string(),
        "create organization",
        await supabase.rpc("mbx_dev_create_organization", {
          p_name: input.name,
          p_slug: input.slug,
          p_owner_account_id: input.ownerId,
        }),
      )
      const organization = await store.getOrganization(organizationId)
      if (organization === null) {
        throw new StoreQueryError("create organization", "row missing")
      }
      return organization
    },
    async updateOrganization(id, patch) {
      const row: Record<string, string> = {}
      if (patch.name !== undefined) row.name = patch.name
      if (patch.slug !== undefined) row.slug = patch.slug
      return one(
        organizationRow,
        "update organization",
        await supabase
          .from("mbx_dev_organizations")
          .update(row)
          .eq("id", id)
          .select("*")
          .single(),
      )
    },
    async deleteOrganization(id) {
      done(
        "delete organization",
        await supabase.from("mbx_dev_organizations").delete().eq("id", id),
      )
    },
    async organizationHasVerifiedOwner(organizationId) {
      const owners = await store.listMembers(organizationId)
      return owners.some(
        (member) => member.role === "owner" && member.emailVerifiedAt !== null,
      )
    },

    async getMembership(organizationId, accountId) {
      return maybe(
        membershipRow,
        "get membership",
        await supabase
          .from("mbx_dev_memberships")
          .select("*")
          .eq("organization_id", organizationId)
          .eq("account_id", accountId)
          .maybeSingle(),
      )
    },
    async listMembers(organizationId) {
      return many(
        memberRow,
        "list members",
        await supabase
          .from("mbx_dev_memberships")
          .select(
            "*, account:mbx_dev_accounts!inner(email, display_name, email_verified_at)",
          )
          .eq("organization_id", organizationId)
          .order("created_at"),
      )
    },
    async addMember(input) {
      return one(
        membershipRow,
        "add member",
        await supabase
          .from("mbx_dev_memberships")
          .insert({
            organization_id: input.organizationId,
            account_id: input.accountId,
            role: input.role,
          })
          .select("*")
          .single(),
      )
    },
    async updateMemberRole(organizationId, accountId, role) {
      done(
        "update member role",
        await supabase
          .from("mbx_dev_memberships")
          .update({ role })
          .eq("organization_id", organizationId)
          .eq("account_id", accountId),
      )
    },
    async removeMember(organizationId, accountId) {
      done(
        "remove member",
        await supabase
          .from("mbx_dev_memberships")
          .delete()
          .eq("organization_id", organizationId)
          .eq("account_id", accountId),
      )
    },
    async listInvitations(organizationId) {
      return many(
        invitationRow,
        "list invitations",
        await supabase
          .from("mbx_dev_invitations")
          .select("*")
          .eq("organization_id", organizationId)
          .order("created_at", { ascending: false })
          .limit(200),
      )
    },
    async getInvitation(id) {
      return maybe(
        invitationRow,
        "get invitation",
        await supabase
          .from("mbx_dev_invitations")
          .select("*")
          .eq("id", id)
          .maybeSingle(),
      )
    },
    async findInvitationByTokenHash(tokenHash) {
      return maybe(
        invitationRow,
        "find invitation",
        await supabase
          .from("mbx_dev_invitations")
          .select("*")
          .eq("token_hash", tokenHash)
          .maybeSingle(),
      )
    },
    async createInvitation(input) {
      return one(
        invitationRow,
        "create invitation",
        await supabase
          .from("mbx_dev_invitations")
          .insert({
            organization_id: input.organizationId,
            email: input.email,
            role: input.role,
            token_hash: input.tokenHash,
            invited_by: input.invitedBy,
            created_at: input.createdAt,
            expires_at: input.expiresAt,
          })
          .select("*")
          .single(),
      )
    },
    async updateInvitation(id, patch) {
      const row: Record<string, string> = {}
      if (patch.acceptedAt !== undefined) row.accepted_at = patch.acceptedAt
      if (patch.revokedAt !== undefined) row.revoked_at = patch.revokedAt
      done(
        "update invitation",
        await supabase.from("mbx_dev_invitations").update(row).eq("id", id),
      )
    },

    async listApps(organizationId) {
      return many(
        appRow,
        "list apps",
        await supabase
          .from("mbx_dev_apps")
          .select("*")
          .eq("organization_id", organizationId)
          .order("created_at"),
      )
    },
    async getApp(id) {
      return maybe(
        appRow,
        "get app",
        await supabase
          .from("mbx_dev_apps")
          .select("*")
          .eq("id", id)
          .maybeSingle(),
      )
    },
    async findAppBySlug(organizationId, slug) {
      return maybe(
        appRow,
        "find app",
        await supabase
          .from("mbx_dev_apps")
          .select("*")
          .eq("organization_id", organizationId)
          .eq("slug", slug)
          .maybeSingle(),
      )
    },
    async createApp(input) {
      return one(
        appRow,
        "create app",
        await supabase
          .from("mbx_dev_apps")
          .insert({
            organization_id: input.organizationId,
            name: input.name,
            slug: input.slug,
            description: input.description,
            logo_url: input.logoUrl,
            website_url: input.websiteUrl,
            privacy_url: input.privacyUrl,
            terms_url: input.termsUrl,
            support_email: input.supportEmail,
          })
          .select("*")
          .single(),
      )
    },
    async updateApp(id, patch) {
      return one(
        appRow,
        "update app",
        await supabase
          .from("mbx_dev_apps")
          .update(appPatchRow(patch))
          .eq("id", id)
          .select("*")
          .single(),
      )
    },
    async listAdminApps(input) {
      let query = supabase
        .from("mbx_dev_apps")
        .select("*, organization:mbx_dev_organizations!inner(*)")
      if (input.status !== undefined) query = query.eq("status", input.status)
      const search = sanitizeSearch(input.query ?? "")
      if (search.length > 0) {
        query = query.or(`name.ilike.*${search}*,slug.ilike.*${search}*`)
      }
      const rows = many(
        z.object({ ...appFields, organization: z.object(organizationFields) }),
        "list admin apps",
        await query
          .order("created_at", { ascending: false })
          .order("id")
          .range(input.offset, input.offset + input.limit),
      )
      return {
        items: rows.slice(0, input.limit).map((row) => ({
          app: mapApp(row),
          organization: {
            id: row.organization.id,
            name: row.organization.name,
            slug: row.organization.slug,
            createdAt: row.organization.created_at,
          },
        })),
        hasMore: rows.length > input.limit,
      }
    },
    async listEnvironmentsForApps(appIds) {
      if (appIds.length === 0) return []
      return many(
        environmentRow,
        "list environments",
        await supabase
          .from("mbx_dev_environments")
          .select("*")
          .in("app_id", appIds)
          .order("kind", { ascending: false }),
      )
    },
    async getEnvironment(id) {
      return maybe(
        environmentRow,
        "get environment",
        await supabase
          .from("mbx_dev_environments")
          .select("*")
          .eq("id", id)
          .maybeSingle(),
      )
    },
    async getEnvironmentByKind(appId, kind) {
      return maybe(
        environmentRow,
        "get environment by kind",
        await supabase
          .from("mbx_dev_environments")
          .select("*")
          .eq("app_id", appId)
          .eq("kind", kind)
          .maybeSingle(),
      )
    },
    async createEnvironment(input) {
      return one(
        environmentRow,
        "create environment",
        await supabase
          .from("mbx_dev_environments")
          .insert({
            app_id: input.appId,
            kind: input.kind,
            network: input.network,
            client_id: input.clientId,
            client_type: input.clientType,
          })
          .select("*")
          .single(),
      )
    },
    async updateEnvironment(id, patch) {
      return one(
        environmentRow,
        "update environment",
        await supabase
          .from("mbx_dev_environments")
          .update(environmentPatchRow(patch))
          .eq("id", id)
          .select("*")
          .single(),
      )
    },
    async listRedirectUris(environmentId) {
      const rows = many(
        z.object({ uri: z.string() }),
        "list redirect uris",
        await supabase
          .from("mbx_dev_redirect_uris")
          .select("uri")
          .eq("environment_id", environmentId)
          .order("created_at"),
      )
      return rows.map((row) => row.uri)
    },
    async replaceRedirectUris(environmentId, uris) {
      done(
        "replace redirect uris",
        await supabase.rpc("mbx_dev_replace_redirect_uris", {
          p_environment_id: environmentId,
          p_uris: uris,
        }),
      )
    },
    async listOrigins(environmentId) {
      const rows = many(
        z.object({ origin: z.string() }),
        "list origins",
        await supabase
          .from("mbx_dev_origins")
          .select("origin")
          .eq("environment_id", environmentId)
          .order("created_at"),
      )
      return rows.map((row) => row.origin)
    },
    async replaceOrigins(environmentId, origins) {
      done(
        "replace origins",
        await supabase.rpc("mbx_dev_replace_origins", {
          p_environment_id: environmentId,
          p_origins: origins,
        }),
      )
    },
    async revokeEnvironmentTokens(environmentId, reason) {
      return one(
        environmentTokenRevocationSchema,
        "revoke environment tokens",
        await supabase.rpc("mbx_dev_revoke_environment_tokens", {
          p_environment_id: environmentId,
          p_reason: reason,
        }),
      )
    },

    async getReview(id) {
      return maybe(
        reviewRow,
        "get review",
        await supabase
          .from("mbx_dev_reviews")
          .select("*")
          .eq("id", id)
          .maybeSingle(),
      )
    },
    async getOpenReview(environmentId) {
      return maybe(
        reviewRow,
        "get open review",
        await supabase
          .from("mbx_dev_reviews")
          .select("*")
          .eq("environment_id", environmentId)
          .eq("state", "open")
          .maybeSingle(),
      )
    },
    async createReview(input) {
      const row: Record<string, string | string[] | null> = {
        environment_id: input.environmentId,
        requested_scopes: input.requestedScopes,
        state: input.state,
        submitter_id: input.submitterId,
        submitter_note: input.submitterNote,
        reviewer_id: input.reviewerId,
        reviewer_note: input.reviewerNote,
        decided_at: input.decidedAt,
      }
      if (input.createdAt !== undefined) row.created_at = input.createdAt
      return one(
        reviewRow,
        "create review",
        await supabase.from("mbx_dev_reviews").insert(row).select("*").single(),
      )
    },
    async updateReview(id, patch) {
      const row: Record<string, string | null> = {
        state: patch.state,
        decided_at: patch.decidedAt,
      }
      if (patch.reviewerId !== undefined) row.reviewer_id = patch.reviewerId
      if (patch.reviewerNote !== undefined) {
        row.reviewer_note = patch.reviewerNote
      }
      return one(
        reviewRow,
        "update review",
        await supabase
          .from("mbx_dev_reviews")
          .update(row)
          .eq("id", id)
          .select("*")
          .single(),
      )
    },
    async getAdminReview(id) {
      return maybe(
        adminReviewRow,
        "get admin review",
        await supabase
          .from("mbx_dev_reviews")
          .select(adminReviewSelect)
          .eq("id", id)
          .maybeSingle(),
      )
    },
    async listAdminReviews(input) {
      const rows = many(
        adminReviewRow,
        "list admin reviews",
        await supabase
          .from("mbx_dev_reviews")
          .select(adminReviewSelect)
          .eq("state", input.state)
          .order("created_at")
          .order("id")
          .range(input.offset, input.offset + input.limit),
      )
      return {
        items: rows.slice(0, input.limit),
        hasMore: rows.length > input.limit,
      }
    },

    async listApiKeys(environmentId) {
      return many(
        apiKeyRow,
        "list api keys",
        await supabase
          .from("mbx_dev_api_keys")
          .select("*")
          .eq("environment_id", environmentId)
          .order("created_at", { ascending: false })
          .limit(200),
      )
    },
    async getApiKey(id) {
      return maybe(
        apiKeyRow,
        "get api key",
        await supabase
          .from("mbx_dev_api_keys")
          .select("*")
          .eq("id", id)
          .maybeSingle(),
      )
    },
    async createApiKey(input) {
      return one(
        apiKeyRow,
        "create api key",
        await supabase
          .from("mbx_dev_api_keys")
          .insert({
            environment_id: input.environmentId,
            kind: input.kind,
            name: input.name,
            prefix: input.prefix,
            secret_hash: input.secretHash,
            allowed_cidrs: input.allowedCidrs,
            created_by: input.createdBy,
            expires_at: input.expiresAt,
            rotated_from: input.rotatedFrom,
          })
          .select("*")
          .single(),
      )
    },
    async updateApiKey(id, patch) {
      const row: Record<string, string | string[] | null> = {}
      if (patch.name !== undefined) row.name = patch.name
      if (patch.allowedCidrs !== undefined) {
        row.allowed_cidrs = patch.allowedCidrs
      }
      if (patch.expiresAt !== undefined) row.expires_at = patch.expiresAt
      if (patch.revokedAt !== undefined) row.revoked_at = patch.revokedAt
      return one(
        apiKeyRow,
        "update api key",
        await supabase
          .from("mbx_dev_api_keys")
          .update(row)
          .eq("id", id)
          .select("*")
          .single(),
      )
    },
    async listClientSecrets(environmentId) {
      return many(
        clientSecretRow,
        "list client secrets",
        await supabase
          .from("mbx_dev_client_secrets")
          .select("*")
          .eq("environment_id", environmentId)
          .order("created_at", { ascending: false })
          .limit(100),
      )
    },
    async getClientSecret(id) {
      return maybe(
        clientSecretRow,
        "get client secret",
        await supabase
          .from("mbx_dev_client_secrets")
          .select("*")
          .eq("id", id)
          .maybeSingle(),
      )
    },
    async createClientSecret(input) {
      return one(
        clientSecretRow,
        "create client secret",
        await supabase
          .from("mbx_dev_client_secrets")
          .insert({
            environment_id: input.environmentId,
            secret_hash: input.secretHash,
            prefix: input.prefix,
            created_by: input.createdBy,
            expires_at: input.expiresAt,
          })
          .select("*")
          .single(),
      )
    },
    async revokeClientSecret(id, at) {
      return one(
        clientSecretRow,
        "revoke client secret",
        await supabase
          .from("mbx_dev_client_secrets")
          .update({ revoked_at: at })
          .eq("id", id)
          .select("*")
          .single(),
      )
    },

    async listQuotaOverrides(environmentId) {
      return many(
        quotaOverrideRow,
        "list quota overrides",
        await supabase
          .from("mbx_dev_quota_overrides")
          .select("*")
          .eq("environment_id", environmentId)
          .order("created_at", { ascending: false })
          .limit(200),
      )
    },
    async getQuotaOverride(id) {
      return maybe(
        quotaOverrideRow,
        "get quota override",
        await supabase
          .from("mbx_dev_quota_overrides")
          .select("*")
          .eq("id", id)
          .maybeSingle(),
      )
    },
    async createQuotaOverride(input) {
      return one(
        quotaOverrideRow,
        "create quota override",
        await supabase
          .from("mbx_dev_quota_overrides")
          .insert({
            environment_id: input.environmentId,
            endpoint_class: input.endpointClass,
            per_minute: input.perMinute,
            per_day: input.perDay,
            reason: input.reason,
            created_by: input.createdBy,
            expires_at: input.expiresAt,
          })
          .select("*")
          .single(),
      )
    },
    async expireQuotaOverride(id, at) {
      done(
        "expire quota override",
        await supabase
          .from("mbx_dev_quota_overrides")
          .update({ expires_at: at })
          .eq("id", id),
      )
    },

    async oauthStats(input) {
      const grants = () =>
        supabase
          .from("mbx_id_grants")
          .select("id", { count: "exact", head: true })
          .eq("environment_id", input.environmentId)
      const reasons = grantRevokedReasonSchema.options
      const scopes = oidcScopeSchema.options
      const [active, created, revoked, byScope] = await Promise.all([
        grants().is("revoked_at", null),
        grants().gte("created_at", input.from).lt("created_at", input.to),
        Promise.all(
          reasons.map((reason) =>
            grants()
              .eq("revoked_reason", reason)
              .gte("revoked_at", input.from)
              .lt("revoked_at", input.to),
          ),
        ),
        Promise.all(
          scopes.map((scope) =>
            grants().is("revoked_at", null).contains("scopes", [scope]),
          ),
        ),
      ])
      const stats: OAuthStatsRecord = {
        activeGrants: countOf("active grants", active),
        grantsCreated: countOf("created grants", created),
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
      reasons.forEach((reason, index) => {
        const result = revoked[index]
        if (result !== undefined) {
          stats.revocationsByReason[reason] = countOf("revocations", result)
        }
      })
      scopes.forEach((scope, index) => {
        const result = byScope[index]
        if (result !== undefined) {
          stats.activeGrantsByScope[scope] = countOf("grants by scope", result)
        }
      })
      return stats
    },

    async recordAudit(event) {
      await insertAuditEvent(supabase, event)
    },
    async searchAudit(filter) {
      let query = supabase.from(auditTable).select(auditSelect)
      if (filter.organizationId !== undefined) {
        query = query.eq("organization_id", filter.organizationId)
      }
      if (filter.appId !== undefined) query = query.eq("app_id", filter.appId)
      if (filter.environmentId !== undefined) {
        query = query.eq("environment_id", filter.environmentId)
      }
      if (filter.actorType !== undefined) {
        query = query.eq("actor_type", filter.actorType)
      }
      if (filter.actorId !== undefined) {
        query = query.eq("actor_id", filter.actorId)
      }
      if (filter.action !== undefined) query = query.eq("action", filter.action)
      if (filter.from !== undefined)
        query = query.gte("occurred_at", filter.from)
      if (filter.to !== undefined) query = query.lt("occurred_at", filter.to)
      if (filter.beforeId !== undefined) query = query.lt("id", filter.beforeId)
      return many(
        auditRowSchema,
        "search audit",
        await query.order("id", { ascending: false }).limit(filter.limit),
      )
    },
  }
  return store
}
