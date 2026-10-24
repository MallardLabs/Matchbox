import { logger as rootLogger } from "@repo/logger"
import type {
  QuotaOverride,
  RateLimitPolicy,
  RateLimitResult,
} from "@repo/platform-contracts/rate-limits"
import type { AppDeps } from "./deps"

export type RateLimitCheck = { key: string; policy: RateLimitPolicy }

/** Consumes each key in order; returns the first rejection, else null. */
export async function firstRateLimitRejection(
  deps: AppDeps,
  checks: readonly RateLimitCheck[],
): Promise<RateLimitResult | null> {
  for (const check of checks) {
    const result = await deps.rateLimits.consume(
      `matchbox-id:${check.key}`,
      check.policy,
    )
    if (!result.allowed) return result
  }
  return null
}

/** Quota overrides are re-read at most once a minute per environment. */
export const quotaOverrideCacheTtlMs = 60_000
const maxCachedEnvironments = 1000

export type QuotaOverrideLookup = (
  environmentId: string,
) => Promise<QuotaOverride[]>

/**
 * `mbx_dev_quota_overrides` for per-client limits, cached in-isolate for
 * 60 s. Fails open to the defaults (logged) when the store is unavailable.
 */
export function createQuotaOverrideLookup(deps: AppDeps): QuotaOverrideLookup {
  const cache = new Map<string, { value: QuotaOverride[]; expiresAt: number }>()
  return async function quotaOverridesFor(environmentId) {
    const now = deps.now()
    const cached = cache.get(environmentId)
    if (cached !== undefined && cached.expiresAt > now.getTime()) {
      return cached.value
    }
    try {
      const value = await deps.store.listQuotaOverrides(environmentId, now)
      cache.delete(environmentId)
      if (cache.size >= maxCachedEnvironments) {
        const oldest = cache.keys().next()
        if (oldest.done !== true) cache.delete(oldest.value)
      }
      cache.set(environmentId, {
        value,
        expiresAt: now.getTime() + quotaOverrideCacheTtlMs,
      })
      return value
    } catch (error) {
      const log = deps.logger ?? rootLogger
      log.warn({
        message: "Quota overrides unavailable",
        environmentId,
        error,
      })
      return []
    }
  }
}
