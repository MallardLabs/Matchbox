import {
  type ErrorCode,
  type ErrorIssue,
  type ErrorStatus,
  buildErrorBody,
  errorStatusByCode,
} from "@repo/platform-contracts/errors"
import type { Context } from "hono"
import "./context"
import { generateRequestId } from "./crypto"

export type PlatformErrorOptions = {
  /** Public message; defaults to the code's generic message. */
  message?: string
  issues?: ErrorIssue[]
  headers?: Record<string, string>
  /** Internal detail for logs; never sent to clients. */
  cause?: unknown
}

/**
 * Throw from any route or middleware; `errorHandler` turns it into the
 * standard `{ error: { code, message, requestId, docsUrl } }` body.
 */
export class PlatformError extends Error {
  readonly code: ErrorCode
  readonly status: ErrorStatus
  readonly publicMessage: string | undefined
  readonly issues: ErrorIssue[]
  readonly headers: Record<string, string>

  constructor(code: ErrorCode, options: PlatformErrorOptions = {}) {
    super(options.message ?? code, { cause: options.cause })
    this.name = "PlatformError"
    this.code = code
    this.status = errorStatusByCode[code]
    this.publicMessage = options.message
    this.issues = options.issues ?? []
    this.headers = options.headers ?? {}
  }
}

/** The request id set by `requestId()`, or a fresh one if it has not run. */
export function currentRequestId(c: Context): string {
  const existing: string | undefined = c.get("requestId")
  if (existing !== undefined && existing.length > 0) return existing
  const generated = generateRequestId()
  c.set("requestId", generated)
  return generated
}

export type ErrorResponseOptions = {
  message?: string
  issues?: ErrorIssue[]
  headers?: Record<string, string>
}

/** Builds a JSON error response with the standard body and headers. */
export function errorResponse(
  c: Context,
  code: ErrorCode,
  options: ErrorResponseOptions = {},
): Response {
  const requestId = currentRequestId(c)
  const body = buildErrorBody({
    code,
    requestId,
    ...(options.message === undefined ? {} : { message: options.message }),
    ...(options.issues === undefined ? {} : { issues: options.issues }),
  })
  return c.json(body, errorStatusByCode[code], {
    "Cache-Control": "no-store",
    "X-Request-Id": requestId,
    ...options.headers,
  })
}
