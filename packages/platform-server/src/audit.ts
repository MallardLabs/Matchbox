import {
  type AuditEventInput,
  auditEventInputSchema,
} from "@repo/platform-contracts/audit"
import type { SupabaseClient } from "@supabase/supabase-js"

export const auditTable = "mbx_platform_audit_events"

/** Snake-case row for `mbx_platform_audit_events` (occurred_at = DB now()). */
export function auditRow(event: AuditEventInput) {
  const parsed = auditEventInputSchema.parse(event)
  return {
    actor_type: parsed.actorType,
    actor_id: parsed.actorId,
    organization_id: parsed.organizationId,
    app_id: parsed.appId,
    environment_id: parsed.environmentId,
    action: parsed.action,
    target_type: parsed.targetType,
    target_id: parsed.targetId,
    metadata: parsed.metadata,
    ip_prefix: parsed.ipPrefix,
    request_id: parsed.requestId,
  }
}

/**
 * Appends an immutable audit event. Throws when the insert fails so callers
 * can decide whether the surrounding action must fail too.
 */
export default async function recordAudit(
  supabase: SupabaseClient,
  event: AuditEventInput,
): Promise<void> {
  const { error } = await supabase.from(auditTable).insert(auditRow(event))
  if (error !== null) {
    throw new Error(`Failed to record audit event ${event.action}`, {
      cause: error,
    })
  }
}
