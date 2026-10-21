import { z } from "zod"
import { isoDateTimeSchema, uuidSchema } from "./common"
import type { AppStatus } from "./console"
import { type EnvironmentKind, environmentKindSchema } from "./network"

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

/** The override in force for an endpoint class (first unexpired match;
 * stores list overrides newest first). */
export function activeQuotaOverride(
  overrides: readonly QuotaOverride[],
  endpointClass: EndpointClass,
  now: Date,
): QuotaOverride | null {
  return (
    overrides.find(
      (candidate) =>
        candidate.endpointClass === endpointClass &&
        (candidate.expiresAt === null ||
          Date.parse(candidate.expiresAt) > now.getTime()),
    ) ?? null
  )
}

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
  const override = activeQuotaOverride(
    input.overrides,
    input.endpointClass,
    input.now,
  )
  if (override !== null) {
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

// ---------------------------------------------------------------------------
// Quota buckets and the readable quota status (console "Quota · today")
// ---------------------------------------------------------------------------

/**
 * Share of an environment's quota that publishable-key traffic may use
 * (developer-api `PUBLISHABLE_QUOTA_SHARE`). Publishable keys ship to
 * browsers, so anyone can spend them; their own bucket keeps them from
 * starving secret keys.
 */
export const defaultPublishableQuotaShare = 0.5

/** The publishable bucket's policy: `share` of the environment policy. */
export function publishablePolicy(
  policy: RateLimitPolicy,
  share: number,
): RateLimitPolicy {
  return {
    perMinute: Math.max(1, Math.floor(policy.perMinute * share)),
    perDay: Math.max(1, Math.floor(policy.perDay * share)),
  }
}

export const quotaBucketKindSchema = z.enum(["secret", "publishable"])

export type QuotaBucketKind = z.infer<typeof quotaBucketKindSchema>

/** Durable Object key of an environment's Gauge Profile API bucket. */
export function environmentQuotaBucketKey(
  environmentId: string,
  kind: QuotaBucketKind,
): string {
  return `env:${environmentId}:${kind}`
}

/** One fixed window of a bucket. `used` is 0 (a real zero) when the bucket
 * has not been touched in the current window. */
export const quotaWindowSchema = z.object({
  used: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
  remaining: z.number().int().nonnegative(),
  resetAt: isoDateTimeSchema,
})

export type QuotaWindow = z.infer<typeof quotaWindowSchema>

export const quotaBucketStatusSchema = z.object({
  /** UTC day window (resets 00:00 UTC). */
  daily: quotaWindowSchema,
  /** Current per-minute (burst) window. */
  burst: quotaWindowSchema,
})

export type QuotaBucketStatus = z.infer<typeof quotaBucketStatusSchema>

export const activeQuotaOverrideSchema = z.object({
  perMinute: z.number().int().positive(),
  perDay: z.number().int().positive(),
  expiresAt: isoDateTimeSchema.nullable(),
})

/**
 * `GET /api/environments/{environmentId}/quota` (and each entry of
 * `GET /api/orgs/{orgId}/quotas`). Buckets are null when the limiter could
 * not be read (render "—"); `daily`/`burst` of a bucket nobody used today
 * are real zeros. `secret` is the environment's full quota ("Daily",
 * "Burst" in the console); `publishable` is the browser share.
 */
export const environmentQuotaStatusSchema = z.object({
  environmentId: uuidSchema,
  environmentKind: environmentKindSchema,
  endpointClass: endpointClassSchema,
  secret: quotaBucketStatusSchema.nullable(),
  publishable: quotaBucketStatusSchema.nullable(),
  /** (0, 1]; the publishable bucket's share of the policy. */
  publishableShare: z.number().gt(0).max(1),
  override: activeQuotaOverrideSchema.nullable(),
  /** 429 responses since 00:00 UTC (request log); null when unavailable. */
  rateLimitedToday: z.number().int().nonnegative().nullable(),
  observedAt: isoDateTimeSchema,
})

export type EnvironmentQuotaStatus = z.infer<
  typeof environmentQuotaStatusSchema
>

export const environmentQuotaListResponseSchema = z.object({
  data: z.array(environmentQuotaStatusSchema),
})

export type EnvironmentQuotaListResponse = z.infer<
  typeof environmentQuotaListResponseSchema
>
