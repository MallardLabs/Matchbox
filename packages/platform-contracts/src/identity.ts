import { z } from "zod"
import { addressSchema, isoDateTimeSchema, uuidSchema } from "./common"
import { environmentKindSchema, networkSlugSchema } from "./network"
import { oidcClaimSchema, oidcScopeSchema } from "./scopes"

/** Request/response schemas for the Matchbox ID `/api/*` routes. */

export const grantRevokedReasonSchema = z.enum([
  "user-revoked",
  "app-suspended",
  "discord-link-changed",
  "scope-changed",
  "account-disabled",
])

export type GrantRevokedReason = z.infer<typeof grantRevokedReasonSchema>

// POST /api/siwe/nonce ------------------------------------------------------

export const siweNonceResponseSchema = z.object({
  nonce: z.string().regex(/^[0-9A-Za-z]{8,64}$/),
})

export type SiweNonceResponse = z.infer<typeof siweNonceResponseSchema>

// POST /api/siwe/verify -----------------------------------------------------

export const siweVerifyRequestSchema = z.object({
  message: z.string().min(1).max(4096),
  signature: z.string().regex(/^0x[0-9a-fA-F]+$/, "Expected a hex signature"),
})

export type SiweVerifyRequest = z.infer<typeof siweVerifyRequestSchema>

export const linkedDiscordSchema = z.object({
  id: z.string(),
  username: z.string().nullable(),
  displayName: z.string().nullable(),
  avatarUrl: z.string().nullable(),
})

export type LinkedDiscord = z.infer<typeof linkedDiscordSchema>

export const identityAccountSchema = z.object({
  walletAddress: addressSchema,
  discord: linkedDiscordSchema.nullable(),
})

export type IdentityAccount = z.infer<typeof identityAccountSchema>

export const siweVerifyResponseSchema = z.object({
  account: identityAccountSchema,
})

export type SiweVerifyResponse = z.infer<typeof siweVerifyResponseSchema>

// GET /api/session ----------------------------------------------------------

export const sessionResponseSchema = z.object({
  account: identityAccountSchema.nullable(),
})

export type SessionResponse = z.infer<typeof sessionResponseSchema>

// POST /api/session/sign-out -> okResponseSchema (common)

// GET /api/authorization-requests/{id} --------------------------------------

export const authorizationRequestIdSchema = uuidSchema

export const consentAppSchema = z.object({
  name: z.string(),
  logoUrl: z.string().nullable(),
  websiteUrl: z.string().nullable(),
  privacyUrl: z.string().nullable(),
  termsUrl: z.string().nullable(),
  status: z.enum(["active", "restricted"]),
})

export type ConsentApp = z.infer<typeof consentAppSchema>

export const scopeUnavailableReasonSchema = z.enum([
  "discord-not-linked",
  "not-approved",
  "disabled",
])

export type ScopeUnavailableReason = z.infer<
  typeof scopeUnavailableReasonSchema
>

export const claimPreviewSchema = z.object({
  claim: oidcClaimSchema,
  label: z.string(),
  /** The signed-in user's own value; null when not available. */
  value: z.string().nullable(),
})

export type ClaimPreview = z.infer<typeof claimPreviewSchema>

export const consentScopeSchema = z.object({
  scope: oidcScopeSchema,
  label: z.string(),
  description: z.string(),
  claims: z.array(claimPreviewSchema),
  available: z.boolean(),
  unavailableReason: scopeUnavailableReasonSchema.nullable(),
  /** True when an existing grant already covers this scope. */
  previouslyGranted: z.boolean(),
})

export type ConsentScope = z.infer<typeof consentScopeSchema>

export const authorizationRequestDetailSchema = z.object({
  id: authorizationRequestIdSchema,
  app: consentAppSchema,
  environmentKind: environmentKindSchema,
  network: networkSlugSchema,
  redirectOrigin: z.string(),
  scopes: z.array(consentScopeSchema),
  existingGrant: z
    .object({
      id: uuidSchema,
      scopes: z.array(oidcScopeSchema),
      createdAt: isoDateTimeSchema,
    })
    .nullable(),
  diff: z.object({
    added: z.array(oidcScopeSchema),
    removed: z.array(oidcScopeSchema),
    unchanged: z.array(oidcScopeSchema),
  }),
  /** True when the decision can be approved (all scopes available). */
  approvable: z.boolean(),
  expiresAt: isoDateTimeSchema,
})

export type AuthorizationRequestDetail = z.infer<
  typeof authorizationRequestDetailSchema
>

// POST /api/authorization-requests/{id}/decision ----------------------------

export const authorizationDecisionSchema = z.enum(["approve", "deny"])

export const authorizationDecisionRequestSchema = z.object({
  decision: authorizationDecisionSchema,
})

export type AuthorizationDecisionRequest = z.infer<
  typeof authorizationDecisionRequestSchema
>

export const authorizationDecisionResponseSchema = z.object({
  redirectTo: z.url(),
})

export type AuthorizationDecisionResponse = z.infer<
  typeof authorizationDecisionResponseSchema
>

// GET /api/grants, DELETE /api/grants/{id} ----------------------------------

export const connectedAppGrantSchema = z.object({
  id: uuidSchema,
  app: z.object({
    name: z.string(),
    logoUrl: z.string().nullable(),
    websiteUrl: z.string().nullable(),
  }),
  environmentKind: environmentKindSchema,
  scopes: z.array(oidcScopeSchema),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
})

export type ConnectedAppGrant = z.infer<typeof connectedAppGrantSchema>

export const grantListResponseSchema = z.object({
  data: z.array(connectedAppGrantSchema),
})

export type GrantListResponse = z.infer<typeof grantListResponseSchema>

// GET /api/sessions, DELETE /api/sessions/{id} ------------------------------

export const deviceSessionSchema = z.object({
  id: uuidSchema,
  createdAt: isoDateTimeSchema,
  lastSeenAt: isoDateTimeSchema.nullable(),
  expiresAt: isoDateTimeSchema,
  userAgent: z.string().nullable(),
  ipPrefix: z.string().nullable(),
  current: z.boolean(),
})

export type DeviceSession = z.infer<typeof deviceSessionSchema>

export const sessionListResponseSchema = z.object({
  data: z.array(deviceSessionSchema),
})

export type SessionListResponse = z.infer<typeof sessionListResponseSchema>

export const idPathParamsSchema = z.object({ id: uuidSchema })
