import { errorBodySchema } from "@repo/platform-contracts/errors"
import { describe, expect, it } from "vitest"
import { type Harness, createHarness } from "./test/harness"

type Actor = "owner" | "admin" | "developer" | "outsider"

async function setup(options: { steppedUp: boolean }) {
  const harness = createHarness()
  const owner = await harness.account("owner@example.com")
  const admin = await harness.account("admin@example.com")
  const developer = await harness.account("developer@example.com")
  const outsider = await harness.account("outsider@example.com")
  const organization = await harness.organization(owner, [
    { account: admin, role: "admin" },
    { account: developer, role: "developer" },
  ])
  const { app, test, live } = await harness.appWithEnvironments(organization.id)
  const cookies: Record<Actor, string> = {
    owner: await harness.signIn(owner, options),
    admin: await harness.signIn(admin, options),
    developer: await harness.signIn(developer, options),
    outsider: await harness.signIn(outsider, options),
  }
  return {
    harness,
    accounts: { owner, admin, developer, outsider },
    organization,
    app,
    test,
    live,
    cookies,
  }
}

async function errorCode(harness: Harness, response: Response) {
  return (await harness.json(response, errorBodySchema)).error.code
}

describe("role matrix", () => {
  const cases: {
    name: string
    call: (context: Awaited<ReturnType<typeof setup>>) => {
      method: string
      path: string
      body?: unknown
    }
    expected: Record<Actor, number>
  }[] = [
    {
      name: "view app",
      call: ({ app }) => ({ method: "GET", path: `/api/apps/${app.id}` }),
      expected: { owner: 200, admin: 200, developer: 200, outsider: 404 },
    },
    {
      name: "update app",
      call: ({ app }) => ({
        method: "PATCH",
        path: `/api/apps/${app.id}`,
        body: { name: "Renamed" },
      }),
      expected: { owner: 200, admin: 200, developer: 403, outsider: 404 },
    },
    {
      name: "create app",
      call: ({ organization }) => ({
        method: "POST",
        path: `/api/orgs/${organization.id}/apps`,
        body: { name: "Another" },
      }),
      expected: { owner: 201, admin: 201, developer: 403, outsider: 404 },
    },
    {
      name: "create test publishable key",
      call: ({ test }) => ({
        method: "POST",
        path: `/api/environments/${test.id}/api-keys`,
        body: { kind: "publishable", name: "Browser" },
      }),
      expected: { owner: 201, admin: 201, developer: 201, outsider: 404 },
    },
    {
      name: "create live publishable key",
      call: ({ live }) => ({
        method: "POST",
        path: `/api/environments/${live.id}/api-keys`,
        body: { kind: "publishable", name: "Website" },
      }),
      expected: { owner: 201, admin: 201, developer: 403, outsider: 404 },
    },
    {
      name: "list live keys",
      call: ({ live }) => ({
        method: "GET",
        path: `/api/environments/${live.id}/api-keys`,
      }),
      expected: { owner: 200, admin: 200, developer: 200, outsider: 404 },
    },
    {
      name: "replace redirect URIs",
      call: ({ test }) => ({
        method: "PUT",
        path: `/api/environments/${test.id}/redirect-uris`,
        body: { uris: ["http://localhost:3000/callback"] },
      }),
      expected: { owner: 200, admin: 200, developer: 403, outsider: 404 },
    },
    {
      name: "list invitations",
      call: ({ organization }) => ({
        method: "GET",
        path: `/api/orgs/${organization.id}/invitations`,
      }),
      expected: { owner: 200, admin: 200, developer: 403, outsider: 404 },
    },
    {
      name: "invite a developer",
      call: ({ organization }) => ({
        method: "POST",
        path: `/api/orgs/${organization.id}/invitations`,
        body: { email: "new@example.com", role: "developer" },
      }),
      expected: { owner: 201, admin: 201, developer: 403, outsider: 404 },
    },
    {
      name: "invite an owner",
      call: ({ organization }) => ({
        method: "POST",
        path: `/api/orgs/${organization.id}/invitations`,
        body: { email: "boss@example.com", role: "owner" },
      }),
      expected: { owner: 201, admin: 403, developer: 403, outsider: 404 },
    },
    {
      name: "view usage",
      call: ({ test }) => ({
        method: "GET",
        path: `/api/environments/${test.id}/usage?from=2026-09-30T00:00:00Z&to=2026-09-30T06:00:00Z&bucket=hour`,
      }),
      expected: { owner: 200, admin: 200, developer: 200, outsider: 404 },
    },
    {
      name: "org audit log",
      call: ({ organization }) => ({
        method: "GET",
        path: `/api/orgs/${organization.id}/audit`,
      }),
      expected: { owner: 200, admin: 200, developer: 403, outsider: 404 },
    },
    {
      name: "delete organization",
      call: ({ organization }) => ({
        method: "DELETE",
        path: `/api/orgs/${organization.id}`,
      }),
      expected: { owner: 200, admin: 403, developer: 403, outsider: 404 },
    },
    {
      name: "staff review queue",
      call: () => ({ method: "GET", path: "/api/admin/reviews" }),
      expected: { owner: 403, admin: 403, developer: 403, outsider: 403 },
    },
  ]

  for (const testCase of cases) {
    for (const actor of ["outsider", "developer", "admin", "owner"] as const) {
      it(`${testCase.name}: ${actor} → ${testCase.expected[actor]}`, async () => {
        const context = await setup({ steppedUp: true })
        const call = testCase.call(context)
        const response = await context.harness.request(call.method, call.path, {
          cookie: context.cookies[actor],
          ...(call.body === undefined ? {} : { body: call.body }),
        })
        expect(response.status).toBe(testCase.expected[actor])
      })
    }
  }
})

describe("step-up gating", () => {
  const gated: {
    name: string
    call: (
      context: Awaited<ReturnType<typeof setup>>,
    ) => Promise<{ method: string; path: string; body?: unknown }>
    stepUp: boolean
  }[] = [
    {
      name: "test publishable key",
      stepUp: false,
      call: async ({ test }) => ({
        method: "POST",
        path: `/api/environments/${test.id}/api-keys`,
        body: { kind: "publishable", name: "Browser" },
      }),
    },
    {
      name: "test secret key",
      stepUp: true,
      call: async ({ test }) => ({
        method: "POST",
        path: `/api/environments/${test.id}/api-keys`,
        body: { kind: "secret", name: "Server" },
      }),
    },
    {
      name: "live publishable key",
      stepUp: true,
      call: async ({ live }) => ({
        method: "POST",
        path: `/api/environments/${live.id}/api-keys`,
        body: { kind: "publishable", name: "Website" },
      }),
    },
    {
      name: "client secret",
      stepUp: true,
      call: async ({ live }) => ({
        method: "POST",
        path: `/api/environments/${live.id}/client-secrets`,
        body: {},
      }),
    },
    {
      name: "rotate a secret key",
      stepUp: true,
      call: async ({ harness, test, accounts }) => {
        const key = await harness.store.createApiKey({
          environmentId: test.id,
          kind: "secret",
          name: "Server",
          prefix: "AbCdEfGhIjKl",
          secretHash: "0".repeat(64),
          allowedCidrs: [],
          createdBy: accounts.owner.id,
          expiresAt: null,
          rotatedFrom: null,
        })
        return {
          method: "POST",
          path: `/api/api-keys/${key.id}/rotate`,
          body: {},
        }
      },
    },
    {
      name: "rotate a test publishable key",
      stepUp: false,
      call: async ({ harness, test, accounts }) => {
        const key = await harness.store.createApiKey({
          environmentId: test.id,
          kind: "publishable",
          name: "Browser",
          prefix: "ZyXwVuTsRqPo",
          secretHash: "1".repeat(64),
          allowedCidrs: [],
          createdBy: accounts.owner.id,
          expiresAt: null,
          rotatedFrom: null,
        })
        return {
          method: "POST",
          path: `/api/api-keys/${key.id}/rotate`,
          body: {},
        }
      },
    },
    {
      name: "invite a member",
      stepUp: true,
      call: async ({ organization }) => ({
        method: "POST",
        path: `/api/orgs/${organization.id}/invitations`,
        body: { email: "new@example.com", role: "developer" },
      }),
    },
    {
      name: "change a member role",
      stepUp: true,
      call: async ({ organization, accounts }) => ({
        method: "PATCH",
        path: `/api/orgs/${organization.id}/members/${accounts.developer.id}`,
        body: { role: "admin" },
      }),
    },
    {
      name: "remove a member",
      stepUp: true,
      call: async ({ organization, accounts }) => ({
        method: "DELETE",
        path: `/api/orgs/${organization.id}/members/${accounts.developer.id}`,
      }),
    },
    {
      name: "delete the organization",
      stepUp: true,
      call: async ({ organization }) => ({
        method: "DELETE",
        path: `/api/orgs/${organization.id}`,
      }),
    },
    {
      name: "retire an app",
      stepUp: true,
      call: async ({ app }) => ({
        method: "POST",
        path: `/api/apps/${app.id}/retire`,
      }),
    },
  ]

  for (const testCase of gated) {
    it(`${testCase.name} ${testCase.stepUp ? "requires" : "skips"} step-up`, async () => {
      const context = await setup({ steppedUp: false })
      const call = await testCase.call(context)
      const response = await context.harness.request(call.method, call.path, {
        cookie: context.cookies.owner,
        ...(call.body === undefined ? {} : { body: call.body }),
      })
      if (testCase.stepUp) {
        expect(response.status).toBe(403)
        expect(await errorCode(context.harness, response)).toBe(
          "step_up_required",
        )
        const stepped = await context.harness.signIn(context.accounts.owner, {
          steppedUp: true,
        })
        const retry = await context.harness.request(call.method, call.path, {
          cookie: stepped,
          ...(call.body === undefined ? {} : { body: call.body }),
        })
        expect(retry.status).toBeLessThan(300)
      } else {
        expect(response.status).toBeLessThan(300)
      }
    })
  }

  it("step-up lapses after 10 minutes", async () => {
    const context = await setup({ steppedUp: true })
    const call = {
      method: "POST",
      path: `/api/environments/${context.test.id}/api-keys`,
      body: { kind: "secret", name: "Server" },
    }
    const first = await context.harness.request(call.method, call.path, {
      cookie: context.cookies.owner,
      body: call.body,
    })
    expect(first.status).toBe(201)
    context.harness.advance(10 * 60_000 + 1)
    const second = await context.harness.request(call.method, call.path, {
      cookie: context.cookies.owner,
      body: call.body,
    })
    expect(second.status).toBe(403)
    expect(await errorCode(context.harness, second)).toBe("step_up_required")
  })
})

describe("ownership", () => {
  it("never removes or demotes the last owner", async () => {
    const context = await setup({ steppedUp: true })
    const { harness, organization, accounts, cookies } = context
    const demote = await harness.request(
      "PATCH",
      `/api/orgs/${organization.id}/members/${accounts.owner.id}`,
      { cookie: cookies.owner, body: { role: "admin" } },
    )
    expect(demote.status).toBe(409)
    const leave = await harness.request(
      "DELETE",
      `/api/orgs/${organization.id}/members/${accounts.owner.id}`,
      { cookie: cookies.owner },
    )
    expect(leave.status).toBe(409)

    const promote = await harness.request(
      "PATCH",
      `/api/orgs/${organization.id}/members/${accounts.admin.id}`,
      { cookie: cookies.owner, body: { role: "owner" } },
    )
    expect(promote.status).toBe(200)
    const leaveNow = await harness.request(
      "DELETE",
      `/api/orgs/${organization.id}/members/${accounts.owner.id}`,
      { cookie: cookies.owner },
    )
    expect(leaveNow.status).toBe(200)
    const members = await harness.store.listMembers(organization.id)
    expect(members.filter((member) => member.role === "owner")).toHaveLength(1)
    expect(harness.store.auditEvents().map((event) => event.action)).toEqual(
      expect.arrayContaining(["member-role-changed", "member-removed"]),
    )
  })

  it("admins cannot promote to owner or touch owners", async () => {
    const context = await setup({ steppedUp: true })
    const { harness, organization, accounts, cookies } = context
    const promote = await harness.request(
      "PATCH",
      `/api/orgs/${organization.id}/members/${accounts.developer.id}`,
      { cookie: cookies.admin, body: { role: "owner" } },
    )
    expect(promote.status).toBe(403)
    const removeOwner = await harness.request(
      "DELETE",
      `/api/orgs/${organization.id}/members/${accounts.owner.id}`,
      { cookie: cookies.admin },
    )
    expect(removeOwner.status).toBe(403)
    const demoteDeveloper = await harness.request(
      "PATCH",
      `/api/orgs/${organization.id}/members/${accounts.developer.id}`,
      { cookie: cookies.admin, body: { role: "admin" } },
    )
    expect(demoteDeveloper.status).toBe(200)
  })

  it("developers may leave on their own", async () => {
    const context = await setup({ steppedUp: true })
    const { harness, organization, accounts, cookies } = context
    const leave = await harness.request(
      "DELETE",
      `/api/orgs/${organization.id}/members/${accounts.developer.id}`,
      { cookie: cookies.developer },
    )
    expect(leave.status).toBe(200)
  })
})
