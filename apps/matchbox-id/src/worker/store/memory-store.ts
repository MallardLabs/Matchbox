import {
  type AuditEventInput,
  auditEventInputSchema,
} from "@repo/platform-contracts/audit"
import type { AppStatus, ClientType } from "@repo/platform-contracts/console"
import type { GrantRevokedReason } from "@repo/platform-contracts/identity"
import type { QuotaOverride } from "@repo/platform-contracts/rate-limits"
import { isDiscordScope } from "@repo/platform-contracts/scopes"
import { hmacHex } from "@repo/platform-server"
import type {
  AccessTokenRecord,
  AccountRecord,
  AppRecord,
  AuthorizationCodeRecord,
  AuthorizationRequestRecord,
  ClientRecord,
  ClientSecretRecord,
  DiscordLinkRecord,
  EnvironmentRecord,
  GrantRecord,
  IdStore,
  PurgeCounts,
  RefreshTokenRecord,
  SessionRecord,
} from "./id-store"

/**
 * In-memory `IdStore` for tests and `PLATFORM_STORE=memory` local dev. It
 * mirrors the database semantics the routes rely on: single-use consumption,
 * one active grant per (account, environment), refresh-family issuance /
 * rotation / revocation (`mbx_id_issue_code_tokens`,
 * `mbx_id_rotate_refresh_token`, `mbx_id_revoke_token_family`), cleanup
 * (`mbx_id_purge_expired`) and the `mbx_id_invalidate_discord_grants`
 * trigger (via `admin.setDiscordLink`). No method awaits between its reads
 * and writes, which is what makes each one atomic here.
 */

/** Seed identifiers and credentials, stable across restarts. */
export const memorySeed = {
  organizationId: "00000000-0000-4000-8000-000000000001",
  appId: "00000000-0000-4000-8000-000000000010",
  liveEnvironmentId: "00000000-0000-4000-8000-000000000100",
  testEnvironmentId: "00000000-0000-4000-8000-000000000200",
  liveClientId: "mbx_live_ExampleLiveClient0000001",
  testClientId: "mbx_test_ExampleTestClient0000001",
  liveClientSecretPrefix: "DevSecret001",
  liveClientSecret:
    "mbx_cs_DevSecret001_local-dev-client-secret-do-not-use-in-prod0",
  liveRedirectUris: ["https://localhost:5174/callback"],
  testRedirectUris: [
    "http://localhost:5174/callback",
    "http://127.0.0.1:5174/callback",
  ],
  /** Hardhat account #0: a well-known local dev key, never a real wallet. */
  devWallet: "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266",
  devDiscord: {
    discordUserId: "100000000000000001",
    username: "matchbox-dev",
    globalName: "Matchbox Dev",
    avatarHash: null,
  },
} as const

export type MemoryAuditEvent = ReturnType<typeof auditEventInputSchema.parse>

export type MemoryIdStore = IdStore & {
  admin: {
    setAppStatus(appId: string, status: AppStatus): void
    setScopeVersion(environmentId: string, scopeVersion: number): void
    setClientType(environmentId: string, clientType: ClientType): void
    setRedirectUris(environmentId: string, uris: string[]): void
    setQuotaOverrides(environmentId: string, overrides: QuotaOverride[]): void
    setApprovedScopes(
      environmentId: string,
      scopes: EnvironmentRecord["approvedScopes"],
    ): void
    /** Replaces (or removes) a wallet's Discord link like the DB trigger. */
    setDiscordLink(
      walletAddress: string,
      link: Omit<DiscordLinkRecord, "walletAddress"> | null,
      now: Date,
    ): void
    auditEvents(): MemoryAuditEvent[]
    grants(): GrantRecord[]
    refreshTokens(): RefreshTokenRecord[]
    accessTokens(): AccessTokenRecord[]
    sessions(): SessionRecord[]
    tokenFamilies(): TokenFamilyRecord[]
    counts(): PurgeCounts
  }
}

export type TokenFamilyRecord = {
  familyId: string
  grantId: string | null
  createdAt: Date
  revokedAt: Date | null
}

const hourMs = 60 * 60_000
const dayMs = 24 * hourMs

function jtiPrefix(familyId: string): string {
  return familyId.replaceAll("-", "").toLowerCase()
}

function clone<Value>(value: Value): Value {
  return structuredClone(value)
}

function isActiveSecret(secret: ClientSecretRecord, now: Date): boolean {
  return (
    secret.revokedAt === null &&
    (secret.expiresAt === null || secret.expiresAt > now)
  )
}

export async function createMemoryIdStore(options: {
  clientSecretPepper: string
}): Promise<MemoryIdStore> {
  const apps = new Map<string, AppRecord>()
  const environments = new Map<string, EnvironmentRecord>()
  const redirectUris = new Map<string, string[]>()
  const clientSecrets = new Map<string, ClientSecretRecord[]>()
  const accounts = new Map<string, AccountRecord>()
  const nonces = new Map<string, { expiresAt: Date; consumedAt: Date | null }>()
  const sessions = new Map<string, SessionRecord & { tokenHash: string }>()
  const pairwise = new Map<string, string>()
  const discordLinks = new Map<string, DiscordLinkRecord>()
  const requests = new Map<string, AuthorizationRequestRecord>()
  const grants = new Map<string, GrantRecord>()
  const codes = new Map<string, AuthorizationCodeRecord>()
  const refreshTokens = new Map<string, RefreshTokenRecord>()
  const accessTokens = new Map<string, AccessTokenRecord>()
  const families = new Map<string, TokenFamilyRecord>()
  const quotaOverrides = new Map<string, QuotaOverride[]>()
  const audit: MemoryAuditEvent[] = []

  apps.set(memorySeed.appId, {
    id: memorySeed.appId,
    organizationId: memorySeed.organizationId,
    name: "Matchbox Example",
    logoUrl: null,
    websiteUrl: "https://matchbox.markets",
    privacyUrl: "https://matchbox.markets/privacy",
    termsUrl: "https://matchbox.markets/terms",
    status: "active",
  })
  environments.set(memorySeed.liveEnvironmentId, {
    id: memorySeed.liveEnvironmentId,
    appId: memorySeed.appId,
    kind: "live",
    network: "mezo",
    clientId: memorySeed.liveClientId,
    clientType: "confidential",
    reviewState: "approved",
    requestedScopes: ["openid", "wallet", "discord:id", "discord:profile"],
    approvedScopes: ["openid", "wallet", "discord:id", "discord:profile"],
    scopeVersion: 1,
    sectorId: memorySeed.liveEnvironmentId,
  })
  environments.set(memorySeed.testEnvironmentId, {
    id: memorySeed.testEnvironmentId,
    appId: memorySeed.appId,
    kind: "test",
    network: "mezo-testnet",
    clientId: memorySeed.testClientId,
    clientType: "public",
    reviewState: "development",
    requestedScopes: ["openid", "wallet", "discord:id", "discord:profile"],
    approvedScopes: ["openid", "wallet"],
    scopeVersion: 1,
    sectorId: memorySeed.testEnvironmentId,
  })
  redirectUris.set(memorySeed.liveEnvironmentId, [
    ...memorySeed.liveRedirectUris,
  ])
  redirectUris.set(memorySeed.testEnvironmentId, [
    ...memorySeed.testRedirectUris,
  ])
  clientSecrets.set(memorySeed.liveEnvironmentId, [
    {
      id: crypto.randomUUID(),
      prefix: memorySeed.liveClientSecretPrefix,
      secretHash: await hmacHex(
        options.clientSecretPepper,
        memorySeed.liveClientSecret,
      ),
      expiresAt: null,
      revokedAt: null,
    },
  ])
  discordLinks.set(memorySeed.devWallet, {
    ...memorySeed.devDiscord,
    walletAddress: memorySeed.devWallet,
  })

  function clientFor(environment: EnvironmentRecord): ClientRecord | null {
    const app = apps.get(environment.appId)
    if (app === undefined) return null
    return clone({
      app,
      environment,
      redirectUris: redirectUris.get(environment.id) ?? [],
    })
  }

  function revokeGrantTokens(grantId: string, now: Date): void {
    for (const token of refreshTokens.values()) {
      if (token.grantId === grantId && token.revokedAt === null) {
        token.revokedAt = now
      }
    }
    for (const token of accessTokens.values()) {
      if (token.grantId === grantId && token.revokedAt === null) {
        token.revokedAt = now
      }
    }
  }

  function revokeFamily(familyId: string, now: Date): void {
    const family = families.get(familyId)
    if (family === undefined) {
      families.set(familyId, {
        familyId,
        grantId: null,
        createdAt: now,
        revokedAt: now,
      })
    } else if (family.revokedAt === null) {
      family.revokedAt = now
    }
    for (const token of refreshTokens.values()) {
      if (token.familyId === familyId && token.revokedAt === null) {
        token.revokedAt = now
      }
    }
    const prefix = jtiPrefix(familyId)
    for (const token of accessTokens.values()) {
      if (token.jti.startsWith(prefix) && token.revokedAt === null) {
        token.revokedAt = now
      }
    }
  }

  function grantIsActive(grantId: string): boolean {
    const grant = grants.get(grantId)
    return grant !== undefined && grant.revokedAt === null
  }

  function purge<Row>(
    rows: Map<string, Row>,
    expired: (row: Row) => boolean,
    batchSize: number,
  ): number {
    let deleted = 0
    for (const [key, row] of rows) {
      if (deleted >= batchSize) break
      if (expired(row)) {
        rows.delete(key)
        deleted += 1
      }
    }
    return deleted
  }

  function revokeGrantRecord(
    grant: GrantRecord,
    reason: GrantRevokedReason,
    now: Date,
  ): void {
    grant.revokedAt = now
    grant.revokedReason = reason
    grant.updatedAt = now
    revokeGrantTokens(grant.id, now)
  }

  const store: MemoryIdStore = {
    async findClient(clientId) {
      for (const environment of environments.values()) {
        if (environment.clientId === clientId) return clientFor(environment)
      }
      return null
    },
    async findEnvironment(environmentId) {
      const environment = environments.get(environmentId)
      return environment === undefined ? null : clientFor(environment)
    },
    async listClientSecrets(environmentId) {
      const now = new Date()
      return clone(
        (clientSecrets.get(environmentId) ?? []).filter((secret) =>
          isActiveSecret(secret, now),
        ),
      )
    },

    async upsertAccountForSignIn(walletAddress, now) {
      for (const account of accounts.values()) {
        if (account.walletAddress === walletAddress) {
          account.lastSignInAt = now
          return clone(account)
        }
      }
      const account: AccountRecord = {
        id: crypto.randomUUID(),
        walletAddress,
        createdAt: now,
        lastSignInAt: now,
        disabledAt: null,
      }
      accounts.set(account.id, account)
      return clone(account)
    },
    async findAccount(accountId) {
      const account = accounts.get(accountId)
      return account === undefined ? null : clone(account)
    },
    async createSiweNonce(nonce, expiresAt) {
      nonces.set(nonce, { expiresAt, consumedAt: null })
    },
    async consumeSiweNonce(nonce, now) {
      const row = nonces.get(nonce)
      if (
        row === undefined ||
        row.consumedAt !== null ||
        row.expiresAt <= now
      ) {
        return false
      }
      row.consumedAt = now
      return true
    },
    async createSession(input) {
      const session = {
        id: crypto.randomUUID(),
        accountId: input.accountId,
        tokenHash: input.tokenHash,
        createdAt: input.createdAt,
        expiresAt: input.expiresAt,
        lastSeenAt: null,
        revokedAt: null,
        userAgent: input.userAgent,
        ipPrefix: input.ipPrefix,
        siweChainId: input.siweChainId,
        signerKind: input.signerKind,
      }
      sessions.set(session.id, session)
      const { tokenHash: _tokenHash, ...record } = session
      return clone(record)
    },
    async findSessionByTokenHash(tokenHash) {
      for (const session of sessions.values()) {
        if (session.tokenHash === tokenHash) {
          const { tokenHash: _tokenHash, ...record } = session
          return clone(record)
        }
      }
      return null
    },
    async touchSession(sessionId, now) {
      const session = sessions.get(sessionId)
      if (session !== undefined) session.lastSeenAt = now
    },
    async listActiveSessions(accountId, now) {
      return [...sessions.values()]
        .filter(
          (session) =>
            session.accountId === accountId &&
            session.revokedAt === null &&
            session.expiresAt > now,
        )
        .sort(
          (left, right) => right.createdAt.getTime() - left.createdAt.getTime(),
        )
        .map(({ tokenHash: _tokenHash, ...record }) => clone(record))
    },
    async revokeSession(accountId, sessionId, now) {
      const session = sessions.get(sessionId)
      if (
        session === undefined ||
        session.accountId !== accountId ||
        session.revokedAt !== null
      ) {
        return false
      }
      session.revokedAt = now
      return true
    },

    async getOrCreatePairwiseSubject(accountId, sectorId, generate) {
      const key = `${accountId}:${sectorId}`
      const existing = pairwise.get(key)
      if (existing !== undefined) return existing
      const subject = generate()
      pairwise.set(key, subject)
      return subject
    },
    async findDiscordLink(walletAddress) {
      const link = discordLinks.get(walletAddress)
      return link === undefined ? null : clone(link)
    },

    async createAuthorizationRequest(input) {
      const request: AuthorizationRequestRecord = {
        ...input,
        id: crypto.randomUUID(),
        consumedAt: null,
      }
      requests.set(request.id, request)
      return clone(request)
    },
    async findAuthorizationRequest(id) {
      const request = requests.get(id)
      return request === undefined ? null : clone(request)
    },
    async consumeAuthorizationRequest(id, now) {
      const request = requests.get(id)
      if (
        request === undefined ||
        request.consumedAt !== null ||
        request.expiresAt <= now
      ) {
        return null
      }
      request.consumedAt = now
      return clone(request)
    },

    async findActiveGrant(accountId, environmentId) {
      for (const grant of grants.values()) {
        if (
          grant.accountId === accountId &&
          grant.environmentId === environmentId &&
          grant.revokedAt === null
        ) {
          return clone(grant)
        }
      }
      return null
    },
    async findGrant(grantId) {
      const grant = grants.get(grantId)
      return grant === undefined ? null : clone(grant)
    },
    async createGrant(input, now) {
      const existing = await store.findActiveGrant(
        input.accountId,
        input.environmentId,
      )
      if (existing !== null) throw new Error("Active grant already exists")
      const grant: GrantRecord = {
        ...clone(input),
        id: crypto.randomUUID(),
        createdAt: now,
        updatedAt: now,
        revokedAt: null,
        revokedReason: null,
      }
      grants.set(grant.id, grant)
      return clone(grant)
    },
    async updateGrant(grantId, update, now) {
      const grant = grants.get(grantId)
      if (grant === undefined) throw new Error("Grant not found")
      Object.assign(grant, clone(update), { updatedAt: now })
      return clone(grant)
    },
    async listActiveGrants(accountId) {
      const connected = []
      for (const grant of grants.values()) {
        if (grant.accountId !== accountId || grant.revokedAt !== null) continue
        const client = await store.findEnvironment(grant.environmentId)
        if (client === null) continue
        connected.push({
          grant: clone(grant),
          app: client.app,
          environment: client.environment,
        })
      }
      return connected.sort(
        (left, right) =>
          right.grant.createdAt.getTime() - left.grant.createdAt.getTime(),
      )
    },
    async revokeGrant(grantId, reason, now) {
      const grant = grants.get(grantId)
      if (grant === undefined || grant.revokedAt !== null) return false
      revokeGrantRecord(grant, reason, now)
      return true
    },

    async createAuthorizationCode(input) {
      codes.set(input.codeHash, { ...clone(input), consumedAt: null })
    },
    async consumeAuthorizationCode(codeHash, now) {
      const code = codes.get(codeHash)
      if (code === undefined || code.consumedAt !== null) return null
      code.consumedAt = now
      return clone(code)
    },
    async findAuthorizationCode(codeHash) {
      const code = codes.get(codeHash)
      return code === undefined ? null : clone(code)
    },

    async findRefreshTokenByHash(tokenHash) {
      for (const token of refreshTokens.values()) {
        if (token.tokenHash === tokenHash) return clone(token)
      }
      return null
    },
    async issueCodeTokens(input) {
      if (!input.accessJti.startsWith(jtiPrefix(input.familyId))) {
        throw new Error("Access token jti is not in the family")
      }
      const family = families.get(input.familyId)
      if (family === undefined) {
        families.set(input.familyId, {
          familyId: input.familyId,
          grantId: input.grantId,
          createdAt: input.now,
          revokedAt: null,
        })
      } else if (family.revokedAt !== null) {
        return "family-revoked"
      }
      if (!grantIsActive(input.grantId)) return "grant-revoked"
      refreshTokens.set(input.refreshTokenId, {
        id: input.refreshTokenId,
        tokenHash: input.refreshTokenHash,
        grantId: input.grantId,
        familyId: input.familyId,
        parentId: null,
        scopes: [...input.scopes],
        authTime: input.authTime,
        expiresAt: input.refreshExpiresAt,
        createdAt: input.now,
        rotatedAt: null,
        revokedAt: null,
      })
      accessTokens.set(input.accessJti, {
        jti: input.accessJti,
        grantId: input.grantId,
        expiresAt: input.accessExpiresAt,
        revokedAt: null,
      })
      return "issued"
    },
    async rotateRefreshToken(input) {
      const old = [...refreshTokens.values()].find(
        (token) => token.tokenHash === input.oldTokenHash,
      )
      if (old === undefined) return { status: "invalid" }
      const family = families.get(old.familyId) ?? {
        familyId: old.familyId,
        grantId: old.grantId,
        createdAt: old.createdAt,
        revokedAt: null,
      }
      families.set(old.familyId, family)
      if (family.revokedAt !== null || old.revokedAt !== null) {
        return { status: "invalid" }
      }
      if (old.rotatedAt !== null) {
        revokeFamily(old.familyId, input.now)
        return { status: "reused", familyId: old.familyId }
      }
      const oldScopes = new Set(old.scopes)
      if (
        old.expiresAt <= input.now ||
        input.scopes.some((scope) => !oldScopes.has(scope)) ||
        !input.accessJti.startsWith(jtiPrefix(old.familyId)) ||
        !grantIsActive(old.grantId)
      ) {
        return { status: "invalid" }
      }
      old.rotatedAt = input.now
      refreshTokens.set(input.newTokenId, {
        id: input.newTokenId,
        tokenHash: input.newTokenHash,
        grantId: old.grantId,
        familyId: old.familyId,
        parentId: old.id,
        scopes: [...input.scopes],
        authTime: old.authTime,
        expiresAt: input.expiresAt,
        createdAt: input.now,
        rotatedAt: null,
        revokedAt: null,
      })
      accessTokens.set(input.accessJti, {
        jti: input.accessJti,
        grantId: old.grantId,
        expiresAt: input.accessExpiresAt,
        revokedAt: null,
      })
      return {
        status: "rotated",
        familyId: old.familyId,
        tokenId: input.newTokenId,
      }
    },
    async revokeTokenFamily(familyId, now) {
      revokeFamily(familyId, now)
    },

    async findAccessToken(jti) {
      const token = accessTokens.get(jti)
      return token === undefined ? null : clone(token)
    },
    async revokeAccessToken(jti, now) {
      const token = accessTokens.get(jti)
      if (token !== undefined && token.revokedAt === null) token.revokedAt = now
    },

    async listQuotaOverrides(environmentId, now) {
      return clone(
        (quotaOverrides.get(environmentId) ?? []).filter(
          (override) =>
            override.expiresAt === null ||
            Date.parse(override.expiresAt) > now.getTime(),
        ),
      )
    },
    async purgeExpired(now, requestedBatchSize) {
      const batchSize = Math.min(Math.max(requestedBatchSize, 1), 5000)
      const at = now.getTime()
      function olderThan(graceMs: number) {
        return (row: { expiresAt: Date }) =>
          row.expiresAt.getTime() < at - graceMs
      }
      const counts: PurgeCounts = {
        siweNonces: purge(nonces, olderThan(hourMs), batchSize),
        authorizationRequests: purge(requests, olderThan(hourMs), batchSize),
        authorizationCodes: purge(codes, olderThan(dayMs), batchSize),
        accessTokens: purge(accessTokens, olderThan(dayMs), batchSize),
        refreshTokens: purge(refreshTokens, olderThan(dayMs), batchSize),
        tokenFamilies: 0,
      }
      const referenced = new Set(
        [...refreshTokens.values()].map((token) => token.familyId),
      )
      counts.tokenFamilies = purge(
        families,
        (row) =>
          row.createdAt.getTime() < at - 2 * dayMs &&
          !referenced.has(row.familyId),
        batchSize,
      )
      return counts
    },

    async recordAudit(event: AuditEventInput) {
      audit.push(auditEventInputSchema.parse(event))
    },

    admin: {
      setAppStatus(appId, status) {
        const app = apps.get(appId)
        if (app !== undefined) app.status = status
      },
      setScopeVersion(environmentId, scopeVersion) {
        const environment = environments.get(environmentId)
        if (environment !== undefined) environment.scopeVersion = scopeVersion
      },
      setClientType(environmentId, clientType) {
        const environment = environments.get(environmentId)
        if (environment !== undefined) environment.clientType = clientType
      },
      setRedirectUris(environmentId, uris) {
        redirectUris.set(environmentId, [...uris])
      },
      setQuotaOverrides(environmentId, overrides) {
        quotaOverrides.set(environmentId, clone(overrides))
      },
      setApprovedScopes(environmentId, scopes) {
        const environment = environments.get(environmentId)
        if (environment !== undefined) environment.approvedScopes = [...scopes]
      },
      setDiscordLink(walletAddress, link, now) {
        const previous = discordLinks.get(walletAddress)
        if (link === null) discordLinks.delete(walletAddress)
        else discordLinks.set(walletAddress, { ...link, walletAddress })
        const changed =
          previous !== undefined &&
          (link === null || link.discordUserId !== previous.discordUserId)
        if (!changed) return
        const accountIds = new Set(
          [...accounts.values()]
            .filter((account) => account.walletAddress === walletAddress)
            .map((account) => account.id),
        )
        for (const grant of grants.values()) {
          if (
            accountIds.has(grant.accountId) &&
            grant.revokedAt === null &&
            grant.scopes.some((scope) => isDiscordScope(scope))
          ) {
            revokeGrantRecord(grant, "discord-link-changed", now)
            audit.push(
              auditEventInputSchema.parse({
                actorType: "system",
                actorId: null,
                appId: grant.appId,
                environmentId: grant.environmentId,
                action: "grant-revoked",
                targetType: "grant",
                targetId: grant.id,
                metadata: { reason: "discord-link-changed" },
              }),
            )
          }
        }
      },
      auditEvents: () => clone(audit),
      grants: () => clone([...grants.values()]),
      refreshTokens: () => clone([...refreshTokens.values()]),
      accessTokens: () => clone([...accessTokens.values()]),
      sessions: () =>
        [...sessions.values()].map(({ tokenHash: _tokenHash, ...record }) =>
          clone(record),
        ),
      tokenFamilies: () => clone([...families.values()]),
      counts: () => ({
        siweNonces: nonces.size,
        authorizationRequests: requests.size,
        authorizationCodes: codes.size,
        accessTokens: accessTokens.size,
        refreshTokens: refreshTokens.size,
        tokenFamilies: families.size,
      }),
    },
  }
  return store
}
