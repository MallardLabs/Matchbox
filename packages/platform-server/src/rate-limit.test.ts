import { describe, expect, it } from "vitest"
import {
  type RateLimitState,
  consumeRateLimit,
  createMemoryRateLimitClient,
  dayMs,
  emptyRateLimitState,
  minuteMs,
  rateLimitHeaders,
} from "./rate-limit"

const policy = { perMinute: 3, perDay: 5 }
// 2026-09-30T12:00:10.000Z
const start = Date.UTC(2026, 8, 30, 12, 0, 10)

function run(
  times: number,
  now: number,
  state: RateLimitState = emptyRateLimitState,
) {
  let current = state
  const results = []
  for (let index = 0; index < times; index++) {
    const step = consumeRateLimit(current, policy, now)
    current = step.state
    results.push(step.result)
  }
  return { state: current, results }
}

describe("consumeRateLimit", () => {
  it("allows up to the per-minute limit then rejects", () => {
    const { results } = run(4, start)
    expect(results.map((result) => result.allowed)).toEqual([
      true,
      true,
      true,
      false,
    ])
    expect(results.map((result) => result.remaining)).toEqual([2, 1, 0, 0])
    const rejected = results[3]
    expect(rejected?.limit).toBe(3)
    expect(rejected?.resetAt).toBe(Date.UTC(2026, 8, 30, 12, 1, 0))
    expect(rejected?.retryAfterSeconds).toBe(50)
  })

  it("does not count rejected requests", () => {
    const { state } = run(10, start)
    expect(state.minute?.count).toBe(3)
    expect(state.day?.count).toBe(3)
  })

  it("resets the minute window but keeps the day window", () => {
    const first = run(3, start)
    const next = run(3, start + minuteMs, first.state)
    expect(next.results.map((result) => result.allowed)).toEqual([
      true,
      true,
      false,
    ])
    const blocked = next.results[2]
    expect(blocked?.limit).toBe(5)
    expect(blocked?.resetAt).toBe(Date.UTC(2026, 9, 1))
    expect(blocked?.retryAfterSeconds).toBe(
      Math.ceil((Date.UTC(2026, 9, 1) - (start + minuteMs)) / 1000),
    )
  })

  it("reports the day window once it is the tighter one", () => {
    const first = run(3, start)
    const { results } = run(1, start + minuteMs, first.state)
    expect(results[0]).toMatchObject({ allowed: true, limit: 5, remaining: 1 })
  })

  it("starts fresh on a new UTC day", () => {
    const first = run(5, start)
    const nextDay = run(1, start + dayMs, first.state)
    expect(nextDay.results[0]).toMatchObject({ allowed: true, remaining: 2 })
  })

  it("supports weighted costs", () => {
    const step = consumeRateLimit(emptyRateLimitState, policy, start, 3)
    expect(step.result).toMatchObject({ allowed: true, remaining: 0 })
    expect(consumeRateLimit(step.state, policy, start, 1).result.allowed).toBe(
      false,
    )
  })
})

describe("rateLimitHeaders", () => {
  it("emits RateLimit-* and Retry-After only when rejected", () => {
    const allowed = consumeRateLimit(emptyRateLimitState, policy, start).result
    expect(rateLimitHeaders(allowed, start)).toEqual({
      "RateLimit-Limit": "3",
      "RateLimit-Remaining": "2",
      "RateLimit-Reset": "50",
    })
    const rejected = run(4, start).results[3]
    expect(rejected).toBeDefined()
    if (rejected !== undefined) {
      expect(rateLimitHeaders(rejected, start)["Retry-After"]).toBe("50")
    }
  })
})

describe("createMemoryRateLimitClient", () => {
  it("keeps independent state per key", async () => {
    let now = start
    const client = createMemoryRateLimitClient(() => now)
    for (let index = 0; index < 3; index++) {
      expect((await client.consume("env:a", policy)).allowed).toBe(true)
    }
    expect((await client.consume("env:a", policy)).allowed).toBe(false)
    expect((await client.consume("env:b", policy)).allowed).toBe(true)
    now += minuteMs
    expect((await client.consume("env:a", policy)).allowed).toBe(true)
    client.reset()
    expect((await client.consume("env:a", policy)).remaining).toBe(2)
  })
})
