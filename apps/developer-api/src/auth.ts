import type { ApiKeyKind } from "@repo/platform-contracts/credentials"
import type { ErrorCode } from "@repo/platform-contracts/errors"
import type { EnvironmentKind } from "@repo/platform-contracts/network"
import { ipMatchesCidrs } from "@repo/platform-server"
import type { ApiKeyRecord } from "./store/api-store"

/** Verified key policy cache lifetime; bounds revocation latency. */
export const keyPolicyCacheTtlMs = 15_000

const maxCacheEntries = 10_000

export type TtlCache<Value> = {
  get(key: string): { value: Value } | undefined
  set(key: string, value: Value): void
  clear(): void
}

/** Small in-isolate TTL cache with oldest-first eviction. */
export function createTtlCache<Value>(
  ttlMs: number,
  now: () => number,
): TtlCache<Value> {
  const entries = new Map<string, { value: Value; expiresAt: number }>()
  return {
    get(key) {
      const entry = entries.get(key)
      if (entry === undefined) return undefined
      if (entry.expiresAt <= now()) {
        entries.delete(key)
        return undefined
      }
      return { value: entry.value }
    },
    set(key, value) {
      entries.delete(key)
      if (entries.size >= maxCacheEntries) {
        const oldest = entries.keys().next()
        if (oldest.done !== true) entries.delete(oldest.value)
      }
      entries.set(key, { value, expiresAt: now() + ttlMs })
    },
    clear() {
      entries.clear()
    },
  }
}

/** What routes know about the caller once a key is fully authorised. */
export type RequestAuth = {
  keyId: string
  keyKind: ApiKeyKind
  environmentId: string
  environmentKind: EnvironmentKind
  appStatus: ApiKeyRecord["app"]["status"]
  ipPrefix: string | null
}

export type KeyRequestContext = {
  /** Environment kind encoded in the presented key string. */
  presentedKind: ApiKeyKind
  presentedEnvironmentKind: EnvironmentKind
  origin: string | null
  clientIp: string | null
  now: Date
}

export type KeyEvaluation =
  | { ok: true }
  | { ok: false; code: ErrorCode; message: string }

function deny(code: ErrorCode, message: string): KeyEvaluation {
  return { ok: false, code, message }
}

/**
 * Applies every per-request rule to a verified key record. Pure, so the
 * cached record is re-evaluated on each request (expiry, origin, IP).
 */
export function evaluateKey(
  record: ApiKeyRecord,
  request: KeyRequestContext,
): KeyEvaluation {
  if (
    record.key.kind !== request.presentedKind ||
    record.environment.kind !== request.presentedEnvironmentKind
  ) {
    return deny("unauthorized", "Missing or invalid credentials.")
  }
  if (record.key.revokedAt !== null) {
    return deny("unauthorized", "This API key has been revoked.")
  }
  if (
    record.key.expiresAt !== null &&
    Date.parse(record.key.expiresAt) <= request.now.getTime()
  ) {
    return deny("unauthorized", "This API key has expired.")
  }
  if (record.app.status === "suspended" || record.app.status === "retired") {
    return deny("forbidden", "This app is not active.")
  }
  if (record.environment.kind === "live") {
    if (record.environment.reviewState !== "approved") {
      return deny("forbidden", "The live environment is not approved yet.")
    }
    if (!record.environment.approvedScopes.includes("gauge-profiles:read")) {
      return deny("forbidden", "Gauge profile access is not approved.")
    }
  }
  if (record.key.kind === "publishable") {
    if (request.origin === null || !record.origins.includes(request.origin)) {
      return deny("origin_not_allowed", "Origin not registered for this key.")
    }
    return { ok: true }
  }
  if (request.origin !== null) {
    return deny(
      "origin_not_allowed",
      "Secret keys cannot be used from browsers. Use a publishable key.",
    )
  }
  if (record.key.allowedCidrs.length > 0) {
    if (
      request.clientIp === null ||
      !ipMatchesCidrs(request.clientIp, record.key.allowedCidrs)
    ) {
      return deny("forbidden", "Client IP is not in this key's allowlist.")
    }
  }
  return { ok: true }
}
