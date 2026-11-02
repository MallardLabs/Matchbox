import type { AuditEventInput } from "@repo/platform-contracts/audit"
import { auditSearchResponseSchema } from "@repo/platform-contracts/console"
import { errorBodySchema } from "@repo/platform-contracts/errors"
import { describe, expect, it } from "vitest"
import { createHarness } from "./test/harness"

const ipPrefix = "203.0.113.0/24"

/**
 * One Matchbox ID account consenting to two environments of an app, as
 * apps/matchbox-id `upsertGrant` records it, plus a row written before the
 * pairwise `sub` was recorded and a staff decision.
 */
async function auditedApp() {
  const harness = createHarness()
  const owner = await harness.account("owner@example.com")
  const organization = await harness.organization(owner)
  const { app, test, live } = await harness.appWithEnvironments(organization.id)
  const accountId = crypto.randomUUID()
  const scope = { organizationId: organization.id, appId: app.id }
  function grantRow(
    environmentId: string,
    subject: string | null,
  ): AuditEventInput {
    return {
      ...scope,
      environmentId,
      actorType: "wallet",
      actorId: accountId,
      action: "grant-created",
      targetType: "grant",
      targetId: crypto.randomUUID(),
      metadata: {
        scopes: ["openid"],
        declinedScopes: [],
        scopeVersion: 1,
        ...(subject === null ? {} : { subject }),
      },
      ipPrefix,
      requestId: "req_test",
    }
  }
  await harness.store.recordAudit(grantRow(live.id, null))
  await harness.store.recordAudit(grantRow(live.id, "mbx_LiveSubject"))
  await harness.store.recordAudit(grantRow(test.id, "mbx_TestSubject"))
  const staffId = crypto.randomUUID()
  await harness.store.recordAudit({
    ...scope,
    environmentId: live.id,
    actorType: "staff",
    actorId: staffId,
    action: "review-rejected",
    targetType: "review",
    targetId: crypto.randomUUID(),
    ipPrefix: "198.51.100.0/24",
  })
  await harness.store.recordAudit({
    ...scope,
    actorType: "developer",
    actorId: owner.id,
    action: "app-updated",
    targetType: "app",
    targetId: app.id,
    ipPrefix: "192.0.2.0/24",
  })
  const cookie = await harness.signIn(owner)
  return { harness, owner, organization, app, accountId, staffId, cookie }
}

describe("organization audit feeds", () => {
  it("show wallet actors by pairwise sub, never the account id or IP prefix", async () => {
    const { harness, organization, app, accountId, staffId, cookie } =
      await auditedApp()
    for (const path of [
      `/api/orgs/${organization.id}/audit`,
      `/api/apps/${app.id}/audit`,
    ]) {
      const response = await harness.request("GET", path, { cookie })
      expect(response.status).toBe(200)
      const body = await harness.json(response, auditSearchResponseSchema)
      const visible = body.data.filter(
        (event) => event.actorType === "wallet" || event.actorType === "staff",
      )
      expect(visible.map((event) => [event.actorType, event.actorId])).toEqual([
        ["staff", null],
        ["wallet", "mbx_TestSubject"],
        ["wallet", "mbx_LiveSubject"],
        ["wallet", null],
      ])
      expect(visible.every((event) => event.ipPrefix === null)).toBe(true)
      const raw = JSON.stringify(body)
      expect(raw).not.toContain(accountId)
      expect(raw).not.toContain(staffId)
      expect(raw).not.toContain(ipPrefix)
    }
  })

  it("keep member rows as stored, filterable by actor id", async () => {
    const { harness, owner, organization, cookie } = await auditedApp()
    const response = await harness.request(
      "GET",
      `/api/orgs/${organization.id}/audit?actorId=${owner.id}`,
      { cookie },
    )
    const body = await harness.json(response, auditSearchResponseSchema)
    expect(body.data.map((event) => [event.actorId, event.ipPrefix])).toEqual([
      [owner.id, "192.0.2.0/24"],
    ])
  })

  it("cannot be probed with a stored account id", async () => {
    const { harness, organization, app, accountId, cookie } = await auditedApp()
    const unfiltered = await harness.request(
      "GET",
      `/api/apps/${app.id}/audit?actorId=${accountId}`,
      { cookie },
    )
    expect(
      (await harness.json(unfiltered, auditSearchResponseSchema)).data,
    ).toEqual([])
    for (const actorType of ["wallet", "staff", "system"]) {
      const response = await harness.request(
        "GET",
        `/api/orgs/${organization.id}/audit?actorType=${actorType}&actorId=${accountId}`,
        { cookie },
      )
      expect(response.status).toBe(400)
      const error = await harness.json(response, errorBodySchema)
      expect(error.error.issues?.[0]?.path).toBe("actorId")
    }
  })

  it("stay raw for staff", async () => {
    const { harness, accountId } = await auditedApp()
    const reviewer = await harness.account("reviewer@matchbox.local")
    harness.store.seedStaff(reviewer.id, "reviewer")
    const response = await harness.request(
      "GET",
      `/api/admin/audit?actorType=wallet&actorId=${accountId}`,
      { cookie: await harness.signIn(reviewer) },
    )
    const body = await harness.json(response, auditSearchResponseSchema)
    expect(body.data).toHaveLength(3)
    expect(
      body.data.every(
        (event) => event.actorId === accountId && event.ipPrefix === ipPrefix,
      ),
    ).toBe(true)
  })
})
