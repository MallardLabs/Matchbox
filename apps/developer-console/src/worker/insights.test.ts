import {
  adminReviewContextResponseSchema,
  adminReviewStatsResponseSchema,
  environmentReviewListResponseSchema,
  environmentSchema,
  oauthStatsResponseSchema,
  orgReviewListResponseSchema,
  orgUsageResponseSchema,
  usageResponseSchema,
} from "@repo/platform-contracts/console"
import { platformHealthResponseSchema } from "@repo/platform-contracts/platform-health"
import {
  environmentQuotaBucketKey,
  environmentQuotaListResponseSchema,
  environmentQuotaStatusSchema,
  rateLimitPolicies,
} from "@repo/platform-contracts/rate-limits"
import { describe, expect, it } from "vitest"
import { startOfUtcDay } from "./routes/quotas"
import { fillDaily } from "./routes/usage"
import { createHarness } from "./test/harness"

async function ownerContext() {
  const harness = createHarness()
  const owner = await harness.account("owner@example.com", "Alex Kim")
  const organization = await harness.organization(owner)
  const { app, test, live } = await harness.appWithEnvironments(organization.id)
  const cookie = await harness.signIn(owner, { steppedUp: true })
  return { harness, owner, organization, app, test, live, cookie }
}

const day = 86_400_000

describe("platform health", () => {
  it("answers without a session (sign-in footer)", async () => {
    const harness = createHarness()
    const response = await harness.request("GET", "/api/platform/health")
    expect(response.status).toBe(200)
    const body = await harness.json(response, platformHealthResponseSchema)
    expect(body.source).toBe("local")
    expect(body.products.map((product) => product.product)).toEqual([
      "gauge-profile-api",
      "matchbox-id",
    ])
  })

  it("maps reader failures to 503 service_disabled", async () => {
    const harness = createHarness({
      health: {
        read: async () => {
          throw new Error("AE down")
        },
      },
    })
    const response = await harness.request("GET", "/api/platform/health")
    expect(response.status).toBe(503)
  })
})

describe("usage split", () => {
  it("splits errors into 4xx (excl. 429), 429 and 5xx", async () => {
    const { harness, test, cookie } = await ownerContext()
    const to = harness.now()
    const from = new Date(to.getTime() - day)
    const response = await harness.request(
      "GET",
      `/api/environments/${test.id}/usage?from=${from.toISOString()}&to=${to.toISOString()}&bucket=hour`,
      { cookie },
    )
    expect(response.status).toBe(200)
    const usage = await harness.json(response, usageResponseSchema)
    const { totals } = usage
    expect(
      (totals.clientErrors ?? 0) +
        (totals.rateLimited ?? 0) +
        (totals.serverErrors ?? 0),
    ).toBe(totals.errors)
    for (const point of usage.series) {
      expect(point.clientErrors).toBeDefined()
    }
  })

  it("aggregates the organization and lists every environment", async () => {
    const { harness, organization, app, cookie } = await ownerContext()
    const to = harness.now()
    const from = new Date(startOfUtcDay(to).getTime() - 6 * day)
    const base = `/api/orgs/${organization.id}/usage?from=${from.toISOString()}&to=${to.toISOString()}&bucket=day`
    const both = await harness.json(
      await harness.request("GET", base, { cookie }),
      orgUsageResponseSchema,
    )
    expect(both.byEnvironment).toHaveLength(2)
    expect(both.byEnvironment.every((row) => row.app.id === app.id)).toBe(true)
    expect(both.byEnvironment[0]?.daily).toHaveLength(7)
    const summed = both.byEnvironment.reduce(
      (sum, row) => sum + row.summary.requests,
      0,
    )
    expect(both.totals.requests).toBe(summed)

    const live = await harness.json(
      await harness.request("GET", `${base}&environmentKind=live`, { cookie }),
      orgUsageResponseSchema,
    )
    expect(live.byEnvironment.map((row) => row.environmentKind)).toEqual([
      "live",
    ])

    const foreign = await harness.request(
      "GET",
      `${base}&appId=${crypto.randomUUID()}`,
      { cookie },
    )
    expect(foreign.status).toBe(404)
  })

  it("keeps outsiders out of organization usage", async () => {
    const { harness, organization } = await ownerContext()
    const outsider = await harness.account("outsider@example.com")
    const cookie = await harness.signIn(outsider)
    const to = harness.now()
    const from = new Date(to.getTime() - day)
    const response = await harness.request(
      "GET",
      `/api/orgs/${organization.id}/usage?from=${from.toISOString()}&to=${to.toISOString()}`,
      { cookie },
    )
    expect(response.status).toBe(404)
  })

  it("fills missing UTC days with real zeros", () => {
    const from = new Date("2026-10-15T00:00:00Z")
    const to = new Date("2026-10-17T12:00:00Z")
    expect(
      fillDaily(
        [{ start: Date.parse("2026-10-16T00:00:00Z") / 1000, requests: 5 }],
        from,
        to,
      ).map((point) => point.requests),
    ).toEqual([0, 5, 0])
  })
})

describe("quota status", () => {
  it("reads the developer-api buckets without consuming them", async () => {
    const { harness, live, cookie } = await ownerContext()
    const policy = rateLimitPolicies.live["gauge-profiles"]
    for (let index = 0; index < 3; index++) {
      await harness.apiLimiter.consume(
        environmentQuotaBucketKey(live.id, "secret"),
        policy,
      )
    }
    const read = async () =>
      harness.json(
        await harness.request("GET", `/api/environments/${live.id}/quota`, {
          cookie,
        }),
        environmentQuotaStatusSchema,
      )
    const first = await read()
    expect(first.secret?.daily).toMatchObject({
      used: 3,
      limit: policy.perDay,
    })
    expect(first.publishable?.daily.used).toBe(0)
    expect((await read()).secret?.daily.used).toBe(3)
    expect(first.rateLimitedToday).not.toBeNull()
  })

  it("lists every environment of the organization", async () => {
    const { harness, organization, test, live, cookie } = await ownerContext()
    const all = await harness.json(
      await harness.request("GET", `/api/orgs/${organization.id}/quotas`, {
        cookie,
      }),
      environmentQuotaListResponseSchema,
    )
    expect(all.data.map((row) => row.environmentId).sort()).toEqual(
      [test.id, live.id].sort(),
    )
    const liveOnly = await harness.json(
      await harness.request(
        "GET",
        `/api/orgs/${organization.id}/quotas?environmentKind=live`,
        { cookie },
      ),
      environmentQuotaListResponseSchema,
    )
    expect(liveOnly.data.map((row) => row.environmentId)).toEqual([live.id])
  })
})

describe("reviews for developers", () => {
  it("lists decided reviews with staff notes and submitter names", async () => {
    const { harness, owner, organization, live, cookie } = await ownerContext()
    const reviewer = await harness.account("reviewer@matchbox.local")
    const at = harness.now().toISOString()
    await harness.store.createReview({
      environmentId: live.id,
      requestedScopes: ["openid", "discord:id"],
      state: "changes-requested",
      submitterId: owner.id,
      submitterNote: "Leaderboard names",
      reviewerId: reviewer.id,
      reviewerNote: "Add a privacy policy URL.",
      decidedAt: at,
    })
    const reviews = await harness.json(
      await harness.request("GET", `/api/environments/${live.id}/reviews`, {
        cookie,
      }),
      environmentReviewListResponseSchema,
    )
    expect(reviews.data[0]).toMatchObject({
      state: "changes-requested",
      decidedBy: "staff",
      submitterName: "Alex Kim",
      reviewerNote: "Add a privacy policy URL.",
    })
    const org = await harness.json(
      await harness.request("GET", `/api/orgs/${organization.id}/reviews`, {
        cookie,
      }),
      orgReviewListResponseSchema,
    )
    expect(org.data[0]?.environmentKind).toBe("live")
  })
})

describe("re-consent and optional scopes", () => {
  it("counts active grants below the environment's scope version", async () => {
    const { harness, live, cookie } = await ownerContext()
    await harness.store.updateEnvironment(live.id, { scopeVersion: 3 })
    const at = harness.now().toISOString()
    for (const scopeVersion of [1, 2, 3]) {
      harness.store.seedGrant({
        environmentId: live.id,
        scopes: ["openid"],
        createdAt: at,
        revokedAt: null,
        revokedReason: null,
        scopeVersion,
      })
    }
    const from = new Date(harness.now().getTime() - 30 * day).toISOString()
    const stats = await harness.json(
      await harness.request(
        "GET",
        `/api/environments/${live.id}/oauth?from=${from}&to=${at}`,
        { cookie },
      ),
      oauthStatsResponseSchema,
    )
    expect(stats.awaitingReconsent).toEqual({
      count: 2,
      currentScopeVersion: 3,
      oldestScopeVersion: 1,
    })
  })

  it("stores optional scopes and drops them with their scope", async () => {
    const { harness, test, cookie } = await ownerContext()
    const put = (body: unknown) =>
      harness.request("PUT", `/api/environments/${test.id}/scopes`, {
        cookie,
        body,
      })
    const rejected = await put({
      requestedScopes: ["openid", "wallet"],
      optionalScopes: ["openid"],
    })
    expect(rejected.status).toBe(400)
    const saved = await harness.json(
      await put({
        requestedScopes: ["openid", "wallet"],
        optionalScopes: ["wallet"],
      }),
      environmentSchema,
    )
    expect(saved.optionalScopes).toEqual(["wallet"])
    const narrowed = await harness.json(
      await put({ requestedScopes: ["openid"] }),
      environmentSchema,
    )
    expect(narrowed.optionalScopes).toEqual([])
  })
})

describe("admin review stats", () => {
  it("summarizes the queue and filters by scope", async () => {
    const { harness, live, test } = await ownerContext()
    const staff = await harness.account("staff@matchbox.local")
    harness.store.seedStaff(staff.id, "reviewer")
    const cookie = await harness.signIn(staff)
    await harness.store.createReview({
      environmentId: live.id,
      requestedScopes: ["openid", "discord:profile"],
      state: "open",
      submitterId: null,
      submitterNote: null,
      reviewerId: null,
      reviewerNote: null,
      decidedAt: null,
    })
    await harness.store.createReview({
      environmentId: test.id,
      requestedScopes: ["wallet"],
      state: "open",
      submitterId: null,
      submitterNote: null,
      reviewerId: null,
      reviewerNote: null,
      decidedAt: null,
    })
    const stats = await harness.json(
      await harness.request("GET", "/api/admin/reviews/stats", { cookie }),
      adminReviewStatsResponseSchema,
    )
    expect(stats.open).toBe(2)
    const filtered = await harness.request(
      "GET",
      "/api/admin/reviews?state=open&scope=discord%3Aprofile",
      { cookie },
    )
    const body: unknown = await filtered.json()
    expect(body).toMatchObject({ data: [{ environmentId: live.id }] })
  })
})

describe("admin review context", () => {
  it("gives staff test usage, grants and the scope bump", async () => {
    const { harness, live } = await ownerContext()
    const staff = await harness.account("staff@matchbox.local")
    harness.store.seedStaff(staff.id, "reviewer")
    const cookie = await harness.signIn(staff)
    await harness.store.updateEnvironment(live.id, {
      requestedScopes: ["openid", "discord:profile"],
      approvedScopes: ["openid"],
      scopeVersion: 2,
    })
    const review = await harness.store.createReview({
      environmentId: live.id,
      requestedScopes: ["openid", "discord:profile"],
      state: "open",
      submitterId: null,
      submitterNote: null,
      reviewerId: null,
      reviewerNote: null,
      decidedAt: null,
    })
    const context = await harness.json(
      await harness.request("GET", `/api/admin/reviews/${review.id}/context`, {
        cookie,
      }),
      adminReviewContextResponseSchema,
    )
    expect(context.scopeVersion).toBe(2)
    expect(context.nextScopeVersion).toBe(3)
    expect(context.priorReviews).toBe(0)
    expect(context.testUsage7d?.requests).toBeGreaterThan(0)
    expect(context.testActiveGrants).toBe(0)

    const developer = await harness.signIn(
      await harness.account("dev@example.com"),
    )
    const forbidden = await harness.request(
      "GET",
      `/api/admin/reviews/${review.id}/context`,
      { cookie: developer },
    )
    expect(forbidden.status).toBe(403)
  })
})
