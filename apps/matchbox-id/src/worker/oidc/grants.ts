import {
  type OidcScope,
  isDiscordScope,
  normalizeScopes,
} from "@repo/platform-contracts/scopes"
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
 * environment, or widens it to the union of old and new scopes at the
 * environment's current scope version.
 */
export async function upsertGrant(
  deps: AppDeps,
  input: {
    account: AccountRecord
    client: ClientRecord
    scopes: readonly OidcScope[]
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
  const scopes = normalizeScopes([...(existing?.scopes ?? []), ...input.scopes])
  const discordUserId = scopes.some((scope) => isDiscordScope(scope))
    ? (input.discordLink?.discordUserId ?? null)
    : null
  const update = {
    scopes,
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
      existing.scopes.join(" ") === scopes.join(" ")
    if (unchanged) return existing
    const grant = await deps.store.updateGrant(existing.id, update, now)
    await deps.store.recordAudit({
      ...auditBase,
      action: "grant-updated",
      targetId: grant.id,
      metadata: { scopes, scopeVersion: update.scopeVersion },
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
    metadata: { scopes, scopeVersion: update.scopeVersion },
  })
  return grant
}
