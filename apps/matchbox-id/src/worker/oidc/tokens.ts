import { clientIdSchema } from "@repo/platform-contracts/credentials"
import {
  type TokenResponse,
  accessTokenClaimsSchema,
  oidcLifetimes,
} from "@repo/platform-contracts/oidc"
import {
  type OidcScope,
  formatScopeString,
} from "@repo/platform-contracts/scopes"
import {
  generateOpaqueToken,
  generatePairwiseSubject,
  hmacHex,
  randomToken,
} from "@repo/platform-server"
import type { AppDeps } from "../deps"
import type {
  AccountRecord,
  ClientRecord,
  GrantRecord,
} from "../store/id-store"
import { releasedClaims } from "./claims"

/**
 * Token issuance. Access tokens are ES256 JWTs whose `jti` starts with the
 * refresh family id (32 hex), so a family's access tokens can be revoked
 * together. A code's refresh family id is derived from the code hash, so a
 * replayed code can revoke exactly the tokens issued from it. Tokens are
 * signed first and persisted in one atomic store call (family issuance or
 * rotation), so a concurrent family revocation always wins.
 */

const secondMs = 1000

/** Opaque codes/refresh tokens are stored as HMAC(SESSION_PEPPER, value). */
export function opaqueTokenHash(deps: AppDeps, token: string): Promise<string> {
  return hmacHex(deps.config.sessionPepper, token)
}

function formatUuid(hex: string): string {
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
}

export function familyIdForCodeHash(codeHash: string): string {
  return formatUuid(codeHash.slice(0, 32))
}

export function familyJtiPrefix(familyId: string): string {
  return familyId.replaceAll("-", "").toLowerCase()
}

function newJti(familyId: string): string {
  return `${familyJtiPrefix(familyId)}${randomToken(16)}`
}

export async function pairwiseSubject(
  deps: AppDeps,
  account: AccountRecord,
  client: ClientRecord,
): Promise<string> {
  return deps.store.getOrCreatePairwiseSubject(
    account.id,
    client.environment.sectorId,
    generatePairwiseSubject,
  )
}

/** Access tokens are audience-restricted to the client they were issued to. */
export function accessTokenAudience(client: ClientRecord): string {
  return client.environment.clientId
}

/** Access-token claims as issued here: `aud` is the `client_id`. */
export const issuedAccessTokenClaimsSchema = accessTokenClaimsSchema
  .extend({ aud: clientIdSchema })
  .refine((claims) => claims.aud === claims.client_id, {
    message: "aud must equal client_id",
  })

export type TokenPersistence =
  /** First redemption of an authorization code (creates the family). */
  | { kind: "code" }
  /** Rotation of the presented refresh token (successor keeps its scopes). */
  | { kind: "rotation"; oldTokenHash: string }

export type IssueTokensResult =
  | { ok: true; tokens: TokenResponse }
  | {
      ok: false
      reason: "family-revoked" | "grant-revoked" | "reused" | "invalid"
    }

export type IssueTokensInput = {
  client: ClientRecord
  grant: GrantRecord
  account: AccountRecord
  /** Scopes for this access/ID token (may be narrower on refresh). */
  scopes: OidcScope[]
  /** Scopes the refresh token keeps (RFC 6749 §6: unchanged on rotation). */
  refreshScopes: OidcScope[]
  authTime: Date
  nonce: string | null
  familyId: string
  persistence: TokenPersistence
}

export async function issueTokens(
  deps: AppDeps,
  input: IssueTokensInput,
): Promise<IssueTokensResult> {
  const now = deps.now()
  const issuedAt = Math.floor(now.getTime() / secondMs)
  const { issuer } = deps.config
  const clientId = input.client.environment.clientId
  const subject = await pairwiseSubject(deps, input.account, input.client)
  const scope = formatScopeString(input.scopes)

  const jti = newJti(input.familyId)
  const accessToken = await deps.keys.sign(
    {
      iss: issuer,
      aud: accessTokenAudience(input.client),
      sub: subject,
      client_id: clientId,
      scope,
      jti,
      iat: issuedAt,
      exp: issuedAt + oidcLifetimes.accessToken,
    },
    { type: "at+jwt" },
  )
  const accessExpiresAt = new Date(
    now.getTime() + oidcLifetimes.accessToken * secondMs,
  )

  const discordLink = await deps.store.findDiscordLink(
    input.account.walletAddress,
  )
  const idToken = input.scopes.includes("openid")
    ? await deps.keys.sign(
        {
          iss: issuer,
          aud: clientId,
          sub: subject,
          iat: issuedAt,
          exp: issuedAt + oidcLifetimes.idToken,
          auth_time: Math.floor(input.authTime.getTime() / secondMs),
          ...(input.nonce === null ? {} : { nonce: input.nonce }),
          azp: clientId,
          ...releasedClaims({
            scopes: input.scopes,
            account: input.account,
            environment: input.client.environment,
            grant: input.grant,
            discordLink,
            flags: deps.flags,
          }),
        },
        { type: "JWT" },
      )
    : undefined

  const refreshToken = generateOpaqueToken()
  const refreshTokenHash = await opaqueTokenHash(deps, refreshToken)
  const refreshExpiresAt = new Date(
    now.getTime() + oidcLifetimes.refreshToken * secondMs,
  )
  const persistence = input.persistence
  if (persistence.kind === "code") {
    const issued = await deps.store.issueCodeTokens({
      familyId: input.familyId,
      grantId: input.grant.id,
      refreshTokenId: crypto.randomUUID(),
      refreshTokenHash,
      scopes: input.refreshScopes,
      authTime: input.authTime,
      refreshExpiresAt,
      accessJti: jti,
      accessExpiresAt,
      now,
    })
    if (issued !== "issued") return { ok: false, reason: issued }
  } else {
    const rotated = await deps.store.rotateRefreshToken({
      oldTokenHash: persistence.oldTokenHash,
      newTokenId: crypto.randomUUID(),
      newTokenHash: refreshTokenHash,
      scopes: input.refreshScopes,
      expiresAt: refreshExpiresAt,
      accessJti: jti,
      accessExpiresAt,
      now,
    })
    if (rotated.status !== "rotated") {
      return { ok: false, reason: rotated.status }
    }
  }

  return {
    ok: true,
    tokens: {
      access_token: accessToken,
      token_type: "Bearer",
      expires_in: oidcLifetimes.accessToken,
      refresh_token: refreshToken,
      ...(idToken === undefined ? {} : { id_token: idToken }),
      scope,
    },
  }
}

/** Stores a 60 s single-use authorization code and returns its value. */
export async function createAuthorizationCode(
  deps: AppDeps,
  input: {
    grant: GrantRecord
    client: ClientRecord
    redirectUri: string
    codeChallenge: string
    nonce: string | null
    scopes: OidcScope[]
    authTime: Date
  },
): Promise<string> {
  const code = generateOpaqueToken()
  await deps.store.createAuthorizationCode({
    codeHash: await opaqueTokenHash(deps, code),
    grantId: input.grant.id,
    environmentId: input.client.environment.id,
    redirectUri: input.redirectUri,
    codeChallenge: input.codeChallenge,
    nonce: input.nonce,
    scopes: input.scopes,
    authTime: input.authTime,
    expiresAt: new Date(
      deps.now().getTime() + oidcLifetimes.authorizationCode * secondMs,
    ),
  })
  return code
}

/**
 * Revokes a refresh family (recording it, so nothing more is issued in it)
 * and the access tokens minted in it.
 */
export function revokeTokenFamily(
  deps: AppDeps,
  familyId: string,
): Promise<void> {
  return deps.store.revokeTokenFamily(familyId, deps.now())
}
