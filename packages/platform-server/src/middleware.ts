import { type Logger, logger as rootLogger } from "@repo/logger"
import type { ErrorCode } from "@repo/platform-contracts/errors"
import type {
  Context,
  ErrorHandler,
  MiddlewareHandler,
  NotFoundHandler,
} from "hono"
import { HTTPException } from "hono/http-exception"
import "./context"
import { generateRequestId } from "./crypto"
import { PlatformError, currentRequestId, errorResponse } from "./errors"

/** Logger bound to the current request (falls back to the root logger). */
export function requestLogger(c: Context): Logger {
  const bound: Logger | undefined = c.get("logger")
  return bound ?? rootLogger.child({ requestId: currentRequestId(c) })
}

/**
 * Assigns `req_<base62>` ids (never trusts inbound ids), exposes
 * `c.var.requestId` / `c.var.logger`, and sets `X-Request-Id` on every
 * response.
 */
export function requestId(
  options: { logger?: Logger } = {},
): MiddlewareHandler {
  const base = options.logger ?? rootLogger
  return async function requestIdMiddleware(c, next) {
    const id = generateRequestId()
    c.set("requestId", id)
    c.set("logger", base.child({ requestId: id }))
    await next()
    c.header("X-Request-Id", id)
  }
}

function codeForHttpStatus(status: number): ErrorCode {
  if (status === 401) return "unauthorized"
  if (status === 403) return "forbidden"
  if (status === 404) return "not_found"
  if (status === 409) return "conflict"
  if (status === 429) return "rate_limited"
  if (status === 503) return "service_disabled"
  if (status >= 400 && status < 500) return "invalid_request"
  return "internal_error"
}

/**
 * `app.onError(errorHandler())`: PlatformError → its code; Hono
 * HTTPException → mapped code; anything else → 500 `internal_error`.
 * Details are logged, never returned.
 */
export function errorHandler(): ErrorHandler {
  return function handleError(error, c) {
    const log = requestLogger(c)
    if (error instanceof PlatformError) {
      if (error.status >= 500) {
        log.error({
          message: "Request failed",
          code: error.code,
          error,
        })
      }
      return errorResponse(c, error.code, {
        ...(error.publicMessage === undefined
          ? {}
          : { message: error.publicMessage }),
        issues: error.issues,
        headers: error.headers,
      })
    }
    if (error instanceof HTTPException) {
      const code = codeForHttpStatus(error.status)
      if (code === "internal_error") {
        log.error({ message: "Request failed", status: error.status, error })
      }
      return errorResponse(c, code)
    }
    log.error({
      message: "Unhandled error",
      method: c.req.method,
      path: c.req.path,
      error,
    })
    return errorResponse(c, "internal_error")
  }
}

/** `app.notFound(notFoundHandler)` → 404 `not_found`. */
export const notFoundHandler: NotFoundHandler = function handleNotFound(c) {
  return errorResponse(c, "not_found")
}

export type SecurityHeadersOptions = {
  /** Full CSP value; null to skip. Default suits JSON APIs. */
  contentSecurityPolicy?: string | null
  /** Send HSTS (default true). */
  strictTransportSecurity?: boolean
}

export const apiContentSecurityPolicy =
  "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"

/** Conservative security headers; never overrides a header a route set. */
export function securityHeaders(
  options: SecurityHeadersOptions = {},
): MiddlewareHandler {
  const csp =
    options.contentSecurityPolicy === undefined
      ? apiContentSecurityPolicy
      : options.contentSecurityPolicy
  const headers: Record<string, string> = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  }
  if (csp !== null) headers["Content-Security-Policy"] = csp
  if (options.strictTransportSecurity ?? true) {
    headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains"
  }
  return async function securityHeadersMiddleware(c, next) {
    await next()
    for (const [name, value] of Object.entries(headers)) {
      if (!c.res.headers.has(name)) c.res.headers.set(name, value)
    }
  }
}

const safeMethods = new Set(["GET", "HEAD", "OPTIONS"])

export type SameOriginOptions = {
  /** Allowed `Origin` values; defaults to the request URL's origin. */
  allowedOrigins?: readonly string[] | ((c: Context) => readonly string[])
}

/**
 * CSRF guard for cookie-authenticated JSON APIs: non-GET/HEAD/OPTIONS
 * requests must carry an allowed `Origin` header.
 */
export function requireSameOrigin(
  options: SameOriginOptions = {},
): MiddlewareHandler {
  return async function sameOriginMiddleware(c, next) {
    if (!safeMethods.has(c.req.method)) {
      const origin = c.req.header("Origin")
      const allowed =
        options.allowedOrigins === undefined
          ? [new URL(c.req.url).origin]
          : typeof options.allowedOrigins === "function"
            ? options.allowedOrigins(c)
            : options.allowedOrigins
      if (origin === undefined || !allowed.includes(origin)) {
        throw new PlatformError("forbidden", {
          message: "Cross-origin request blocked.",
        })
      }
    }
    await next()
  }
}

/** 503 `service_disabled` unless `isEnabled(c)` returns true. */
export function requireFlag(
  isEnabled: (c: Context) => boolean,
): MiddlewareHandler {
  return async function flagMiddleware(c, next) {
    if (!isEnabled(c)) {
      return errorResponse(c, "service_disabled")
    }
    await next()
  }
}
