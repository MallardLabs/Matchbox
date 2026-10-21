// Per-isolate memo for values that never change once an epoch is sealed
// (past checkpoints, past tokenRewardsPerEpoch, epoch-close prices). Bounded
// so a long-lived isolate can't grow without limit; oldest entries go first.

const MAX_ENTRIES = 200_000
const sealed = new Map<string, unknown>()

export function sealedGet<T>(key: string): T | undefined {
  return sealed.get(key) as T | undefined
}

export function sealedHas(key: string): boolean {
  return sealed.has(key)
}

export function sealedSet(key: string, value: unknown): void {
  if (sealed.size >= MAX_ENTRIES) {
    const oldest = sealed.keys().next()
    if (!oldest.done) sealed.delete(oldest.value)
  }
  sealed.set(key, value)
}

// Short-lived values that many keys load together (e.g. which bribes each
// lock has voted on), so callers can batch the misses into one read.
const timed = new Map<string, { expires: number; value: unknown }>()

export function timedGet<T>(key: string): T | undefined {
  const hit = timed.get(key)
  if (!hit) return undefined
  if (hit.expires <= Date.now()) {
    timed.delete(key)
    return undefined
  }
  return hit.value as T
}

export function timedSet(key: string, value: unknown, ttlMs: number): void {
  if (timed.size >= MAX_ENTRIES) {
    const oldest = timed.keys().next()
    if (!oldest.done) timed.delete(oldest.value)
  }
  timed.set(key, { expires: Date.now() + ttlMs, value })
}

/** Test hook. */
export function clearHistoryMemo(): void {
  sealed.clear()
  timed.clear()
}

// Cross-isolate persistence for sealed values through the Workers Cache API
// (per colo, best effort). A no-op where `caches.default` doesn't exist
// (tests, Node) or on workers.dev, where the Cache API doesn't store.
const PERSIST_ORIGIN = "https://history.matchbox-pro.internal"

function edgeCache(): Cache | undefined {
  if (typeof caches === "undefined") return undefined
  const storage: object = caches
  return "default" in storage && storage.default instanceof Cache
    ? storage.default
    : undefined
}

function persistUrl(key: string): string {
  return `${PERSIST_ORIGIN}/${encodeURIComponent(key)}`
}

export async function persistedGet(key: string): Promise<unknown> {
  const cache = edgeCache()
  if (!cache) return undefined
  try {
    const hit = await cache.match(persistUrl(key))
    return hit ? ((await hit.json()) as unknown) : undefined
  } catch {
    return undefined
  }
}

/** Stores `value` for `maxAgeSeconds` (default: a year, for sealed values). */
export async function persistedPut(
  key: string,
  value: unknown,
  maxAgeSeconds?: number,
): Promise<void> {
  const cache = edgeCache()
  if (!cache) return
  try {
    await cache.put(
      persistUrl(key),
      new Response(JSON.stringify(value), {
        headers: {
          "content-type": "application/json",
          "cache-control":
            maxAgeSeconds === undefined
              ? "public, max-age=31536000, immutable"
              : `public, max-age=${maxAgeSeconds}`,
        },
      }),
    )
  } catch {
    // Best effort: the per-isolate memo still holds the value.
  }
}
