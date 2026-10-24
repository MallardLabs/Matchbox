import {
  type QuotaBucketStatus,
  type QuotaWindow,
  type RateLimitPolicy,
  type RateLimitResult,
  rateLimitHeaderNames,
  rateLimitPolicySchema,
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

/** A bucket's stored counters plus the policy it last enforced (null
 * before its first allowed request). */
export const rateLimitSnapshotSchema = z.object({
  state: rateLimitStateSchema,
  policy: rateLimitPolicySchema.nullable(),
})

export type RateLimitSnapshot = z.infer<typeof rateLimitSnapshotSchema>

export const emptyRateLimitSnapshot: RateLimitSnapshot = {
  state: emptyRateLimitState,
  policy: null,
}

/** Read-only access for dashboards; `peek` never consumes quota. */
export type RateLimitReader = {
  peek(key: string): Promise<RateLimitSnapshot>
}

function quotaWindowView(
  counter: RateLimitCounter | null,
  window: number,
  windowMs: number,
  limit: number,
): QuotaWindow {
  const used = counter !== null && counter.window === window ? counter.count : 0
  return {
    used,
    limit,
    remaining: Math.max(limit - used, 0),
    resetAt: new Date((window + 1) * windowMs).toISOString(),
  }
}

/**
 * Daily (UTC) and burst windows of a bucket at `nowMs`. Counters from an
 * earlier window read as a real zero. Limits come from the policy the
 * bucket last enforced, else `fallback` (the policy it would get now).
 */
export function quotaBucketStatus(
  snapshot: RateLimitSnapshot,
  fallback: RateLimitPolicy,
  nowMs: number,
): QuotaBucketStatus {
  const policy = snapshot.policy ?? fallback
  return {
    daily: quotaWindowView(
      snapshot.state.day,
      Math.floor(nowMs / dayMs),
      dayMs,
      policy.perDay,
    ),
    burst: quotaWindowView(
      snapshot.state.minute,
      Math.floor(nowMs / minuteMs),
      minuteMs,
      policy.perMinute,
    ),
  }
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

/** Reads a bucket without consuming it. */
export async function peekRateLimit(
  namespace: RateLimiterNamespace,
  key: string,
): Promise<RateLimitSnapshot> {
  const stub = namespace.get(namespace.idFromName(key))
  return rateLimitSnapshotSchema.parse(await stub.peek())
}

/**
 * Durable Object client. Another Worker can read the developer-api's
 * buckets through a cross-script binding (`script_name`) to its
 * `RateLimiter` class and `peek` them.
 */
export function createDurableRateLimitClient(
  namespace: RateLimiterNamespace,
): RateLimitClient & RateLimitReader {
  return {
    consume(key, policy) {
      return checkRateLimit(namespace, key, policy)
    },
    peek(key) {
      return peekRateLimit(namespace, key)
    },
  }
}

/** In-memory limiter with the same window maths, for tests and dev. */
export function createMemoryRateLimitClient(
  now: () => number = () => Date.now(),
): RateLimitClient & RateLimitReader & { reset(): void } {
  const snapshots = new Map<string, RateLimitSnapshot>()
  return {
    async consume(key, policy) {
      const stored = snapshots.get(key) ?? emptyRateLimitSnapshot
      const { state, result } = consumeRateLimit(stored.state, policy, now())
      if (result.allowed) snapshots.set(key, { state, policy })
      return result
    },
    async peek(key) {
      return structuredClone(snapshots.get(key) ?? emptyRateLimitSnapshot)
    },
    reset() {
      snapshots.clear()
    },
  }
}
