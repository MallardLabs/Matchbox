import type { Logger } from "@repo/logger"
import {
  type QuotaOverride,
  type RateLimitPolicy,
  type RateLimitResult,
  environmentQuotaBucketKey,
  publishableIpRateLimitPolicy,
  publishablePolicy,
  resolveRateLimitPolicy,
} from "@repo/platform-contracts/rate-limits"
import {
  PlatformError,
  type RateLimitClient,
  rateLimitHeaders,
} from "@repo/platform-server"
import { type TtlCache, createTtlCache } from "../auth"
import type { ApiMiddleware } from "../context"
import type { ApiStore } from "../store/api-store"

/** Quota overrides are re-read at most once a minute per environment. */
export const quotaOverrideCacheTtlMs = 60_000

// Shared with the console's quota read path (`readEnvironmentQuota`).
export {
  defaultPublishableQuotaShare,
  publishablePolicy,
} from "@repo/platform-contracts/rate-limits"

export function createOverrideCache(
  now: () => number,
): TtlCache<QuotaOverride[]> {
  return createTtlCache<QuotaOverride[]>(quotaOverrideCacheTtlMs, now)
}

export type RateLimitOptions = {
  store: ApiStore
  rateLimits: RateLimitClient
  now: () => Date
  logger: Logger
  overrides: TtlCache<QuotaOverride[]>
  /** (0, 1]; see `defaultPublishableQuotaShare`. */
  publishableQuotaShare: number
}

/** The most restrictive result is what clients see in `RateLimit-*`. */
function mostRestrictive(results: readonly RateLimitResult[]) {
  let reported: RateLimitResult | null = null
  for (const result of results) {
    if (reported === null || result.remaining < reported.remaining) {
      reported = result
    }
  }
  return reported
}

/**
 * Per-environment limits, split by key kind so browser traffic cannot drain
 * the server's quota: `env:<environmentId>:secret` gets the full policy
 * (`resolveRateLimitPolicy` + overrides) and `env:<environmentId>:publishable`
 * gets `publishableQuotaShare` of it. Publishable keys also have a
 * `pk:<keyId>:<ipPrefix>` bucket. The limiter fails open: an unavailable
 * Durable Object is logged, not surfaced, and the request is served without
 * `RateLimit-*` headers. Rejections are 429 `rate_limited` and are counted
 * in usage through the request log. The console reads the environment
 * buckets with `peek` (no consumption).
 */
export function rateLimit(options: RateLimitOptions): ApiMiddleware {
  const { store, rateLimits, now, logger } = options

  async function overridesFor(environmentId: string): Promise<QuotaOverride[]> {
    const cached = options.overrides.get(environmentId)
    if (cached !== undefined) return cached.value
    try {
      const overrides = await store.listQuotaOverrides(environmentId)
      options.overrides.set(environmentId, overrides)
      return overrides
    } catch (error) {
      logger.warn({ message: "Quota overrides unavailable", error })
      return []
    }
  }

  async function consume(
    bucket: string,
    policy: RateLimitPolicy,
  ): Promise<RateLimitResult | null> {
    try {
      return await rateLimits.consume(bucket, policy)
    } catch (error) {
      logger.warn({ message: "Rate limiter unavailable", bucket, error })
      return null
    }
  }

  function rejected(result: RateLimitResult): PlatformError {
    return new PlatformError("rate_limited", {
      headers: rateLimitHeaders(result, now().getTime()),
    })
  }

  return async function rateLimitMiddleware(c, next) {
    const auth = c.get("auth")
    if (auth === undefined) throw new PlatformError("internal_error")
    const results: RateLimitResult[] = []

    if (auth.keyKind === "publishable") {
      const perIp = await consume(
        `pk:${auth.keyId}:${auth.ipPrefix ?? "unknown"}`,
        publishableIpRateLimitPolicy,
      )
      if (perIp !== null) {
        if (!perIp.allowed) throw rejected(perIp)
        results.push(perIp)
      }
    }

    const policy = resolveRateLimitPolicy({
      environmentKind: auth.environmentKind,
      endpointClass: "gauge-profiles",
      appStatus: auth.appStatus,
      overrides: await overridesFor(auth.environmentId),
      now: now(),
    })
    const perEnvironment = await consume(
      environmentQuotaBucketKey(auth.environmentId, auth.keyKind),
      auth.keyKind === "publishable"
        ? publishablePolicy(policy, options.publishableQuotaShare)
        : policy,
    )

    if (perEnvironment !== null) {
      if (!perEnvironment.allowed) throw rejected(perEnvironment)
      results.push(perEnvironment)
    }

    await next()

    const reported = mostRestrictive(results)
    if (reported !== null) {
      for (const [name, value] of Object.entries(
        rateLimitHeaders(reported, now().getTime()),
      )) {
        c.res.headers.set(name, value)
      }
    }
  }
}
