import {
  adminReviewSchema,
  appSchema,
  environmentSchema,
  submitReviewResponseSchema,
} from "@repo/platform-contracts/console"
import { errorBodySchema } from "@repo/platform-contracts/errors"
import { describe, expect, it } from "vitest"
import { evaluateSubmission } from "./review-policy"
import { createHarness } from "./test/harness"

async function ownerContext(options: { websiteUrl?: string | null } = {}) {
  const harness = createHarness()
  const owner = await harness.account("owner@example.com")
  const organization = await harness.organization(owner)
  const { app, test, live } = await harness.appWithEnvironments(
    organization.id,
    options,
  )
  const cookie = await harness.signIn(owner, { steppedUp: true })
  return { harness, owner, organization, app, test, live, cookie }
}

describe("app creation", () => {
  it("creates test and live environments with client ids", async () => {
    const harness = createHarness()
    const owner = await harness.account("owner@example.com")
    const organization = await harness.organization(owner)
    const cookie = await harness.signIn(owner)
    const response = await harness.request(
      "POST",
      `/api/orgs/${organization.id}/apps`,
      {
        cookie,
        body: { name: "Gauge Board", websiteUrl: "https://gauges.example.com" },
      },
    )
    expect(response.status).toBe(201)
    const app = await harness.json(response, appSchema)
    expect(app.slug).toBe("gauge-board")
    expect(app.environments.map((environment) => environment.kind)).toEqual([
      "test",
      "live",
    ])
    expect(app.environments[0]?.network).toBe("mezo-testnet")
    expect(app.environments[1]?.network).toBe("mezo")
    expect(app.environments[0]?.clientId).toMatch(/^mbx_test_[0-9A-Za-z]{24}$/)
    expect(app.environments[1]?.clientId).toMatch(/^mbx_live_[0-9A-Za-z]{24}$/)
    const actions = harness.store.auditEvents().map((event) => event.action)
    expect(actions).toEqual([
      "app-created",
      "environment-created",
      "environment-created",
    ])
  })

  it("rejects non-https app URLs", async () => {
    const harness = createHarness()
    const owner = await harness.account("owner@example.com")
    const organization = await harness.organization(owner)
    const cookie = await harness.signIn(owner)
    const response = await harness.request(
      "POST",
      `/api/orgs/${organization.id}/apps`,
      { cookie, body: { name: "App", websiteUrl: "http://example.com" } },
    )
    expect(response.status).toBe(400)
  })
})

describe("redirect URIs and origins", () => {
  it("test allows https and http loopback; live allows https only", async () => {
    const { harness, test, live, cookie } = await ownerContext()
    const testResponse = await harness.request(
      "PUT",
      `/api/environments/${test.id}/redirect-uris`,
      {
        cookie,
        body: {
          uris: [
            "http://localhost:3000/callback",
            "http://127.0.0.1:8080/cb",
            "https://app.example.com/callback",
          ],
        },
      },
    )
    expect(testResponse.status).toBe(200)
    const environment = await harness.json(testResponse, environmentSchema)
    expect(environment.redirectUris).toHaveLength(3)

    const liveResponse = await harness.request(
      "PUT",
      `/api/environments/${live.id}/redirect-uris`,
      { cookie, body: { uris: ["http://localhost:3000/callback"] } },
    )
    expect(liveResponse.status).toBe(400)
    const error = await harness.json(liveResponse, errorBodySchema)
    expect(error.error.issues?.[0]?.path).toBe("uris.0")
  })

  it("rejects wildcards, fragments and non-canonical values with a hint", async () => {
    const { harness, test, cookie } = await ownerContext()
    const response = await harness.request(
      "PUT",
      `/api/environments/${test.id}/redirect-uris`,
      {
        cookie,
        body: {
          uris: [
            "https://*.example.com/cb",
            "https://example.com/cb#frag",
            "https://EXAMPLE.com",
          ],
        },
      },
    )
    expect(response.status).toBe(400)
    const error = await harness.json(response, errorBodySchema)
    expect(error.error.issues?.map((issue) => issue.path)).toEqual([
      "uris.0",
      "uris.1",
      "uris.2",
    ])
    expect(error.error.issues?.[2]?.message).toContain("https://example.com/")
  })

  it("validates origins by environment kind", async () => {
    const { harness, test, live, cookie } = await ownerContext()
    const ok = await harness.request(
      "PUT",
      `/api/environments/${test.id}/origins`,
      { cookie, body: { origins: ["http://localhost:5173"] } },
    )
    expect(ok.status).toBe(200)
    const withPath = await harness.request(
      "PUT",
      `/api/environments/${live.id}/origins`,
      { cookie, body: { origins: ["https://app.example.com/path"] } },
    )
    expect(withPath.status).toBe(400)
    const loopbackLive = await harness.request(
      "PUT",
      `/api/environments/${live.id}/origins`,
      { cookie, body: { origins: ["http://localhost:5173"] } },
    )
    expect(loopbackLive.status).toBe(400)
    const liveOk = await harness.request(
      "PUT",
      `/api/environments/${live.id}/origins`,
      { cookie, body: { origins: ["https://app.example.com"] } },
    )
    expect(liveOk.status).toBe(200)
    expect(await harness.store.listOrigins(live.id)).toEqual([
      "https://app.example.com",
    ])
    expect(
      harness.store
        .auditEvents()
        .filter((event) => event.action === "origins-updated"),
    ).toHaveLength(2)
  })
})

async function requestScopes(
  context: Awaited<ReturnType<typeof ownerContext>>,
  environmentId: string,
  scopes: string[],
) {
  const response = await context.harness.request(
    "PUT",
    `/api/environments/${environmentId}/scopes`,
    { cookie: context.cookie, body: { requestedScopes: scopes } },
  )
  expect(response.status).toBe(200)
}

async function submit(
  context: Awaited<ReturnType<typeof ownerContext>>,
  environmentId: string,
) {
  const response = await context.harness.request(
    "POST",
    `/api/environments/${environmentId}/submit-review`,
    { cookie: context.cookie, body: {} },
  )
  return response
}

describe("review submission", () => {
  it("auto-approves live gauge-profiles:read and writes approved scopes", async () => {
    const context = await ownerContext()
    await requestScopes(context, context.live.id, ["gauge-profiles:read"])
    const response = await submit(context, context.live.id)
    expect(response.status).toBe(200)
    const body = await context.harness.json(
      response,
      submitReviewResponseSchema,
    )
    expect(body.autoApproved).toBe(true)
    expect(body.environment.reviewState).toBe("approved")
    expect(body.environment.approvedScopes).toEqual(["gauge-profiles:read"])
    expect(body.environment.scopeVersion).toBe(2)
    const stored = await context.harness.store.getEnvironment(context.live.id)
    expect(stored?.approvedScopes).toEqual(["gauge-profiles:read"])
    expect(stored?.scopeVersion).toBe(2)
    expect(
      context.harness.store.auditEvents().map((event) => event.action),
    ).toContain("review-auto-approved")
  })

  it("sends live gauge-profiles:read to manual review without a website", async () => {
    const context = await ownerContext({ websiteUrl: null })
    await requestScopes(context, context.live.id, ["gauge-profiles:read"])
    const body = await context.harness.json(
      await submit(context, context.live.id),
      submitReviewResponseSchema,
    )
    expect(body.autoApproved).toBe(false)
    expect(body.environment.reviewState).toBe("submitted")
    expect(body.environment.approvedScopes).toEqual([])
    expect(body.review?.state).toBe("open")
  })

  it("opens a manual review for any discord scope, even in test", async () => {
    const context = await ownerContext()
    await requestScopes(context, context.test.id, ["openid", "discord:profile"])
    const body = await context.harness.json(
      await submit(context, context.test.id),
      submitReviewResponseSchema,
    )
    expect(body.autoApproved).toBe(false)
    expect(body.environment.openReview?.requestedScopes).toEqual([
      "openid",
      "discord:profile",
    ])
    const again = await submit(context, context.test.id)
    expect(again.status).toBe(409)
    const change = await context.harness.request(
      "PUT",
      `/api/environments/${context.test.id}/scopes`,
      { cookie: context.cookie, body: { requestedScopes: ["openid"] } },
    )
    expect(change.status).toBe(409)
    const withdraw = await context.harness.request(
      "POST",
      `/api/environments/${context.test.id}/withdraw-review`,
      { cookie: context.cookie },
    )
    expect(withdraw.status).toBe(200)
    const environment = await context.harness.json(withdraw, environmentSchema)
    expect(environment.openReview).toBeNull()
    expect(environment.reviewState).toBe("development")
  })

  it("keeps approved scopes working while a scope increase is reviewed", async () => {
    const context = await ownerContext()
    await requestScopes(context, context.live.id, ["gauge-profiles:read"])
    await submit(context, context.live.id)
    await requestScopes(context, context.live.id, [
      "gauge-profiles:read",
      "openid",
      "discord:id",
    ])
    const body = await context.harness.json(
      await submit(context, context.live.id),
      submitReviewResponseSchema,
    )
    expect(body.autoApproved).toBe(false)
    expect(body.environment.reviewState).toBe("approved")
    expect(body.environment.approvedScopes).toEqual(["gauge-profiles:read"])
  })

  it("evaluates the auto-approval rule", () => {
    const base = {
      environment: {
        kind: "live" as const,
        requestedScopes: ["gauge-profiles:read" as const],
        approvedScopes: [],
      },
      app: { status: "active" as const, websiteUrl: "https://a.example" },
      ownerEmailVerified: true,
    }
    expect(evaluateSubmission(base).autoApprove).toBe(true)
    expect(
      evaluateSubmission({ ...base, ownerEmailVerified: false }).autoApprove,
    ).toBe(false)
    expect(
      evaluateSubmission({
        ...base,
        app: { status: "restricted", websiteUrl: "https://a.example" },
      }).autoApprove,
    ).toBe(false)
    expect(
      evaluateSubmission({
        ...base,
        environment: {
          ...base.environment,
          requestedScopes: ["gauge-profiles:read", "openid"],
        },
      }).autoApprove,
    ).toBe(false)
    expect(
      evaluateSubmission({
        ...base,
        environment: {
          kind: "test",
          requestedScopes: ["openid", "wallet"],
          approvedScopes: [],
        },
      }).autoApprove,
    ).toBe(true)
  })
})

describe("staff review decisions", () => {
  async function openReview() {
    const context = await ownerContext()
    await requestScopes(context, context.live.id, [
      "gauge-profiles:read",
      "openid",
      "discord:profile",
    ])
    const submitted = await context.harness.json(
      await submit(context, context.live.id),
      submitReviewResponseSchema,
    )
    const reviewer = await context.harness.account("staff@matchbox.local")
    context.harness.store.seedStaff(reviewer.id, "reviewer")
    const staffCookie = await context.harness.signIn(reviewer, {
      steppedUp: true,
    })
    const operator = await context.harness.account("ops@matchbox.local")
    context.harness.store.seedStaff(operator.id, "operator")
    const operatorCookie = await context.harness.signIn(operator, {
      steppedUp: true,
    })
    return {
      ...context,
      reviewId: submitted.review?.id ?? "",
      staffCookie,
      reviewer,
      operatorCookie,
    }
  }

  it("approval writes approved scopes and bumps scope_version", async () => {
    const context = await openReview()
    const before = await context.harness.store.getEnvironment(context.live.id)
    const response = await context.harness.request(
      "POST",
      `/api/admin/reviews/${context.reviewId}/decision`,
      {
        cookie: context.staffCookie,
        body: { decision: "approve", note: "Looks good" },
      },
    )
    expect(response.status).toBe(200)
    const review = await context.harness.json(response, adminReviewSchema)
    expect(review.state).toBe("approved")
    expect(review.reviewerId).toBe(context.reviewer.id)
    const after = await context.harness.store.getEnvironment(context.live.id)
    expect(after?.approvedScopes).toEqual([
      "gauge-profiles:read",
      "openid",
      "discord:profile",
    ])
    expect(after?.reviewState).toBe("approved")
    expect(after?.scopeVersion).toBe((before?.scopeVersion ?? 0) + 1)
    const event = context.harness.store
      .auditEvents()
      .find((candidate) => candidate.action === "review-approved")
    expect(event?.actorType).toBe("staff")
    expect(event?.actorId).toBe(context.reviewer.id)
    expect(
      context.harness.email.sent.some((message) =>
        message.subject.includes("review approved"),
      ),
    ).toBe(true)
    const again = await context.harness.request(
      "POST",
      `/api/admin/reviews/${context.reviewId}/decision`,
      { cookie: context.staffCookie, body: { decision: "reject" } },
    )
    expect(again.status).toBe(409)
  })

  it("partial approval only adds the chosen scopes", async () => {
    const context = await openReview()
    await context.harness.request(
      "POST",
      `/api/admin/reviews/${context.reviewId}/decision`,
      {
        cookie: context.staffCookie,
        body: {
          decision: "approve",
          approvedScopes: ["gauge-profiles:read", "openid"],
        },
      },
    )
    const after = await context.harness.store.getEnvironment(context.live.id)
    expect(after?.approvedScopes).toEqual(["gauge-profiles:read", "openid"])
    expect(after?.scopeVersion).toBe(2)
  })

  it("request-changes leaves scopes and version untouched", async () => {
    const context = await openReview()
    const response = await context.harness.request(
      "POST",
      `/api/admin/reviews/${context.reviewId}/decision`,
      {
        cookie: context.staffCookie,
        body: { decision: "request-changes", note: "Add a privacy URL" },
      },
    )
    expect(response.status).toBe(200)
    const after = await context.harness.store.getEnvironment(context.live.id)
    expect(after?.approvedScopes).toEqual([])
    expect(after?.scopeVersion).toBe(1)
    expect(after?.reviewState).toBe("changes-requested")
  })

  it("app status changes record the reason", async () => {
    const context = await openReview()
    const response = await context.harness.request(
      "POST",
      `/api/admin/apps/${context.app.id}/status`,
      {
        cookie: context.operatorCookie,
        body: { status: "suspended", reason: "Abuse report 42" },
      },
    )
    expect(response.status).toBe(200)
    expect((await context.harness.store.getApp(context.app.id))?.status).toBe(
      "suspended",
    )
    const event = context.harness.store
      .auditEvents()
      .find((candidate) => candidate.action === "app-status-changed")
    expect(event?.metadata).toMatchObject({
      from: "active",
      to: "suspended",
      reason: "Abuse report 42",
    })
  })
})
