import { oauthErrorCodeSchema } from "@repo/platform-contracts/errors"
import { z } from "zod"

/**
 * Codes the Worker sends to the SPA `/error?code=` page when it must not
 * redirect back to the client (unknown client, unregistered redirect URI).
 */
export const errorPageCodeSchema = z.enum([
  ...oauthErrorCodeSchema.options,
  "invalid_redirect_uri",
  "request_expired",
  "service_disabled",
])

export type ErrorPageCode = z.infer<typeof errorPageCodeSchema>

export const errorPagePath = "/error"

export function errorPageUrl(origin: string, code: ErrorPageCode): string {
  const url = new URL(errorPagePath, origin)
  url.searchParams.set("code", code)
  return url.href
}
