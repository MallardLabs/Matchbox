import { mergeGrantScopes } from "@repo/platform-contracts/consent"
import { type OidcScope, isDiscordScope } from "@repo/platform-contracts/scopes"
import type { AppDeps } from "../deps"
import type {
  AccountRecord,
  ClientRecord,
  DiscordLinkRecord,
  GrantRecord,
} from "../store/id-store"
import { claimsSnapshot } from "./claims"

export type AuditContext = {
  ipPrefix: string | null
  requestId: string
}

/**
 * Records consent: creates the (single) active grant for the account and
 * environment, or updates it at the environment's current scope version.
 * Requested scopes take this decision (granted or declined); scopes outside
 * the request keep their previous state.
 */
export async function upsertGrant(
  deps: AppDeps,
  input: {
    account: AccountRecord
    client: ClientRecord
    requested: readonly OidcScope[]
    granted: readonly OidcScope[]
    declined: readonly OidcScope[]
    existing: GrantRecord | null
    discordLink: DiscordLinkRecord | null
    audit: AuditContext
  },
): Promise<GrantRecord> {
  const now = deps.now()
  const { account, client } = input
  const existing =
    input.existing ??
    (await deps.store.findActiveGrant(account.id, client.environment.id))
  const { scopes, declinedScopes } = mergeGrantScopes({
    existing,
    requested: input.requested,
    granted: input.granted,
    declined: input.declined,
  })
  const discordUserId = scopes.some((scope) => isDiscordScope(scope))
    ? (input.discordLink?.discordUserId ?? null)
    : null
  const update = {
    scopes,
    declinedScopes,
    scopeVersion: client.environment.scopeVersion,
    claimsSnapshot: claimsSnapshot(scopes),
    discordUserId,
  }
  const auditBase = {
    actorType: "wallet" as const,
    actorId: account.id,
    organizationId: client.app.organizationId,
    appId: client.app.id,
    environmentId: client.environment.id,
    targetType: "grant",
    ipPrefix: input.audit.ipPrefix,
    requestId: input.audit.requestId,
  }

  if (existing !== null) {
    const unchanged =
      existing.scopeVersion === update.scopeVersion &&
      existing.discordUserId === update.discordUserId &&
      existing.scopes.join(" ") === scopes.join(" ") &&
      existing.declinedScopes.join(" ") === declinedScopes.join(" ")
    if (unchanged) return existing
    const grant = await deps.store.updateGrant(existing.id, update, now)
    await deps.store.recordAudit({
      ...auditBase,
      action: "grant-updated",
      targetId: grant.id,
      metadata: { scopes, declinedScopes, scopeVersion: update.scopeVersion },
    })
    return grant
  }

  const grant = await deps.store.createGrant(
    {
      accountId: account.id,
      appId: client.app.id,
      environmentId: client.environment.id,
      ...update,
    },
    now,
  )
  await deps.store.recordAudit({
    ...auditBase,
    action: "grant-created",
    targetId: grant.id,
    metadata: { scopes, declinedScopes, scopeVersion: update.scopeVersion },
  })
  return grant
}
