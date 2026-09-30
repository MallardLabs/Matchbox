import { PlatformError, sha256Base64Url } from "@repo/platform-server"
import type { ApiContext } from "./context"

export const privateCacheControl = "private, max-age=30"
export const publicCacheControl = "public, max-age=300"

/** Weak validator over the exact response bytes. */
export async function weakEtag(body: string): Promise<string> {
  return `W/"${await sha256Base64Url(body)}"`
}

function opaqueTag(tag: string): string {
  const trimmed = tag.trim()
  return trimmed.startsWith("W/") ? trimmed.slice(2) : trimmed
}

/** RFC 9110 §13.1.2 weak comparison against an `If-None-Match` list. */
export function ifNoneMatchMatches(
  header: string | undefined,
  etag: string,
): boolean {
  if (header === undefined) return false
  if (header.trim() === "*") return true
  const current = opaqueTag(etag)
  return header.split(",").some((candidate) => opaqueTag(candidate) === current)
}

/**
 * JSON with a weak `ETag`; `If-None-Match` → 304 without a body. Records
 * the cache outcome for the request log.
 */
export async function respondJson(
  c: ApiContext,
  body: unknown,
  cacheControl: string = privateCacheControl,
): Promise<Response> {
  const text = JSON.stringify(body)
  const etag = await weakEtag(text)
  const headers = { ETag: etag, "Cache-Control": cacheControl }
  if (ifNoneMatchMatches(c.req.header("If-None-Match"), etag)) {
    c.set("cacheStatus", "not-modified")
    return c.body(null, 304, headers)
  }
  c.set("cacheStatus", "full")
  return c.body(text, 200, {
    ...headers,
    "Content-Type": "application/json; charset=utf-8",
  })
}

/** Throws `not_found` unless the value exists. */
export function found<Value>(value: Value | null): Value {
  if (value === null) throw new PlatformError("not_found")
  return value
}
