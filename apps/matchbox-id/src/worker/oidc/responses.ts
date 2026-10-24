import {
  type OAuthErrorBody,
  type OAuthErrorCode,
  oauthErrorStatusByCode,
} from "@repo/platform-contracts/errors"
import { appendRedirectParams } from "@repo/platform-contracts/redirects"
import { currentRequestId } from "@repo/platform-server"
import type { Context } from "hono"
import { type ErrorPageCode, errorPageUrl } from "../../shared/error-page"

export const noStoreHeaders = {
  "Cache-Control": "no-store",
  Pragma: "no-cache",
} as const

/** RFC 6749 §5.2 JSON error with no-store headers. */
export function oauthErrorResponse(
  c: Context,
  code: OAuthErrorCode,
  options: {
    description?: string
    status?: number
    headers?: Record<string, string>
  } = {},
): Response {
  const body: OAuthErrorBody =
    options.description === undefined
      ? { error: code }
      : { error: code, error_description: options.description }
  return new Response(JSON.stringify(body), {
    status: options.status ?? oauthErrorStatusByCode[code],
    headers: {
      "Content-Type": "application/json",
      "X-Request-Id": currentRequestId(c),
      ...noStoreHeaders,
      ...options.headers,
    },
  })
}

export function noStoreJson(c: Context, body: unknown): Response {
  return c.json(body, 200, { ...noStoreHeaders })
}

/** 302 to the SPA error page; used when redirecting to the client is unsafe. */
export function errorPageRedirect(c: Context, code: ErrorPageCode): Response {
  return redirect(c, errorPageUrl(new URL(c.req.url).origin, code))
}

export function redirect(c: Context, location: string): Response {
  return new Response(null, {
    status: 302,
    headers: {
      Location: location,
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
      "X-Request-Id": currentRequestId(c),
    },
  })
}

/** Authorization error response (RFC 6749 §4.1.2.1) with RFC 9207 `iss`. */
export function clientErrorRedirectUrl(input: {
  redirectUri: string
  issuer: string
  code: OAuthErrorCode
  description?: string
  state: string | null
}): string {
  const params: Record<string, string> = {
    error: input.code,
    iss: input.issuer,
  }
  if (input.description !== undefined) {
    params.error_description = input.description
  }
  if (input.state !== null) params.state = input.state
  return appendRedirectParams(input.redirectUri, params)
}

/** Successful authorization response with RFC 9207 `iss`. */
export function clientCodeRedirectUrl(input: {
  redirectUri: string
  issuer: string
  code: string
  state: string
}): string {
  return appendRedirectParams(input.redirectUri, {
    code: input.code,
    state: input.state,
    iss: input.issuer,
  })
}
