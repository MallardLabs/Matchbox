import { okResponseSchema } from "@repo/platform-contracts/common"
import {
  consolePaths,
  consoleSessionListResponseSchema,
  meResponseSchema,
  revokeOtherSessionsResponseSchema,
  updateMeRequestSchema,
} from "@repo/platform-contracts/console"
import { PlatformError, jsonBody, pathParams } from "@repo/platform-server"
import { type ConsoleApp, audit, deps, nowIso, requireAuth } from "../context"
import { buildMe, respond, toConsoleSession } from "../mappers"

export default function registerMeRoutes(app: ConsoleApp): void {
  app.get("/api/me", async (c) => {
    const auth = requireAuth(c)
    return respond(c, meResponseSchema, await buildMe(c, auth))
  })

  app.patch("/api/me", async (c) => {
    const auth = requireAuth(c)
    const body = await jsonBody(c, updateMeRequestSchema)
    const account = await deps(c).store.updateAccount(auth.account.id, {
      displayName: body.displayName,
    })
    await audit(c, {
      action: "developer-account-updated",
      targetType: "account",
      targetId: account.id,
      metadata: { displayName: body.displayName },
    })
    return respond(c, meResponseSchema, await buildMe(c, { ...auth, account }))
  })

  // Sessions --------------------------------------------------------------

  app.get("/api/me/sessions", async (c) => {
    const auth = requireAuth(c)
    const { store, now } = deps(c)
    const current = now().getTime()
    const sessions = (await store.listSessions(auth.account.id)).filter(
      (session) =>
        session.revokedAt === null && Date.parse(session.expiresAt) > current,
    )
    return respond(c, consoleSessionListResponseSchema, {
      data: sessions.map((session) =>
        toConsoleSession(session, auth.session.id),
      ),
    })
  })

  /** "Sign out everywhere else": revokes every other active session. */
  app.post("/api/me/sessions/revoke-others", async (c) => {
    const auth = requireAuth(c)
    const revoked = await deps(c).store.revokeOtherSessions(
      auth.account.id,
      auth.session.id,
      nowIso(c),
    )
    await audit(c, {
      action: "developer-session-revoked",
      targetType: "account",
      targetId: auth.account.id,
      metadata: { scope: "others", revoked },
    })
    return respond(c, revokeOtherSessionsResponseSchema, { revoked })
  })

  app.delete("/api/me/sessions/:sessionId", async (c) => {
    const auth = requireAuth(c)
    const { sessionId } = pathParams(c, consolePaths.sessionId)
    const { store } = deps(c)
    const session = (await store.listSessions(auth.account.id)).find(
      (candidate) => candidate.id === sessionId,
    )
    if (session === undefined) throw new PlatformError("not_found")
    if (session.revokedAt === null) {
      await store.updateSession(sessionId, { revokedAt: nowIso(c) })
      await audit(c, {
        action: "developer-session-revoked",
        targetType: "session",
        targetId: sessionId,
        metadata: { current: sessionId === auth.session.id },
      })
    }
    return respond(c, okResponseSchema, { ok: true })
  })
}
