import { idTokenClaimsSchema } from "@repo/platform-contracts/oidc"
import { decodeJwt } from "jose"
import { describe, expect, it } from "vitest"
import { memorySeed } from "./store/memory-store"
import {
  createHarness,
  exchangeCode,
  obtainCode,
  pkce,
  signIn,
} from "./test-harness"

describe("organization-scoped audit rows", () => {
  it("carry the environment's pairwise sub beside the staff-only account id", async () => {
    const harness = await createHarness()
    const cookie = await signIn(harness)
    const first = await pkce()
    const code = await obtainCode(harness, cookie, {
      pkce: first,
      scope: "openid",
    })
    const tokens = await exchangeCode(harness, code, first.verifier)
    const sub = idTokenClaimsSchema.parse(decodeJwt(tokens.id_token ?? "")).sub
    await obtainCode(harness, cookie, {
      pkce: await pkce(),
      scope: "openid wallet",
    })

    const accountId = harness.store.admin.sessions()[0]?.accountId
    const rows = harness.store.admin
      .auditEvents()
      .filter((event) => event.targetType === "grant")
    expect(rows.map((event) => event.action)).toEqual([
      "grant-created",
      "grant-updated",
    ])
    for (const row of rows) {
      expect(row.organizationId).toBe(memorySeed.organizationId)
      expect(row.environmentId).toBe(memorySeed.testEnvironmentId)
      expect(row.actorId).toBe(accountId)
      expect(row.metadata.subject).toBe(sub)
      expect(row.metadata.subject).not.toBe(accountId)
    }
  })
})
