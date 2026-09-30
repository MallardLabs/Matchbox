import {
  type AuthorizationRequestView,
  authorizationDecisionRequestSchema,
  authorizationDecisionResponseSchema,
  authorizationRequestViewSchema,
  idPathParamsSchema,
} from "@repo/platform-contracts/identity"
import { networkNames } from "@repo/platform-contracts/network"
import { redirectUriMatches } from "@repo/platform-contracts/redirects"
import {
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

/** Consent screen data and the Allow / Cancel decision. */

type LoadedRequest = {
  request: AuthorizationRequestRecord
  client: ClientRecord
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

export default function consentRoutes(deps: AppDeps): Hono {
  const app = new Hono()

  async function loadRequest(
    id: string,
    active: ActiveSession,
  ): Promise<LoadedRequest> {
    const request = await deps.store.findAuthorizationRequest(id)
    const now = deps.now()
    if (
      request === null ||
      request.consumedAt !== null ||
      request.expiresAt <= now
    ) {
      throw new PlatformError("not_found", { message: "Request expired." })
    }
    const client = await deps.store.findEnvironment(request.environmentId)
    if (client === null) throw new PlatformError("not_found")
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
        }
      }),
      existingGrant:
        grant === null
          ? null
          : {
              id: grant.id,
              scopes: grant.scopes,
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
    const { decision } = await jsonBody(c, authorizationDecisionRequestSchema)
    const loaded = await loadRequest(id, active)
    if (decision === "approve" && loaded.reauthenticationRequired) {
      throw new PlatformError("forbidden", { message: "Sign in again." })
    }
    if (decision === "approve" && loaded.networkSignInRequired) {
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

    let redirectTo: string
    if (client.app.status === "suspended" || client.app.status === "retired") {
      redirectTo = denied("app-unavailable")
    } else if (decision === "deny") {
      redirectTo = denied(
        consent.unavailable.size > 0 &&
          [...consent.unavailable.values()].includes("discord-not-linked")
          ? "discord-not-linked"
          : "user-denied",
      )
    } else if (!consent.approvable) {
      redirectTo = denied(
        [...consent.unavailable.values()].includes("discord-not-linked")
          ? "discord-not-linked"
          : "scope-unavailable",
      )
    } else {
      const grant = await upsertGrant(deps, {
        account: active.account,
        client,
        scopes: request.scopes,
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
        scopes: request.scopes,
        authTime: active.session.createdAt,
      })
      redirectTo = clientCodeRedirectUrl({
        redirectUri: request.redirectUri,
        issuer: deps.config.issuer,
        code,
        state: request.state,
      })
    }
    return c.json(
      authorizationDecisionResponseSchema.parse({ redirectTo }),
      200,
      noStore,
    )
  })

  return app
}
