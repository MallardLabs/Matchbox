import { okResponseSchema } from "@repo/platform-contracts/common"
import { parseJson } from "@repo/platform-contracts/encoding"
import {
  type ErrorCode,
  errorBodySchema,
} from "@repo/platform-contracts/errors"
import {
  type AuthorizationDecisionRequest,
  authorizationDecisionResponseSchema,
  authorizationRequestViewSchema,
  grantListResponseSchema,
  sessionListResponseSchema,
  sessionResponseSchema,
  siweNonceResponseSchema,
  siweVerifyResponseSchema,
} from "@repo/platform-contracts/identity"
import type { z } from "zod"

/** Typed client for the Matchbox ID Worker `/api/*` routes. */

export class ApiError extends Error {
  readonly status: number
  readonly code: ErrorCode

  constructor(status: number, code: ErrorCode, message: string) {
    super(message)
    this.name = "ApiError"
    this.status = status
    this.code = code
  }
}

export function isApiError(
  error: unknown,
  code?: ErrorCode,
): error is ApiError {
  return (
    error instanceof ApiError && (code === undefined || error.code === code)
  )
}

async function request<Schema extends z.ZodType>(
  path: string,
  schema: Schema,
  init: { method?: "GET" | "POST" | "DELETE"; body?: unknown } = {},
): Promise<z.output<Schema>> {
  const response = await fetch(path, {
    method: init.method ?? "GET",
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      ...(init.body === undefined
        ? {}
        : { "Content-Type": "application/json" }),
    },
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
  })
  const json = parseJson(await response.text())
  if (!response.ok) {
    const error = errorBodySchema.safeParse(json.ok ? json.value : null)
    throw error.success
      ? new ApiError(
          response.status,
          error.data.error.code,
          error.data.error.message,
        )
      : new ApiError(response.status, "internal_error", "Something went wrong.")
  }
  const parsed = schema.safeParse(json.ok ? json.value : null)
  if (!parsed.success) {
    throw new ApiError(
      response.status,
      "internal_error",
      "Unexpected response.",
    )
  }
  return parsed.data
}

export const api = {
  session: () => request("/api/session", sessionResponseSchema),
  signOut: () =>
    request("/api/session/sign-out", okResponseSchema, { method: "POST" }),
  siweNonce: () =>
    request("/api/siwe/nonce", siweNonceResponseSchema, { method: "POST" }),
  siweVerify: (body: { message: string; signature: string }) =>
    request("/api/siwe/verify", siweVerifyResponseSchema, {
      method: "POST",
      body,
    }),
  authorizationRequest: (id: string) =>
    request(
      `/api/authorization-requests/${encodeURIComponent(id)}`,
      authorizationRequestViewSchema,
    ),
  decide: (id: string, body: AuthorizationDecisionRequest) =>
    request(
      `/api/authorization-requests/${encodeURIComponent(id)}/decision`,
      authorizationDecisionResponseSchema,
      { method: "POST", body },
    ),
  grants: () => request("/api/grants", grantListResponseSchema),
  revokeGrant: (id: string) =>
    request(`/api/grants/${encodeURIComponent(id)}`, okResponseSchema, {
      method: "DELETE",
    }),
  sessions: () => request("/api/sessions", sessionListResponseSchema),
  revokeSession: (id: string) =>
    request(`/api/sessions/${encodeURIComponent(id)}`, okResponseSchema, {
      method: "DELETE",
    }),
}
