import type { ApiMiddleware, CorsPolicy } from "../context"

export const exposedHeaders = [
  "X-Request-Id",
  "ETag",
  "RateLimit-Limit",
  "RateLimit-Remaining",
  "RateLimit-Reset",
  "Retry-After",
].join(", ")

const allowedMethods = "GET, HEAD, OPTIONS"
const allowedHeaders = "Authorization, If-None-Match, Content-Type"
const preflightMaxAgeSeconds = "600"
const varyHeaders = ["Origin", "Authorization"]

function mergeVary(headers: Headers): void {
  const existing = (headers.get("Vary") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0)
  const merged = [...existing]
  for (const name of varyHeaders) {
    if (!merged.some((value) => value.toLowerCase() === name.toLowerCase())) {
      merged.push(name)
    }
  }
  headers.set("Vary", merged.join(", "))
}

/**
 * Which origin (if any) may read this response:
 * - public routes (`/v1/health`, `/openapi.json`): `*`;
 * - a publishable key: only its registered origins, errors included;
 * - a secret key: never (secret keys are server-only);
 * - no verified key: error responses only, so browsers can read a 401/429
 *   body. These responses carry no data.
 */
export function allowedOriginFor(
  policy: CorsPolicy | undefined,
  origin: string | null,
  status: number,
): string | null {
  const resolved = policy ?? { kind: "anonymous" }
  if (resolved.kind === "public") return "*"
  if (origin === null) return null
  if (resolved.kind === "key") {
    return resolved.keyKind === "publishable" &&
      resolved.origins.includes(origin)
      ? origin
      : null
  }
  return status >= 400 ? origin : null
}

export function applyCorsHeaders(
  headers: Headers,
  policy: CorsPolicy | undefined,
  origin: string | null,
  status: number,
): void {
  mergeVary(headers)
  headers.set("Access-Control-Expose-Headers", exposedHeaders)
  const allowed = allowedOriginFor(policy, origin, status)
  if (allowed === null) headers.delete("Access-Control-Allow-Origin")
  else headers.set("Access-Control-Allow-Origin", allowed)
}

/**
 * CORS on every response, including errors, 429s and preflights. Preflight
 * is answered for any origin; the actual response is gated by the key.
 */
export function cors(): ApiMiddleware {
  return async function corsMiddleware(c, next) {
    const origin = c.req.header("Origin") ?? null
    if (c.req.method === "OPTIONS") {
      c.set("routeTemplate", "preflight")
      const headers = new Headers({
        "Access-Control-Allow-Methods": allowedMethods,
        "Access-Control-Allow-Headers": allowedHeaders,
        "Access-Control-Max-Age": preflightMaxAgeSeconds,
        "Cache-Control": "no-store",
      })
      mergeVary(headers)
      if (origin !== null) headers.set("Access-Control-Allow-Origin", origin)
      return c.body(null, 204, Object.fromEntries(headers))
    }
    await next()
    applyCorsHeaders(c.res.headers, c.get("cors"), origin, c.res.status)
  }
}
