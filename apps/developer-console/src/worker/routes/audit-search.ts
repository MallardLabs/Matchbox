import type { AuditEvent } from "@repo/platform-contracts/audit"
import {
  type AuditSearchQuery,
  auditSearchResponseSchema,
} from "@repo/platform-contracts/console"
import { createCursorCodec } from "@repo/platform-contracts/cursor"
import { PlatformError } from "@repo/platform-server"
import { z } from "zod"
import { type ConsoleContext, deps } from "../context"
import { respond } from "../mappers"

const auditCursor = createCursorCodec(
  z.object({ beforeId: z.string().regex(/^[0-9]{1,19}$/) }),
)

/** Staff search sees rows as stored; organizations see `organizationAuditEvent`. */
export type AuditView = "staff" | "organization"

/**
 * An audit row as an organization sees it. A wallet actor is a Matchbox ID
 * account that every app shares, so its account id and IP prefix would let
 * developers link one user across apps (what the pairwise `sub` prevents):
 * the row carries the environment's `sub` instead (`metadata.subject`; null
 * on rows written before it was recorded). Staff and system rows drop their
 * actor id and IP prefix too.
 */
export function organizationAuditEvent(event: AuditEvent): AuditEvent {
  if (event.actorType === "developer") return event
  const subject = event.metadata.subject
  return {
    ...event,
    actorId:
      event.actorType === "wallet" && typeof subject === "string"
        ? subject
        : null,
    ipPrefix: null,
  }
}

/** Keyset-paginated audit search (newest first, cursor = last id). */
export async function auditSearch(
  c: ConsoleContext,
  query: AuditSearchQuery,
  view: AuditView,
): Promise<Response> {
  const cursor =
    query.cursor === undefined ? null : auditCursor.decode(query.cursor)
  if (query.cursor !== undefined && cursor === null) {
    throw new PlatformError("invalid_request", { message: "Invalid cursor." })
  }
  // Stored actor ids of wallet and staff rows are never shown to an
  // organization, so it must not be able to probe for them either.
  const organizationActorFilter =
    view === "organization" && query.actorId !== undefined
  if (
    organizationActorFilter &&
    query.actorType !== undefined &&
    query.actorType !== "developer"
  ) {
    throw new PlatformError("invalid_request", {
      issues: [{ path: "actorId", message: "Filters developer actors only" }],
    })
  }
  const actorType = organizationActorFilter ? "developer" : query.actorType
  const events = await deps(c).store.searchAudit({
    ...(query.organizationId === undefined
      ? {}
      : { organizationId: query.organizationId }),
    ...(query.appId === undefined ? {} : { appId: query.appId }),
    ...(query.environmentId === undefined
      ? {}
      : { environmentId: query.environmentId }),
    ...(actorType === undefined ? {} : { actorType }),
    ...(query.actorId === undefined ? {} : { actorId: query.actorId }),
    ...(query.action === undefined ? {} : { action: query.action }),
    ...(query.from === undefined ? {} : { from: query.from }),
    ...(query.to === undefined ? {} : { to: query.to }),
    ...(cursor === null ? {} : { beforeId: cursor.beforeId }),
    limit: query.limit + 1,
  })
  const page = events.slice(0, query.limit)
  const last = page.at(-1)
  return respond(c, auditSearchResponseSchema, {
    data: view === "organization" ? page.map(organizationAuditEvent) : page,
    nextCursor:
      events.length > query.limit && last !== undefined
        ? auditCursor.encode({ beforeId: last.id })
        : null,
  })
}
