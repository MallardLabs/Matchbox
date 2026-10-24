import type { components } from "./generated/schema"

export type ErrorCode = components["schemas"]["ErrorCode"]

export type ErrorIssue = { path: string; message: string }

/** Codes the SDK raises itself when the API gave no usable error body. */
export type ClientErrorCode = "invalid_response" | "network_error"

export type MatchboxApiErrorInit = {
  status: number
  code: ErrorCode | ClientErrorCode
  message: string
  requestId: string | null
  retryAfter: number | null
  docsUrl: string | null
  issues: ErrorIssue[]
  cause?: unknown
}

/**
 * Any non-2xx API response (after retries). `code` is the stable API error
 * code; quote `requestId` in support requests. `retryAfter` is in seconds.
 */
export class MatchboxApiError extends Error {
  readonly status: number
  readonly code: ErrorCode | ClientErrorCode
  readonly requestId: string | null
  readonly retryAfter: number | null
  readonly docsUrl: string | null
  readonly issues: ErrorIssue[]

  constructor(init: MatchboxApiErrorInit) {
    super(init.message, init.cause === undefined ? {} : { cause: init.cause })
    this.name = "MatchboxApiError"
    this.status = init.status
    this.code = init.code
    this.requestId = init.requestId
    this.retryAfter = init.retryAfter
    this.docsUrl = init.docsUrl
    this.issues = init.issues
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

const errorCodes: readonly string[] = [
  "invalid_request",
  "unauthorized",
  "forbidden",
  "not_found",
  "conflict",
  "step_up_required",
  "rate_limited",
  "service_disabled",
  "origin_not_allowed",
  "network_not_allowed",
  "internal_error",
] satisfies ErrorCode[]

function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === "string" && errorCodes.includes(value)
}

function issuesFrom(value: unknown): ErrorIssue[] {
  if (!Array.isArray(value)) return []
  const issues: ErrorIssue[] = []
  for (const entry of value) {
    if (
      isRecord(entry) &&
      typeof entry.path === "string" &&
      typeof entry.message === "string"
    ) {
      issues.push({ path: entry.path, message: entry.message })
    }
  }
  return issues
}

/** Reads `{ error: { code, message, requestId, docsUrl, issues? } }`. */
export function errorFromBody(input: {
  status: number
  body: unknown
  headerRequestId: string | null
  retryAfter: number | null
}): MatchboxApiError {
  const error = isRecord(input.body) ? input.body.error : undefined
  if (isRecord(error) && isErrorCode(error.code)) {
    return new MatchboxApiError({
      status: input.status,
      code: error.code,
      message: typeof error.message === "string" ? error.message : error.code,
      requestId:
        typeof error.requestId === "string"
          ? error.requestId
          : input.headerRequestId,
      retryAfter: input.retryAfter,
      docsUrl: typeof error.docsUrl === "string" ? error.docsUrl : null,
      issues: issuesFrom(error.issues),
    })
  }
  return new MatchboxApiError({
    status: input.status,
    code: "invalid_response",
    message: `Unexpected ${input.status} response from the Matchbox API.`,
    requestId: input.headerRequestId,
    retryAfter: input.retryAfter,
    docsUrl: null,
    issues: [],
  })
}
