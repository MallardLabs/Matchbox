import { bearerToken } from "@repo/platform-contracts/credentials"
import {
  oidcEndpointPaths,
  userinfoResponseSchema,
} from "@repo/platform-contracts/oidc"
import {
  rateLimitPolicies,
  resolveRateLimitPolicy,
} from "@repo/platform-contracts/rate-limits"
import { parseOidcScopeString } from "@repo/platform-contracts/scopes"
import { ipPrefix, rateLimitHeaders } from "@repo/platform-server"
import { type Context, Hono } from "hono"
import type { AppDeps } from "../deps"
import { releasedClaims } from "../oidc/claims"
import { noStoreJson, oauthErrorResponse } from "../oidc/responses"
import { issuedAccessTokenClaimsSchema, pairwiseSubject } from "../oidc/tokens"
import {
  type QuotaOverrideLookup,
  firstRateLimitRejection,
} from "../rate-limit"

/** `GET|POST /oauth/userinfo` (OIDC Core §5.3) with a bearer access token. */

function invalidToken(c: Context, description: string): Response {
  return oauthErrorResponse(c, "invalid_token", {
    description,
    headers: {
      "WWW-Authenticate": `Bearer realm="matchbox-id", error="invalid_token", error_description="${description}"`,
    },
  })
}

export default function userinfoRoutes(
  deps: AppDeps,
  quotaOverrides: QuotaOverrideLookup,
): Hono {
  const app = new Hono()

  async function handle(c: Context): Promise<Response> {
    const now = deps.now()
    const prefix = ipPrefix(c.req.raw) ?? "unknown"
    const ipLimited = await firstRateLimitRejection(deps, [
      { key: `userinfo:ip:${prefix}`, policy: rateLimitPolicies.live.userinfo },
    ])
    if (ipLimited !== null) {
      return oauthErrorResponse(c, "temporarily_unavailable", {
        description: "Rate limit exceeded",
        status: 429,
        headers: rateLimitHeaders(ipLimited, now.getTime()),
      })
    }

    const token = bearerToken(c.req.header("Authorization") ?? null)
    if (token === null) {
      return oauthErrorResponse(c, "invalid_request", {
        description: "Bearer token required",
        status: 401,
        headers: { "WWW-Authenticate": 'Bearer realm="matchbox-id"' },
      })
    }
    // `aud` is the client id; the grant lookup below pins it to the client
    // the token was issued to.
    const payload = await deps.keys.verify(token, {
      issuer: deps.config.issuer,
      type: "at+jwt",
      currentDate: now,
    })
    const claims = issuedAccessTokenClaimsSchema.safeParse(payload)
    if (!claims.success) return invalidToken(c, "Invalid access token")

    const record = await deps.store.findAccessToken(claims.data.jti)
    if (
      record === null ||
      record.revokedAt !== null ||
      record.expiresAt <= now
    ) {
      return invalidToken(c, "Access token revoked")
    }
    const grant = await deps.store.findGrant(record.grantId)
    const client =
      grant === null
        ? null
        : await deps.store.findEnvironment(grant.environmentId)
    const account =
      grant === null ? null : await deps.store.findAccount(grant.accountId)
    if (
      grant === null ||
      grant.revokedAt !== null ||
      client === null ||
      account === null ||
      account.disabledAt !== null ||
      client.environment.clientId !== claims.data.client_id ||
      client.app.status === "suspended" ||
      client.app.status === "retired"
    ) {
      return invalidToken(c, "Grant inactive")
    }
    const discordLink = await deps.store.findDiscordLink(account.walletAddress)
    if (
      grant.discordUserId !== null &&
      discordLink?.discordUserId !== grant.discordUserId
    ) {
      return invalidToken(c, "Grant inactive")
    }

    const clientLimited = await firstRateLimitRejection(deps, [
      {
        key: `userinfo:env:${client.environment.id}`,
        policy: resolveRateLimitPolicy({
          environmentKind: client.environment.kind,
          endpointClass: "userinfo",
          appStatus: client.app.status,
          overrides: await quotaOverrides(client.environment.id),

          now,
        }),
      },
    ])
    if (clientLimited !== null) {
      return oauthErrorResponse(c, "temporarily_unavailable", {
        description: "Rate limit exceeded",
        status: 429,
        headers: rateLimitHeaders(clientLimited, now.getTime()),
      })
    }

    const scopes = parseOidcScopeString(claims.data.scope)
    const subject = await pairwiseSubject(deps, account, client)
    const body = userinfoResponseSchema.parse({
      sub: subject,
      ...releasedClaims({
        scopes: scopes.ok ? scopes.scopes : [],
        account,
        environment: client.environment,
        grant,
        discordLink,
        flags: deps.flags,
      }),
    })
    return noStoreJson(c, body)
  }

  app.get(oidcEndpointPaths.userinfo, handle)
  app.post(oidcEndpointPaths.userinfo, handle)
  return app
}
