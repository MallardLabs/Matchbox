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

/** Keyset-paginated audit search (newest first, cursor = last id). */
export async function auditSearch(
  c: ConsoleContext,
  query: AuditSearchQuery,
): Promise<Response> {
  const cursor =
    query.cursor === undefined ? null : auditCursor.decode(query.cursor)
  if (query.cursor !== undefined && cursor === null) {
    throw new PlatformError("invalid_request", { message: "Invalid cursor." })
  }
  const events = await deps(c).store.searchAudit({
    ...(query.organizationId === undefined
      ? {}
      : { organizationId: query.organizationId }),
    ...(query.appId === undefined ? {} : { appId: query.appId }),
    ...(query.environmentId === undefined
      ? {}
      : { environmentId: query.environmentId }),
    ...(query.actorType === undefined ? {} : { actorType: query.actorType }),
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
    data: page,
    nextCursor:
      events.length > query.limit && last !== undefined
        ? auditCursor.encode({ beforeId: last.id })
        : null,
  })
}
