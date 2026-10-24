import {
  oidcEndpointPaths,
  revokeRequestSchema,
} from "@repo/platform-contracts/oidc"
import { formBody } from "@repo/platform-server"
import { type Context, Hono } from "hono"
import type { AppDeps } from "../deps"
import { authenticateClient } from "../oidc/client-auth"
import { noStoreHeaders, oauthErrorResponse } from "../oidc/responses"
import {
  issuedAccessTokenClaimsSchema,
  opaqueTokenHash,
  revokeTokenFamily,
} from "../oidc/tokens"
import type { ClientRecord } from "../store/id-store"

/**
 * `POST /oauth/revoke` (RFC 7009). Always 200 for any token the client
 * presents — unknown, expired or foreign tokens included — once the client
 * has authenticated. Refresh tokens revoke their family; access tokens are
 * revoked by `jti`.
 */

async function revokeRefreshToken(
  deps: AppDeps,
  client: ClientRecord,
  token: string,
): Promise<boolean> {
  const record = await deps.store.findRefreshTokenByHash(
    await opaqueTokenHash(deps, token),
  )
  if (record === null) return false
  const grant = await deps.store.findGrant(record.grantId)
  if (grant?.environmentId === client.environment.id) {
    await revokeTokenFamily(deps, record.familyId)
  }
  return true
}

async function revokeAccessToken(
  deps: AppDeps,
  client: ClientRecord,
  token: string,
): Promise<boolean> {
  // Signature is checked so a forged jti cannot revoke someone else's token;
  // expiry is not (revoking an expired token is harmless).
  const verified = await deps.keys.verify(token, {
    issuer: deps.config.issuer,
    type: "at+jwt",
    currentDate: new Date(0),
  })
  const claims = issuedAccessTokenClaimsSchema.safeParse(verified)

  if (!claims.success) return false
  if (claims.data.client_id !== client.environment.clientId) return true
  await deps.store.revokeAccessToken(claims.data.jti, deps.now())
  return true
}

export default function revokeRoutes(deps: AppDeps): Hono {
  const app = new Hono()

  app.post(oidcEndpointPaths.revocation, async (c: Context) => {
    const form = await formBody(c, revokeRequestSchema)
    if (!form.ok) {
      return oauthErrorResponse(c, "invalid_request", {
        description: "token is required",
      })
    }
    const auth = await authenticateClient(c, deps, form.data)
    if (!auth.ok) {
      return oauthErrorResponse(c, auth.error, {
        description: auth.description,
        ...(auth.usedBasic
          ? { headers: { "WWW-Authenticate": 'Basic realm="matchbox-id"' } }
          : {}),
      })
    }
    const { token, token_type_hint: hint } = form.data
    const order =
      hint === "access_token"
        ? [revokeAccessToken, revokeRefreshToken]
        : [revokeRefreshToken, revokeAccessToken]
    for (const attempt of order) {
      if (await attempt(deps, auth.client, token)) break
    }
    return c.body(null, 200, { ...noStoreHeaders })
  })

  return app
}
