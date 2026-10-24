import { z } from "zod"
import {
  auditActionSchema,
  auditActorTypeSchema,
  auditEventSchema,
} from "./audit"
import {
  displayNameSchema,
  emailSchema,
  httpsUrlSchema,
  isoDateTimeSchema,
  slugSchema,
  uuidSchema,
} from "./common"
import { apiKeyKindSchema, clientIdSchema } from "./credentials"
import { grantRevokedReasonSchema } from "./identity"
import { environmentKindSchema, networkSlugSchema } from "./network"
import { endpointClassSchema } from "./rate-limits"
import { oidcScopeSchema, platformScopeSchema } from "./scopes"

/**
 * Request/response schemas for the developer console `/api/*` routes.
 * Route comments list method + path; `okResponseSchema` (common) is the body
 * for mutations that return nothing else.
 */

// ---------------------------------------------------------------------------
// Enumerations (mirror CHECK constraints in the v2 migration)
// ---------------------------------------------------------------------------

export const appStatusSchema = z.enum([
  "active",
  "restricted",
  "suspended",
  "retired",
])

export type AppStatus = z.infer<typeof appStatusSchema>

export const reviewStateSchema = z.enum([
  "development",
  "submitted",
  "approved",
  "changes-requested",
  "rejected",
])

export type ReviewState = z.infer<typeof reviewStateSchema>

export const reviewRecordStateSchema = z.enum([
  "open",
  "approved",
  "changes-requested",
  "rejected",
  "withdrawn",
])

export type ReviewRecordState = z.infer<typeof reviewRecordStateSchema>

export const reviewDecisionSchema = z.enum([
  "approve",
  "request-changes",
  "reject",
])

export type ReviewDecision = z.infer<typeof reviewDecisionSchema>

export const membershipRoleSchema = z.enum(["owner", "admin", "developer"])

export type MembershipRole = z.infer<typeof membershipRoleSchema>

export const staffRoleSchema = z.enum(["reviewer", "operator"])

export type StaffRole = z.infer<typeof staffRoleSchema>

export const clientTypeSchema = z.enum(["confidential", "public"])

export type ClientType = z.infer<typeof clientTypeSchema>

export const credentialStatusSchema = z.enum(["active", "expired", "revoked"])

export type CredentialStatus = z.infer<typeof credentialStatusSchema>

/** Derives a credential status from its timestamps. */
export function credentialStatus(
  credential: { expiresAt: string | null; revokedAt: string | null },
  now: Date,
): CredentialStatus {
  if (credential.revokedAt !== null) return "revoked"
  if (
    credential.expiresAt !== null &&
    Date.parse(credential.expiresAt) <= now.getTime()
  ) {
    return "expired"
  }
  return "active"
}

const optionalText = (max: number) => z.string().trim().max(max).nullable()

export const consolePaths = {
  orgId: z.object({ orgId: uuidSchema }),
  appId: z.object({ appId: uuidSchema }),
  environmentId: z.object({ environmentId: uuidSchema }),
  appEnvironment: z.object({ appId: uuidSchema, kind: environmentKindSchema }),
  member: z.object({ orgId: uuidSchema, accountId: uuidSchema }),
  invitation: z.object({ orgId: uuidSchema, invitationId: uuidSchema }),
  apiKeyId: z.object({ apiKeyId: uuidSchema }),
  clientSecretId: z.object({ clientSecretId: uuidSchema }),
  sessionId: z.object({ sessionId: uuidSchema }),
  reviewId: z.object({ reviewId: uuidSchema }),
  quotaOverrideId: z.object({ quotaOverrideId: uuidSchema }),
  requestId: z.object({
    environmentId: uuidSchema,
    requestId: z.string().min(1).max(64),
  }),
} as const

// ---------------------------------------------------------------------------
// Auth: /api/auth/* (Sign in with Google)
// ---------------------------------------------------------------------------

/** What a Google nonce is issued for; bound into the signed nonce cookie. */
export const googleNoncePurposeSchema = z.enum(["sign-in", "step-up"])

export type GoogleNoncePurpose = z.infer<typeof googleNoncePurposeSchema>

/** POST /api/auth/google/nonce */
export const googleNonceRequestSchema = z.object({
  purpose: googleNoncePurposeSchema,
})

/** Nonce for the Google Identity Services button, plus its client id. */
export const googleNonceResponseSchema = z.object({
  clientId: z.string().min(1),
  nonce: z.string().min(1),
  expiresAt: isoDateTimeSchema,
})

export type GoogleNonceResponse = z.infer<typeof googleNonceResponseSchema>

/** A Google ID token (JWT) as returned by the GIS `callback`. */
export const googleCredentialSchema = z.string().min(1).max(8192)

/** POST /api/auth/google — signs in, creating the account on first use. */
export const googleSignInRequestSchema = z.object({
  credential: googleCredentialSchema,
  invitationToken: z.string().min(1).max(256).optional(),
})

export type GoogleSignInRequest = z.infer<typeof googleSignInRequestSchema>

/** POST /api/auth/step-up/google — re-confirms the signed-in account. */
export const googleStepUpRequestSchema = z.object({
  credential: googleCredentialSchema,
})

export type GoogleStepUpRequest = z.infer<typeof googleStepUpRequestSchema>

/** POST /api/auth/step-up/google response. */
export const stepUpResponseSchema = z.object({
  steppedUpUntil: isoDateTimeSchema,
})

export type StepUpResponse = z.infer<typeof stepUpResponseSchema>

// POST /api/auth/sign-out -> okResponseSchema

// ---------------------------------------------------------------------------
// Me: /api/me
// ---------------------------------------------------------------------------

export const developerAccountSchema = z.object({
  id: uuidSchema,
  email: z.string(),
  emailVerifiedAt: isoDateTimeSchema.nullable(),
  displayName: z.string(),
  /** Google profile picture (https); null when Google sent none. */
  avatarUrl: z.string().nullable(),
  createdAt: isoDateTimeSchema,
})

export type DeveloperAccount = z.infer<typeof developerAccountSchema>

export const organizationSummarySchema = z.object({
  id: uuidSchema,
  name: z.string(),
  slug: z.string(),
  role: membershipRoleSchema,
})

export type OrganizationSummary = z.infer<typeof organizationSummarySchema>

/** Response of every successful sign-in and GET /api/me. */
export const meResponseSchema = z.object({
  account: developerAccountSchema,
  organizations: z.array(organizationSummarySchema),
  staffRole: staffRoleSchema.nullable(),
  session: z.object({
    id: uuidSchema,
    expiresAt: isoDateTimeSchema,
    steppedUpUntil: isoDateTimeSchema.nullable(),
  }),
})

export type MeResponse = z.infer<typeof meResponseSchema>

/** GET /api/me when signed out returns 401 unauthorized. */

/** PATCH /api/me */
export const updateMeRequestSchema = z.object({
  displayName: displayNameSchema,
})

export const consoleSessionSchema = z.object({
  id: uuidSchema,
  createdAt: isoDateTimeSchema,
  lastSeenAt: isoDateTimeSchema.nullable(),
  expiresAt: isoDateTimeSchema,
  userAgent: z.string().nullable(),
  ipPrefix: z.string().nullable(),
  current: z.boolean(),
})

/** GET /api/me/sessions; DELETE /api/me/sessions/{sessionId} -> ok */
export const consoleSessionListResponseSchema = z.object({
  data: z.array(consoleSessionSchema),
})

/** POST /api/me/sessions/revoke-others ("sign out everywhere else"). */
export const revokeOtherSessionsResponseSchema = z.object({
  revoked: z.number().int().nonnegative(),
})

export type RevokeOtherSessionsResponse = z.infer<
  typeof revokeOtherSessionsResponseSchema
>

// ---------------------------------------------------------------------------
// Organizations, members, invitations
// ---------------------------------------------------------------------------

export const organizationSchema = z.object({
  id: uuidSchema,
  name: z.string(),
  slug: z.string(),
  role: membershipRoleSchema,
  createdAt: isoDateTimeSchema,
})

export type Organization = z.infer<typeof organizationSchema>

/** GET /api/orgs */
export const organizationListResponseSchema = z.object({
  data: z.array(organizationSchema),
})

/** POST /api/orgs -> organizationSchema */
export const createOrganizationRequestSchema = z.object({
  name: z.string().trim().min(1).max(80),
  slug: slugSchema.optional(),
})

/** PATCH /api/orgs/{orgId} -> organizationSchema */
export const updateOrganizationRequestSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  slug: slugSchema.optional(),
})

// DELETE /api/orgs/{orgId} -> ok (owner + step-up)

export const memberSchema = z.object({
  accountId: uuidSchema,
  email: z.string(),
  displayName: z.string(),
  avatarUrl: z.string().nullable(),
  role: membershipRoleSchema,
  createdAt: isoDateTimeSchema,
})

export type Member = z.infer<typeof memberSchema>

/** GET /api/orgs/{orgId}/members */
export const memberListResponseSchema = z.object({
  data: z.array(memberSchema),
})

/** PATCH /api/orgs/{orgId}/members/{accountId} -> memberSchema (step-up) */
export const updateMemberRequestSchema = z.object({
  role: membershipRoleSchema,
})

// DELETE /api/orgs/{orgId}/members/{accountId} -> ok (step-up)

export const invitationSchema = z.object({
  id: uuidSchema,
  email: z.string(),
  role: membershipRoleSchema,
  invitedBy: uuidSchema.nullable(),
  createdAt: isoDateTimeSchema,
  expiresAt: isoDateTimeSchema,
  acceptedAt: isoDateTimeSchema.nullable(),
  revokedAt: isoDateTimeSchema.nullable(),
})

export type Invitation = z.infer<typeof invitationSchema>

/** GET /api/orgs/{orgId}/invitations */
export const invitationListResponseSchema = z.object({
  data: z.array(invitationSchema),
})

/** POST /api/orgs/{orgId}/invitations -> invitationSchema (step-up) */
export const createInvitationRequestSchema = z.object({
  email: emailSchema,
  role: membershipRoleSchema,
})

// DELETE /api/orgs/{orgId}/invitations/{invitationId} -> ok

/** POST /api/invitations/accept -> organizationSchema */
export const acceptInvitationRequestSchema = z.object({
  token: z.string().min(1).max(256),
})

// ---------------------------------------------------------------------------
// Apps
// ---------------------------------------------------------------------------

export const reviewSchema = z.object({
  id: uuidSchema,
  environmentId: uuidSchema,
  requestedScopes: z.array(platformScopeSchema),
  state: reviewRecordStateSchema,
  submitterId: uuidSchema.nullable(),
  submitterNote: z.string().nullable(),
  reviewerId: uuidSchema.nullable(),
  reviewerNote: z.string().nullable(),
  createdAt: isoDateTimeSchema,
  decidedAt: isoDateTimeSchema.nullable(),
})

export type Review = z.infer<typeof reviewSchema>

/** Who closed a review: staff, the auto-approval policy, or the developer
 * (withdrawn). Null while open. */
export const reviewDecidedBySchema = z.enum(["staff", "auto", "developer"])

export type ReviewDecidedBy = z.infer<typeof reviewDecidedBySchema>

export function reviewDecidedBy(
  review: Pick<Review, "state" | "reviewerId">,
): ReviewDecidedBy | null {
  if (review.state === "open") return null
  if (review.state === "withdrawn") return "developer"
  return review.reviewerId === null ? "auto" : "staff"
}

/** When a review last changed: decision time, else submission time. */
export function reviewActivityAt(
  review: Pick<Review, "createdAt" | "decidedAt">,
): string {
  return review.decidedAt ?? review.createdAt
}

/** Sort comparator: most recent activity first, then newest submission. */
export function compareReviewsNewestFirst(
  left: Pick<Review, "createdAt" | "decidedAt">,
  right: Pick<Review, "createdAt" | "decidedAt">,
): number {
  const byActivity =
    Date.parse(reviewActivityAt(right)) - Date.parse(reviewActivityAt(left))
  if (byActivity !== 0) return byActivity
  return Date.parse(right.createdAt) - Date.parse(left.createdAt)
}

/**
 * A review as developers see it, decided ones included. `reviewerNote` is
 * the staff "Note to developer" (shown on Overview + Environments).
 */
export const developerReviewSchema = reviewSchema.extend({
  decidedBy: reviewDecidedBySchema.nullable(),
  /** Submitter's display name; null when the account is gone. */
  submitterName: z.string().nullable(),
})

export type DeveloperReview = z.infer<typeof developerReviewSchema>

/** GET /api/environments/{environmentId}/reviews — every review of the
 * environment (open + decided), `compareReviewsNewestFirst` order. */
export const environmentReviewListResponseSchema = z.object({
  data: z.array(developerReviewSchema),
})

export type EnvironmentReviewListResponse = z.infer<
  typeof environmentReviewListResponseSchema
>

export const environmentSummarySchema = z.object({
  id: uuidSchema,
  kind: environmentKindSchema,
  network: networkSlugSchema,
  clientId: clientIdSchema,
  reviewState: reviewStateSchema,
  approvedScopes: z.array(platformScopeSchema),
  /**
   * Requested scopes (approved ones plus any pending review). Always
   * populate; optional only for older servers.
   */
  requestedScopes: z.array(platformScopeSchema).optional(),
})

export type EnvironmentSummary = z.infer<typeof environmentSummarySchema>

export const appSchema = z.object({
  id: uuidSchema,
  organizationId: uuidSchema,
  name: z.string(),
  slug: z.string(),
  description: z.string().nullable(),
  logoUrl: z.string().nullable(),
  websiteUrl: z.string().nullable(),
  privacyUrl: z.string().nullable(),
  termsUrl: z.string().nullable(),
  supportEmail: z.string().nullable(),
  status: appStatusSchema,
  environments: z.array(environmentSummarySchema),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
})

export type App = z.infer<typeof appSchema>

/** GET /api/orgs/{orgId}/apps */
export const appListResponseSchema = z.object({
  data: z.array(appSchema),
})

const appProfileFields = {
  description: optionalText(500).optional(),
  logoUrl: httpsUrlSchema.nullable().optional(),
  websiteUrl: httpsUrlSchema.nullable().optional(),
  privacyUrl: httpsUrlSchema.nullable().optional(),
  termsUrl: httpsUrlSchema.nullable().optional(),
  supportEmail: emailSchema.nullable().optional(),
}

/** POST /api/orgs/{orgId}/apps -> appSchema (creates test + live envs) */
export const createAppRequestSchema = z.object({
  name: z.string().trim().min(1).max(80),
  slug: slugSchema.optional(),
  ...appProfileFields,
})

export type CreateAppRequest = z.infer<typeof createAppRequestSchema>

/** GET /api/apps/{appId} -> appSchema; PATCH /api/apps/{appId} -> appSchema */
export const updateAppRequestSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  slug: slugSchema.optional(),
  ...appProfileFields,
})

export type UpdateAppRequest = z.infer<typeof updateAppRequestSchema>

// POST /api/apps/{appId}/retire -> appSchema (step-up)

// ---------------------------------------------------------------------------
// Environments
// ---------------------------------------------------------------------------

export const environmentSchema = z.object({
  id: uuidSchema,
  appId: uuidSchema,
  kind: environmentKindSchema,
  network: networkSlugSchema,
  clientId: clientIdSchema,
  clientType: clientTypeSchema,
  reviewState: reviewStateSchema,
  requestedScopes: z.array(platformScopeSchema),
  approvedScopes: z.array(platformScopeSchema),
  /**
   * Requested OIDC scopes users may decline at consent (toggles); the rest
   * are required. Validate with `validateOptionalScopes` (scopes). Always
   * populate; optional only for older servers.
   */
  optionalScopes: z.array(oidcScopeSchema).optional(),
  scopeVersion: z.number().int().positive(),
  redirectUris: z.array(z.string()),
  origins: z.array(z.string()),
  openReview: reviewSchema.nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
})

export type Environment = z.infer<typeof environmentSchema>

// GET /api/apps/{appId}/environments/{kind} -> environmentSchema
// GET /api/environments/{environmentId} -> environmentSchema

/** PATCH /api/environments/{environmentId} -> environmentSchema */
export const updateEnvironmentRequestSchema = z.object({
  clientType: clientTypeSchema,
})

/** PUT /api/environments/{environmentId}/redirect-uris -> environmentSchema.
 * Each URI is validated with `validateRedirectUri` for the env kind. */
export const replaceRedirectUrisRequestSchema = z.object({
  uris: z.array(z.string().min(1).max(2048)).max(20),
})

/** PUT /api/environments/{environmentId}/origins -> environmentSchema.
 * Each origin is validated with `validateOrigin` for the env kind. */
export const replaceOriginsRequestSchema = z.object({
  origins: z.array(z.string().min(1).max(2048)).max(20),
})

/** PUT /api/environments/{environmentId}/scopes -> environmentSchema */
export const updateRequestedScopesRequestSchema = z.object({
  requestedScopes: z.array(platformScopeSchema).max(16),
  /** Omitted = keep the current optional subset (minus removed scopes). */
  optionalScopes: z.array(oidcScopeSchema).max(8).optional(),
})

/** POST /api/environments/{environmentId}/submit-review */
export const submitReviewRequestSchema = z.object({
  note: z.string().trim().max(2000).optional(),
})

export const submitReviewResponseSchema = z.object({
  environment: environmentSchema,
  review: reviewSchema.nullable(),
  /** True when auto-approval moved the environment straight to approved. */
  autoApproved: z.boolean(),
})

export type SubmitReviewResponse = z.infer<typeof submitReviewResponseSchema>

// POST /api/environments/{environmentId}/withdraw-review -> environmentSchema

// ---------------------------------------------------------------------------
// API keys
// ---------------------------------------------------------------------------

export const apiKeyRecordSchema = z.object({
  id: uuidSchema,
  environmentId: uuidSchema,
  kind: apiKeyKindSchema,
  name: z.string(),
  /** Display prefix, e.g. `mbx_sk_live_AbCdEfGhIjKl`. */
  displayPrefix: z.string(),
  allowedCidrs: z.array(z.string()),
  status: credentialStatusSchema,
  createdBy: uuidSchema.nullable(),
  createdAt: isoDateTimeSchema,
  expiresAt: isoDateTimeSchema.nullable(),
  lastUsedAt: isoDateTimeSchema.nullable(),
  revokedAt: isoDateTimeSchema.nullable(),
  rotatedFrom: uuidSchema.nullable(),
})

export type ApiKeyRecord = z.infer<typeof apiKeyRecordSchema>

/** GET /api/environments/{environmentId}/api-keys */
export const apiKeyListResponseSchema = z.object({
  data: z.array(apiKeyRecordSchema),
})

const cidrSchema = z.string().min(3).max(64)

/** POST /api/environments/{environmentId}/api-keys (step-up) */
export const createApiKeyRequestSchema = z.object({
  kind: apiKeyKindSchema,
  name: z.string().trim().min(1).max(80),
  /** Secret keys only. */
  allowedCidrs: z.array(cidrSchema).max(20).default([]),
  expiresAt: isoDateTimeSchema.nullable().default(null),
})

export type CreateApiKeyRequest = z.infer<typeof createApiKeyRequestSchema>

/** The full key is returned exactly once. */
export const createdApiKeyResponseSchema = z.object({
  apiKey: apiKeyRecordSchema,
  key: z.string(),
})

export type CreatedApiKeyResponse = z.infer<typeof createdApiKeyResponseSchema>

/** PATCH /api/api-keys/{apiKeyId} -> apiKeyRecordSchema */
export const updateApiKeyRequestSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  allowedCidrs: z.array(cidrSchema).max(20).optional(),
})

/** POST /api/api-keys/{apiKeyId}/rotate (step-up). The old key expires after
 * the overlap window. */
export const rotateApiKeyRequestSchema = z.object({
  overlapSeconds: z
    .number()
    .int()
    .min(0)
    .max(7 * 24 * 60 * 60)
    .default(24 * 60 * 60),
})

export const rotatedApiKeyResponseSchema = z.object({
  apiKey: apiKeyRecordSchema,
  key: z.string(),
  previous: apiKeyRecordSchema,
})

export type RotatedApiKeyResponse = z.infer<typeof rotatedApiKeyResponseSchema>

/** POST /api/api-keys/{apiKeyId}/expire -> apiKeyRecordSchema */
export const expireApiKeyRequestSchema = z.object({
  expiresAt: isoDateTimeSchema,
})

// POST /api/api-keys/{apiKeyId}/revoke -> apiKeyRecordSchema

// ---------------------------------------------------------------------------
// Client secrets
// ---------------------------------------------------------------------------

export const clientSecretRecordSchema = z.object({
  id: uuidSchema,
  environmentId: uuidSchema,
  /** Display prefix, e.g. `mbx_cs_AbCdEfGhIjKl`. */
  displayPrefix: z.string(),
  status: credentialStatusSchema,
  createdBy: uuidSchema.nullable(),
  createdAt: isoDateTimeSchema,
  expiresAt: isoDateTimeSchema.nullable(),
  revokedAt: isoDateTimeSchema.nullable(),
})

export type ClientSecretRecord = z.infer<typeof clientSecretRecordSchema>

export const maxActiveClientSecrets = 2

/** GET /api/environments/{environmentId}/client-secrets */
export const clientSecretListResponseSchema = z.object({
  data: z.array(clientSecretRecordSchema),
})

/** POST /api/environments/{environmentId}/client-secrets (step-up) */
export const createClientSecretRequestSchema = z.object({
  expiresAt: isoDateTimeSchema.nullable().default(null),
})

export const createdClientSecretResponseSchema = z.object({
  clientSecret: clientSecretRecordSchema,
  secret: z.string(),
})

export type CreatedClientSecretResponse = z.infer<
  typeof createdClientSecretResponseSchema
>

// POST /api/client-secrets/{clientSecretId}/revoke -> clientSecretRecordSchema

// ---------------------------------------------------------------------------
// Usage (Analytics Engine)
// ---------------------------------------------------------------------------

export const usageBucketSchema = z.enum(["minute", "hour", "day"])

export type UsageBucket = z.infer<typeof usageBucketSchema>

export const usageBucketSeconds = {
  minute: 60,
  hour: 3_600,
  day: 86_400,
} as const satisfies Record<UsageBucket, number>

/** Longest range allowed per bucket size. */
export const usageMaxRangeSeconds = {
  minute: 6 * 3_600,
  hour: 7 * 86_400,
  day: 90 * 86_400,
} as const satisfies Record<UsageBucket, number>

/** GET /api/environments/{environmentId}/usage (and /usage.csv) query. */
export const usageQuerySchema = z
  .object({
    from: isoDateTimeSchema,
    to: isoDateTimeSchema,
    bucket: usageBucketSchema.default("hour"),
    apiKeyId: uuidSchema.optional(),
  })
  .refine((query) => Date.parse(query.from) < Date.parse(query.to), {
    message: "`from` must be before `to`",
    path: ["from"],
  })
  .refine(
    (query) =>
      (Date.parse(query.to) - Date.parse(query.from)) / 1000 <=
      usageMaxRangeSeconds[query.bucket],
    { message: "Range too long for bucket", path: ["to"] },
  )

export type UsageQuery = z.output<typeof usageQuerySchema>

const latencySchema = z.number().nonnegative().nullable()

const countSchema = z.number().int().nonnegative()

/**
 * Status split shared by every usage view. `errors` = all >= 400;
 * `clientErrors` = 4xx excluding 429; `rateLimited` = 429;
 * `serverErrors` = 5xx (so errors = clientErrors + rateLimited +
 * serverErrors). Analytics Engine predicates on `double2` (status code):
 * clientErrors `>= 400 AND < 500 AND != 429`, rateLimited `= 429`,
 * serverErrors `>= 500`.
 */
export const usageCountsSchema = z.object({
  requests: countSchema,
  errors: countSchema,
  clientErrors: countSchema,
  rateLimited: countSchema,
  serverErrors: countSchema,
})

export type UsageCounts = z.infer<typeof usageCountsSchema>

/** Counts plus error rate and latency for a whole range. */
export const usageSummarySchema = usageCountsSchema.extend({
  /** errors / requests in [0, 1]; null when there were no requests. */
  errorRate: z.number().min(0).max(1).nullable(),
  p50LatencyMs: latencySchema,
  p95LatencyMs: latencySchema,
})

export type UsageSummary = z.infer<typeof usageSummarySchema>

export const usageSplitSeriesPointSchema = usageCountsSchema.extend({
  start: isoDateTimeSchema,
  p50LatencyMs: latencySchema,
  p95LatencyMs: latencySchema,
})

export type UsageSplitSeriesPoint = z.infer<typeof usageSplitSeriesPointSchema>

/** errors / requests, or null when there were no requests. */
export function usageErrorRate(counts: {
  requests: number
  errors: number
}): number | null {
  if (counts.requests <= 0) return null
  return Math.min(Math.max(counts.errors / counts.requests, 0), 1)
}

export const usageTotalsSchema = z.object({
  requests: z.number().int().nonnegative(),
  errors: z.number().int().nonnegative(),
  /** errors / requests in [0, 1]; null when there were no requests. */
  errorRate: z.number().min(0).max(1).nullable(),
  p50LatencyMs: latencySchema,
  p95LatencyMs: latencySchema,
  /** Split of `errors` (see `usageCountsSchema`). Always populate;
   * optional only for older servers. */
  clientErrors: countSchema.optional(),
  rateLimited: countSchema.optional(),
  serverErrors: countSchema.optional(),
})

export type UsageTotals = z.infer<typeof usageTotalsSchema>

export const usageSeriesPointSchema = z.object({
  start: isoDateTimeSchema,
  requests: z.number().int().nonnegative(),
  errors: z.number().int().nonnegative(),
  p50LatencyMs: latencySchema,
  p95LatencyMs: latencySchema,
  /** Split of `errors` (see `usageCountsSchema`). Always populate. */
  clientErrors: countSchema.optional(),
  rateLimited: countSchema.optional(),
  serverErrors: countSchema.optional(),
})

export const usageRouteSchema = z.object({
  route: z.string(),
  method: z.string(),
  requests: z.number().int().nonnegative(),
  errors: z.number().int().nonnegative(),
  p95LatencyMs: latencySchema,
})

export const usageByKeySchema = z.object({
  apiKeyId: uuidSchema.nullable(),
  displayPrefix: z.string().nullable(),
  requests: z.number().int().nonnegative(),
  errors: z.number().int().nonnegative(),
})

export const usageResponseSchema = z.object({
  from: isoDateTimeSchema,
  to: isoDateTimeSchema,
  bucket: usageBucketSchema,
  totals: usageTotalsSchema,
  series: z.array(usageSeriesPointSchema),
  topRoutes: z.array(usageRouteSchema),
  byKey: z.array(usageByKeySchema),
})

export type UsageResponse = z.infer<typeof usageResponseSchema>

export const requestStatusClassSchema = z.enum([
  "success",
  "client-error",
  "server-error",
])

/**
 * Request-log status filter (All / 2xx / 4xx / 5xx / 429 chips):
 * `client-error` here excludes 429, which has its own `rate-limited`.
 * Supersedes `requestStatusClassSchema` for new code.
 */
export const requestStatusFilterSchema = z.enum([
  "success",
  "client-error",
  "rate-limited",
  "server-error",
])

export type RequestStatusFilter = z.infer<typeof requestStatusFilterSchema>

/** Which filter bucket a status code falls in. */
export function requestStatusFilterFor(status: number): RequestStatusFilter {
  if (status === 429) return "rate-limited"
  if (status >= 500) return "server-error"
  if (status >= 400) return "client-error"
  return "success"
}

export const requestLogEntrySchema = z.object({
  requestId: z.string(),
  timestamp: isoDateTimeSchema,
  apiKeyId: uuidSchema.nullable(),
  route: z.string(),
  method: z.string(),
  status: z.number().int(),
  cacheStatus: z.string().nullable(),
  colo: z.string().nullable(),
  country: z.string().nullable(),
  latencyMs: z.number().nonnegative(),
  /** Platform error code (`rate_limited`, `not_found`, …) from the request
   * log's `errorCode` column; null for successes and older rows. */
  errorCode: z.string().nullable().optional(),
})

export type RequestLogEntry = z.infer<typeof requestLogEntrySchema>

/** GET /api/environments/{environmentId}/requests */
export const requestLogQuerySchema = z.object({
  from: isoDateTimeSchema,
  to: isoDateTimeSchema,
  statusClass: requestStatusClassSchema.optional(),
  apiKeyId: uuidSchema.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
})

export const requestLogResponseSchema = z.object({
  data: z.array(requestLogEntrySchema),
})

// ---------------------------------------------------------------------------
// Organization usage (C06): every app and environment of the org
// ---------------------------------------------------------------------------

export const environmentKindFilterSchema = z.enum(["live", "test", "both"])

export type EnvironmentKindFilter = z.infer<typeof environmentKindFilterSchema>

/** GET /api/orgs/{orgId}/usage (and /usage.csv) query. */
export const orgUsageQuerySchema = z
  .object({
    from: isoDateTimeSchema,
    to: isoDateTimeSchema,
    bucket: usageBucketSchema.default("day"),
    environmentKind: environmentKindFilterSchema.default("both"),
    appId: uuidSchema.optional(),
    apiKeyId: uuidSchema.optional(),
  })
  .refine((query) => Date.parse(query.from) < Date.parse(query.to), {
    message: "`from` must be before `to`",
    path: ["from"],
  })
  .refine(
    (query) =>
      (Date.parse(query.to) - Date.parse(query.from)) / 1000 <=
      usageMaxRangeSeconds[query.bucket],
    { message: "Range too long for bucket", path: ["to"] },
  )

export type OrgUsageQuery = z.output<typeof orgUsageQuerySchema>

export const orgUsageEnvironmentSchema = z.object({
  app: z.object({ id: uuidSchema, name: z.string(), status: appStatusSchema }),
  environmentId: uuidSchema,
  environmentKind: environmentKindSchema,
  network: networkSlugSchema,
  /** All zeros + null latency = "No traffic" (a real zero, not missing). */
  summary: usageSummarySchema,
  /** One point per UTC day of the range (the "7 d" sparkline). */
  daily: z.array(z.object({ start: isoDateTimeSchema, requests: countSchema })),
})

export type OrgUsageEnvironment = z.infer<typeof orgUsageEnvironmentSchema>

export const orgUsageKeySchema = z.object({
  apiKeyId: uuidSchema.nullable(),
  displayPrefix: z.string().nullable(),
  app: z.object({ id: uuidSchema, name: z.string() }).nullable(),
  environmentKind: environmentKindSchema.nullable(),
  requests: countSchema,
  errors: countSchema,
})

export type OrgUsageKey = z.infer<typeof orgUsageKeySchema>

/**
 * Org-wide usage across the selected environments (`both` = Live + Test).
 * `byEnvironment` lists every environment in scope, including those
 * without traffic, so per-app "Requests · 7 d" on Apps (C03) is the sum of
 * an app's rows.
 */
export const orgUsageResponseSchema = z.object({
  from: isoDateTimeSchema,
  to: isoDateTimeSchema,
  bucket: usageBucketSchema,
  environmentKind: environmentKindFilterSchema,
  totals: usageSummarySchema,
  series: z.array(usageSplitSeriesPointSchema),
  byEnvironment: z.array(orgUsageEnvironmentSchema),
  topRoutes: z.array(usageRouteSchema),
  byKey: z.array(orgUsageKeySchema),
})

export type OrgUsageResponse = z.infer<typeof orgUsageResponseSchema>

// GET /api/environments/{environmentId}/quota
//   -> rate-limits environmentQuotaStatusSchema
// GET /api/orgs/{orgId}/quotas?environmentKind
//   -> rate-limits environmentQuotaListResponseSchema
// GET /api/platform/health
//   -> platform-health platformHealthResponseSchema

// ---------------------------------------------------------------------------
// Organization reviews (C02 "Reviews")
// ---------------------------------------------------------------------------

export const orgReviewSchema = developerReviewSchema.extend({
  app: z.object({ id: uuidSchema, name: z.string() }),
  environmentKind: environmentKindSchema,
})

export type OrgReview = z.infer<typeof orgReviewSchema>

/** GET /api/orgs/{orgId}/reviews — newest first
 * (`compareReviewsNewestFirst`); `state` omitted = every state. */
export const orgReviewQuerySchema = z.object({
  state: reviewRecordStateSchema.optional(),
  limit: z.coerce.number().int().min(1).max(50).default(10),
})

export const orgReviewListResponseSchema = z.object({
  data: z.array(orgReviewSchema),
})

export type OrgReviewListResponse = z.infer<typeof orgReviewListResponseSchema>

// GET /api/environments/{environmentId}/requests/{requestId}
//   -> requestLogEntrySchema | 404 not_found

// ---------------------------------------------------------------------------
// OAuth stats
// ---------------------------------------------------------------------------

/** GET /api/environments/{environmentId}/oauth?from&to */
export const oauthStatsQuerySchema = z.object({
  from: isoDateTimeSchema,
  to: isoDateTimeSchema,
})

/**
 * Active grants consented at a lower `scope_version` than the
 * environment's: their next sign-in shows consent again (C04d "Awaiting
 * re-consent · scope v2 → v3").
 */
export const reconsentSummarySchema = z.object({
  count: z.number().int().nonnegative(),
  currentScopeVersion: z.number().int().positive(),
  /** Lowest scope version among those grants; null when `count` is 0. */
  oldestScopeVersion: z.number().int().positive().nullable(),
})

export type ReconsentSummary = z.infer<typeof reconsentSummarySchema>

export const oauthStatsResponseSchema = z.object({
  activeGrants: z.number().int().nonnegative(),
  grantsCreated: z.number().int().nonnegative(),
  revocations: z.object({
    total: z.number().int().nonnegative(),
    byReason: z.record(
      grantRevokedReasonSchema,
      z.number().int().nonnegative(),
    ),
  }),
  grantsByScope: z.array(
    z.object({
      scope: platformScopeSchema,
      activeGrants: z.number().int().nonnegative(),
    }),
  ),
  /** Always populate; optional only for older servers. */
  awaitingReconsent: reconsentSummarySchema.optional(),
})

export type OAuthStatsResponse = z.infer<typeof oauthStatsResponseSchema>

// GET /api/environments/{environmentId}/consent-preview
//   -> identity authorizationRequestDetailSchema with placeholder values

// ---------------------------------------------------------------------------
// Admin: /api/admin/* (staff only)
// ---------------------------------------------------------------------------

export const adminReviewSchema = reviewSchema.extend({
  organization: z.object({ id: uuidSchema, name: z.string() }),
  app: z.object({
    id: uuidSchema,
    name: z.string(),
    websiteUrl: z.string().nullable(),
    status: appStatusSchema,
    /** Always populate; optional only for older servers. */
    privacyUrl: z.string().nullable().optional(),
    termsUrl: z.string().nullable().optional(),
    supportEmail: z.string().nullable().optional(),
  }),
  environment: z.object({
    id: uuidSchema,
    kind: environmentKindSchema,
    clientId: clientIdSchema,
    approvedScopes: z.array(platformScopeSchema),
  }),
  submitterEmail: z.string().nullable(),
})

export type AdminReview = z.infer<typeof adminReviewSchema>

/** GET /api/admin/reviews */
export const adminReviewQuerySchema = z.object({
  state: reviewRecordStateSchema.default("open"),
  /** Only reviews whose requested scopes include this scope. */
  scope: platformScopeSchema.optional(),
  cursor: z.string().min(1).max(1024).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
})

export const adminReviewListResponseSchema = z.object({
  data: z.array(adminReviewSchema),
  nextCursor: z.string().nullable(),
})

// GET /api/admin/reviews/{reviewId} -> adminReviewSchema

/**
 * GET /api/admin/reviews/{reviewId}/context (C09b strip): what staff need
 * to judge a review without reading the org's own usage or OAuth views.
 */
export const adminReviewContextResponseSchema = z.object({
  /** The app's test environment over the last 7 days; null when analytics
   * are unavailable or the app has no test environment. */
  testUsage7d: z
    .object({
      requests: z.number().int().nonnegative(),
      errors: z.number().int().nonnegative(),
      /** errors / requests in [0, 1]; null when there were no requests. */
      errorRate: z.number().min(0).max(1).nullable(),
    })
    .nullable(),
  /** Active grants on the test environment; null when unavailable. */
  testActiveGrants: z.number().int().nonnegative().nullable(),
  /** Decided reviews of this environment created before this one. */
  priorReviews: z.number().int().nonnegative(),
  /** The environment's current scope version ("scope v2 → v3"). */
  scopeVersion: z.number().int().positive(),
  /** Version an approval would set; null when it adds no scope. */
  nextScopeVersion: z.number().int().positive().nullable(),
})

export type AdminReviewContextResponse = z.infer<
  typeof adminReviewContextResponseSchema
>

/**
 * GET /api/admin/reviews/stats (C09 header). Decisions count staff
 * decisions only (auto-approvals and withdrawals excluded); the median wait
 * is over those decisions, submission → decision.
 */
export const adminReviewStatsResponseSchema = z.object({
  open: z.number().int().nonnegative(),
  oldestOpen: z
    .object({
      reviewId: uuidSchema,
      appName: z.string(),
      createdAt: isoDateTimeSchema,
    })
    .nullable(),
  decided7d: z.object({
    total: z.number().int().nonnegative(),
    approved: z.number().int().nonnegative(),
    changesRequested: z.number().int().nonnegative(),
    rejected: z.number().int().nonnegative(),
  }),
  medianWaitSeconds: z.number().int().nonnegative().nullable(),
})

export type AdminReviewStatsResponse = z.infer<
  typeof adminReviewStatsResponseSchema
>

export const adminReviewStatsWindowSeconds = 7 * 86_400

/** Computes the stats from open reviews plus recently decided ones. */
export function adminReviewStats(
  reviews: readonly (Pick<
    Review,
    "id" | "state" | "reviewerId" | "createdAt" | "decidedAt"
  > & { appName: string })[],
  now: Date,
): AdminReviewStatsResponse {
  const since = now.getTime() - adminReviewStatsWindowSeconds * 1000
  const open = reviews
    .filter((review) => review.state === "open")
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))
  const waits: number[] = []
  const decided7d = { total: 0, approved: 0, changesRequested: 0, rejected: 0 }
  for (const review of reviews) {
    if (review.decidedAt === null || reviewDecidedBy(review) !== "staff") {
      continue
    }
    const decidedAt = Date.parse(review.decidedAt)
    if (decidedAt < since || decidedAt > now.getTime()) continue
    decided7d.total += 1
    if (review.state === "approved") decided7d.approved += 1
    if (review.state === "changes-requested") decided7d.changesRequested += 1
    if (review.state === "rejected") decided7d.rejected += 1
    waits.push(
      Math.max(
        Math.round((decidedAt - Date.parse(review.createdAt)) / 1000),
        0,
      ),
    )
  }
  waits.sort((a, b) => a - b)
  const middle = Math.floor(waits.length / 2)
  const upper = waits[middle]
  const lower = waits[middle - 1]
  const median =
    upper === undefined
      ? null
      : waits.length % 2 === 1 || lower === undefined
        ? upper
        : Math.round((lower + upper) / 2)
  const oldest = open[0]
  return {
    open: open.length,
    oldestOpen:
      oldest === undefined
        ? null
        : {
            reviewId: oldest.id,
            appName: oldest.appName,
            createdAt: oldest.createdAt,
          },
    decided7d,
    medianWaitSeconds: median,
  }
}

/** POST /api/admin/reviews/{reviewId}/decision -> adminReviewSchema */
export const reviewDecisionRequestSchema = z.object({
  decision: reviewDecisionSchema,
  note: z.string().trim().max(2000).optional(),
  /** Approve a subset of the requested scopes; defaults to all requested. */
  approvedScopes: z.array(platformScopeSchema).optional(),
})

export type ReviewDecisionRequest = z.infer<typeof reviewDecisionRequestSchema>

/** GET /api/admin/apps */
export const adminAppQuerySchema = z.object({
  query: z.string().trim().max(120).optional(),
  status: appStatusSchema.optional(),
  cursor: z.string().min(1).max(1024).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
})

export const adminAppSchema = appSchema.extend({
  organization: z.object({ id: uuidSchema, name: z.string() }),
})

export const adminAppListResponseSchema = z.object({
  data: z.array(adminAppSchema),
  nextCursor: z.string().nullable(),
})

/** POST /api/admin/apps/{appId}/status -> adminAppSchema */
export const appStatusChangeRequestSchema = z.object({
  status: appStatusSchema,
  reason: z.string().trim().min(1).max(2000),
})

export type AppStatusChangeRequest = z.infer<
  typeof appStatusChangeRequestSchema
>

export const quotaOverrideRecordSchema = z.object({
  id: uuidSchema,
  environmentId: uuidSchema,
  endpointClass: endpointClassSchema,
  perMinute: z.number().int().positive(),
  perDay: z.number().int().positive(),
  reason: z.string(),
  createdBy: uuidSchema.nullable(),
  createdAt: isoDateTimeSchema,
  expiresAt: isoDateTimeSchema.nullable(),
})

export type QuotaOverrideRecord = z.infer<typeof quotaOverrideRecordSchema>

/** GET /api/admin/environments/{environmentId}/quota-overrides */
export const quotaOverrideListResponseSchema = z.object({
  data: z.array(quotaOverrideRecordSchema),
})

/** POST /api/admin/environments/{environmentId}/quota-overrides */
export const createQuotaOverrideRequestSchema = z.object({
  endpointClass: endpointClassSchema,
  perMinute: z.number().int().positive().max(1_000_000),
  perDay: z.number().int().positive().max(1_000_000_000),
  reason: z.string().trim().min(1).max(2000),
  expiresAt: isoDateTimeSchema.nullable().default(null),
})

// DELETE /api/admin/quota-overrides/{quotaOverrideId} -> ok (expires it now)

/** GET /api/admin/audit */
export const auditSearchQuerySchema = z.object({
  organizationId: uuidSchema.optional(),
  appId: uuidSchema.optional(),
  environmentId: uuidSchema.optional(),
  actorType: auditActorTypeSchema.optional(),
  actorId: z.string().max(128).optional(),
  action: auditActionSchema.optional(),
  from: isoDateTimeSchema.optional(),
  to: isoDateTimeSchema.optional(),
  cursor: z.string().min(1).max(1024).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
})

export type AuditSearchQuery = z.output<typeof auditSearchQuerySchema>

export const auditSearchResponseSchema = z.object({
  data: z.array(auditEventSchema),
  nextCursor: z.string().nullable(),
})

export type AuditSearchResponse = z.infer<typeof auditSearchResponseSchema>

// GET /api/orgs/{orgId}/audit and GET /api/apps/{appId}/audit reuse
// auditSearchQuerySchema (org/app scoping forced server-side).
