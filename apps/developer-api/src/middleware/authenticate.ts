import type { Logger } from "@repo/logger"
import {
  bearerToken,
  parseApiKey,
  parseClientId,
  parseClientSecret,
} from "@repo/platform-contracts/credentials"
import {
  type RateLimitPolicy,
  type RateLimitResult,
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

/**
 * A key-cache miss normally reads the key row. Once this isolate has seen
 * `ip:<prefix>` spent (or the limiter fail), a miss reads it only when the
 * prefix is in the known-prefix snapshot, so junk keys cost no DB reads.
 * The snapshot is one `listActiveKeyPrefixes` read, reloaded after 60 s, or
 * after 10 s when a prefix is missing (a key created moments ago).
 */
export const knownPrefixMaxAgeMs = 60_000
export const knownPrefixRetryMs = 10_000

/** How long a limiter error keeps the miss path gated (fail closed). */
export const limiterDownGateMs = 30_000

/**
 * Prefixes whose lookup failed verification: null for an unknown prefix,
 * else the row's secret hash, so repeated wrong secrets skip the DB.
 */
export const rejectedPrefixTtlMs = 15_000

const maxSpentBuckets = 10_000

type KeyLookup =
  | { kind: "verified"; record: ApiKeyRecord }
  | { kind: "rejected" }
  /** Skipped the DB: miss path gated and the prefix is not known. */
  | { kind: "gated" }

type KnownPrefixes = {
  prefixes: Set<string>
  loadedAt: number
}

export type AuthState = {
  /** Verified record (or null for unknown/wrong keys) by credential HMAC. */
  keys: TtlCache<ApiKeyRecord | null>
  rejectedPrefixes: TtlCache<string | null>
  /** `ip:` buckets this isolate saw 429, by bucket, until `resetAt`. */
  spentBuckets: Map<string, RateLimitResult>
  limiterDownUntil: number
  knownPrefixes: KnownPrefixes | null
  knownPrefixesAttemptAt: number
  knownPrefixesLoading: boolean
  lastUsed: Map<string, number>
}

export function createAuthState(now: () => number): AuthState {
  return {
    keys: createTtlCache<ApiKeyRecord | null>(keyPolicyCacheTtlMs, now),
    rejectedPrefixes: createTtlCache<string | null>(rejectedPrefixTtlMs, now),
    spentBuckets: new Map(),
    limiterDownUntil: 0,
    knownPrefixes: null,
    knownPrefixesAttemptAt: Number.NEGATIVE_INFINITY,
    knownPrefixesLoading: false,
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

  function spentResult(bucket: string, at: number): RateLimitResult | null {
    const spent = state.spentBuckets.get(bucket)
    if (spent === undefined) return null
    if (spent.resetAt > at) return spent
    state.spentBuckets.delete(bucket)
    return null
  }

  function rememberSpent(bucket: string, result: RateLimitResult): void {
    state.spentBuckets.delete(bucket)
    if (state.spentBuckets.size >= maxSpentBuckets) {
      const oldest = state.spentBuckets.keys().next()
      if (oldest.done !== true) state.spentBuckets.delete(oldest.value)
    }
    state.spentBuckets.set(bucket, result)
  }

  /**
   * Charges a rejected request to its IP bucket; 429 once it is spent. A
   * bucket this isolate saw spent answers 429 locally until it resets
   * (rejected requests never consume quota, so the limiter would agree). The
   * request is refused either way, so an unavailable limiter (logged) only
   * turns that 429 into the caller's 401, and gates the miss path.
   */
  async function limitByIp(
    bucket: string,
    policy: RateLimitPolicy,
  ): Promise<void> {
    const at = now().getTime()
    const spent = spentResult(bucket, at)
    if (spent !== null) {
      const retryAfterSeconds = Math.max(
        Math.ceil((spent.resetAt - at) / 1000),
        1,
      )
      throw new PlatformError("rate_limited", {
        headers: rateLimitHeaders({ ...spent, retryAfterSeconds }, at),
      })
    }
    try {
      const result = await rateLimits.consume(bucket, policy)
      state.limiterDownUntil = 0
      if (!result.allowed) {
        rememberSpent(bucket, result)
        throw new PlatformError("rate_limited", {
          headers: rateLimitHeaders(result, now().getTime()),
        })
      }
    } catch (error) {
      if (error instanceof PlatformError) throw error
      state.limiterDownUntil = now().getTime() + limiterDownGateMs
      logger.warn({ message: "Pre-auth rate limiter unavailable", error })
    }
  }

  /** True once junk has spent `bucket` or the limiter failed (fail closed). */
  function missPathGated(bucket: string): boolean {
    const at = now().getTime()
    return state.limiterDownUntil > at || spentResult(bucket, at) !== null
  }

  /**
   * Whether `keyPrefix` belongs to an unrevoked key, from the isolate's
   * snapshot. Reloads at most once per `knownPrefixRetryMs`; requests that
   * arrive while the first load is in flight fall through to the lookup.
   */
  async function isKnownPrefix(keyPrefix: string): Promise<boolean> {
    const at = now().getTime()
    const snapshot = state.knownPrefixes
    const listed = snapshot?.prefixes.has(keyPrefix) ?? false
    if (
      listed &&
      snapshot !== null &&
      at - snapshot.loadedAt < knownPrefixMaxAgeMs
    ) {
      return true
    }
    if (at - state.knownPrefixesAttemptAt < knownPrefixRetryMs) {
      return state.knownPrefixesLoading ? snapshot === null || listed : listed
    }
    state.knownPrefixesAttemptAt = at
    state.knownPrefixesLoading = true
    try {
      const prefixes = await store.listActiveKeyPrefixes()
      state.knownPrefixes = {
        prefixes: new Set(prefixes),
        loadedAt: now().getTime(),
      }
    } catch (error) {
      logger.warn({ message: "Key prefix snapshot failed", error })
    } finally {
      state.knownPrefixesLoading = false
    }
    return state.knownPrefixes?.prefixes.has(keyPrefix) ?? false
  }

  /**
   * Verified record for a key-cache miss, or null. Prefixes that just failed
   * verification answer from `rejectedPrefixes`; while the miss path is
   * gated, only known prefixes reach the DB. A valid key always has a known
   * prefix, so other callers' junk never rejects it.
   */
  async function lookUpKey(
    keyPrefix: string,
    hash: string,
    bucket: string,
  ): Promise<KeyLookup> {
    const rejected = state.rejectedPrefixes.get(keyPrefix)
    if (
      rejected !== undefined &&
      (rejected.value === null || !timingSafeEqualHex(hash, rejected.value))
    ) {
      return { kind: "rejected" }
    }
    if (missPathGated(bucket) && !(await isKnownPrefix(keyPrefix))) {
      return { kind: "gated" }
    }
    const record = await store.findApiKeyByPrefix(keyPrefix)
    if (record === null) {
      state.rejectedPrefixes.set(keyPrefix, null)
      return { kind: "rejected" }
    }
    if (!timingSafeEqualHex(hash, record.key.secretHash)) {
      state.rejectedPrefixes.set(keyPrefix, record.key.secretHash)
      return { kind: "rejected" }
    }
    return { kind: "verified", record }
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
    const bucket = `ip:${ipPrefix(c.req.raw) ?? "unknown"}`
    const token = bearerToken(c.req.header("Authorization") ?? null)
    const parsed = token === null ? null : parseApiKey(token)
    if (token === null || parsed === null) {
      await limitByIp(bucket, unauthenticatedPolicy)
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
      const lookup = await lookUpKey(parsed.prefix, hash, bucket)
      const verified = lookup.kind === "verified" ? lookup.record : null
      // A gated miss is not cached: a key created moments ago must work as
      // soon as the prefix snapshot reloads.
      if (lookup.kind !== "gated") state.keys.set(hash, verified)
      cached = { value: verified }
    }

    const record = cached.value
    if (record === null) {
      await limitByIp(bucket, unauthenticatedPolicy)
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
