import {
  authorizationCodeTokenRequestSchema,
  oidcEndpointPaths,
  refreshTokenRequestSchema,
} from "@repo/platform-contracts/oidc"
import {
  type RateLimitPolicy,
  type RateLimitResult,
  rateLimitPolicies,
  resolveRateLimitPolicy,
} from "@repo/platform-contracts/rate-limits"
import {
  normalizeScopes,
  parseOidcScopeString,
  scopesCovered,
} from "@repo/platform-contracts/scopes"
import {
  currentRequestId,
  formBody,
  ipPrefix,
  rateLimitHeaders,
  requestLogger,
  verifyPkceS256,
} from "@repo/platform-server"
import { type Context, Hono } from "hono"
import { z } from "zod"
import type { AppDeps } from "../deps"
import { authenticateClient } from "../oidc/client-auth"
import { noStoreJson, oauthErrorResponse } from "../oidc/responses"
import {
  familyIdForCodeHash,
  issueTokens,
  opaqueTokenHash,
  revokeTokenFamily,
} from "../oidc/tokens"
import {
  type QuotaOverrideLookup,
  firstRateLimitRejection,
} from "../rate-limit"
import type { ClientRecord, GrantRecord } from "../store/id-store"

/** `POST /oauth/token`: authorization_code (+PKCE) and refresh_token. */

const rawFormSchema = z.record(z.string(), z.string())

/**
 * Failed token requests per client IP prefix. Only issued tokens spend the
 * environment's quota, so junk codes and refresh tokens sent with a public
 * `client_id` cannot drain it for the app's users. Charged only after a
 * request fails, never checked first: that would also refuse the prefix's
 * valid requests, so anyone sharing it could block them.
 */
const failedTokenRateLimitPolicy = {
  perMinute: 30,
  perDay: 1_000,
} as const satisfies RateLimitPolicy

/**
 * Anyone can get valid tokens for a public client by signing in with a
 * throwaway wallet, so tokens issued for one are capped per grant and per
 * IP prefix before they reach the environment's bucket.
 *
 * Per grant: access tokens last 10 minutes, so one user refreshing on a few
 * devices stays well below this, but one grant cannot rotate its refresh
 * token in a loop.
 */
const publicGrantRateLimitPolicy = {
  perMinute: 10,
  perDay: 500,
} as const satisfies RateLimitPolicy

/**
 * Per IP prefix: this share of the environment's policy, quota overrides
 * included, so draining it takes ten prefixes.
 */
const publicClientIpQuotaShare = 0.1

function policyShare(policy: RateLimitPolicy, share: number): RateLimitPolicy {
  return {
    perMinute: Math.max(1, Math.floor(policy.perMinute * share)),
    perDay: Math.max(1, Math.floor(policy.perDay * share)),
  }
}

type TokenContext = {
  c: Context
  deps: AppDeps
  client: ClientRecord
  form: Record<string, string>
  /**
   * Spends the environment's quota once the grant checks out; the 429 to
   * send when it is used up.
   */
  chargeEnvironment: (grant: GrantRecord) => Promise<Response | null>
}

function rateLimited(
  c: Context,
  deps: AppDeps,
  result: RateLimitResult,
): Response {
  return oauthErrorResponse(c, "temporarily_unavailable", {
    description: "Rate limit exceeded",
    status: 429,
    headers: rateLimitHeaders(result, deps.now().getTime()),
  })
}

async function activeGrantFor(
  deps: AppDeps,
  grantId: string,
  client: ClientRecord,
): Promise<GrantRecord | null> {
  const grant = await deps.store.findGrant(grantId)
  if (
    grant === null ||
    grant.revokedAt !== null ||
    grant.environmentId !== client.environment.id
  ) {
    return null
  }
  return grant
}

async function authorizationCodeGrant(
  context: TokenContext,
): Promise<Response> {
  const { c, deps, client } = context
  const parsed = authorizationCodeTokenRequestSchema.safeParse(context.form)
  if (!parsed.success) {
    return oauthErrorResponse(c, "invalid_request", {
      description: "code, redirect_uri and code_verifier are required",
    })
  }
  const request = parsed.data
  const now = deps.now()
  const codeHash = await opaqueTokenHash(deps, request.code)
  const invalidCode = () =>
    oauthErrorResponse(c, "invalid_grant", {
      description: "Invalid authorization code",
    })
  async function replayed(): Promise<Response> {
    // RFC 6749 §4.1.2: revoke what the first redemption issued.
    await revokeTokenFamily(deps, familyIdForCodeHash(codeHash))
    requestLogger(c).warn({
      message: "Authorization code replayed",
      clientId: client.environment.clientId,
    })
    return invalidCode()
  }
  // Everything is checked before the code is consumed, so a wrong request
  // (or a 429) does not burn a code the client is still redeeming, and only
  // the code's own client with its PKCE verifier can trigger the replay
  // revocation.
  const code = await deps.store.findAuthorizationCode(codeHash)
  if (
    code === null ||
    code.environmentId !== client.environment.id ||
    code.redirectUri !== request.redirect_uri
  ) {
    return invalidCode()
  }
  if (!(await verifyPkceS256(request.code_verifier, code.codeChallenge))) {
    return oauthErrorResponse(c, "invalid_grant", {
      description: "PKCE verification failed",
    })
  }
  if (code.consumedAt !== null) return replayed()
  if (code.expiresAt <= now) return invalidCode()
  const grant = await activeGrantFor(deps, code.grantId, client)
  const account =
    grant === null ? null : await deps.store.findAccount(grant.accountId)
  if (grant === null || account === null || account.disabledAt !== null) {
    return oauthErrorResponse(c, "invalid_grant", {
      description: "Grant is no longer active",
    })
  }
  const limited = await context.chargeEnvironment(grant)
  if (limited !== null) return limited
  // A concurrent redemption may have consumed it since the read above.
  if ((await deps.store.consumeAuthorizationCode(codeHash, now)) === null) {
    return replayed()
  }
  const issued = await issueTokens(deps, {
    client,
    grant,
    account,
    scopes: code.scopes,
    refreshScopes: code.scopes,
    authTime: code.authTime,
    nonce: code.nonce,
    familyId: familyIdForCodeHash(codeHash),
    persistence: { kind: "code" },
  })
  if (!issued.ok) {
    // A concurrent replay revoked the family first: nothing was issued.
    return oauthErrorResponse(c, "invalid_grant", {
      description:
        issued.reason === "grant-revoked"
          ? "Grant is no longer active"
          : "Invalid authorization code",
    })
  }
  return noStoreJson(c, issued.tokens)
}

async function refreshTokenGrant(context: TokenContext): Promise<Response> {
  const { c, deps, client } = context
  const parsed = refreshTokenRequestSchema.safeParse(context.form)
  if (!parsed.success) {
    return oauthErrorResponse(c, "invalid_request", {
      description: "refresh_token is required",
    })
  }
  const request = parsed.data
  const now = deps.now()
  const invalid = () =>
    oauthErrorResponse(c, "invalid_grant", {
      description: "Invalid refresh token",
    })
  const token = await deps.store.findRefreshTokenByHash(
    await opaqueTokenHash(deps, request.refresh_token),
  )
  if (token === null) return invalid()
  const grant = await activeGrantFor(deps, token.grantId, client)
  if (grant === null) return invalid()
  if (token.revokedAt !== null || token.expiresAt <= now) return invalid()

  async function reuseDetected(alreadyRevoked: boolean): Promise<Response> {
    if (token === null || grant === null) return invalid()
    if (!alreadyRevoked) await revokeTokenFamily(deps, token.familyId)
    await deps.store.recordAudit({
      actorType: "system",
      actorId: null,
      organizationId: client.app.organizationId,
      appId: client.app.id,
      environmentId: client.environment.id,
      action: "refresh-token-reuse-detected",
      targetType: "grant",
      targetId: grant.id,
      metadata: { familyId: token.familyId },
      ipPrefix: ipPrefix(c.req.raw),
      requestId: currentRequestId(c),
    })
    return invalid()
  }
  if (token.rotatedAt !== null) return reuseDetected(false)

  let scopes = token.scopes
  if (request.scope !== undefined) {
    const requested = parseOidcScopeString(request.scope)
    if (!requested.ok || !scopesCovered(token.scopes, requested.scopes)) {
      return oauthErrorResponse(c, "invalid_scope", {
        description: "Requested scope exceeds the original grant",
      })
    }
    scopes = requested.scopes
  }
  scopes = normalizeScopes(
    scopes.filter((scope) => grant.scopes.includes(scope)),
  )
  if (!scopes.includes("openid")) {
    return oauthErrorResponse(c, "invalid_scope", {
      description: "openid scope is required",
    })
  }
  const account = await deps.store.findAccount(grant.accountId)
  if (account === null || account.disabledAt !== null) return invalid()
  const limited = await context.chargeEnvironment(grant)
  if (limited !== null) return limited
  // Rotation is atomic: if another request rotated this token first, the
  // store revokes the whole family (including that request's successor).
  const issued = await issueTokens(deps, {
    client,
    grant,
    account,
    scopes,
    refreshScopes: token.scopes,
    authTime: token.authTime,
    nonce: null,
    familyId: token.familyId,
    persistence: { kind: "rotation", oldTokenHash: token.tokenHash },
  })
  if (!issued.ok) {
    return issued.reason === "reused" ? reuseDetected(true) : invalid()
  }
  return noStoreJson(c, issued.tokens)
}

async function tokenResponse(
  c: Context,
  deps: AppDeps,
  quotaOverrides: QuotaOverrideLookup,
): Promise<Response> {
  const form = await formBody(c, rawFormSchema)
  if (!form.ok) {
    return oauthErrorResponse(c, "invalid_request", {
      description:
        form.reason === "duplicate-parameter"
          ? "Repeated parameter"
          : "Expected an application/x-www-form-urlencoded body",
    })
  }
  const auth = await authenticateClient(c, deps, {
    client_id: form.data.client_id,
    client_secret: form.data.client_secret,
  })
  if (!auth.ok) {
    return oauthErrorResponse(c, auth.error, {
      description: auth.description,
      ...(auth.usedBasic
        ? { headers: { "WWW-Authenticate": 'Basic realm="matchbox-id"' } }
        : {}),
    })
  }
  const { client } = auth
  if (client.app.status === "suspended" || client.app.status === "retired") {
    return oauthErrorResponse(c, "unauthorized_client", {
      description: "App unavailable",
    })
  }
  async function chargeEnvironment(
    grant: GrantRecord,
  ): Promise<Response | null> {
    const prefix = ipPrefix(c.req.raw) ?? "unknown"
    const environmentId = client.environment.id
    const policy = resolveRateLimitPolicy({
      environmentKind: client.environment.kind,
      endpointClass: "oidc-token",
      appStatus: client.app.status,
      overrides: await quotaOverrides(environmentId),
      now: deps.now(),
    })
    const limited = await firstRateLimitRejection(deps, [
      ...(client.environment.clientType === "public"
        ? [
            {
              key: `oidc-token:grant:${grant.id}`,
              policy: publicGrantRateLimitPolicy,
            },
            {
              key: `oidc-token:env-ip:${environmentId}:${prefix}`,
              policy: policyShare(policy, publicClientIpQuotaShare),
            },
          ]
        : []),
      { key: `oidc-token:env:${environmentId}`, policy },
    ])
    return limited === null ? null : rateLimited(c, deps, limited)
  }

  const context = { c, deps, client, form: form.data, chargeEnvironment }
  const grantType = form.data.grant_type
  if (grantType === "authorization_code") {
    return authorizationCodeGrant(context)
  }
  if (grantType === "refresh_token") return refreshTokenGrant(context)
  if (grantType === undefined) {
    return oauthErrorResponse(c, "invalid_request", {
      description: "grant_type is required",
    })
  }
  return oauthErrorResponse(c, "unsupported_grant_type")
}

export default function tokenRoutes(
  deps: AppDeps,
  quotaOverrides: QuotaOverrideLookup,
): Hono {
  const app = new Hono()

  app.post(oidcEndpointPaths.token, async (c) => {
    const prefix = ipPrefix(c.req.raw) ?? "unknown"
    const ipLimited = await firstRateLimitRejection(deps, [
      {
        key: `oidc-token:ip:${prefix}`,
        policy: rateLimitPolicies.live["oidc-token"],
      },
    ])
    if (ipLimited !== null) return rateLimited(c, deps, ipLimited)

    const response = await tokenResponse(c, deps, quotaOverrides)
    // 400 / 401: a rejected request (bad client, code or refresh token).
    if (response.status !== 400 && response.status !== 401) return response
    const failedLimited = await firstRateLimitRejection(deps, [
      {
        key: `oidc-token:failed:${prefix}`,
        policy: failedTokenRateLimitPolicy,
      },
    ])
    return failedLimited === null
      ? response
      : rateLimited(c, deps, failedLimited)
  })

  return app
}
