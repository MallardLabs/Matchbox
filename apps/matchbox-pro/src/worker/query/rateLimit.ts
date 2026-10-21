import type { RateLimitBinding } from "./env"

export type RateLimitPolicy = {
  name: string
  limit: number
  periodSeconds: number
}

export const QUERY_LIMIT: RateLimitPolicy = {
  name: "query",
  limit: 20,
  periodSeconds: 60,
}
export const REFRESH_LIMIT: RateLimitPolicy = {
  name: "refresh",
  limit: 30,
  periodSeconds: 60,
}
export const MCP_LIMIT: RateLimitPolicy = {
  name: "mcp",
  limit: 30,
  periodSeconds: 60,
}
export const SUPPORT_LIMIT: RateLimitPolicy = {
  name: "support",
  limit: 3,
  periodSeconds: 60,
}

type Bucket = { tokens: number; updatedAt: number }

// In-isolate token bucket used when no Workers rate-limit binding is
// configured (local dev, or before the wrangler `ratelimits` entries exist).
// Counters are per isolate, so this is a first defence only.
export class TokenBuckets {
  private readonly buckets = new Map<string, Bucket>()

  take(key: string, policy: RateLimitPolicy, nowMs: number): number | null {
    const refillPerMs = policy.limit / (policy.periodSeconds * 1000)
    const current = this.buckets.get(key) ?? {
      tokens: policy.limit,
      updatedAt: nowMs,
    }
    const tokens = Math.min(
      policy.limit,
      current.tokens + (nowMs - current.updatedAt) * refillPerMs,
    )
    if (tokens < 1) {
      this.buckets.set(key, { tokens, updatedAt: nowMs })
      return Math.max(1, Math.ceil((1 - tokens) / refillPerMs / 1000))
    }
    this.buckets.set(key, { tokens: tokens - 1, updatedAt: nowMs })
    if (this.buckets.size > 10_000) this.evictOldest()
    return null
  }

  private evictOldest(): void {
    const oldest = [...this.buckets.entries()]
      .sort((left, right) => left[1].updatedAt - right[1].updatedAt)
      .slice(0, 1_000)
    for (const [key] of oldest) this.buckets.delete(key)
  }
}

const isolateBuckets = new TokenBuckets()

/** Returns seconds to wait when limited, or null when the call may proceed. */
export async function checkRateLimit(input: {
  binding: RateLimitBinding | null
  policy: RateLimitPolicy
  keys: readonly string[]
  nowMs: number
}): Promise<number | null> {
  for (const key of input.keys) {
    const scoped = `${input.policy.name}:${key}`
    if (input.binding) {
      const outcome = await input.binding.limit({ key: scoped })
      if (!outcome.success) return input.policy.periodSeconds
      continue
    }
    const wait = isolateBuckets.take(scoped, input.policy, input.nowMs)
    if (wait !== null) return wait
  }
  return null
}
