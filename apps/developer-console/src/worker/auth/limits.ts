import type { RateLimitPolicy } from "@repo/platform-contracts/rate-limits"
import {
  PlatformError,
  ipPrefix,
  rateLimitHeaders,
} from "@repo/platform-server"
import { type ConsoleContext, deps } from "../context"

/** Auth endpoints: per client IP prefix, plus per email for code sends. */
export const authIpPolicy = {
  perMinute: 20,
  perDay: 500,
} as const satisfies RateLimitPolicy

export const emailSendPolicy = {
  perMinute: 2,
  perDay: 15,
} as const satisfies RateLimitPolicy

/** Invitations and other outbound email from signed-in accounts. */
export const accountEmailPolicy = {
  perMinute: 10,
  perDay: 200,
} as const satisfies RateLimitPolicy

async function consume(
  c: ConsoleContext,
  key: string,
  policy: RateLimitPolicy,
): Promise<void> {
  const { rateLimits, now } = deps(c)
  const result = await rateLimits.consume(key, policy)
  if (!result.allowed) {
    throw new PlatformError("rate_limited", {
      headers: rateLimitHeaders(result, now().getTime()),
    })
  }
}

export function limitByIp(c: ConsoleContext, scope: string): Promise<void> {
  return consume(
    c,
    `console:${scope}:ip:${ipPrefix(c.req.raw) ?? "unknown"}`,
    authIpPolicy,
  )
}

export function limitByEmail(
  c: ConsoleContext,
  scope: string,
  email: string,
): Promise<void> {
  return consume(c, `console:${scope}:email:${email}`, emailSendPolicy)
}

export function limitByAccount(
  c: ConsoleContext,
  scope: string,
  accountId: string,
): Promise<void> {
  return consume(c, `console:${scope}:account:${accountId}`, accountEmailPolicy)
}
