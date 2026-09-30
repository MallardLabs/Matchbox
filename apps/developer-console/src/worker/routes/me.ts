import { okResponseSchema } from "@repo/platform-contracts/common"
import {
  consolePaths,
  consoleSessionListResponseSchema,
  meResponseSchema,
  passkeyListResponseSchema,
  passkeyRegistrationOptionsResponseSchema,
  passkeySchema,
  renamePasskeyRequestSchema,
  revokeOtherSessionsResponseSchema,
  updateMeRequestSchema,
} from "@repo/platform-contracts/console"
import { PlatformError, jsonBody, pathParams } from "@repo/platform-server"
import { createRegistrationOptions } from "../auth/webauthn"
import {
  type ConsoleApp,
  audit,
  deps,
  notifyAccount,
  nowIso,
  requireAuth,
  requireStepUp,
} from "../context"
import { passkeyChangedEmail } from "../email/templates"
import { buildMe, respond, toConsoleSession, toPasskey } from "../mappers"
import { webauthnChallengeLifetimeMs } from "./auth"

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

  // Passkeys --------------------------------------------------------------

  app.get("/api/me/passkeys", async (c) => {
    const auth = requireAuth(c)
    const passkeys = await deps(c).store.listPasskeys(auth.account.id)
    return respond(c, passkeyListResponseSchema, {
      data: passkeys.map(toPasskey),
    })
  })

  // Adding, renaming and removing passkeys need a fresh step-up with an
  // existing passkey.
  app.post("/api/me/passkeys/options", async (c) => {
    const auth = requireStepUp(c)
    const { store, webauthn, now } = deps(c)
    const options = await createRegistrationOptions({
      config: webauthn,
      account: auth.account,
      existing: await store.listPasskeys(auth.account.id),
    })
    const createdAt = now()
    const challenge = await store.createWebauthnChallenge({
      challenge: options.challenge,
      purpose: "register",
      accountId: auth.account.id,
      createdAt: createdAt.toISOString(),
      expiresAt: new Date(
        createdAt.getTime() + webauthnChallengeLifetimeMs,
      ).toISOString(),
    })
    return respond(c, passkeyRegistrationOptionsResponseSchema, {
      challengeId: challenge.id,
      options,
    })
  })

  app.patch("/api/me/passkeys/:passkeyId", async (c) => {
    const auth = requireStepUp(c)
    const { passkeyId } = pathParams(c, consolePaths.passkeyId)
    const body = await jsonBody(c, renamePasskeyRequestSchema)
    const { store } = deps(c)
    const passkey = (await store.listPasskeys(auth.account.id)).find(
      (candidate) => candidate.id === passkeyId,
    )
    if (passkey === undefined) throw new PlatformError("not_found")
    await store.updatePasskey(passkeyId, { name: body.name })
    await audit(c, {
      action: "passkey-renamed",
      targetType: "passkey",
      targetId: passkeyId,
      metadata: { name: body.name },
    })
    return respond(c, passkeySchema, toPasskey({ ...passkey, name: body.name }))
  })

  app.delete("/api/me/passkeys/:passkeyId", async (c) => {
    const auth = requireStepUp(c)
    const { passkeyId } = pathParams(c, consolePaths.passkeyId)
    const { store, config } = deps(c)
    const passkeys = await store.listPasskeys(auth.account.id)
    const passkey = passkeys.find((candidate) => candidate.id === passkeyId)
    if (passkey === undefined) throw new PlatformError("not_found")
    if (passkeys.length <= 1) {
      throw new PlatformError("conflict", {
        message: "You cannot remove your last passkey.",
      })
    }
    await store.deletePasskey(passkeyId)
    const at = nowIso(c)
    // A removed passkey may have been used to open other sessions.
    const revokedSessions = await store.revokeOtherSessions(
      auth.account.id,
      auth.session.id,
      at,
    )
    await audit(c, {
      action: "passkey-removed",
      targetType: "passkey",
      targetId: passkeyId,
      metadata: { revokedSessions },
    })
    await notifyAccount(
      c,
      auth.account,
      passkeyChangedEmail({
        change: "removed",
        passkeyName: passkey.name,
        at,
        accountUrl: `${config.consoleOrigin}/account`,
      }),
    )
    return respond(c, okResponseSchema, { ok: true })
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
