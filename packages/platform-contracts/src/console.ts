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
import { platformScopeSchema } from "./scopes"

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

export const emailChallengePurposeSchema = z.enum([
  "sign-up",
  "recovery",
  "invitation",
])

export type EmailChallengePurpose = z.infer<typeof emailChallengePurposeSchema>

export const webauthnChallengePurposeSchema = z.enum([
  "register",
  "authenticate",
  "step-up",
])

export type WebauthnChallengePurpose = z.infer<
  typeof webauthnChallengePurposeSchema
>

export const passkeyDeviceTypeSchema = z.enum(["single-device", "multi-device"])

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

export const emailCodeSchema = z.string().regex(/^[0-9]{6}$/, "6-digit code")

export const consolePaths = {
  orgId: z.object({ orgId: uuidSchema }),
  appId: z.object({ appId: uuidSchema }),
  environmentId: z.object({ environmentId: uuidSchema }),
  appEnvironment: z.object({ appId: uuidSchema, kind: environmentKindSchema }),
  member: z.object({ orgId: uuidSchema, accountId: uuidSchema }),
  invitation: z.object({ orgId: uuidSchema, invitationId: uuidSchema }),
  apiKeyId: z.object({ apiKeyId: uuidSchema }),
  clientSecretId: z.object({ clientSecretId: uuidSchema }),
  passkeyId: z.object({ passkeyId: uuidSchema }),
  sessionId: z.object({ sessionId: uuidSchema }),
  reviewId: z.object({ reviewId: uuidSchema }),
  quotaOverrideId: z.object({ quotaOverrideId: uuidSchema }),
  requestId: z.object({
    environmentId: uuidSchema,
    requestId: z.string().min(1).max(64),
  }),
} as const

// ---------------------------------------------------------------------------
// WebAuthn JSON (shapes of @simplewebauthn/server <-> /browser)
// ---------------------------------------------------------------------------

export const authenticatorTransportSchema = z.enum([
  "ble",
  "cable",
  "hybrid",
  "internal",
  "nfc",
  "smart-card",
  "usb",
])

const base64UrlStringSchema = z.string().regex(/^[A-Za-z0-9_-]+$/)

const credentialDescriptorSchema = z.object({
  id: base64UrlStringSchema,
  type: z.literal("public-key"),
  transports: z.array(authenticatorTransportSchema).optional(),
})

const userVerificationSchema = z.enum(["required", "preferred", "discouraged"])

export const registrationOptionsSchema = z.object({
  rp: z.object({ name: z.string(), id: z.string().optional() }),
  user: z.object({
    id: base64UrlStringSchema,
    name: z.string(),
    displayName: z.string(),
  }),
  challenge: base64UrlStringSchema,
  pubKeyCredParams: z.array(
    z.object({ alg: z.number().int(), type: z.literal("public-key") }),
  ),
  timeout: z.number().int().optional(),
  excludeCredentials: z.array(credentialDescriptorSchema).optional(),
  authenticatorSelection: z
    .object({
      authenticatorAttachment: z
        .enum(["platform", "cross-platform"])
        .optional(),
      residentKey: z.enum(["discouraged", "preferred", "required"]).optional(),
      requireResidentKey: z.boolean().optional(),
      userVerification: userVerificationSchema.optional(),
    })
    .optional(),
  attestation: z.enum(["none", "indirect", "direct", "enterprise"]).optional(),
  hints: z
    .array(z.enum(["hybrid", "security-key", "client-device"]))
    .optional(),
  extensions: z.record(z.string(), z.unknown()).optional(),
})

export type RegistrationOptions = z.infer<typeof registrationOptionsSchema>

export const authenticationOptionsSchema = z.object({
  challenge: base64UrlStringSchema,
  timeout: z.number().int().optional(),
  rpId: z.string().optional(),
  allowCredentials: z.array(credentialDescriptorSchema).optional(),
  userVerification: userVerificationSchema.optional(),
  hints: z
    .array(z.enum(["hybrid", "security-key", "client-device"]))
    .optional(),
  extensions: z.record(z.string(), z.unknown()).optional(),
})

export type AuthenticationOptions = z.infer<typeof authenticationOptionsSchema>

export const registrationCredentialSchema = z.object({
  id: base64UrlStringSchema,
  rawId: base64UrlStringSchema,
  type: z.literal("public-key"),
  response: z.object({
    clientDataJSON: base64UrlStringSchema,
    attestationObject: base64UrlStringSchema,
    authenticatorData: base64UrlStringSchema.optional(),
    transports: z.array(authenticatorTransportSchema).optional(),
    publicKeyAlgorithm: z.number().int().optional(),
    publicKey: base64UrlStringSchema.optional(),
  }),
  authenticatorAttachment: z.enum(["platform", "cross-platform"]).optional(),
  clientExtensionResults: z.record(z.string(), z.unknown()),
})

export type RegistrationCredential = z.infer<
  typeof registrationCredentialSchema
>

export const authenticationCredentialSchema = z.object({
  id: base64UrlStringSchema,
  rawId: base64UrlStringSchema,
  type: z.literal("public-key"),
  response: z.object({
    clientDataJSON: base64UrlStringSchema,
    authenticatorData: base64UrlStringSchema,
    signature: base64UrlStringSchema,
    userHandle: base64UrlStringSchema.optional(),
  }),
  authenticatorAttachment: z.enum(["platform", "cross-platform"]).optional(),
  clientExtensionResults: z.record(z.string(), z.unknown()),
})

export type AuthenticationCredential = z.infer<
  typeof authenticationCredentialSchema
>

// ---------------------------------------------------------------------------
// Auth: /api/auth/*
// ---------------------------------------------------------------------------

/** POST /api/auth/sign-up/start — sends a 6-digit code. */
export const signUpStartRequestSchema = z.object({
  email: emailSchema,
  displayName: displayNameSchema,
  invitationToken: z.string().min(1).max(256).optional(),
})

export type SignUpStartRequest = z.infer<typeof signUpStartRequestSchema>

/** Response for any endpoint that emails a code. Identical whether or not
 * the address exists, to avoid account enumeration. */
export const emailChallengeResponseSchema = z.object({
  challengeId: uuidSchema,
  expiresAt: isoDateTimeSchema,
})

export type EmailChallengeResponse = z.infer<
  typeof emailChallengeResponseSchema
>

/** POST /api/auth/sign-up/verify and POST /api/auth/recovery/verify. */
export const emailCodeVerifyRequestSchema = z.object({
  challengeId: uuidSchema,
  code: emailCodeSchema,
})

export type EmailCodeVerifyRequest = z.infer<
  typeof emailCodeVerifyRequestSchema
>

/** Returned after email verification and by POST /api/me/passkeys/options. */
export const passkeyRegistrationOptionsResponseSchema = z.object({
  challengeId: uuidSchema,
  options: registrationOptionsSchema,
})

export type PasskeyRegistrationOptionsResponse = z.infer<
  typeof passkeyRegistrationOptionsResponseSchema
>

/** POST /api/auth/passkeys/register — completes sign-up, recovery, or an
 * additional passkey for the signed-in account. */
export const passkeyRegisterRequestSchema = z.object({
  challengeId: uuidSchema,
  credential: registrationCredentialSchema,
  name: z.string().trim().min(1).max(64).optional(),
  /** Sign-up only: name of the first organization. */
  organizationName: z.string().trim().min(1).max(80).optional(),
})

export type PasskeyRegisterRequest = z.infer<
  typeof passkeyRegisterRequestSchema
>

/** POST /api/auth/passkeys/authenticate/options and
 * POST /api/auth/step-up/options (no body). */
export const passkeyAuthenticationOptionsResponseSchema = z.object({
  challengeId: uuidSchema,
  options: authenticationOptionsSchema,
})

export type PasskeyAuthenticationOptionsResponse = z.infer<
  typeof passkeyAuthenticationOptionsResponseSchema
>

/** POST /api/auth/passkeys/authenticate and POST /api/auth/step-up/verify. */
export const passkeyAuthenticateRequestSchema = z.object({
  challengeId: uuidSchema,
  credential: authenticationCredentialSchema,
})

export type PasskeyAuthenticateRequest = z.infer<
  typeof passkeyAuthenticateRequestSchema
>

/** POST /api/auth/recovery/start. Responds with emailChallengeResponse. */
export const recoveryStartRequestSchema = z.object({ email: emailSchema })

export type RecoveryStartRequest = z.infer<typeof recoveryStartRequestSchema>

/** POST /api/auth/step-up/verify response. */
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

/** Response of every successful sign-in/sign-up/recovery and GET /api/me. */
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

export const passkeySchema = z.object({
  id: uuidSchema,
  name: z.string().nullable(),
  deviceType: passkeyDeviceTypeSchema,
  backedUp: z.boolean(),
  transports: z.array(authenticatorTransportSchema),
  createdAt: isoDateTimeSchema,
  lastUsedAt: isoDateTimeSchema.nullable(),
})

export type Passkey = z.infer<typeof passkeySchema>

/** GET /api/me/passkeys */
export const passkeyListResponseSchema = z.object({
  data: z.array(passkeySchema),
})

/** PATCH /api/me/passkeys/{passkeyId} */
export const renamePasskeyRequestSchema = z.object({
  name: z.string().trim().min(1).max(64),
})

// DELETE /api/me/passkeys/{passkeyId} -> ok (refuses to delete the last one)
// POST /api/me/passkeys/options -> passkeyRegistrationOptionsResponse

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

export const environmentSummarySchema = z.object({
  id: uuidSchema,
  kind: environmentKindSchema,
  network: networkSlugSchema,
  clientId: clientIdSchema,
  reviewState: reviewStateSchema,
  approvedScopes: z.array(platformScopeSchema),
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

export const usageTotalsSchema = z.object({
  requests: z.number().int().nonnegative(),
  errors: z.number().int().nonnegative(),
  /** errors / requests in [0, 1]; null when there were no requests. */
  errorRate: z.number().min(0).max(1).nullable(),
  p50LatencyMs: latencySchema,
  p95LatencyMs: latencySchema,
})

export type UsageTotals = z.infer<typeof usageTotalsSchema>

export const usageSeriesPointSchema = z.object({
  start: isoDateTimeSchema,
  requests: z.number().int().nonnegative(),
  errors: z.number().int().nonnegative(),
  p50LatencyMs: latencySchema,
  p95LatencyMs: latencySchema,
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
  cursor: z.string().min(1).max(1024).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
})

export const adminReviewListResponseSchema = z.object({
  data: z.array(adminReviewSchema),
  nextCursor: z.string().nullable(),
})

// GET /api/admin/reviews/{reviewId} -> adminReviewSchema

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
