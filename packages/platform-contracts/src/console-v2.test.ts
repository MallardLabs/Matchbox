import { describe, expect, it } from "vitest"
import {
  adminReviewStats,
  compareReviewsNewestFirst,
  environmentReviewListResponseSchema,
  orgUsageQuerySchema,
  orgUsageResponseSchema,
  requestStatusFilterFor,
  reviewDecidedBy,
  usageErrorRate,
} from "./console"
import {
  activeQuotaOverride,
  environmentQuotaBucketKey,
  publishablePolicy,
} from "./rate-limits"

const now = new Date("2026-10-21T14:00:00.000Z")
const hoursAgo = (hours: number) =>
  new Date(now.getTime() - hours * 3_600_000).toISOString()

const staff = "11111111-1111-4111-8111-111111111111"

function review(
  id: string,
  state: "open" | "approved" | "changes-requested" | "rejected" | "withdrawn",
  createdHoursAgo: number,
  decidedHoursAgo: number | null,
  reviewerId: string | null = staff,
) {
  return {
    id,
    state,
    reviewerId,
    createdAt: hoursAgo(createdHoursAgo),
    decidedAt: decidedHoursAgo === null ? null : hoursAgo(decidedHoursAgo),
    appName: `App ${id.slice(0, 1)}`,
  }
}

describe("reviews", () => {
  it("derives who closed a review", () => {
    expect(reviewDecidedBy({ state: "open", reviewerId: null })).toBeNull()
    expect(reviewDecidedBy({ state: "approved", reviewerId: null })).toBe(
      "auto",
    )
    expect(reviewDecidedBy({ state: "approved", reviewerId: staff })).toBe(
      "staff",
    )
    expect(reviewDecidedBy({ state: "withdrawn", reviewerId: null })).toBe(
      "developer",
    )
  })

  it("orders by latest activity, newest first", () => {
    const reviews = [
      { createdAt: hoursAgo(100), decidedAt: hoursAgo(90) },
      { createdAt: hoursAgo(50), decidedAt: null },
      { createdAt: hoursAgo(80), decidedAt: hoursAgo(10) },
    ]
    expect([...reviews].sort(compareReviewsNewestFirst)).toEqual([
      reviews[2],
      reviews[1],
      reviews[0],
    ])
  })

  it("parses decided reviews with reviewer notes", () => {
    const parsed = environmentReviewListResponseSchema.parse({
      data: [
        {
          id: "22222222-2222-4222-8222-222222222222",
          environmentId: "33333333-3333-4333-8333-333333333333",
          requestedScopes: ["openid", "discord:profile"],
          state: "changes-requested",
          submitterId: null,
          submitterNote: "Leaderboard display names",
          reviewerId: staff,
          reviewerNote: "Add a privacy policy URL.",
          createdAt: hoursAgo(30),
          decidedAt: hoursAgo(20),
          decidedBy: "staff",
          submitterName: "Alex K.",
        },
      ],
    })
    expect(parsed.data[0]?.reviewerNote).toBe("Add a privacy policy URL.")
  })

  it("computes admin review stats from staff decisions only", () => {
    const stats = adminReviewStats(
      [
        review("a0000000-0000-4000-8000-000000000000", "open", 120, null, null),
        review("b0000000-0000-4000-8000-000000000000", "open", 48, null, null),
        review("c0000000-0000-4000-8000-000000000000", "approved", 30, 20),
        review("d0000000-0000-4000-8000-000000000000", "rejected", 50, 40),
        review(
          "e0000000-0000-4000-8000-000000000000",
          "changes-requested",
          12,
          2,
        ),
        review("f0000000-0000-4000-8000-000000000000", "approved", 5, 5, null),
        review("90000000-0000-4000-8000-000000000000", "approved", 400, 300),
      ],
      now,
    )
    expect(stats).toEqual({
      open: 2,
      oldestOpen: {
        reviewId: "a0000000-0000-4000-8000-000000000000",
        appName: "App a",
        createdAt: hoursAgo(120),
      },
      decided7d: { total: 3, approved: 1, changesRequested: 1, rejected: 1 },
      medianWaitSeconds: 10 * 3_600,
    })
    expect(adminReviewStats([], now)).toEqual({
      open: 0,
      oldestOpen: null,
      decided7d: { total: 0, approved: 0, changesRequested: 0, rejected: 0 },
      medianWaitSeconds: null,
    })
  })
})

describe("usage split", () => {
  it("buckets status codes with 429 separate from 4xx", () => {
    expect(requestStatusFilterFor(200)).toBe("success")
    expect(requestStatusFilterFor(304)).toBe("success")
    expect(requestStatusFilterFor(404)).toBe("client-error")
    expect(requestStatusFilterFor(429)).toBe("rate-limited")
    expect(requestStatusFilterFor(503)).toBe("server-error")
  })

  it("returns a null error rate without traffic", () => {
    expect(usageErrorRate({ requests: 0, errors: 0 })).toBeNull()
    expect(usageErrorRate({ requests: 200, errors: 1 })).toBe(0.005)
  })

  it("defaults org usage to daily buckets across both kinds", () => {
    const query = orgUsageQuerySchema.parse({
      from: "2026-10-14T00:00:00.000Z",
      to: "2026-10-21T00:00:00.000Z",
    })
    expect(query).toMatchObject({ bucket: "day", environmentKind: "both" })
    expect(
      orgUsageQuerySchema.safeParse({
        from: "2026-10-01T00:00:00.000Z",
        to: "2026-10-21T00:00:00.000Z",
        bucket: "hour",
      }).success,
    ).toBe(false)
  })

  it("accepts an environment with no traffic", () => {
    const zero = {
      requests: 0,
      errors: 0,
      clientErrors: 0,
      rateLimited: 0,
      serverErrors: 0,
    }
    const parsed = orgUsageResponseSchema.safeParse({
      from: "2026-10-14T00:00:00.000Z",
      to: "2026-10-21T00:00:00.000Z",
      bucket: "day",
      environmentKind: "both",
      totals: {
        ...zero,
        errorRate: null,
        p50LatencyMs: null,
        p95LatencyMs: null,
      },
      series: [],
      byEnvironment: [
        {
          app: {
            id: "44444444-4444-4444-8444-444444444444",
            name: "Vote Relay",
            status: "active",
          },
          environmentId: "55555555-5555-4555-8555-555555555555",
          environmentKind: "test",
          network: "mezo-testnet",
          summary: {
            ...zero,
            errorRate: null,
            p50LatencyMs: null,
            p95LatencyMs: null,
          },
          daily: [],
        },
      ],
      topRoutes: [],
      byKey: [],
    })
    expect(parsed.success).toBe(true)
  })
})

describe("quota buckets", () => {
  it("names the limiter buckets and scales the publishable share", () => {
    expect(environmentQuotaBucketKey("env-1", "secret")).toBe(
      "env:env-1:secret",
    )
    expect(publishablePolicy({ perMinute: 300, perDay: 100_000 }, 0.5)).toEqual(
      { perMinute: 150, perDay: 50_000 },
    )
    expect(publishablePolicy({ perMinute: 1, perDay: 1 }, 0.1)).toEqual({
      perMinute: 1,
      perDay: 1,
    })
  })

  it("finds the override in force", () => {
    const overrides = [
      {
        endpointClass: "gauge-profiles" as const,
        perMinute: 5,
        perDay: 50,
        expiresAt: "2026-10-21T13:00:00.000Z",
      },
      {
        endpointClass: "gauge-profiles" as const,
        perMinute: 600,
        perDay: 250_000,
        expiresAt: null,
      },
    ]
    expect(activeQuotaOverride(overrides, "gauge-profiles", now)).toEqual(
      overrides[1],
    )
    expect(activeQuotaOverride(overrides, "userinfo", now)).toBeNull()
  })
})
