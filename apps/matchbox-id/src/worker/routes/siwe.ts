import {
  siweNonceResponseSchema,
  siweVerifyRequestSchema,
  siweVerifyResponseSchema,
} from "@repo/platform-contracts/identity"
import { oidcLifetimes } from "@repo/platform-contracts/oidc"
import { rateLimitPolicies } from "@repo/platform-contracts/rate-limits"
import {
  PlatformError,
  currentRequestId,
  generateOpaqueToken,
  generateSiweNonce,
  ipPrefix,
  jsonBody,
  rateLimitHeaders,
  readSessionCookie,
  requestLogger,
} from "@repo/platform-server"
import { type Context, Hono } from "hono"
import { isHex } from "viem"
import type { AppDeps } from "../deps"
import { firstRateLimitRejection } from "../rate-limit"
import {
  sessionCookieName,
  sessionTokenHash,
  setSessionCookie,
} from "../session"
import { checkSiweMessage, siweSignerKind } from "../siwe"
import { identityAccount } from "./account"

/** Sign-In with Ethereum: nonce issuance and signed-message verification. */

const maxUserAgentLength = 512

async function enforceSiweLimit(
  c: Context,
  deps: AppDeps,
  extraKeys: string[] = [],
): Promise<void> {
  const prefix = ipPrefix(c.req.raw) ?? "unknown"
  const policy = rateLimitPolicies.live.siwe
  const rejected = await firstRateLimitRejection(deps, [
    { key: `siwe:ip:${prefix}`, policy },
    ...extraKeys.map((key) => ({ key, policy })),
  ])
  if (rejected !== null) {
    throw new PlatformError("rate_limited", {
      headers: rateLimitHeaders(rejected, deps.now().getTime()),
    })
  }
}

export default function siweRoutes(deps: AppDeps): Hono {
  const app = new Hono()

  app.post("/api/siwe/nonce", async (c) => {
    await enforceSiweLimit(c, deps)
    const nonce = generateSiweNonce()
    await deps.store.createSiweNonce(
      nonce,
      new Date(deps.now().getTime() + oidcLifetimes.siweNonce * 1000),
    )
    return c.json(siweNonceResponseSchema.parse({ nonce }), 200, {
      "Cache-Control": "no-store",
    })
  })

  app.post("/api/siwe/verify", async (c) => {
    const body = await jsonBody(c, siweVerifyRequestSchema)
    const url = new URL(c.req.url)
    const now = deps.now()
    const checked = checkSiweMessage(body.message, {
      host: url.host,
      origin: url.origin,
      now,
    })
    if (!checked.ok) {
      throw new PlatformError("unauthorized", {
        message: `Sign-in message rejected: ${checked.reason}.`,
      })
    }
    const signature = body.signature
    if (!isHex(signature)) throw new PlatformError("invalid_request")
    const walletAddress = checked.address.toLowerCase()
    await enforceSiweLimit(c, deps, [`siwe:wallet:${walletAddress}`])
    if (!(await deps.store.consumeSiweNonce(checked.nonce, now))) {
      throw new PlatformError("unauthorized", {
        message: "Sign-in message rejected: nonce.",
      })
    }

    let verified = false
    try {
      verified = await deps
        .publicClientFactory(checked.network)
        .verifySiweMessage({
          message: body.message,
          signature,
          address: checked.address,
          domain: url.host,
          nonce: checked.nonce,
          time: now,
        })
    } catch (error) {
      requestLogger(c).error({
        message: "SIWE signature verification failed",
        network: checked.network,
        error,
      })
      throw new PlatformError("internal_error")
    }
    if (!verified) {
      throw new PlatformError("unauthorized", {
        message: "Sign-in message rejected: signature.",
      })
    }
    // Contract accounts are bound to the SIWE chain (see sessionVerifiedFor).
    const signerKind = await siweSignerKind({
      message: body.message,
      signature,
      address: checked.address,
    })

    const account = await deps.store.upsertAccountForSignIn(walletAddress, now)
    if (account.disabledAt !== null) throw new PlatformError("forbidden")

    // Wallet switching: the previous session on this browser ends.
    const previous = readSessionCookie(c, sessionCookieName)
    if (previous !== null) {
      const previousSession = await deps.store.findSessionByTokenHash(
        await sessionTokenHash(deps, previous),
      )
      if (previousSession !== null && previousSession.revokedAt === null) {
        await deps.store.revokeSession(
          previousSession.accountId,
          previousSession.id,
          now,
        )
      }
    }

    const token = generateOpaqueToken()
    const userAgent = c.req.header("User-Agent")?.slice(0, maxUserAgentLength)
    const session = await deps.store.createSession({
      accountId: account.id,
      createdAt: now,
      tokenHash: await sessionTokenHash(deps, token),
      expiresAt: new Date(now.getTime() + oidcLifetimes.session * 1000),
      userAgent: userAgent ?? null,
      ipPrefix: ipPrefix(c.req.raw),
      siweChainId: checked.chainId,
      signerKind,
    })
    await deps.store.recordAudit({
      actorType: "wallet",
      actorId: account.id,
      action: "wallet-signed-in",
      targetType: "session",
      targetId: session.id,
      metadata: {
        network: checked.network,
        chainId: checked.chainId,
        signerKind,
      },

      ipPrefix: ipPrefix(c.req.raw),
      requestId: currentRequestId(c),
    })
    setSessionCookie(c, token)
    return c.json(
      siweVerifyResponseSchema.parse({
        account: await identityAccount(deps, account, checked.chainId),
      }),
      200,
      { "Cache-Control": "no-store" },
    )
  })

  return app
}
