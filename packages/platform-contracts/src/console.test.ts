import { describe, expect, it } from "vitest"
import { auditEventInputSchema } from "./audit"
import {
  createApiKeyRequestSchema,
  createAppRequestSchema,
  credentialStatus,
  googleSignInRequestSchema,
  reviewDecisionRequestSchema,
  usageQuerySchema,
} from "./console"
import {
  authorizationDecisionRequestSchema,
  sessionResponseSchema,
  siweVerifyRequestSchema,
} from "./identity"

const now = new Date("2026-09-30T12:00:00.000Z")

describe("console auth schemas", () => {
  it("accepts a Google credential with an optional invitation", () => {
    expect(
      googleSignInRequestSchema.safeParse({ credential: "eyJ.a.b" }).success,
    ).toBe(true)
    expect(
      googleSignInRequestSchema.safeParse({
        credential: "eyJ.a.b",
        invitationToken: "token",
      }).success,
    ).toBe(true)
    expect(
      googleSignInRequestSchema.safeParse({ credential: "" }).success,
    ).toBe(false)
  })
})

describe("apps and keys", () => {
  it("requires https profile URLs", () => {
    expect(
      createAppRequestSchema.safeParse({
        name: "Gauge Radar",
        websiteUrl: "https://radar.example",
      }).success,
    ).toBe(true)
    expect(
      createAppRequestSchema.safeParse({
        name: "Gauge Radar",
        websiteUrl: "http://radar.example",
      }).success,
    ).toBe(false)
  })

  it("defaults api key options", () => {
    expect(
      createApiKeyRequestSchema.parse({ kind: "secret", name: "Server" }),
    ).toEqual({
      kind: "secret",
      name: "Server",
      allowedCidrs: [],
      expiresAt: null,
    })
  })

  it("derives credential status", () => {
    expect(credentialStatus({ expiresAt: null, revokedAt: null }, now)).toBe(
      "active",
    )
    expect(
      credentialStatus(
        { expiresAt: "2026-09-30T12:00:00.000Z", revokedAt: null },
        now,
      ),
    ).toBe("expired")
    expect(
      credentialStatus(
        { expiresAt: null, revokedAt: "2026-09-01T00:00:00.000Z" },
        now,
      ),
    ).toBe("revoked")
  })
})

describe("usage query", () => {
  it("defaults to hourly buckets and bounds the range", () => {
    expect(
      usageQuerySchema.parse({
        from: "2026-09-29T00:00:00.000Z",
        to: "2026-09-30T00:00:00.000Z",
      }).bucket,
    ).toBe("hour")
    expect(
      usageQuerySchema.safeParse({
        from: "2026-09-30T00:00:00.000Z",
        to: "2026-09-29T00:00:00.000Z",
      }).success,
    ).toBe(false)
    expect(
      usageQuerySchema.safeParse({
        from: "2026-09-01T00:00:00.000Z",
        to: "2026-09-30T00:00:00.000Z",
        bucket: "minute",
      }).success,
    ).toBe(false)
  })
})

describe("admin", () => {
  it("uses kebab-case review decisions", () => {
    expect(
      reviewDecisionRequestSchema.safeParse({ decision: "request-changes" })
        .success,
    ).toBe(true)
    expect(
      reviewDecisionRequestSchema.safeParse({ decision: "requestChanges" })
        .success,
    ).toBe(false)
  })
})

describe("audit input", () => {
  it("fills nullable defaults", () => {
    expect(
      auditEventInputSchema.parse({
        actorType: "developer",
        actorId: "4b9a3b2e-8f25-4a55-9f0e-4f7f2b9a1c3d",
        action: "api-key-created",
      }),
    ).toEqual({
      actorType: "developer",
      actorId: "4b9a3b2e-8f25-4a55-9f0e-4f7f2b9a1c3d",
      organizationId: null,
      appId: null,
      environmentId: null,
      action: "api-key-created",
      targetType: null,
      targetId: null,
      metadata: {},
      ipPrefix: null,
      requestId: null,
    })
    expect(
      auditEventInputSchema.safeParse({
        actorType: "developer",
        actorId: null,
        action: "ApiKeyCreated",
      }).success,
    ).toBe(false)
  })
})

describe("identity schemas", () => {
  it("validates SIWE and consent payloads", () => {
    expect(
      siweVerifyRequestSchema.safeParse({ message: "m", signature: "0xabc" })
        .success,
    ).toBe(true)
    expect(
      siweVerifyRequestSchema.safeParse({ message: "m", signature: "abc" })
        .success,
    ).toBe(false)
    expect(
      authorizationDecisionRequestSchema.safeParse({ decision: "approve" })
        .success,
    ).toBe(true)
    expect(sessionResponseSchema.parse({ account: null })).toEqual({
      account: null,
    })
  })
})
