import {
  clearSessionCookie,
  generateOpaqueToken,
  hmacHex,
  ipPrefix,
  readSessionCookie,
  sessionCookieNames,
  setSessionCookie,
} from "@repo/platform-server"
import type { MiddlewareHandler } from "hono"
import { type ConsoleContext, type ConsoleEnv, deps, logger } from "../context"
import type { AccountRecord, SessionRecord } from "../store/console-store"

/**
 * `__Host-mbx_dev` session cookie: opaque token, stored only as
 * HMAC(SESSION_PEPPER, token). 12 h sliding expiry, refreshed at most every
 * 5 minutes, capped at an absolute 7 days from sign-in.
 */

export const sessionLifetimeMs = 12 * 60 * 60_000
export const sessionMaxLifetimeMs = 7 * 24 * 60 * 60_000
export const sessionTouchIntervalMs = 5 * 60_000

function absoluteExpiry(session: Pick<SessionRecord, "createdAt">): number {
  return Date.parse(session.createdAt) + sessionMaxLifetimeMs
}
const cookieName = sessionCookieNames.developerConsole

export function sessionTokenHash(pepper: string, token: string) {
  return hmacHex(pepper, `session:${token}`)
}

function userAgent(c: ConsoleContext): string | null {
  const value = c.req.header("User-Agent")
  return value === undefined ? null : value.slice(0, 512)
}

/** Creates a session row and sets the cookie. */
export async function startSession(
  c: ConsoleContext,
  account: AccountRecord,
  options: { steppedUp: boolean },
): Promise<SessionRecord> {
  const { store, now, config } = deps(c)
  const token = generateOpaqueToken()
  const createdAt = now()
  const session = await store.createSession({
    accountId: account.id,
    tokenHash: await sessionTokenHash(config.sessionPepper, token),
    createdAt: createdAt.toISOString(),
    expiresAt: new Date(createdAt.getTime() + sessionLifetimeMs).toISOString(),
    userAgent: userAgent(c),
    ipPrefix: ipPrefix(c.req.raw),
    steppedUpAt: options.steppedUp ? createdAt.toISOString() : null,
  })
  setSessionCookie(c, cookieName, token, sessionLifetimeMs / 1000)
  c.set("auth", { session, account })
  return session
}

export function endSessionCookie(c: ConsoleContext): void {
  clearSessionCookie(c, cookieName)
}

/**
 * Resolves the cookie to `c.var.auth` (or null). Revoked, expired or
 * disabled sessions clear the cookie. Active sessions slide forward.
 */
export function loadSession(): MiddlewareHandler<ConsoleEnv> {
  return async function sessionMiddleware(c, next) {
    c.set("auth", null)
    const token = readSessionCookie(c, cookieName)
    if (token !== null) {
      const { store, now, config } = deps(c)
      const session = await store.findSessionByTokenHash(
        await sessionTokenHash(config.sessionPepper, token),
      )
      const current = now()
      const valid =
        session !== null &&
        session.revokedAt === null &&
        Date.parse(session.expiresAt) > current.getTime() &&
        absoluteExpiry(session) > current.getTime()
      const account = valid ? await store.getAccount(session.accountId) : null
      if (
        session === null ||
        !valid ||
        account === null ||
        account.disabledAt !== null
      ) {
        endSessionCookie(c)
      } else {
        const lastSeen = Date.parse(session.lastSeenAt ?? session.createdAt)
        if (current.getTime() - lastSeen >= sessionTouchIntervalMs) {
          const expiresMs = Math.min(
            current.getTime() + sessionLifetimeMs,
            absoluteExpiry(session),
          )
          const expiresAt = new Date(expiresMs).toISOString()
          try {
            await store.updateSession(session.id, {
              lastSeenAt: current.toISOString(),
              expiresAt,
            })
            session.lastSeenAt = current.toISOString()
            session.expiresAt = expiresAt
            setSessionCookie(
              c,
              cookieName,
              token,
              Math.floor((expiresMs - current.getTime()) / 1000),
            )
          } catch (error) {
            logger(c).warn({ message: "Session touch failed", error })
          }
        }
        c.set("auth", { session, account })
      }
    }
    await next()
  }
}
