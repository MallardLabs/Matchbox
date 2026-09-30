import type { OAuthErrorCode } from "@repo/platform-contracts/errors"
import {
  authorizeClientParamsSchema,
  authorizeRequestSchema,
  oidcLifetimes,
} from "@repo/platform-contracts/oidc"
import {
  type RateLimitPolicy,
  resolveRateLimitPolicy,
} from "@repo/platform-contracts/rate-limits"
import { redirectUriMatches } from "@repo/platform-contracts/redirects"
import {
  isDiscordScope,
  parseOidcScopeString,
} from "@repo/platform-contracts/scopes"
import { ipPrefix } from "@repo/platform-server"
import { Hono } from "hono"
import type { AppDeps } from "../deps"
import { environmentOidcScopes, evaluateConsent } from "../oidc/claims"
import {
  clientCodeRedirectUrl,
  clientErrorRedirectUrl,
  errorPageRedirect,
  redirect,
} from "../oidc/responses"
import { createAuthorizationCode } from "../oidc/tokens"
import {
  type QuotaOverrideLookup,
  firstRateLimitRejection,
} from "../rate-limit"
import { loadSession, sessionVerifiedFor } from "../session"
import type { ClientRecord } from "../store/id-store"

/**
 * `GET /oauth/authorize`. The client and exact redirect URI are validated
 * first; until both pass, errors go to the SPA error page (never to the
 * client). Afterwards errors are returned to the redirect URI with `state`.
 */

const maxStateLength = 1024

/**
 * Per client IP prefix, before any lookup: every request that reaches
 * consent stores an `mbx_id_authorization_requests` row. The per-client
 * bucket (`oidc-token` policy + quota overrides) guards the same insert.
 */
export const authorizeIpRateLimitPolicy = {
  perMinute: 60,
  perDay: 2_000,
} as const satisfies RateLimitPolicy

type SingleValuedParams =
  | { ok: true; values: Record<string, string> }
  | { ok: false; repeated: string }

function singleValued(params: URLSearchParams): SingleValuedParams {
  const values: Record<string, string> = {}
  for (const [key, value] of params) {
    if (key in values) return { ok: false, repeated: key }
    if (value.length > 0) values[key] = value
  }
  return { ok: true, values }
}

function describeRequestIssue(path: string): string {
  if (path === "code_challenge" || path === "code_challenge_method") {
    return "PKCE with code_challenge_method=S256 is required"
  }
  if (path === "state") return "state is required"
  if (path === "prompt") return "Unsupported prompt"
  return `Invalid ${path}`
}

export default function authorizeRoutes(
  deps: AppDeps,
  quotaOverrides: QuotaOverrideLookup,
): Hono {
  const app = new Hono()

  async function verifiedClient(
    clientId: string,
    redirectUri: string,
  ): Promise<ClientRecord | "invalid_client" | "invalid_redirect_uri"> {
    const client = await deps.store.findClient(clientId)
    if (client === null) return "invalid_client"
    if (!redirectUriMatches(client.redirectUris, redirectUri)) {
      return "invalid_redirect_uri"
    }
    return client
  }

  app.get("/oauth/authorize", async (c) => {
    const ipLimited = await firstRateLimitRejection(deps, [
      {
        key: `authorize:ip:${ipPrefix(c.req.raw) ?? "unknown"}`,
        policy: authorizeIpRateLimitPolicy,
      },
    ])
    if (ipLimited !== null) {
      return errorPageRedirect(c, "temporarily_unavailable")
    }
    const url = new URL(c.req.url)
    const single = singleValued(url.searchParams)

    if (!single.ok) {
      const clientParams = authorizeClientParamsSchema.safeParse({
        client_id: url.searchParams.get("client_id"),
        redirect_uri: url.searchParams.get("redirect_uri"),
      })
      const repeatedClientParam =
        single.repeated === "client_id" || single.repeated === "redirect_uri"
      if (!repeatedClientParam && clientParams.success) {
        const client = await verifiedClient(
          clientParams.data.client_id,
          clientParams.data.redirect_uri,
        )
        if (typeof client !== "string") {
          return redirect(
            c,
            clientErrorRedirectUrl({
              redirectUri: clientParams.data.redirect_uri,
              issuer: deps.config.issuer,
              code: "invalid_request",
              description: `Repeated parameter: ${single.repeated}`,
              state: null,
            }),
          )
        }
      }
      return errorPageRedirect(c, "invalid_request")
    }

    const raw = single.values
    const clientParams = authorizeClientParamsSchema.safeParse(raw)
    if (!clientParams.success) {
      return errorPageRedirect(
        c,
        raw.client_id === undefined ? "invalid_request" : "invalid_client",
      )
    }
    const redirectUri = clientParams.data.redirect_uri
    const client = await verifiedClient(
      clientParams.data.client_id,
      redirectUri,
    )
    if (typeof client === "string") return errorPageRedirect(c, client)

    // From here on, errors are returned to the verified redirect URI.
    const state =
      raw.state !== undefined && raw.state.length <= maxStateLength
        ? raw.state
        : null
    function fail(code: OAuthErrorCode, description?: string): Response {
      return redirect(
        c,
        clientErrorRedirectUrl({
          redirectUri,
          issuer: deps.config.issuer,
          code,
          ...(description === undefined ? {} : { description }),
          state,
        }),
      )
    }

    if (raw.response_type === undefined) {
      return fail("invalid_request", "response_type is required")
    }
    if (raw.response_type !== "code") return fail("unsupported_response_type")
    if (client.app.status === "suspended" || client.app.status === "retired") {
      return fail("access_denied", "app-unavailable")
    }
    const parsed = authorizeRequestSchema.safeParse(raw)
    if (!parsed.success) {
      const path = String(parsed.error.issues[0]?.path[0] ?? "request")
      return fail("invalid_request", describeRequestIssue(path))
    }
    const request = parsed.data

    const scopeResult = parseOidcScopeString(request.scope)
    if (!scopeResult.ok) return fail("invalid_scope", "Unknown scope")
    const scopes = scopeResult.scopes
    if (!scopes.includes("openid")) {
      return fail("invalid_scope", "openid scope is required")
    }
    if (
      !deps.flags.discordClaims &&
      scopes.some((scope) => isDiscordScope(scope))
    ) {
      return fail("invalid_scope", "Discord scopes are unavailable")
    }
    const allowed = new Set(
      environmentOidcScopes(client.environment, deps.flags),
    )
    if (scopes.some((scope) => !allowed.has(scope))) {
      return fail("invalid_scope", "Scope not approved for this client")
    }

    const now = deps.now()
    const prompt = request.prompt ?? null
    const active = await loadSession(c, deps)
    // A contract-account session signed on another network does not prove
    // control of this wallet on the client's network: sign in again there.
    const verifiedHere =
      active !== null &&
      sessionVerifiedFor(active.session, client.environment.network)

    // Silent approval: an existing grant covers the request (unless the
    // client asked for a fresh login or consent screen).
    if (
      active !== null &&
      verifiedHere &&
      (prompt === null || prompt === "none")
    ) {
      const [grant, discordLink] = await Promise.all([
        deps.store.findActiveGrant(active.account.id, client.environment.id),
        deps.store.findDiscordLink(active.account.walletAddress),
      ])
      const consent = evaluateConsent({
        grant,
        environment: client.environment,
        scopes,
        discordLink,
        flags: deps.flags,
      })
      if (consent.covered && consent.grant !== null) {
        const code = await createAuthorizationCode(deps, {
          grant: consent.grant,
          client,
          redirectUri,
          codeChallenge: request.code_challenge,
          nonce: request.nonce ?? null,
          scopes,
          authTime: active.session.createdAt,
        })
        return redirect(
          c,
          clientCodeRedirectUrl({
            redirectUri,
            issuer: deps.config.issuer,
            code,
            state: request.state,
          }),
        )
      }
    }
    if (prompt === "none") {
      return fail(verifiedHere ? "consent_required" : "login_required")
    }

    const clientLimited = await firstRateLimitRejection(deps, [
      {
        key: `authorize:env:${client.environment.id}`,
        policy: resolveRateLimitPolicy({
          environmentKind: client.environment.kind,
          endpointClass: "oidc-token",
          appStatus: client.app.status,
          overrides: await quotaOverrides(client.environment.id),
          now,
        }),
      },
    ])
    if (clientLimited !== null) {
      return fail("temporarily_unavailable", "Rate limit exceeded")
    }

    const stored = await deps.store.createAuthorizationRequest({
      environmentId: client.environment.id,
      redirectUri,
      state: request.state,
      scopes,
      codeChallenge: request.code_challenge,
      nonce: request.nonce ?? null,
      prompt,
      createdAt: now,
      expiresAt: new Date(
        now.getTime() + oidcLifetimes.authorizationRequest * 1000,
      ),
    })
    const target = new URL("/authorize", url.origin)
    target.searchParams.set("request", stored.id)
    return redirect(c, target.href)
  })

  return app
}
