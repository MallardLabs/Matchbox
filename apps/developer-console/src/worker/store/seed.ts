import { networkForEnvironmentKind } from "@repo/platform-contracts/network"
import type { EnvironmentKind } from "@repo/platform-contracts/network"
import type { PlatformScope } from "@repo/platform-contracts/scopes"
import {
  generateApiKey,
  generateClientId,
  generateClientSecret,
  hmacHex,
  randomToken,
} from "@repo/platform-server"
import type { AppRecord } from "./console-store"
import type { MemoryConsoleStore } from "./memory-store"

export const demoAccountEmail = "dev@matchbox.local"

/**
 * Demo data for `PLATFORM_STORE=memory`: one developer account (sign in with
 * `POST /api/auth/dev-sign-in`; a passkey cannot be seeded), the "Mallard
 * Labs" org, one approved live gauge-profile app and one app with a
 * `discord:profile` review open.
 */
export default async function seedDemoData(
  store: MemoryConsoleStore,
  options: { apiKeyPepper: string; clientSecretPepper: string; now: Date },
): Promise<void> {
  if ((await store.findAccountByEmail(demoAccountEmail)) !== null) return
  const at = options.now.toISOString()
  const account = await store.createAccount({
    email: demoAccountEmail,
    displayName: "Matchbox Developer",
    emailVerifiedAt: at,
  })
  store.seedStaff(account.id, "reviewer")
  const teammate = await store.createAccount({
    email: "teammate@matchbox.local",
    displayName: "Teammate",
    emailVerifiedAt: at,
  })
  const organization = await store.createOrganization({
    name: "Mallard Labs",
    slug: "mallard-labs",
    ownerId: account.id,
  })
  await store.addMember({
    organizationId: organization.id,
    accountId: teammate.id,
    role: "developer",
  })
  const audit = (input: {
    action: Parameters<MemoryConsoleStore["recordAudit"]>[0]["action"]
    appId?: string
    environmentId?: string
    targetType: string
    targetId: string
    metadata?: Record<string, unknown>
  }) =>
    store.recordAudit({
      actorType: "developer",
      actorId: account.id,
      organizationId: organization.id,
      appId: input.appId ?? null,
      environmentId: input.environmentId ?? null,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      metadata: input.metadata ?? {},
    })
  await audit({
    action: "organization-created",
    targetType: "organization",
    targetId: organization.id,
  })

  async function environment(
    app: AppRecord,
    kind: EnvironmentKind,
    scopes: { requested: PlatformScope[]; approved: PlatformScope[] },
  ) {
    const created = await store.createEnvironment({
      appId: app.id,
      kind,
      network: networkForEnvironmentKind(kind),
      clientId: generateClientId(kind),
      clientType: "confidential",
    })
    return store.updateEnvironment(created.id, {
      requestedScopes: scopes.requested,
      approvedScopes: scopes.approved,
      reviewState: scopes.approved.length > 0 ? "approved" : "development",
      scopeVersion: scopes.approved.length > 0 ? 2 : 1,
    })
  }

  async function apiKey(
    environmentId: string,
    kind: EnvironmentKind,
    keyKind: "publishable" | "secret",
    name: string,
  ) {
    const generated = generateApiKey(keyKind, kind)
    const row = await store.createApiKey({
      environmentId,
      kind: keyKind,
      name,
      prefix: generated.prefix,
      secretHash: await hmacHex(options.apiKeyPepper, generated.value),
      allowedCidrs: [],
      createdBy: account.id,
      expiresAt: null,
      rotatedFrom: null,
    })
    await audit({
      action: "api-key-created",
      environmentId,
      targetType: "api-key",
      targetId: row.id,
      metadata: { kind: keyKind, name },
    })
  }

  // App 1: gauge profiles, live approved -------------------------------------
  const gaugeApp = await store.createApp({
    organizationId: organization.id,
    name: "Gauge Board",
    slug: "gauge-board",
    description: "Gauge profile explorer for Mezo.",
    logoUrl: null,
    websiteUrl: "https://gauges.example.com",
    privacyUrl: "https://gauges.example.com/privacy",
    termsUrl: null,
    supportEmail: "support@example.com",
  })
  await audit({
    action: "app-created",
    appId: gaugeApp.id,
    targetType: "app",
    targetId: gaugeApp.id,
  })
  const gaugeTest = await environment(gaugeApp, "test", {
    requested: ["gauge-profiles:read"],
    approved: ["gauge-profiles:read"],
  })
  const gaugeLive = await environment(gaugeApp, "live", {
    requested: ["gauge-profiles:read"],
    approved: ["gauge-profiles:read"],
  })
  await store.replaceOrigins(gaugeTest.id, ["http://localhost:5173"])
  await store.replaceOrigins(gaugeLive.id, ["https://gauges.example.com"])
  await store.createReview({
    environmentId: gaugeLive.id,
    requestedScopes: ["gauge-profiles:read"],
    state: "approved",
    submitterId: account.id,
    submitterNote: null,
    reviewerId: null,
    reviewerNote: "Auto-approved",
    decidedAt: at,
  })
  await apiKey(gaugeTest.id, "test", "publishable", "Local dev")
  await apiKey(gaugeTest.id, "test", "secret", "CI")
  await apiKey(gaugeLive.id, "live", "publishable", "Website")
  await apiKey(gaugeLive.id, "live", "secret", "Indexer")

  // App 2: Matchbox ID with a Discord review open ----------------------------
  const hubApp = await store.createApp({
    organizationId: organization.id,
    name: "Validator Hub",
    slug: "validator-hub",
    description: "Validator community dashboard.",
    logoUrl: null,
    websiteUrl: "https://validators.example.com",
    privacyUrl: "https://validators.example.com/privacy",
    termsUrl: "https://validators.example.com/terms",
    supportEmail: null,
  })
  await audit({
    action: "app-created",
    appId: hubApp.id,
    targetType: "app",
    targetId: hubApp.id,
  })
  const hubTest = await environment(hubApp, "test", {
    requested: ["openid", "wallet"],
    approved: ["openid", "wallet"],
  })
  const hubLive = await environment(hubApp, "live", {
    requested: ["openid", "wallet", "discord:profile"],
    approved: [],
  })
  await store.updateEnvironment(hubLive.id, { reviewState: "submitted" })
  await store.replaceRedirectUris(hubTest.id, [
    "http://localhost:3000/auth/callback",
  ])
  await store.replaceRedirectUris(hubLive.id, [
    "https://validators.example.com/auth/callback",
  ])
  const review = await store.createReview({
    environmentId: hubLive.id,
    requestedScopes: ["openid", "wallet", "discord:profile"],
    state: "open",
    submitterId: account.id,
    submitterNote: "Show Discord names next to validator profiles.",
    reviewerId: null,
    reviewerNote: null,
    decidedAt: null,
  })
  await audit({
    action: "review-submitted",
    appId: hubApp.id,
    environmentId: hubLive.id,
    targetType: "review",
    targetId: review.id,
  })
  for (const environmentId of [hubTest.id, hubLive.id]) {
    const generated = generateClientSecret()
    await store.createClientSecret({
      environmentId,
      secretHash: await hmacHex(options.clientSecretPepper, generated.value),
      prefix: generated.prefix,
      createdBy: account.id,
      expiresAt: null,
    })
  }
  for (let index = 0; index < 12; index++) {
    store.seedGrant({
      environmentId: hubTest.id,
      scopes: index % 3 === 0 ? ["openid"] : ["openid", "wallet"],
      createdAt: new Date(
        options.now.getTime() - index * 36 * 60 * 60_000,
      ).toISOString(),
      revokedAt:
        index % 5 === 4
          ? new Date(options.now.getTime() - index * 3_600_000).toISOString()
          : null,
      revokedReason: index % 5 === 4 ? "user-revoked" : null,
    })
  }
  await store.createInvitation({
    organizationId: organization.id,
    email: "new.hire@example.com",
    role: "admin",
    tokenHash: await hmacHex(options.apiKeyPepper, randomToken()),
    invitedBy: account.id,
    createdAt: at,
    expiresAt: new Date(
      options.now.getTime() + 6 * 24 * 60 * 60_000,
    ).toISOString(),
  })
}
