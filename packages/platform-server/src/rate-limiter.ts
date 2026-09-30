import { DurableObject } from "cloudflare:workers"
import {
  type RateLimitPolicy,
  type RateLimitResult,
  rateLimitPolicySchema,
} from "@repo/platform-contracts/rate-limits"
import {
  consumeRateLimit,
  dayMs,
  emptyRateLimitState,
  rateLimitStateSchema,
} from "./rate-limit"

const stateKey = "state"

/**
 * Fixed-window rate limiter, one instance per key. Declare it in each
 * Worker's wrangler file with a `new_sqlite_classes: ["RateLimiter"]`
 * migration and re-export it from the Worker entry:
 *
 *   export { RateLimiter } from "@repo/platform-server/rate-limiter"
 *
 * Storage is wiped by an alarm once the UTC day window has passed.
 */
export class RateLimiter extends DurableObject {
  async consume(policy: RateLimitPolicy, cost = 1): Promise<RateLimitResult> {
    const limits = rateLimitPolicySchema.parse(policy)
    const now = Date.now()
    const stored = rateLimitStateSchema.safeParse(
      await this.ctx.storage.get(stateKey),
    )
    const { state, result } = consumeRateLimit(
      stored.success ? stored.data : emptyRateLimitState,
      limits,
      now,
      cost,
    )
    if (result.allowed) await this.ctx.storage.put(stateKey, state)
    if ((await this.ctx.storage.getAlarm()) === null) {
      await this.ctx.storage.setAlarm(nextCleanupAt(now))
    }
    return result
  }

  async alarm(): Promise<void> {
    const now = Date.now()
    const stored = rateLimitStateSchema.safeParse(
      await this.ctx.storage.get(stateKey),
    )
    const currentDay = Math.floor(now / dayMs)
    if (!stored.success || (stored.data.day?.window ?? -1) < currentDay) {
      await this.ctx.storage.deleteAll()
      return
    }
    await this.ctx.storage.setAlarm(nextCleanupAt(now))
  }
}

function nextCleanupAt(nowMs: number): number {
  return (Math.floor(nowMs / dayMs) + 1) * dayMs + 60_000
}
