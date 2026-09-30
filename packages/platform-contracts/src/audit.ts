import { z } from "zod"
import { isoDateTimeSchema, uuidSchema } from "./common"

/** Rows of `mbx_platform_audit_events`; immutable once written. */

export const auditActorTypeSchema = z.enum([
  "developer",
  "staff",
  "wallet",
  "system",
])

export type AuditActorType = z.infer<typeof auditActorTypeSchema>

export const auditActionSchema = z.enum([
  // developer console: accounts
  "developer-account-created",
  "developer-signed-in",
  "developer-signed-out",
  "developer-recovery-completed",
  "developer-step-up-completed",
  "passkey-registered",
  "passkey-renamed",
  "passkey-removed",
  "developer-session-revoked",
  "developer-account-updated",
  // organizations
  "organization-created",
  "organization-updated",
  "organization-deleted",
  "member-role-changed",
  "member-removed",
  "invitation-created",
  "invitation-accepted",
  "invitation-revoked",
  // apps & environments
  "app-created",
  "app-updated",
  "app-retired",
  "environment-created",
  "environment-updated",
  "redirect-uris-updated",
  "origins-updated",
  "oauth-tokens-revoked",
  "scopes-requested",
  "review-submitted",
  "review-withdrawn",
  "review-approved",
  "review-auto-approved",
  "review-changes-requested",
  "review-rejected",
  // credentials
  "api-key-created",
  "api-key-updated",
  "api-key-rotated",
  "api-key-expiry-set",
  "api-key-revoked",
  "client-secret-created",
  "client-secret-revoked",
  // staff
  "app-status-changed",
  "quota-override-created",
  "quota-override-removed",
  // matchbox id
  "wallet-signed-in",
  "wallet-signed-out",
  "wallet-session-revoked",
  "grant-created",
  "grant-updated",
  "grant-revoked",
  "refresh-token-reuse-detected",
])

export type AuditAction = z.infer<typeof auditActionSchema>

export const auditMetadataSchema = z.record(z.string(), z.unknown())

/** Input to `recordAudit`; `occurredAt` defaults to the DB clock. */
export const auditEventInputSchema = z.object({
  actorType: auditActorTypeSchema,
  actorId: z.string().max(128).nullable(),
  organizationId: uuidSchema.nullable().default(null),
  appId: uuidSchema.nullable().default(null),
  environmentId: uuidSchema.nullable().default(null),
  action: auditActionSchema,
  targetType: z.string().max(64).nullable().default(null),
  targetId: z.string().max(128).nullable().default(null),
  metadata: auditMetadataSchema.default({}),
  ipPrefix: z.string().max(64).nullable().default(null),
  requestId: z.string().max(128).nullable().default(null),
})

export type AuditEventInput = z.input<typeof auditEventInputSchema>

export const auditEventSchema = z.object({
  id: z.string().regex(/^[0-9]+$/),
  occurredAt: isoDateTimeSchema,
  actorType: auditActorTypeSchema,
  actorId: z.string().nullable(),
  organizationId: uuidSchema.nullable(),
  appId: uuidSchema.nullable(),
  environmentId: uuidSchema.nullable(),
  action: auditActionSchema,
  targetType: z.string().nullable(),
  targetId: z.string().nullable(),
  metadata: auditMetadataSchema,
  ipPrefix: z.string().nullable(),
  requestId: z.string().nullable(),
})

export type AuditEvent = z.infer<typeof auditEventSchema>
