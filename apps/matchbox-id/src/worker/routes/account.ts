import { okResponseSchema } from "@repo/platform-contracts/common"
import {
  type IdentityAccount,
  grantListResponseSchema,
  idPathParamsSchema,
  sessionListResponseSchema,
  sessionResponseSchema,
} from "@repo/platform-contracts/identity"
import { networkForChainId } from "@repo/platform-contracts/network"
import { oidcScopesOf } from "@repo/platform-contracts/scopes"
import {
  PlatformError,
  currentRequestId,
  ipPrefix,
  pathParams,
} from "@repo/platform-server"
import { Hono } from "hono"
import type { AppDeps } from "../deps"
import { discordAvatarUrl } from "../oidc/claims"
import {
  clearSessionCookie,
  loadSession,
  requireSession,
  sessionManages,
  sessionVerifiedFor,
} from "../session"
import type { AccountRecord } from "../store/id-store"

/**
 * Session, connected apps (grants) and device sessions for the SPA. A
 * contract-account session only sees and manages what belongs to the
 * network it signed on (the same address elsewhere may be someone else's).
 */

const noStore = { "Cache-Control": "no-store" } as const

export async function identityAccount(
  deps: AppDeps,
  account: AccountRecord,
  siweChainId: number | null,
): Promise<IdentityAccount> {
  const link = await deps.store.findDiscordLink(account.walletAddress)
  return {
    walletAddress: account.walletAddress,
    signedInNetwork:
      siweChainId === null ? null : networkForChainId(siweChainId),
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
      sessionResponseSchema.parse({
        account:
          active === null
            ? null
            : await identityAccount(
                deps,
                active.account,
                active.session.siweChainId,
              ),
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
    const grants = await deps.store.listActiveGrants(account.id)
    return c.json(
      grantListResponseSchema.parse({
        data: grants
          .filter(
            ({ app: grantApp, environment }) =>
              grantApp.status !== "retired" &&
              sessionVerifiedFor(session, environment.network),
          )
          .map(({ grant, app: grantApp, environment }) => ({
            id: grant.id,
            app: {
              name: grantApp.name,
              logoUrl: grantApp.logoUrl,
              websiteUrl: grantApp.websiteUrl,
            },
            environmentKind: environment.kind,
            scopes: oidcScopesOf(grant.scopes),
            createdAt: grant.createdAt.toISOString(),
            updatedAt: grant.updatedAt.toISOString(),
          })),
      }),
      200,
      noStore,
    )
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
