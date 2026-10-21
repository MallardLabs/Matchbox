import { okResponseSchema } from "@repo/platform-contracts/common"
import {
  idPathParamsSchema,
  sessionListResponseSchema,
} from "@repo/platform-contracts/identity"
import {
  type NetworkSlug,
  networkForChainId,
} from "@repo/platform-contracts/network"
import { oidcScopesOf } from "@repo/platform-contracts/scopes"
import {
  PlatformError,
  currentRequestId,
  ipPrefix,
  pathParams,
} from "@repo/platform-server"
import { Hono } from "hono"
import {
  type GrantListViewResponse,
  type IdentityAccountView,
  endedGrantLimit,
  grantListViewResponseSchema,
  sessionViewResponseSchema,
} from "../../shared/contracts"
import type { AppDeps } from "../deps"
import { discordAvatarUrl } from "../oidc/claims"
import {
  clearSessionCookie,
  loadSession,
  requireSession,
  sessionManages,
  sessionVerifiedFor,
} from "../session"
import type { AccountRecord, SessionRecord } from "../store/id-store"
import { consentVerified } from "./consent"

/**
 * Session, connected apps (grants) and device sessions for the SPA. A
 * contract-account session only sees and manages what belongs to the
 * network it signed on (the same address elsewhere may be someone else's).
 */

const noStore = { "Cache-Control": "no-store" } as const

/** Grants a session may see: its network only, for contract accounts. */
function sessionVisible(
  session: SessionRecord,
): (connected: { environment: { network: NetworkSlug } }) => boolean {
  return ({ environment }) => sessionVerifiedFor(session, environment.network)
}

export async function identityAccount(
  deps: AppDeps,
  account: AccountRecord,
  session: Pick<SessionRecord, "siweChainId" | "signerKind">,
): Promise<IdentityAccountView> {
  const link = await deps.store.findDiscordLink(account.walletAddress)
  return {
    walletAddress: account.walletAddress,
    signedInNetwork:
      session.siweChainId === null
        ? null
        : networkForChainId(session.siweChainId),
    signerKind: session.signerKind,
    discord:
      link === null
        ? null
        : {
            id: link.discordUserId,
            username: link.username,
            displayName: link.globalName,
            avatarUrl: discordAvatarUrl(link),
          },
  }
}

export default function accountRoutes(deps: AppDeps): Hono {
  const app = new Hono()

  app.get("/api/session", async (c) => {
    const active = await loadSession(c, deps)
    return c.json(
      sessionViewResponseSchema.parse({
        account:
          active === null
            ? null
            : await identityAccount(deps, active.account, active.session),
      }),
      200,
      noStore,
    )
  })

  app.post("/api/session/sign-out", async (c) => {
    const active = await loadSession(c, deps)
    if (active !== null) {
      await deps.store.revokeSession(
        active.account.id,
        active.session.id,
        deps.now(),
      )
      await deps.store.recordAudit({
        actorType: "wallet",
        actorId: active.account.id,
        action: "wallet-signed-out",
        targetType: "session",
        targetId: active.session.id,
        ipPrefix: ipPrefix(c.req.raw),
        requestId: currentRequestId(c),
      })
    }
    clearSessionCookie(c)
    return c.json(okResponseSchema.parse({ ok: true }), 200, noStore)
  })

  app.get("/api/grants", async (c) => {
    const { account, session } = await requireSession(c, deps)
    const [active, ended] = await Promise.all([
      deps.store.listActiveGrants(account.id),
      deps.store.listEndedGrants(account.id, endedGrantLimit),
    ])
    const visible = sessionVisible(session)
    const body: GrantListViewResponse = {
      data: active
        .filter(
          (connected) =>
            connected.app.status !== "retired" && visible(connected),
        )
        .map(({ grant, app: grantApp, environment }) => ({
          id: grant.id,
          app: {
            name: grantApp.name,
            logoUrl: grantApp.logoUrl,
            websiteUrl: grantApp.websiteUrl,
          },
          environmentKind: environment.kind,
          network: environment.network,
          verified: consentVerified(environment),
          scopes: oidcScopesOf(grant.scopes),
          declinedScopes: grant.declinedScopes,
          createdAt: grant.createdAt.toISOString(),
          updatedAt: grant.updatedAt.toISOString(),
        })),
      ended: ended
        .filter(visible)
        .flatMap(({ grant, app: grantApp, environment }) =>
          grant.revokedAt === null
            ? []
            : [
                {
                  id: grant.id,
                  app: {
                    name: grantApp.name,
                    logoUrl: grantApp.logoUrl,
                    websiteUrl: grantApp.websiteUrl,
                  },
                  environmentKind: environment.kind,
                  network: environment.network,
                  scopes: oidcScopesOf(grant.scopes),
                  revokedAt: grant.revokedAt.toISOString(),
                  revokedReason: grant.revokedReason,
                },
              ],
        ),
    }
    return c.json(grantListViewResponseSchema.parse(body), 200, noStore)
  })

  app.delete("/api/grants/:id", async (c) => {
    const { account, session } = await requireSession(c, deps)
    const { id } = pathParams(c, idPathParamsSchema)
    const grant = await deps.store.findGrant(id)
    const client =
      grant === null
        ? null
        : await deps.store.findEnvironment(grant.environmentId)
    if (
      grant === null ||
      grant.accountId !== account.id ||
      client === null ||
      !sessionVerifiedFor(session, client.environment.network)
    ) {
      throw new PlatformError("not_found")
    }
    if (await deps.store.revokeGrant(grant.id, "user-revoked", deps.now())) {
      await deps.store.recordAudit({
        actorType: "wallet",
        actorId: account.id,
        appId: grant.appId,
        environmentId: grant.environmentId,
        action: "grant-revoked",
        targetType: "grant",
        targetId: grant.id,
        metadata: { reason: "user-revoked" },
        ipPrefix: ipPrefix(c.req.raw),
        requestId: currentRequestId(c),
      })
    }
    return c.json(okResponseSchema.parse({ ok: true }), 200, noStore)
  })

  app.get("/api/sessions", async (c) => {
    const { account, session: current } = await requireSession(c, deps)
    const sessions = await deps.store.listActiveSessions(account.id, deps.now())
    return c.json(
      sessionListResponseSchema.parse({
        data: sessions
          .filter((session) => sessionManages(current, session))
          .map((session) => ({
            id: session.id,
            createdAt: session.createdAt.toISOString(),
            lastSeenAt: session.lastSeenAt?.toISOString() ?? null,
            expiresAt: session.expiresAt.toISOString(),
            userAgent: session.userAgent,
            ipPrefix: session.ipPrefix,
            current: session.id === current.id,
          })),
      }),
      200,
      noStore,
    )
  })

  app.delete("/api/sessions/:id", async (c) => {
    const { account, session: current } = await requireSession(c, deps)
    const { id } = pathParams(c, idPathParamsSchema)
    const now = deps.now()
    const target = (await deps.store.listActiveSessions(account.id, now)).find(
      (session) => session.id === id,
    )
    if (
      target === undefined ||
      !sessionManages(current, target) ||
      !(await deps.store.revokeSession(account.id, id, now))
    ) {
      throw new PlatformError("not_found")
    }

    await deps.store.recordAudit({
      actorType: "wallet",
      actorId: account.id,
      action: "wallet-session-revoked",
      targetType: "session",
      targetId: id,
      ipPrefix: ipPrefix(c.req.raw),
      requestId: currentRequestId(c),
    })
    if (id === current.id) clearSessionCookie(c)
    return c.json(okResponseSchema.parse({ ok: true }), 200, noStore)
  })

  return app
}
