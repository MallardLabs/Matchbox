import { z } from "zod"

/**
 * Stable platform error codes. These are snake_case (not kebab-case) to match
 * OAuth/HTTP API conventions; they are part of the public contract.
 */
export const errorCodeSchema = z.enum([
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
])

export type ErrorCode = z.infer<typeof errorCodeSchema>

export const errorIssueSchema = z.object({
  path: z.string(),
  message: z.string(),
})

export type ErrorIssue = z.infer<typeof errorIssueSchema>

export const errorBodySchema = z.object({
  error: z.object({
    code: errorCodeSchema,
    message: z.string(),
    requestId: z.string(),
    docsUrl: z.url(),
    issues: z.array(errorIssueSchema).optional(),
  }),
})

export type ErrorBody = z.infer<typeof errorBodySchema>

export const errorStatusByCode = {
  invalid_request: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  step_up_required: 403,
  rate_limited: 429,
  service_disabled: 503,
  origin_not_allowed: 403,
  network_not_allowed: 403,
  internal_error: 500,
} as const satisfies Record<ErrorCode, number>

export type ErrorStatus = (typeof errorStatusByCode)[ErrorCode]

export const defaultErrorMessages = {
  invalid_request: "The request is invalid.",
  unauthorized: "Missing or invalid credentials.",
  forbidden: "Not allowed.",
  not_found: "Not found.",
  conflict: "Conflicts with the current state.",
  step_up_required: "Confirm with your passkey to continue.",
  rate_limited: "Rate limit exceeded.",
  service_disabled: "This service is temporarily unavailable.",
  origin_not_allowed: "Origin not registered for this key.",
  network_not_allowed: "Network not available to this key.",
  internal_error: "Something went wrong.",
} as const satisfies Record<ErrorCode, string>

export const errorDocsBaseUrl = "https://developer.matchbox.markets/docs/errors"

export function errorDocsUrl(code: ErrorCode): string {
  return `${errorDocsBaseUrl}#${code}`
}

export function buildErrorBody(input: {
  code: ErrorCode
  requestId: string
  message?: string
  issues?: ErrorIssue[]
}): ErrorBody {
  const error: ErrorBody["error"] = {
    code: input.code,
    message: input.message ?? defaultErrorMessages[input.code],
    requestId: input.requestId,
    docsUrl: errorDocsUrl(input.code),
  }
  if (input.issues !== undefined && input.issues.length > 0) {
    error.issues = input.issues
  }
  return { error }
}

/** Converts zod issues to the public `issues` array. */
export function issuesFromZodError(error: z.ZodError): ErrorIssue[] {
  return error.issues.map((issue) => ({
    path: issue.path.map((segment) => String(segment)).join("."),
    message: issue.message,
  }))
}

/** RFC 6749 / 7009 / OIDC Core error codes used on `/oauth/*`. */
export const oauthErrorCodeSchema = z.enum([
  "invalid_request",
  "invalid_client",
  "invalid_grant",
  "unauthorized_client",
  "unsupported_grant_type",
  "unsupported_response_type",
  "unsupported_token_type",
  "invalid_scope",
  "access_denied",
  "server_error",
  "temporarily_unavailable",
  "login_required",
  "consent_required",
  "interaction_required",
  "invalid_token",
  "insufficient_scope",
])

export type OAuthErrorCode = z.infer<typeof oauthErrorCodeSchema>

export const oauthErrorBodySchema = z.object({
  error: oauthErrorCodeSchema,
  error_description: z.string().optional(),
})

export type OAuthErrorBody = z.infer<typeof oauthErrorBodySchema>

export const oauthErrorStatusByCode = {
  invalid_request: 400,
  invalid_client: 401,
  invalid_grant: 400,
  unauthorized_client: 400,
  unsupported_grant_type: 400,
  unsupported_response_type: 400,
  unsupported_token_type: 400,
  invalid_scope: 400,
  access_denied: 403,
  server_error: 500,
  temporarily_unavailable: 503,
  login_required: 401,
  consent_required: 403,
  interaction_required: 403,
  invalid_token: 401,
  insufficient_scope: 403,
} as const satisfies Record<OAuthErrorCode, number>
