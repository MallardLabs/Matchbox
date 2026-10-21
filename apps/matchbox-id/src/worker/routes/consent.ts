import { resolveConsentDecision } from "@repo/platform-contracts/consent"
import {
  type AuthorizationRequestSummary,
  type AuthorizationRequestView,
  type ScopeUnavailableReason,
  authorizationDecisionRequestSchema,
  authorizationDecisionResponseSchema,
  authorizationRequestSummarySchema,
  authorizationRequestViewSchema,
  idPathParamsSchema,
} from "@repo/platform-contracts/identity"
import { networkNames } from "@repo/platform-contracts/network"
import { redirectUriMatches } from "@repo/platform-contracts/redirects"
import {
  type OidcScope,
  claimLabels,
  diffScopes,
  scopeDefinitions,
} from "@repo/platform-contracts/scopes"
import {
  PlatformError,
  currentRequestId,
  ipPrefix,
  jsonBody,
  pathParams,
  rateLimitHeaders,
} from "@repo/platform-server"
import { Hono } from "hono"
import { errorPageUrl } from "../../shared/error-page"
import type { AppDeps } from "../deps"
import { claimPreviewValue, evaluateConsent } from "../oidc/claims"
import { upsertGrant } from "../oidc/grants"
import {
  clientCodeRedirectUrl,
  clientErrorRedirectUrl,
} from "../oidc/responses"
import { createAuthorizationCode } from "../oidc/tokens"
import { firstRateLimitRejection } from "../rate-limit"
import {
  type ActiveSession,
  requireSession,
  sessionVerifiedFor,
} from "../session"
import type {
  AuthorizationRequestRecord,
  ClientRecord,
  DiscordLinkRecord,
  EnvironmentRecord,
} from "../store/id-store"
import { authorizeIpRateLimitPolicy } from "./authorize"

/** Consent screen data and the Allow / Cancel decision. */

type OpenRequest = {
  request: AuthorizationRequestRecord
  client: ClientRecord
}

type LoadedRequest = OpenRequest & {
  discordLink: DiscordLinkRecord | null
  consent: ReturnType<typeof evaluateConsent>
  reauthenticationRequired: boolean
  networkSignInRequired: boolean
}

/**
 * The consent screen's "verified" badge: only a live environment whose
 * review is approved, for confidential and public clients alike. Nothing
 * carries over from grants made under another client type (a
 * confidential→public flip bumps `scope_version`, which forces consent).
 */
export function consentVerified(environment: EnvironmentRecord): boolean {
  return environment.kind === "live" && environment.reviewState === "approved"
}

function isAppUnavailable(client: ClientRecord): boolean {
  return client.app.status === "suspended" || client.app.status === "retired"
}

/** `error_description` when required scopes cannot be granted. */
function unavailableDescription(
  scopes: readonly OidcScope[],
  unavailable: ReadonlyMap<OidcScope, ScopeUnavailableReason>,
): "discord-not-linked" | "scope-unavailable" {
  return scopes.some((scope) => unavailable.get(scope) === "discord-not-linked")
    ? "discord-not-linked"
    : "scope-unavailable"
}

export default function consentRoutes(deps: AppDeps): Hono {
  const app = new Hono()

  /** Unconsumed, unexpired request and its client; null otherwise. */
  async function openRequest(id: string): Promise<OpenRequest | null> {
    const request = await deps.store.findAuthorizationRequest(id)
    if (
      request === null ||
      request.consumedAt !== null ||
      request.expiresAt <= deps.now()
    ) {
      return null
    }
    const client = await deps.store.findEnvironment(request.environmentId)
    return client === null ? null : { request, client }
  }

  async function loadRequest(
    id: string,
    active: ActiveSession,
  ): Promise<LoadedRequest> {
    const opened = await openRequest(id)
    if (opened === null) {
      throw new PlatformError("not_found", { message: "Request expired." })
    }
    const { request, client } = opened
    const [grant, discordLink] = await Promise.all([
      deps.store.findActiveGrant(active.account.id, client.environment.id),
      deps.store.findDiscordLink(active.account.walletAddress),
    ])
    const consent = evaluateConsent({
      grant,
      environment: client.environment,
      scopes: request.scopes,
      discordLink,
      flags: deps.flags,
    })
    return {
      request,
      client,
      discordLink,
      consent,
      reauthenticationRequired:
        request.prompt === "login" &&
        active.session.createdAt < request.createdAt,
      networkSignInRequired: !sessionVerifiedFor(
        active.session,
        client.environment.network,
      ),
    }
  }

  // "Continue to <app>" before sign-in. Request ids are random, short-lived
  // and only ever reach the visitor's own browser.
  app.get("/api/authorization-requests/:id/summary", async (c) => {
    const rejected = await firstRateLimitRejection(deps, [
      {
        key: `authorize-summary:ip:${ipPrefix(c.req.raw) ?? "unknown"}`,
        policy: authorizeIpRateLimitPolicy,
      },
    ])
    if (rejected !== null) {
      throw new PlatformError("rate_limited", {
        headers: rateLimitHeaders(rejected, deps.now().getTime()),
      })
    }
    const { id } = pathParams(c, idPathParamsSchema)
    const opened = await openRequest(id)
    if (opened === null || isAppUnavailable(opened.client)) {
      throw new PlatformError("not_found", { message: "Request expired." })
    }
    const { app: clientApp, environment } = opened.client
    const summary: AuthorizationRequestSummary = {
      app: {
        name: clientApp.name,
        logoUrl: clientApp.logoUrl,
        verified: consentVerified(environment),
      },
      environmentKind: environment.kind,
      network: environment.network,
    }
    return c.json(authorizationRequestSummarySchema.parse(summary), 200, {
      "Cache-Control": "no-store",
    })
  })

  app.get("/api/authorization-requests/:id", async (c) => {
    const active = await requireSession(c, deps)
    const { id } = pathParams(c, idPathParamsSchema)
    const loaded = await loadRequest(id, active)
    const { request, client, consent, discordLink } = loaded
    const { app: clientApp, environment } = client
    if (clientApp.status === "suspended" || clientApp.status === "retired") {
      throw new PlatformError("not_found")
    }
    const grant = consent.grant
    const previous = grant?.scopes ?? []
    const declined = grant?.declinedScopes ?? []
    const required = new Set(consent.required)
    const redirect = new URL(request.redirectUri)
    const view: AuthorizationRequestView = {
      id: request.id,
      app: {
        name: clientApp.name,
        logoUrl: clientApp.logoUrl,
        websiteUrl: clientApp.websiteUrl,
        privacyUrl: clientApp.privacyUrl,
        termsUrl: clientApp.termsUrl,
        status: clientApp.status,
        verified: consentVerified(environment),
      },
      environmentKind: environment.kind,
      network: environment.network,
      redirectOrigin: redirect.origin,
      redirectHost: redirect.host,
      scopes: request.scopes.map((scope) => {
        const definition = scopeDefinitions[scope]
        return {
          scope,
          label: definition.label,
          description: definition.consentDescription,
          claims: definition.claims.map((claim) => ({
            claim,
            label: claimLabels[claim],
            value: claimPreviewValue({
              claim,
              account: active.account,
              environment,
              discordLink,
            }),
          })),
          available: !consent.unavailable.has(scope),
          unavailableReason: consent.unavailable.get(scope) ?? null,
          previouslyGranted:
            grant !== null &&
            grant.scopeVersion === environment.scopeVersion &&
            previous.includes(scope),
          requirement: required.has(scope) ? "required" : "optional",
          // Not tied to the scope version: a past "no" stays the default.
          previouslyDeclined: declined.includes(scope),
        }
      }),
      existingGrant:
        grant === null
          ? null
          : {
              id: grant.id,
              scopes: grant.scopes,
              declinedScopes: grant.declinedScopes,
              createdAt: grant.createdAt.toISOString(),
            },
      diff: diffScopes(previous, request.scopes),
      approvable: consent.approvable,
      expiresAt: request.expiresAt.toISOString(),
      consentRequired: !consent.covered || request.prompt === "consent",
      reauthenticationRequired: loaded.reauthenticationRequired,
      networkSignInRequired: loaded.networkSignInRequired,
    }
    return c.json(authorizationRequestViewSchema.parse(view), 200, {
      "Cache-Control": "no-store",
    })
  })

  app.post("/api/authorization-requests/:id/decision", async (c) => {
    const active = await requireSession(c, deps)
    const { id } = pathParams(c, idPathParamsSchema)
    const body = await jsonBody(c, authorizationDecisionRequestSchema)
    const loaded = await loadRequest(id, active)
    if (body.decision === "approve" && loaded.reauthenticationRequired) {
      throw new PlatformError("forbidden", { message: "Sign in again." })
    }
    if (body.decision === "approve" && loaded.networkSignInRequired) {
      throw new PlatformError("forbidden", {
        message: `Sign in on ${networkNames[loaded.client.environment.network]}.`,
      })
    }
    const request = await deps.store.consumeAuthorizationRequest(id, deps.now())
    if (request === null) {
      throw new PlatformError("not_found", { message: "Request expired." })
    }
    const { client, consent } = loaded
    const noStore = {
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
    } as const
    // The redirect URI may have been removed since /oauth/authorize: never
    // send the code (or an error) to a URI that is no longer registered.
    if (!redirectUriMatches(client.redirectUris, request.redirectUri)) {
      return c.json(
        authorizationDecisionResponseSchema.parse({
          redirectTo: errorPageUrl(
            new URL(c.req.url).origin,
            "invalid_redirect_uri",
          ),
        }),
        200,
        noStore,
      )
    }
    const denied = (description: string) =>
      clientErrorRedirectUrl({
        redirectUri: request.redirectUri,
        issuer: deps.config.issuer,
        code: "access_denied",
        description,
        state: request.state,
      })
    const requiredUnavailable = consent.required.filter((scope) =>
      consent.unavailable.has(scope),
    )

    let redirectTo: string
    if (isAppUnavailable(client)) {
      redirectTo = denied("app-unavailable")
    } else if (body.decision === "deny") {
      redirectTo = denied(
        unavailableDescription(requiredUnavailable, consent.unavailable) ===
          "discord-not-linked"
          ? "discord-not-linked"
          : "user-denied",
      )
    } else {
      const decided = resolveConsentDecision({
        requested: request.scopes,
        optionalScopes: client.environment.optionalScopes,
        unavailable: [...consent.unavailable.keys()],
        // Omitted: keep the choices on the existing grant (silent approval).
        declined: body.declinedScopes ?? consent.grant?.declinedScopes ?? [],
      })
      if (!decided.ok) {
        redirectTo = denied(
          decided.reason === "required-scope-declined"
            ? "required-scope-declined"
            : unavailableDescription(decided.scopes, consent.unavailable),
        )
      } else {
        const grant = await upsertGrant(deps, {
          account: active.account,
          client,
          requested: request.scopes,
          granted: decided.granted,
          declined: decided.declined,
          existing: consent.grant,
          discordLink: loaded.discordLink,
          audit: {
            ipPrefix: ipPrefix(c.req.raw),
            requestId: currentRequestId(c),
          },
        })
        const code = await createAuthorizationCode(deps, {
          grant,
          client,
          redirectUri: request.redirectUri,
          codeChallenge: request.codeChallenge,
          nonce: request.nonce,
          scopes: decided.granted,
          authTime: active.session.createdAt,
        })
        redirectTo = clientCodeRedirectUrl({
          redirectUri: request.redirectUri,
          issuer: deps.config.issuer,
          code,
          state: request.state,
        })
      }
    }
    return c.json(
      authorizationDecisionResponseSchema.parse({ redirectTo }),
      200,
      noStore,
    )
  })

  return app
}
