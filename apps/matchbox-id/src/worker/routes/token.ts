import {
  authorizationCodeTokenRequestSchema,
  oidcEndpointPaths,
  refreshTokenRequestSchema,
} from "@repo/platform-contracts/oidc"
import {
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

type TokenContext = {
  c: Context
  deps: AppDeps
  client: ClientRecord
  form: Record<string, string>
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
  const code = await deps.store.consumeAuthorizationCode(codeHash, now)
  if (code === null) {
    const replayed = await deps.store.findAuthorizationCode(codeHash)
    if (replayed !== null) {
      // RFC 6749 §4.1.2: revoke what the first redemption issued.
      await revokeTokenFamily(deps, familyIdForCodeHash(codeHash))
      requestLogger(c).warn({
        message: "Authorization code replayed",
        clientId: client.environment.clientId,
      })
    }
    return oauthErrorResponse(c, "invalid_grant", {
      description: "Invalid authorization code",
    })
  }
  if (
    code.expiresAt <= now ||
    code.environmentId !== client.environment.id ||
    code.redirectUri !== request.redirect_uri
  ) {
    return oauthErrorResponse(c, "invalid_grant", {
      description: "Invalid authorization code",
    })
  }
  if (!(await verifyPkceS256(request.code_verifier, code.codeChallenge))) {
    return oauthErrorResponse(c, "invalid_grant", {
      description: "PKCE verification failed",
    })
  }
  const grant = await activeGrantFor(deps, code.grantId, client)
  const account =
    grant === null ? null : await deps.store.findAccount(grant.accountId)
  if (grant === null || account === null || account.disabledAt !== null) {
    return oauthErrorResponse(c, "invalid_grant", {
      description: "Grant is no longer active",
    })
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
    if (ipLimited !== null) {
      return oauthErrorResponse(c, "temporarily_unavailable", {
        description: "Rate limit exceeded",
        status: 429,
        headers: rateLimitHeaders(ipLimited, deps.now().getTime()),
      })
    }

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
    const clientLimited = await firstRateLimitRejection(deps, [
      {
        key: `oidc-token:env:${client.environment.id}`,
        policy: resolveRateLimitPolicy({
          environmentKind: client.environment.kind,
          endpointClass: "oidc-token",
          appStatus: client.app.status,
          overrides: await quotaOverrides(client.environment.id),

          now: deps.now(),
        }),
      },
    ])
    if (clientLimited !== null) {
      return oauthErrorResponse(c, "temporarily_unavailable", {
        description: "Rate limit exceeded",
        status: 429,
        headers: rateLimitHeaders(clientLimited, deps.now().getTime()),
      })
    }

    const context = { c, deps, client, form: form.data }
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
  })

  return app
}
