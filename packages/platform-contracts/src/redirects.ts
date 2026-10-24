import type { EnvironmentKind } from "./network"

/**
 * Redirect URIs and origins use exact string matching. Registration only
 * accepts canonical values (what `new URL()` would serialize back), so what a
 * developer registers is byte-for-byte what the client must send.
 *
 * - live: `https://` only
 * - test: `https://`, or `http://localhost` / `http://127.0.0.1` on any port
 * - never: fragments, wildcards, userinfo, non-http(s) schemes
 */

export const maxRedirectUriLength = 2048
export const maxRedirectUrisPerEnvironment = 20
export const maxOriginsPerEnvironment = 20

export type UrlRejectionReason =
  | "invalid-url"
  | "too-long"
  | "wildcard-not-allowed"
  | "fragment-not-allowed"
  | "credentials-not-allowed"
  | "scheme-not-allowed"
  | "path-not-allowed"
  | "not-canonical"

export type UrlValidationResult =
  | { ok: true; value: string }
  | { ok: false; reason: UrlRejectionReason; suggestion: string | null }

export const urlRejectionMessages = {
  "invalid-url": "Not a valid URL",
  "too-long": "Too long",
  "wildcard-not-allowed": "Wildcards are not allowed",
  "fragment-not-allowed": "Fragments are not allowed",
  "credentials-not-allowed": "Credentials are not allowed",
  "scheme-not-allowed": "Use https (test also allows http://localhost)",
  "path-not-allowed": "Origins have no path",
  "not-canonical": "Use the canonical form",
} as const satisfies Record<UrlRejectionReason, string>

const loopbackHosts = new Set(["localhost", "127.0.0.1"])

function reject(
  reason: UrlRejectionReason,
  suggestion: string | null = null,
): UrlValidationResult {
  return { ok: false, reason, suggestion }
}

function parseUrl(value: string): URL | null {
  try {
    return new URL(value)
  } catch {
    return null
  }
}

function schemeAllowed(url: URL, kind: EnvironmentKind): boolean {
  if (url.protocol === "https:") return true
  return (
    kind === "test" &&
    url.protocol === "http:" &&
    loopbackHosts.has(url.hostname)
  )
}

function commonChecks(
  value: string,
  kind: EnvironmentKind,
): { ok: true; url: URL } | { ok: false; result: UrlValidationResult } {
  if (value.length > maxRedirectUriLength) {
    return { ok: false, result: reject("too-long") }
  }
  if (value.includes("*")) {
    return { ok: false, result: reject("wildcard-not-allowed") }
  }
  if (value.includes("#")) {
    return { ok: false, result: reject("fragment-not-allowed") }
  }
  const url = parseUrl(value)
  if (url === null) return { ok: false, result: reject("invalid-url") }
  if (url.username !== "" || url.password !== "") {
    return { ok: false, result: reject("credentials-not-allowed") }
  }
  if (!schemeAllowed(url, kind)) {
    return { ok: false, result: reject("scheme-not-allowed") }
  }
  return { ok: true, url }
}

export function validateRedirectUri(
  value: string,
  kind: EnvironmentKind,
): UrlValidationResult {
  const checked = commonChecks(value, kind)
  if (!checked.ok) return checked.result
  if (checked.url.href !== value) {
    return reject("not-canonical", checked.url.href)
  }
  return { ok: true, value }
}

export function validateOrigin(
  value: string,
  kind: EnvironmentKind,
): UrlValidationResult {
  const checked = commonChecks(value, kind)
  if (!checked.ok) return checked.result
  const { url } = checked
  if (url.pathname !== "/" || url.search !== "") {
    return reject("path-not-allowed", url.origin)
  }
  if (url.origin !== value) return reject("not-canonical", url.origin)
  return { ok: true, value }
}

/** Exact-match lookup of a requested redirect URI (RFC 6749 §3.1.2.3). */
export function redirectUriMatches(
  registered: readonly string[],
  candidate: string,
): boolean {
  return registered.includes(candidate)
}

/** Exact-match lookup of a browser `Origin` header value. */
export function originMatches(
  registered: readonly string[],
  candidate: string | null,
): boolean {
  if (candidate === null) return false
  return registered.includes(candidate)
}

/**
 * Builds the final redirect with OAuth parameters appended, preserving any
 * query the registered URI already has.
 */
export function appendRedirectParams(
  redirectUri: string,
  params: Record<string, string>,
): string {
  const url = new URL(redirectUri)
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value)
  }
  return url.href
}
