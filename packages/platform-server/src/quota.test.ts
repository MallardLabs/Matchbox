import { createLogger } from "@repo/logger"
import { environmentQuotaStatusSchema } from "@repo/platform-contracts/rate-limits"
import { describe, expect, it } from "vitest"
import readEnvironmentQuota from "./quota"
import {
  type RateLimitReader,
  createMemoryRateLimitClient,
  dayMs,
  emptyRateLimitSnapshot,
  minuteMs,
  quotaBucketStatus,
} from "./rate-limit"

// 2026-10-21T14:02:10.000Z
const nowMs = Date.UTC(2026, 9, 21, 14, 2, 10)
const now = new Date(nowMs)
const environmentId = "6a3f0c1e-2b4d-4e8f-9a1b-3c5d7e9f1a2b"
const silentLogger = createLogger({ level: "error", sink: () => {} })

describe("quotaBucketStatus", () => {
  it("reports today's counters against the last enforced policy", () => {
    const status = quotaBucketStatus(
      {
        state: {
          minute: { window: Math.floor(nowMs / minuteMs), count: 42 },
          day: { window: Math.floor(nowMs / dayMs), count: 61_240 },
        },
        policy: { perMinute: 300, perDay: 100_000 },
      },
      { perMinute: 60, perDay: 5_000 },
      nowMs,
    )
    expect(status.daily).toEqual({
      used: 61_240,
      limit: 100_000,
      remaining: 38_760,
      resetAt: "2026-10-22T00:00:00.000Z",
    })
    expect(status.burst).toEqual({
      used: 42,
      limit: 300,
      remaining: 258,
      resetAt: "2026-10-21T14:03:00.000Z",
    })
  })

  it("reads stale windows as a real zero and falls back to the policy", () => {
    const status = quotaBucketStatus(
      {
        state: {
          minute: { window: Math.floor(nowMs / minuteMs) - 5, count: 9 },
          day: { window: Math.floor(nowMs / dayMs) - 1, count: 900 },
        },
        policy: null,
      },
      { perMinute: 60, perDay: 5_000 },
      nowMs,
    )
    expect(status.daily).toMatchObject({ used: 0, limit: 5_000 })
    expect(status.burst).toMatchObject({ used: 0, remaining: 60 })
  })
})

describe("memory limiter peek", () => {
  it("returns counters and the policy without consuming", async () => {
    const limiter = createMemoryRateLimitClient(() => nowMs)
    const policy = { perMinute: 3, perDay: 5 }
    expect(await limiter.peek("env:x:secret")).toEqual(emptyRateLimitSnapshot)
    await limiter.consume("env:x:secret", policy)
    await limiter.consume("env:x:secret", policy)
    const snapshot = await limiter.peek("env:x:secret")
    expect(snapshot.policy).toEqual(policy)
    expect(snapshot.state.day?.count).toBe(2)
    expect((await limiter.peek("env:x:secret")).state.day?.count).toBe(2)
  })
})

describe("readEnvironmentQuota", () => {
  it("reads both buckets with the resolved and publishable policies", async () => {
    const limiter = createMemoryRateLimitClient(() => nowMs)
    const live = { perMinute: 300, perDay: 100_000 }
    for (let index = 0; index < 3; index++) {
      await limiter.consume(`env:${environmentId}:secret`, live)
    }
    const status = await readEnvironmentQuota({
      limiter,
      environmentId,
      environmentKind: "live",
      appStatus: "active",
      overrides: [],
      rateLimitedToday: 7,
      now,
    })
    expect(environmentQuotaStatusSchema.parse(status)).toEqual(status)
    expect(status.secret?.daily).toMatchObject({ used: 3, limit: 100_000 })
    expect(status.publishable?.daily).toMatchObject({ used: 0, limit: 50_000 })
    expect(status.publishable?.burst.limit).toBe(150)
    expect(status.publishableShare).toBe(0.5)
    expect(status.override).toBeNull()
    expect(status.rateLimitedToday).toBe(7)
    expect(status.observedAt).toBe(now.toISOString())
  })

  it("applies an active override and restricted-app limits", async () => {
    const limiter = createMemoryRateLimitClient(() => nowMs)
    const overridden = await readEnvironmentQuota({
      limiter,
      environmentId,
      environmentKind: "live",
      appStatus: "active",
      overrides: [
        {
          endpointClass: "gauge-profiles",
          perMinute: 600,
          perDay: 250_000,
          expiresAt: null,
        },
      ],
      publishableShare: 0.25,
      rateLimitedToday: null,
      now,
    })
    expect(overridden.override).toEqual({
      perMinute: 600,
      perDay: 250_000,
      expiresAt: null,
    })
    expect(overridden.secret?.daily.limit).toBe(250_000)
    expect(overridden.publishable?.daily.limit).toBe(62_500)

    const restricted = await readEnvironmentQuota({
      limiter,
      environmentId,
      environmentKind: "live",
      appStatus: "restricted",
      overrides: [],
      rateLimitedToday: null,
      now,
    })
    expect(restricted.secret?.daily.limit).toBe(5_000)
  })

  it("returns null buckets when the limiter cannot be read", async () => {
    const failing: RateLimitReader = {
      async peek() {
        throw new Error("Durable Object unavailable")
      },
    }
    const status = await readEnvironmentQuota({
      limiter: failing,
      environmentId,
      environmentKind: "test",
      appStatus: "active",
      overrides: [],
      rateLimitedToday: null,
      now,
      logger: silentLogger,
    })
    expect(status.secret).toBeNull()
    expect(status.publishable).toBeNull()
  })
})
