import type { Context } from "hono"

/**
 * `__Host-` session cookies: Secure, Path=/, no Domain, HttpOnly,
 * SameSite=Strict. Values must be base64url (opaque tokens).
 */

export const sessionCookieNames = {
  matchboxId: "mbx_id",
  developerConsole: "mbx_dev",
} as const

const cookieNamePattern = /^[A-Za-z0-9_-]+$/
const cookieValuePattern = /^[A-Za-z0-9_-]+$/

export function hostCookieName(name: string): string {
  if (!cookieNamePattern.test(name)) throw new Error("Invalid cookie name")
  return `__Host-${name}`
}

export function serializeSessionCookie(
  name: string,
  value: string,
  maxAgeSeconds: number,
): string {
  if (!cookieValuePattern.test(value)) throw new Error("Invalid cookie value")
  if (!Number.isInteger(maxAgeSeconds) || maxAgeSeconds <= 0) {
    throw new Error("maxAgeSeconds must be a positive integer")
  }
  return `${hostCookieName(name)}=${value}; Max-Age=${maxAgeSeconds}; Path=/; Secure; HttpOnly; SameSite=Strict`
}

export function serializeClearedSessionCookie(name: string): string {
  return `${hostCookieName(name)}=; Max-Age=0; Path=/; Secure; HttpOnly; SameSite=Strict`
}

/** Parses a `Cookie` header; later duplicates do not override the first. */
export function parseCookieHeader(header: string | null | undefined) {
  const cookies = new Map<string, string>()
  if (header === null || header === undefined) return cookies
  for (const part of header.split(";")) {
    const separator = part.indexOf("=")
    if (separator <= 0) continue
    const name = part.slice(0, separator).trim()
    const value = part.slice(separator + 1).trim()
    if (name.length > 0 && !cookies.has(name)) cookies.set(name, value)
  }
  return cookies
}

/** Reads a `__Host-` session cookie; null when absent or malformed. */
export function readSessionCookieFromHeader(
  header: string | null | undefined,
  name: string,
): string | null {
  const value = parseCookieHeader(header).get(hostCookieName(name))
  if (value === undefined || !cookieValuePattern.test(value)) return null
  return value
}

export function setSessionCookie(
  c: Context,
  name: string,
  value: string,
  maxAgeSeconds: number,
): void {
  c.header("Set-Cookie", serializeSessionCookie(name, value, maxAgeSeconds), {
    append: true,
  })
}

export function clearSessionCookie(c: Context, name: string): void {
  c.header("Set-Cookie", serializeClearedSessionCookie(name), { append: true })
}

export function readSessionCookie(c: Context, name: string): string | null {
  return readSessionCookieFromHeader(c.req.header("Cookie"), name)
}
