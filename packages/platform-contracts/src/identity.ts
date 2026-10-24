import { z } from "zod"
import { addressSchema, isoDateTimeSchema, uuidSchema } from "./common"
import { environmentKindSchema, networkSlugSchema } from "./network"
import {
  oidcClaimSchema,
  oidcScopeSchema,
  scopeRequirementSchema,
} from "./scopes"

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

export const signerKindSchema = z.enum(["eoa", "contract"])

export type SignerKind = z.infer<typeof signerKindSchema>

export const identityAccountSchema = z.object({
  walletAddress: addressSchema,
  discord: linkedDiscordSchema.nullable(),
  /** Network the current session's SIWE signature was verified on. */
  signedInNetwork: networkSlugSchema.nullable(),
  /** How the session's SIWE signature verified; null for older sessions. */
  signerKind: signerKindSchema.nullable().optional(),
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

/**
 * GET /api/authorization-requests/{id}/summary: public (no session), for
 * "Continue to <app>" on sign-in. 404 when unknown or expired.
 */
export const authorizationRequestSummarySchema = z.object({
  app: z.object({
    name: z.string(),
    logoUrl: z.string().nullable(),
    verified: z.boolean(),
  }),
  environmentKind: environmentKindSchema,
  network: networkSlugSchema,
})

export type AuthorizationRequestSummary = z.infer<
  typeof authorizationRequestSummarySchema
>

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
  /**
   * `optional` renders a toggle; declining it still signs the user in.
   * Absent = `required` (servers predating optional scopes).
   */
  requirement: scopeRequirementSchema.optional(),
  /** Optional scope the user declined on an existing grant (toggle off). */
  previouslyDeclined: z.boolean().optional(),
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
      /** Optional scopes declined on this grant. */
      declinedScopes: z.array(oidcScopeSchema).optional(),
      createdAt: isoDateTimeSchema,
    })
    .nullable(),
  diff: z.object({
    added: z.array(oidcScopeSchema),
    removed: z.array(oidcScopeSchema),
    unchanged: z.array(oidcScopeSchema),
  }),
  /**
   * True when the decision can be approved: every required scope is
   * available (unavailable optional scopes are declined automatically).
   */
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
  /**
   * Optional scopes the user switched off. Omitted = keep the grant's
   * earlier declined set (nothing declined for a new grant). Declining a
   * required scope ends the request like an unavailable one: the client is
   * redirected with `access_denied` and error_description
   * `required-scope-declined`.
   */
  declinedScopes: z
    .array(oidcScopeSchema)
    .max(oidcScopeSchema.options.length)
    .optional(),
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
  network: networkSlugSchema.optional(),
  /** Live environment whose review is approved. */
  verified: z.boolean().optional(),
  /** Granted scopes (claims are released for these only). */
  scopes: z.array(oidcScopeSchema),
  /** Optional scopes the user declined. */
  declinedScopes: z.array(oidcScopeSchema).optional(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
})

export type ConnectedAppGrant = z.infer<typeof connectedAppGrantSchema>

/** A revoked grant (connected-apps history). */
export const endedGrantSchema = z.object({
  id: uuidSchema,
  app: z.object({
    name: z.string(),
    logoUrl: z.string().nullable(),
    websiteUrl: z.string().nullable(),
  }),
  environmentKind: environmentKindSchema,
  network: networkSlugSchema,
  scopes: z.array(oidcScopeSchema),
  revokedAt: isoDateTimeSchema,
  revokedReason: grantRevokedReasonSchema.nullable(),
})

export type EndedGrant = z.infer<typeof endedGrantSchema>

export const grantListResponseSchema = z.object({
  data: z.array(connectedAppGrantSchema),
  /** Most recently revoked grants, newest first (at most 20). */
  ended: z.array(endedGrantSchema).max(20).optional(),
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

// Matchbox ID SPA view of an authorization request --------------------------
// Additive to `authorizationRequestDetailSchema`: what the consent screen
// needs beyond the detail contract.

export const consentAppViewSchema = consentAppSchema.extend({
  /** Live environment whose review is approved. */
  verified: z.boolean(),
})

export type ConsentAppView = z.infer<typeof consentAppViewSchema>

export const authorizationRequestViewSchema =
  authorizationRequestDetailSchema.extend({
    app: consentAppViewSchema,
    /** Host of the registered redirect URI. */
    redirectHost: z.string(),
    /** False when an active grant already covers every requested scope. */
    consentRequired: z.boolean(),
    /** `prompt=login` and the session started before the request. */
    reauthenticationRequired: z.boolean(),
    /**
     * The session's contract-account signature was verified on another
     * network: sign in again with a SIWE message for `network`'s chain id.
     */
    networkSignInRequired: z.boolean(),
  })

export type AuthorizationRequestView = z.infer<
  typeof authorizationRequestViewSchema
>
