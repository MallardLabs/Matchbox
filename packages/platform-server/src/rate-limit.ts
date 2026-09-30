import {
  type RateLimitPolicy,
  type RateLimitResult,
  rateLimitHeaderNames,
  rateLimitResultSchema,
} from "@repo/platform-contracts/rate-limits"
import { z } from "zod"
import type { RateLimiter } from "./rate-limiter"

/**
 * Fixed-window limiter maths: one per-minute (burst) and one per-UTC-day
 * window per key. Rejected requests do not consume quota.
 */

export const minuteMs = 60_000
export const dayMs = 86_400_000

export const rateLimitCounterSchema = z.object({
  window: z.number().int(),
  count: z.number().int().nonnegative(),
})

export type RateLimitCounter = z.infer<typeof rateLimitCounterSchema>

export const rateLimitStateSchema = z.object({
  minute: rateLimitCounterSchema.nullable(),
  day: rateLimitCounterSchema.nullable(),
})

export type RateLimitState = z.infer<typeof rateLimitStateSchema>

export const emptyRateLimitState: RateLimitState = { minute: null, day: null }

function currentCounter(
  counter: RateLimitCounter | null,
  window: number,
): RateLimitCounter {
  return counter !== null && counter.window === window
    ? counter
    : { window, count: 0 }
}

export function consumeRateLimit(
  state: RateLimitState,
  policy: RateLimitPolicy,
  nowMs: number,
  cost = 1,
): { state: RateLimitState; result: RateLimitResult } {
  const minuteWindow = Math.floor(nowMs / minuteMs)
  const dayWindow = Math.floor(nowMs / dayMs)
  const minute = currentCounter(state.minute, minuteWindow)
  const day = currentCounter(state.day, dayWindow)
  const minuteBlocked = minute.count + cost > policy.perMinute
  const dayBlocked = day.count + cost > policy.perDay
  const allowed = !minuteBlocked && !dayBlocked

  const nextMinute = allowed
    ? { window: minuteWindow, count: minute.count + cost }
    : minute
  const nextDay = allowed ? { window: dayWindow, count: day.count + cost } : day

  const minuteView = {
    limit: policy.perMinute,
    remaining: Math.max(policy.perMinute - nextMinute.count, 0),
    resetAt: (minuteWindow + 1) * minuteMs,
  }
  const dayView = {
    limit: policy.perDay,
    remaining: Math.max(policy.perDay - nextDay.count, 0),
    resetAt: (dayWindow + 1) * dayMs,
  }
  const reported = allowed
    ? dayView.remaining < minuteView.remaining
      ? dayView
      : minuteView
    : dayBlocked
      ? dayView
      : minuteView

  return {
    state: { minute: nextMinute, day: nextDay },
    result: {
      allowed,
      limit: reported.limit,
      remaining: reported.remaining,
      resetAt: reported.resetAt,
      retryAfterSeconds: allowed
        ? 0
        : Math.max(Math.ceil((reported.resetAt - nowMs) / 1000), 1),
    },
  }
}

/** `RateLimit-*` headers, plus `Retry-After` when rejected. */
export function rateLimitHeaders(
  result: RateLimitResult,
  nowMs: number = Date.now(),
): Record<string, string> {
  const headers: Record<string, string> = {
    [rateLimitHeaderNames.limit]: String(result.limit),
    [rateLimitHeaderNames.remaining]: String(result.remaining),
    [rateLimitHeaderNames.reset]: String(
      Math.max(Math.ceil((result.resetAt - nowMs) / 1000), 0),
    ),
  }
  if (!result.allowed) {
    headers[rateLimitHeaderNames.retryAfter] = String(result.retryAfterSeconds)
  }
  return headers
}

/** What routes depend on; swap the DO for memory in tests. */
export type RateLimitClient = {
  consume(key: string, policy: RateLimitPolicy): Promise<RateLimitResult>
}

export type RateLimiterNamespace = DurableObjectNamespace<RateLimiter>

/** One `RateLimiter` Durable Object per key (`idFromName(key)`). */
export async function checkRateLimit(
  namespace: RateLimiterNamespace,
  key: string,
  policy: RateLimitPolicy,
): Promise<RateLimitResult> {
  const stub = namespace.get(namespace.idFromName(key))
  const result = await stub.consume(policy)
  return rateLimitResultSchema.parse(result)
}

export function createDurableRateLimitClient(
  namespace: RateLimiterNamespace,
): RateLimitClient {
  return {
    consume(key, policy) {
      return checkRateLimit(namespace, key, policy)
    },
  }
}

/** In-memory limiter with the same window maths, for tests and dev. */
export function createMemoryRateLimitClient(
  now: () => number = () => Date.now(),
): RateLimitClient & { reset(): void } {
  const states = new Map<string, RateLimitState>()
  return {
    async consume(key, policy) {
      const { state, result } = consumeRateLimit(
        states.get(key) ?? emptyRateLimitState,
        policy,
        now(),
      )
      states.set(key, state)
      return result
    },
    reset() {
      states.clear()
    },
  }
}
