import {
  type NetworkSlug,
  networkForChainId,
} from "@repo/platform-contracts/network"
import { oidcLifetimes } from "@repo/platform-contracts/oidc"
import {
  PlatformError,
  hmacHex,
  hostCookieName,
  readSessionCookie,
  sessionCookieNames,
} from "@repo/platform-server"
import type { Context } from "hono"
import type { AppDeps } from "./deps"
import type { AccountRecord, SessionRecord } from "./store/id-store"

/**
 * `__Host-mbx_id` session cookie. SameSite=Lax (not the platform default
 * Strict): the OIDC flow arrives at `/oauth/authorize` by a cross-site
 * top-level navigation and must see the session to honour `prompt=none` and
 * skip consent. CSRF on `/api/*` is enforced by `requireSameOrigin`.
 */

export const sessionCookieName = sessionCookieNames.matchboxId
const touchIntervalMs = 5 * 60_000
const cookieValuePattern = /^[A-Za-z0-9_-]+$/

export type ActiveSession = {
  session: SessionRecord
  account: AccountRecord
}

export function serializeLaxSessionCookie(
  value: string,
  maxAgeSeconds: number,
): string {
  if (!cookieValuePattern.test(value)) throw new Error("Invalid cookie value")
  return `${hostCookieName(sessionCookieName)}=${value}; Max-Age=${maxAgeSeconds}; Path=/; Secure; HttpOnly; SameSite=Lax`
}

export function serializeClearedLaxSessionCookie(): string {
  return `${hostCookieName(sessionCookieName)}=; Max-Age=0; Path=/; Secure; HttpOnly; SameSite=Lax`
}

export function setSessionCookie(c: Context, token: string): void {
  c.header(
    "Set-Cookie",
    serializeLaxSessionCookie(token, oidcLifetimes.session),
    { append: true },
  )
}

export function clearSessionCookie(c: Context): void {
  c.header("Set-Cookie", serializeClearedLaxSessionCookie(), { append: true })
}

export function sessionTokenHash(
  deps: AppDeps,
  token: string,
): Promise<string> {
  return hmacHex(deps.config.sessionPepper, token)
}

/** Active session for the request cookie, or null. Slides `last_seen_at`. */
export async function loadSession(
  c: Context,
  deps: AppDeps,
): Promise<ActiveSession | null> {
  const token = readSessionCookie(c, sessionCookieName)
  if (token === null) return null
  const session = await deps.store.findSessionByTokenHash(
    await sessionTokenHash(deps, token),
  )
  const now = deps.now()
  if (
    session === null ||
    session.revokedAt !== null ||
    session.expiresAt <= now
  ) {
    return null
  }
  const account = await deps.store.findAccount(session.accountId)
  if (account === null || account.disabledAt !== null) return null
  if (
    session.lastSeenAt === null ||
    now.getTime() - session.lastSeenAt.getTime() > touchIntervalMs
  ) {
    await deps.store.touchSession(session.id, now)
  }
  return { session, account }
}

/**
 * Whether the session's SIWE signature proves control of the wallet on
 * `network`. An EOA signature holds on every chain; a contract account
 * (ERC-1271 / ERC-6492) was only verified against its SIWE chain, and the
 * same address on another chain may belong to someone else. Sessions from
 * before signer binding (null) prove nothing.
 */
export function sessionVerifiedFor(
  session: SessionRecord,
  network: NetworkSlug,
): boolean {
  if (session.signerKind === "eoa") return true
  if (session.signerKind === null || session.siweChainId === null) return false
  return networkForChainId(session.siweChainId) === network
}

/**
 * Whether `current` may see or manage `other` (device list): EOA sessions
 * see every session; contract sessions only those verified the same way.
 */
export function sessionManages(
  current: SessionRecord,
  other: SessionRecord,
): boolean {
  if (current.signerKind === "eoa" || current.id === other.id) return true
  return (
    current.signerKind !== null &&
    other.signerKind === current.signerKind &&
    other.siweChainId === current.siweChainId
  )
}

export async function requireSession(
  c: Context,
  deps: AppDeps,
): Promise<ActiveSession> {
  const active = await loadSession(c, deps)
  if (active === null) throw new PlatformError("unauthorized")
  return active
}
