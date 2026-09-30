import {
  apiKeyListResponseSchema,
  apiKeyRecordSchema,
  clientSecretListResponseSchema,
  createdApiKeyResponseSchema,
  createdClientSecretResponseSchema,
  rotatedApiKeyResponseSchema,
} from "@repo/platform-contracts/console"
import {
  apiKeySchema,
  clientSecretSchema,
  parseApiKey,
} from "@repo/platform-contracts/credentials"
import { errorBodySchema } from "@repo/platform-contracts/errors"
import { hmacHex } from "@repo/platform-server"
import { describe, expect, it } from "vitest"
import { apiKeyPepper, clientSecretPepper, createHarness } from "./test/harness"

async function context() {
  const harness = createHarness()
  const owner = await harness.account("owner@example.com")
  const organization = await harness.organization(owner)
  const { app, test, live } = await harness.appWithEnvironments(organization.id)
  const cookie = await harness.signIn(owner, { steppedUp: true })
  return { harness, owner, app, test, live, cookie }
}

describe("API keys", () => {
  it("returns the plaintext once and stores only its HMAC", async () => {
    const { harness, test, cookie } = await context()
    const response = await harness.request(
      "POST",
      `/api/environments/${test.id}/api-keys`,
      { cookie, body: { kind: "secret", name: "Server" } },
    )
    expect(response.status).toBe(201)
    const created = await harness.json(response, createdApiKeyResponseSchema)
    expect(apiKeySchema.safeParse(created.key).success).toBe(true)
    const parsed = parseApiKey(created.key)
    expect(parsed?.kind).toBe("secret")
    expect(parsed?.environmentKind).toBe("test")
    expect(created.apiKey.displayPrefix).toBe(
      `mbx_sk_test_${parsed?.prefix ?? ""}`,
    )
    expect(created.apiKey.status).toBe("active")

    const row = await harness.store.getApiKey(created.apiKey.id)
    expect(row?.secretHash).toBe(await hmacHex(apiKeyPepper, created.key))
    expect(JSON.stringify(row)).not.toContain(created.key)

    const listResponse = await harness.request(
      "GET",
      `/api/environments/${test.id}/api-keys`,
      { cookie },
    )
    const listText = await listResponse.text()
    expect(listText).not.toContain(created.key)
    expect(listText).not.toContain(row?.secretHash ?? "missing")
    const audit = harness.store
      .auditEvents()
      .find((event) => event.action === "api-key-created")
    expect(audit?.targetId).toBe(created.apiKey.id)
    expect(JSON.stringify(audit)).not.toContain(created.key)
  })

  it("rotates with an overlap window and links the new key", async () => {
    const { harness, test, cookie } = await context()
    const created = await harness.json(
      await harness.request("POST", `/api/environments/${test.id}/api-keys`, {
        cookie,
        body: { kind: "secret", name: "Server", allowedCidrs: ["10.0.0.1/8"] },
      }),
      createdApiKeyResponseSchema,
    )
    expect(created.apiKey.allowedCidrs).toEqual(["10.0.0.0/8"])
    const response = await harness.request(
      "POST",
      `/api/api-keys/${created.apiKey.id}/rotate`,
      { cookie, body: { overlapSeconds: 3_600 } },
    )
    expect(response.status).toBe(201)
    const rotated = await harness.json(response, rotatedApiKeyResponseSchema)
    expect(rotated.key).not.toBe(created.key)
    expect(rotated.apiKey.rotatedFrom).toBe(created.apiKey.id)
    expect(rotated.apiKey.allowedCidrs).toEqual(["10.0.0.0/8"])
    expect(rotated.previous.expiresAt).toBe(
      new Date(harness.now().getTime() + 3_600_000).toISOString(),
    )
    expect(rotated.previous.status).toBe("active")
    harness.advance(3_600_001)
    const list = await harness.json(
      await harness.request("GET", `/api/environments/${test.id}/api-keys`, {
        cookie,
      }),
      apiKeyListResponseSchema,
    )
    const statuses = Object.fromEntries(
      list.data.map((key) => [key.id, key.status]),
    )
    expect(statuses[created.apiKey.id]).toBe("expired")
    expect(statuses[rotated.apiKey.id]).toBe("active")
  })

  it("caps the overlap at 7 days", async () => {
    const { harness, test, cookie } = await context()
    const created = await harness.json(
      await harness.request("POST", `/api/environments/${test.id}/api-keys`, {
        cookie,
        body: { kind: "publishable", name: "Browser" },
      }),
      createdApiKeyResponseSchema,
    )
    const response = await harness.request(
      "POST",
      `/api/api-keys/${created.apiKey.id}/rotate`,
      { cookie, body: { overlapSeconds: 8 * 24 * 3_600 } },
    )
    expect(response.status).toBe(400)
  })

  it("revokes and refuses to rotate a revoked key", async () => {
    const { harness, live, cookie } = await context()
    const created = await harness.json(
      await harness.request("POST", `/api/environments/${live.id}/api-keys`, {
        cookie,
        body: { kind: "publishable", name: "Website" },
      }),
      createdApiKeyResponseSchema,
    )
    expect(created.key.startsWith("mbx_pk_live_")).toBe(true)
    const revoke = await harness.request(
      "POST",
      `/api/api-keys/${created.apiKey.id}/revoke`,
      { cookie },
    )
    const revoked = await harness.json(revoke, apiKeyRecordSchema)
    expect(revoked.status).toBe("revoked")
    const rotate = await harness.request(
      "POST",
      `/api/api-keys/${created.apiKey.id}/rotate`,
      { cookie, body: {} },
    )
    expect(rotate.status).toBe(409)
    expect(
      harness.store
        .auditEvents()
        .filter((event) => event.action === "api-key-revoked"),
    ).toHaveLength(1)
  })

  it("validates CIDRs and keeps them off publishable keys", async () => {
    const { harness, test, cookie } = await context()
    const invalid = await harness.request(
      "POST",
      `/api/environments/${test.id}/api-keys`,
      {
        cookie,
        body: { kind: "secret", name: "Server", allowedCidrs: ["10.0.0/99"] },
      },
    )
    expect(invalid.status).toBe(400)
    expect(
      (await harness.json(invalid, errorBodySchema)).error.issues?.[0]?.path,
    ).toBe("allowedCidrs.0")
    const publishable = await harness.request(
      "POST",
      `/api/environments/${test.id}/api-keys`,
      {
        cookie,
        body: {
          kind: "publishable",
          name: "Browser",
          allowedCidrs: ["10.0.0.0/8"],
        },
      },
    )
    expect(publishable.status).toBe(400)
  })

  it("sets an expiry", async () => {
    const { harness, test, cookie } = await context()
    const created = await harness.json(
      await harness.request("POST", `/api/environments/${test.id}/api-keys`, {
        cookie,
        body: { kind: "publishable", name: "Browser" },
      }),
      createdApiKeyResponseSchema,
    )
    const expiresAt = new Date(harness.now().getTime() + 86_400_000)
    const response = await harness.request(
      "POST",
      `/api/api-keys/${created.apiKey.id}/expire`,
      { cookie, body: { expiresAt: expiresAt.toISOString() } },
    )
    const updated = await harness.json(response, apiKeyRecordSchema)
    expect(updated.expiresAt).toBe(expiresAt.toISOString())
  })
})

describe("client secrets", () => {
  it("issues at most two active secrets, hashed", async () => {
    const { harness, live, cookie } = await context()
    const path = `/api/environments/${live.id}/client-secrets`
    const first = await harness.json(
      await harness.request("POST", path, { cookie, body: {} }),
      createdClientSecretResponseSchema,
    )
    expect(clientSecretSchema.safeParse(first.secret).success).toBe(true)
    const row = await harness.store.getClientSecret(first.clientSecret.id)
    expect(row?.secretHash).toBe(
      await hmacHex(clientSecretPepper, first.secret),
    )
    const second = await harness.request("POST", path, { cookie, body: {} })
    expect(second.status).toBe(201)
    const third = await harness.request("POST", path, { cookie, body: {} })
    expect(third.status).toBe(409)
    const revoke = await harness.request(
      "POST",
      `/api/client-secrets/${first.clientSecret.id}/revoke`,
      { cookie },
    )
    expect(revoke.status).toBe(200)
    const fourth = await harness.request("POST", path, { cookie, body: {} })
    expect(fourth.status).toBe(201)
    const list = await harness.json(
      await harness.request("GET", path, { cookie }),
      clientSecretListResponseSchema,
    )
    expect(
      list.data.filter((secret) => secret.status === "active"),
    ).toHaveLength(2)
  })

  it("refuses secrets for public clients and revokes them on switch", async () => {
    const { harness, test, cookie } = await context()
    const path = `/api/environments/${test.id}/client-secrets`
    const created = await harness.json(
      await harness.request("POST", path, { cookie, body: {} }),
      createdClientSecretResponseSchema,
    )
    const patch = await harness.request(
      "PATCH",
      `/api/environments/${test.id}`,
      { cookie, body: { clientType: "public" } },
    )
    expect(patch.status).toBe(200)
    const row = await harness.store.getClientSecret(created.clientSecret.id)
    expect(row?.revokedAt).not.toBeNull()
    const refused = await harness.request("POST", path, { cookie, body: {} })
    expect(refused.status).toBe(409)
  })
})
