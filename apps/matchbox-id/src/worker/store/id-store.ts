import type { AuditEventInput } from "@repo/platform-contracts/audit"
import type {
  AppStatus,
  ClientType,
  ReviewState,
} from "@repo/platform-contracts/console"
import type { GrantRevokedReason } from "@repo/platform-contracts/identity"
import type {
  EnvironmentKind,
  NetworkSlug,
} from "@repo/platform-contracts/network"
import type { Prompt } from "@repo/platform-contracts/oidc"
import type { QuotaOverride } from "@repo/platform-contracts/rate-limits"
import type { OidcScope, PlatformScope } from "@repo/platform-contracts/scopes"

/**
 * Storage port for the Matchbox ID Worker. Routes depend only on this type;
 * `supabase-store.ts` is production, `memory-store.ts` is tests and local dev.
 * Every "consume"/"rotate" method is an atomic single-use transition: it only
 * succeeds for the first caller. Token issuance, rotation and family
 * revocation serialise on the refresh family (`mbx_id_token_families`), so
 * no successor token can outlive a concurrent family revocation.
 */

export type AppRecord = {
  id: string
  organizationId: string
  name: string
  logoUrl: string | null
  websiteUrl: string | null
  privacyUrl: string | null
  termsUrl: string | null
  status: AppStatus
}

export type EnvironmentRecord = {
  id: string
  appId: string
  kind: EnvironmentKind
  network: NetworkSlug
  clientId: string
  clientType: ClientType
  reviewState: ReviewState
  requestedScopes: PlatformScope[]
  approvedScopes: PlatformScope[]
  scopeVersion: number
  sectorId: string
}

export type ClientRecord = {
  app: AppRecord
  environment: EnvironmentRecord
  redirectUris: string[]
}

export type ClientSecretRecord = {
  id: string
  prefix: string
  secretHash: string
  expiresAt: Date | null
  revokedAt: Date | null
}

export type AccountRecord = {
  id: string
  walletAddress: string
  createdAt: Date
  lastSignInAt: Date | null
  disabledAt: Date | null
}

/**
 * `eoa`: the SIWE signature ecrecovers to the wallet, so the signer controls
 * the address on every chain. `contract`: ERC-1271 / ERC-6492, verified
 * against one chain's state only (`siweChainId`).
 */
export type SignerKind = "eoa" | "contract"

export type SessionRecord = {
  id: string
  accountId: string
  createdAt: Date
  expiresAt: Date
  lastSeenAt: Date | null
  revokedAt: Date | null
  userAgent: string | null
  ipPrefix: string | null
  /** EIP-4361 chain id; null only for sessions created before binding. */
  siweChainId: number | null
  signerKind: SignerKind | null
}

export type DiscordLinkRecord = {
  discordUserId: string
  walletAddress: string
  username: string | null
  globalName: string | null
  avatarHash: string | null
}

export type AuthorizationRequestRecord = {
  id: string
  environmentId: string
  redirectUri: string
  state: string
  scopes: OidcScope[]
  codeChallenge: string
  nonce: string | null
  prompt: Prompt | null
  createdAt: Date
  expiresAt: Date
  consumedAt: Date | null
}

export type GrantRecord = {
  id: string
  accountId: string
  appId: string
  environmentId: string
  scopes: OidcScope[]
  scopeVersion: number
  claimsSnapshot: Array<{ claim: string; label: string }>
  discordUserId: string | null
  createdAt: Date
  updatedAt: Date
  revokedAt: Date | null
  revokedReason: GrantRevokedReason | null
}

export type AuthorizationCodeRecord = {
  codeHash: string
  grantId: string
  environmentId: string
  redirectUri: string
  codeChallenge: string
  nonce: string | null
  scopes: OidcScope[]
  authTime: Date
  expiresAt: Date
  consumedAt: Date | null
}

export type RefreshTokenRecord = {
  id: string
  tokenHash: string
  grantId: string
  familyId: string
  parentId: string | null
  scopes: OidcScope[]
  authTime: Date
  expiresAt: Date
  createdAt: Date
  rotatedAt: Date | null
  revokedAt: Date | null
}

export type AccessTokenRecord = {
  jti: string
  grantId: string
  expiresAt: Date
  revokedAt: Date | null
}

export type ConnectedGrantRecord = {
  grant: GrantRecord
  app: AppRecord
  environment: EnvironmentRecord
}

export type NewSession = {
  accountId: string
  createdAt: Date
  tokenHash: string
  expiresAt: Date
  userAgent: string | null
  ipPrefix: string | null
  siweChainId: number
  signerKind: SignerKind
}

export type NewAuthorizationRequest = Omit<
  AuthorizationRequestRecord,
  "id" | "consumedAt"
>

export type NewGrant = Omit<
  GrantRecord,
  "id" | "createdAt" | "updatedAt" | "revokedAt" | "revokedReason"
>

export type GrantUpdate = Pick<
  GrantRecord,
  "scopes" | "scopeVersion" | "claimsSnapshot" | "discordUserId"
>

export type NewAuthorizationCode = Omit<AuthorizationCodeRecord, "consumedAt">

export type NewAccessToken = Omit<AccessTokenRecord, "revokedAt">

/** First redemption of a code: creates the refresh family and its tokens. */
export type NewCodeTokens = {
  familyId: string
  grantId: string
  refreshTokenId: string
  refreshTokenHash: string
  scopes: OidcScope[]
  authTime: Date
  refreshExpiresAt: Date
  /** Access token jti; must start with the family id (32 hex). */
  accessJti: string
  accessExpiresAt: Date
  now: Date
}

export type IssueCodeTokensResult =
  | "issued"
  | "family-revoked"
  | "grant-revoked"

/** Rotation keeps the old token's grant and auth_time. */
export type RefreshRotation = {
  oldTokenHash: string
  newTokenId: string
  newTokenHash: string
  /** Scopes the successor keeps; never wider than the old token's. */
  scopes: OidcScope[]
  expiresAt: Date
  accessJti: string
  accessExpiresAt: Date
  now: Date
}

export type RotateRefreshTokenResult =
  | { status: "rotated"; familyId: string; tokenId: string }
  /** The old token was already rotated: the whole family is now revoked. */
  | { status: "reused"; familyId: string }
  | { status: "invalid" }

export type PurgeCounts = {
  siweNonces: number
  authorizationRequests: number
  authorizationCodes: number
  accessTokens: number
  refreshTokens: number
  tokenFamilies: number
}

export type IdStore = {
  // Developer-console data (read-only here) --------------------------------
  findClient(clientId: string): Promise<ClientRecord | null>
  findEnvironment(environmentId: string): Promise<ClientRecord | null>
  listClientSecrets(environmentId: string): Promise<ClientSecretRecord[]>

  // Accounts, nonces and sessions ------------------------------------------
  upsertAccountForSignIn(
    walletAddress: string,
    now: Date,
  ): Promise<AccountRecord>
  findAccount(accountId: string): Promise<AccountRecord | null>
  createSiweNonce(nonce: string, expiresAt: Date): Promise<void>
  /** Marks the nonce consumed; false when unknown, expired or already used. */
  consumeSiweNonce(nonce: string, now: Date): Promise<boolean>
  createSession(input: NewSession): Promise<SessionRecord>
  findSessionByTokenHash(tokenHash: string): Promise<SessionRecord | null>
  touchSession(sessionId: string, now: Date): Promise<void>
  listActiveSessions(accountId: string, now: Date): Promise<SessionRecord[]>
  /** Revokes one of the account's sessions; false when not found/active. */
  revokeSession(
    accountId: string,
    sessionId: string,
    now: Date,
  ): Promise<boolean>

  // Identity data -----------------------------------------------------------
  getOrCreatePairwiseSubject(
    accountId: string,
    sectorId: string,
    generate: () => string,
  ): Promise<string>
  findDiscordLink(walletAddress: string): Promise<DiscordLinkRecord | null>

  // OAuth / OIDC -------------------------------------------------------------
  createAuthorizationRequest(
    input: NewAuthorizationRequest,
  ): Promise<AuthorizationRequestRecord>
  findAuthorizationRequest(
    id: string,
  ): Promise<AuthorizationRequestRecord | null>
  /** Single use: returns the row only for the first caller before expiry. */
  consumeAuthorizationRequest(
    id: string,
    now: Date,
  ): Promise<AuthorizationRequestRecord | null>

  findActiveGrant(
    accountId: string,
    environmentId: string,
  ): Promise<GrantRecord | null>
  findGrant(grantId: string): Promise<GrantRecord | null>
  createGrant(input: NewGrant, now: Date): Promise<GrantRecord>
  updateGrant(
    grantId: string,
    update: GrantUpdate,
    now: Date,
  ): Promise<GrantRecord>
  listActiveGrants(accountId: string): Promise<ConnectedGrantRecord[]>
  /** Revokes the grant and every refresh/access token issued under it. */
  revokeGrant(
    grantId: string,
    reason: GrantRevokedReason,
    now: Date,
  ): Promise<boolean>

  createAuthorizationCode(input: NewAuthorizationCode): Promise<void>
  /** Single use: returns the row only for the first caller. */
  consumeAuthorizationCode(
    codeHash: string,
    now: Date,
  ): Promise<AuthorizationCodeRecord | null>
  findAuthorizationCode(
    codeHash: string,
  ): Promise<AuthorizationCodeRecord | null>

  findRefreshTokenByHash(tokenHash: string): Promise<RefreshTokenRecord | null>
  /**
   * Creates the family (unless a replay already revoked it) and inserts the
   * first refresh + access token atomically.
   */
  issueCodeTokens(input: NewCodeTokens): Promise<IssueCodeTokensResult>
  /**
   * Atomic rotation under the family lock: marks the old token rotated and
   * inserts the successor refresh + access token; a second rotation of the
   * same token revokes the family instead.
   */
  rotateRefreshToken(input: RefreshRotation): Promise<RotateRefreshTokenResult>
  /**
   * Marks the family revoked (creating it if a code replay wins the race)
   * and revokes its refresh tokens and access tokens (jti prefix).
   */
  revokeTokenFamily(familyId: string, now: Date): Promise<void>

  findAccessToken(jti: string): Promise<AccessTokenRecord | null>
  revokeAccessToken(jti: string, now: Date): Promise<void>

  /** Unexpired quota overrides for an environment (developer console). */
  listQuotaOverrides(environmentId: string, now: Date): Promise<QuotaOverride[]>
  /** Deletes up to `batchSize` expired rows per table (hourly cron). */
  purgeExpired(now: Date, batchSize: number): Promise<PurgeCounts>

  recordAudit(event: AuditEventInput): Promise<void>
}
