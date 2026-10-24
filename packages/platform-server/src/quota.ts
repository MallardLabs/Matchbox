import { type Logger, logger as rootLogger } from "@repo/logger"
import type { AppStatus } from "@repo/platform-contracts/console"
import type { EnvironmentKind } from "@repo/platform-contracts/network"
import {
  type EndpointClass,
  type EnvironmentQuotaStatus,
  type QuotaBucketKind,
  type QuotaBucketStatus,
  type QuotaOverride,
  type RateLimitPolicy,
  activeQuotaOverride,
  defaultPublishableQuotaShare,
  environmentQuotaBucketKey,
  publishablePolicy,
  resolveRateLimitPolicy,
} from "@repo/platform-contracts/rate-limits"
import { type RateLimitReader, quotaBucketStatus } from "./rate-limit"

export type EnvironmentQuotaInput = {
  /** The developer-api limiter (`createDurableRateLimitClient` over a
   * cross-script `RateLimiter` binding, or the memory client). */
  limiter: RateLimitReader
  environmentId: string
  environmentKind: EnvironmentKind
  appStatus: AppStatus
  /** Overrides for the environment, newest first (expired ones allowed). */
  overrides: readonly QuotaOverride[]
  /** developer-api `PUBLISHABLE_QUOTA_SHARE`; default 0.5. */
  publishableShare?: number
  /** 429s since 00:00 UTC from the request log; null when unavailable. */
  rateLimitedToday: number | null
  now: Date
  logger?: Logger
}

/** Quotas apply to the Gauge Profile API endpoint class. */
const endpointClass: EndpointClass = "gauge-profiles"

/**
 * Quota used / remaining / reset for an environment's secret and
 * publishable buckets, as the developer-api rate limiter enforces them.
 * A bucket the limiter cannot read is null (shown as "—"); reading never
 * consumes quota and never throws.
 */
export default async function readEnvironmentQuota(
  input: EnvironmentQuotaInput,
): Promise<EnvironmentQuotaStatus> {
  const log = input.logger ?? rootLogger
  const share = input.publishableShare ?? defaultPublishableQuotaShare
  const nowMs = input.now.getTime()
  const policy = resolveRateLimitPolicy({
    environmentKind: input.environmentKind,
    endpointClass,
    appStatus: input.appStatus,
    overrides: input.overrides,
    now: input.now,
  })

  async function bucket(
    kind: QuotaBucketKind,
    fallback: RateLimitPolicy,
  ): Promise<QuotaBucketStatus | null> {
    const key = environmentQuotaBucketKey(input.environmentId, kind)
    try {
      return quotaBucketStatus(await input.limiter.peek(key), fallback, nowMs)
    } catch (error) {
      log.warn({ message: "Rate limiter unreadable", key, error })
      return null
    }
  }

  const [secret, publishable] = await Promise.all([
    bucket("secret", policy),
    bucket("publishable", publishablePolicy(policy, share)),
  ])
  const override = activeQuotaOverride(
    input.overrides,
    endpointClass,
    input.now,
  )
  return {
    environmentId: input.environmentId,
    environmentKind: input.environmentKind,
    endpointClass,
    secret,
    publishable,
    publishableShare: share,
    override:
      override === null
        ? null
        : {
            perMinute: override.perMinute,
            perDay: override.perDay,
            expiresAt: override.expiresAt,
          },
    rateLimitedToday: input.rateLimitedToday,
    observedAt: input.now.toISOString(),
  }
}
