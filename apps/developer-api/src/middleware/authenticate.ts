import type { Logger } from "@repo/logger"
import {
  bearerToken,
  parseApiKey,
  parseClientId,
  parseClientSecret,
} from "@repo/platform-contracts/credentials"
import {
  type RateLimitPolicy,
  rateLimitPolicies,
} from "@repo/platform-contracts/rate-limits"
import {
  PlatformError,
  type RateLimitClient,
  clientIp,
  hmacHex,
  ipPrefix,
  rateLimitHeaders,
  timingSafeEqualHex,
} from "@repo/platform-server"
import {
  type TtlCache,
  createTtlCache,
  evaluateKey,
  keyPolicyCacheTtlMs,
} from "../auth"
import type { ApiContext, ApiMiddleware } from "../context"
import type { ApiKeyRecord, ApiStore } from "../store/api-store"

/** `last_used_at` is written at most once per key per 5 minutes. */
export const lastUsedThrottleMs = 5 * 60_000

/**
 * `ip:<prefix>` counts rejected requests only (missing, malformed, unknown
 * or wrong keys). A verified key is never charged to an IP bucket: callers
 * behind one egress (every Cloudflare Worker shares a /48) must not be able
 * to lock each other out.
 */
const unauthenticatedPolicy = rateLimitPolicies.test.unauthenticated

/** Names the credential when someone sends the wrong one as an API key. */
function malformedKeyMessage(token: string): string {
  if (parseClientId(token) !== null) {
    return "That is a client ID, not an API key. Send an mbx_sk_ or mbx_pk_ key."
  }
  if (parseClientSecret(token) !== null) {
    return "That is a client secret, not an API key. Send an mbx_sk_ or mbx_pk_ key."
  }
  return "Malformed API key."
}

export type AuthState = {
  /** Verified record (or null for unknown/wrong keys) by credential HMAC. */
  keys: TtlCache<ApiKeyRecord | null>
  lastUsed: Map<string, number>
}

export function createAuthState(now: () => number): AuthState {
  return {
    keys: createTtlCache<ApiKeyRecord | null>(keyPolicyCacheTtlMs, now),
    lastUsed: new Map(),
  }
}

export type AuthenticateOptions = {
  store: ApiStore
  rateLimits: RateLimitClient
  pepper: string
  now: () => Date
  logger: Logger
  state: AuthState
  background: (c: ApiContext, task: Promise<unknown>) => void
}

export function authenticate(options: AuthenticateOptions): ApiMiddleware {
  const { store, rateLimits, pepper, now, logger, state } = options

  /**
   * Charges a rejected request to its IP bucket; 429 once it is spent. The
   * request is refused either way, so an unavailable limiter (logged) only
   * turns that 429 into the caller's 401.
   */
  async function limitByIp(
    bucket: string,
    policy: RateLimitPolicy,
  ): Promise<void> {
    try {
      const result = await rateLimits.consume(bucket, policy)
      if (!result.allowed) {
        throw new PlatformError("rate_limited", {
          headers: rateLimitHeaders(result, now().getTime()),
        })
      }
    } catch (error) {
      if (error instanceof PlatformError) throw error
      logger.warn({ message: "Pre-auth rate limiter unavailable", error })
    }
  }

  function touchLastUsed(c: ApiContext, keyId: string): void {
    const at = now()
    const previous = state.lastUsed.get(keyId)
    if (
      previous !== undefined &&
      at.getTime() - previous < lastUsedThrottleMs
    ) {
      return
    }
    state.lastUsed.set(keyId, at.getTime())
    options.background(
      c,
      store.touchKeyLastUsed(keyId, at).catch((error: unknown) => {
        logger.warn({ message: "last_used_at update failed", keyId, error })
      }),
    )
  }

  return async function authenticateMiddleware(c, next) {
    const prefix = ipPrefix(c.req.raw) ?? "unknown"
    const token = bearerToken(c.req.header("Authorization") ?? null)
    const parsed = token === null ? null : parseApiKey(token)
    if (token === null || parsed === null) {
      await limitByIp(`ip:${prefix}`, unauthenticatedPolicy)
      throw new PlatformError("unauthorized", {
        message:
          token === null
            ? "Send Authorization: Bearer <API key>."
            : malformedKeyMessage(token),
      })
    }

    const hash = await hmacHex(pepper, token)
    let cached = state.keys.get(hash)
    if (cached === undefined) {
      const record = await store.findApiKeyByPrefix(parsed.prefix)
      const verified =
        record !== null && timingSafeEqualHex(hash, record.key.secretHash)
          ? record
          : null
      state.keys.set(hash, verified)
      cached = { value: verified }
    }

    const record = cached.value
    if (record === null) {
      await limitByIp(`ip:${prefix}`, unauthenticatedPolicy)
      throw new PlatformError("unauthorized")
    }

    c.set("cors", {
      kind: "key",
      keyKind: record.key.kind,
      origins: record.origins,
    })
    c.set("identity", {
      keyId: record.key.id,
      environmentId: record.environment.id,
      environmentKind: record.environment.kind,
    })

    const evaluation = evaluateKey(record, {
      presentedKind: parsed.kind,
      presentedEnvironmentKind: parsed.environmentKind,
      origin: c.req.header("Origin") ?? null,
      clientIp: clientIp(c.req.raw),
      now: now(),
    })
    if (!evaluation.ok) {
      throw new PlatformError(evaluation.code, { message: evaluation.message })
    }

    c.set("auth", {
      keyId: record.key.id,
      keyKind: record.key.kind,
      environmentId: record.environment.id,
      environmentKind: record.environment.kind,
      appStatus: record.app.status,
      ipPrefix: ipPrefix(c.req.raw),
    })
    touchLastUsed(c, record.key.id)
    await next()
  }
}
