import {
  siweNonceResponseSchema,
  siweVerifyRequestSchema,
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
import { siweVerifyViewResponseSchema } from "../../shared/contracts"
import type { AppDeps } from "../deps"
import { firstRateLimitRejection } from "../rate-limit"
import {
  sessionCookieName,
  sessionTokenHash,
  setSessionCookie,
} from "../session"
import {
  type SiweCheckResult,
  checkSiweMessage,
  recoversToAddress,
  verifyContractSignature,
} from "../siwe"
import type { SignerKind } from "../store/id-store"
import { identityAccount } from "./account"

/** Sign-In with Ethereum: nonce issuance and signed-message verification. */

const maxUserAgentLength = 512

function ipLimitKey(c: Context): string {
  return `siwe:ip:${ipPrefix(c.req.raw) ?? "unknown"}`
}

async function enforceSiweLimit(deps: AppDeps, key: string): Promise<void> {
  const rejected = await firstRateLimitRejection(deps, [
    { key, policy: rateLimitPolicies.live.siwe },
  ])
  if (rejected !== null) {
    throw new PlatformError("rate_limited", {
      headers: rateLimitHeaders(rejected, deps.now().getTime()),
    })
  }
}

/**
 * How the signature proves the wallet, or null when it does not. ECDSA is
 * checked locally first, so a key-holding wallet never depends on an RPC.
 * The RPC-backed ERC-1271 / ERC-6492 path comes second and is closed to a
 * wallet that has signed in with its key before: an RPC must not be able
 * to vouch for an address whose owner holds that key.
 */
async function provenSignerKind(
  c: Context,
  deps: AppDeps,
  proof: {
    message: string
    signature: `0x${string}`
    checked: Extract<SiweCheckResult, { ok: true }>
  },
): Promise<SignerKind | null> {
  const { message, signature, checked } = proof
  const { address, network } = checked
  if (await recoversToAddress({ message, signature, address })) return "eoa"

  const log = requestLogger(c)
  if (await deps.store.walletHasEoaSession(address.toLowerCase())) {
    log.warn({
      message: "Contract signature refused for a wallet proven by its key",
      network,
    })
    return null
  }
  const check = await verifyContractSignature(
    deps.publicClientsFor(network),
    { message, signature, address },
    checked.chainId,
  )
  if (check.status === "unavailable") {
    log.error({
      message: "SIWE contract signature verification failed",
      network,
      errors: check.errors,
    })
    throw new PlatformError("internal_error")
  }
  if (check.errors.length > 0) {
    log.warn({
      message: "RPCs gave no SIWE contract signature answer",
      network,
      errors: check.errors,
    })
  }
  return check.status === "valid" ? "contract" : null
}

export default function siweRoutes(deps: AppDeps): Hono {
  const app = new Hono()

  app.post("/api/siwe/nonce", async (c) => {
    await enforceSiweLimit(deps, ipLimitKey(c))
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
    await enforceSiweLimit(deps, ipLimitKey(c))
    if (!(await deps.store.consumeSiweNonce(checked.nonce, now))) {
      throw new PlatformError("unauthorized", {
        message: "Sign-in message rejected: nonce.",
      })
    }

    // Contract accounts are bound to the SIWE chain (see sessionVerifiedFor).
    const signerKind = await provenSignerKind(c, deps, {
      message: body.message,
      signature,
      checked,
    })
    if (signerKind === null) {
      throw new PlatformError("unauthorized", {
        message: "Sign-in message rejected: signature.",
      })
    }
    // Only proven sign-ins spend the wallet's bucket: the address in the
    // message is unauthenticated until here, so charging it earlier let
    // anyone lock a wallet out. Failed attempts are bounded by the IP
    // bucket and the single-use nonce.
    await enforceSiweLimit(deps, `siwe:wallet:${walletAddress}`)

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
      siweVerifyViewResponseSchema.parse({
        account: await identityAccount(deps, account, session),
      }),
      200,
      { "Cache-Control": "no-store" },
    )
  })

  return app
}
