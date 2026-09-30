import { z } from "zod"
import type { AppStatus } from "./console"
import type { EnvironmentKind } from "./network"

export const endpointClassSchema = z.enum([
  "gauge-profiles",
  "unauthenticated",
  "oidc-token",
  "siwe",
  "userinfo",
])

export type EndpointClass = z.infer<typeof endpointClassSchema>

export const rateLimitPolicySchema = z.object({
  perMinute: z.number().int().positive(),
  perDay: z.number().int().positive(),
})

export type RateLimitPolicy = z.infer<typeof rateLimitPolicySchema>

/**
 * Default limits by environment kind and endpoint class. `gauge-profiles`,
 * `oidc-token` and `userinfo` are keyed by environment id; `unauthenticated`
 * and `siwe` are keyed by client IP prefix and do not vary by kind.
 */
export const rateLimitPolicies = {
  test: {
    "gauge-profiles": { perMinute: 60, perDay: 5_000 },
    unauthenticated: { perMinute: 30, perDay: 1_000 },
    "oidc-token": { perMinute: 60, perDay: 5_000 },
    siwe: { perMinute: 20, perDay: 500 },
    userinfo: { perMinute: 120, perDay: 10_000 },
  },
  live: {
    "gauge-profiles": { perMinute: 300, perDay: 100_000 },
    unauthenticated: { perMinute: 30, perDay: 1_000 },
    "oidc-token": { perMinute: 300, perDay: 100_000 },
    siwe: { perMinute: 20, perDay: 500 },
    userinfo: { perMinute: 600, perDay: 200_000 },
  },
} as const satisfies Record<
  EnvironmentKind,
  Record<EndpointClass, RateLimitPolicy>
>

/** Second limiter for publishable keys, keyed `pk:<keyId>:<ipPrefix>`. */
export const publishableIpRateLimitPolicy = {
  perMinute: 60,
  perDay: 20_000,
} as const satisfies RateLimitPolicy

export const quotaOverrideSchema = z.object({
  endpointClass: endpointClassSchema,
  perMinute: z.number().int().positive(),
  perDay: z.number().int().positive(),
  expiresAt: z.string().nullable(),
})

export type QuotaOverride = z.infer<typeof quotaOverrideSchema>

/**
 * Resolves the policy for an environment: an unexpired override wins;
 * restricted apps fall back to test (development) limits.
 */
export function resolveRateLimitPolicy(input: {
  environmentKind: EnvironmentKind
  endpointClass: EndpointClass
  appStatus: AppStatus
  overrides: readonly QuotaOverride[]
  now: Date
}): RateLimitPolicy {
  const override = input.overrides.find(
    (candidate) =>
      candidate.endpointClass === input.endpointClass &&
      (candidate.expiresAt === null ||
        Date.parse(candidate.expiresAt) > input.now.getTime()),
  )
  if (override !== undefined) {
    return { perMinute: override.perMinute, perDay: override.perDay }
  }
  const kind = input.appStatus === "restricted" ? "test" : input.environmentKind
  const policy = rateLimitPolicies[kind][input.endpointClass]
  return { perMinute: policy.perMinute, perDay: policy.perDay }
}

export const rateLimitResultSchema = z.object({
  allowed: z.boolean(),
  limit: z.number().int().nonnegative(),
  remaining: z.number().int().nonnegative(),
  /** Unix epoch milliseconds when the reported window resets. */
  resetAt: z.number().int().nonnegative(),
  /** Seconds to wait before retrying; 0 when allowed. */
  retryAfterSeconds: z.number().int().nonnegative(),
})

export type RateLimitResult = z.infer<typeof rateLimitResultSchema>

export const rateLimitHeaderNames = {
  limit: "RateLimit-Limit",
  remaining: "RateLimit-Remaining",
  reset: "RateLimit-Reset",
  retryAfter: "Retry-After",
} as const
