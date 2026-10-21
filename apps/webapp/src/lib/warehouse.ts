import { type NeonQueryFunction, neon } from "@neondatabase/serverless"
import { CHAIN_ID, type SupportedChainId } from "@repo/shared/contracts"
import { z } from "zod"

// The Matchbox warehouse (Neon) built by apps/matchbox-indexer from Mezo RPC
// logs. See docs/goldsky-exit.md. Reads use a read-only role over HTTP, one
// round trip per call.

export const WAREHOUSE_NETWORK = "mezo"

export type WarehouseQuery = {
  text: string
  params: unknown[]
}

export type IndexedThrough = {
  block: string
  updatedAt: string
}

export class WarehouseUnavailableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "WarehouseUnavailableError"
  }
}

/**
 * Whether reads for this chain come from the warehouse. Mainnet only, opt-in
 * with MEZO_ACTIVITY_SOURCE=warehouse. Read per call: Workers populate
 * process.env at request time.
 */
export function isWarehouseSource(chainId: SupportedChainId): boolean {
  return (
    process.env.MEZO_ACTIVITY_SOURCE === "warehouse" &&
    chainId === CHAIN_ID.mainnet
  )
}

let client: { url: string; sql: NeonQueryFunction<false, false> } | undefined

export function warehouseSql(): NeonQueryFunction<false, false> {
  const url = process.env.MATCHBOX_WAREHOUSE_URL
  if (!url) {
    throw new WarehouseUnavailableError("MATCHBOX_WAREHOUSE_URL is not set")
  }
  if (client?.url !== url) client = { url, sql: neon(url) }
  return client.sql
}

/** Builds `$n` placeholders as values are added, in order. */
export function sqlParams(): {
  params: unknown[]
  add: (value: unknown) => string
} {
  const params: unknown[] = []
  return {
    params,
    add: (value) => {
      params.push(value)
      return `$${params.length}`
    },
  }
}

// The warehouse runs on Neon's Free plan: the compute suspends after 5 idle
// minutes and is billed while awake (100 CU-hours a month). The indexer
// writes every 15 minutes, so reads are cached for 5: per colo in the
// Workers Cache API (a no-op in Node and on workers.dev) and per isolate in
// memory. A miss on a sleeping compute costs a 5-minute wake; a hit costs
// nothing. Shorter TTLs keep the compute awake under steady traffic.
export const WAREHOUSE_CACHE_SECONDS = 300

const CACHE_ORIGIN = "https://warehouse-cache.matchbox.internal"
const MEMO_LIMIT = 500
const memo = new Map<string, { expires: number; value: unknown }>()

type Rows = Record<string, unknown>[]

const rowsSchema = z.array(z.record(z.string(), z.unknown()))
const batchSchema = z.array(rowsSchema)

function edgeCache(): Cache | undefined {
  if (typeof caches === "undefined") return undefined
  const storage: object = caches
  return "default" in storage && storage.default instanceof Cache
    ? storage.default
    : undefined
}

async function cacheKey(queries: readonly WarehouseQuery[]): Promise<string> {
  const body = JSON.stringify(
    queries.map((query) => [query.text, query.params]),
  )
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(body),
  )
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
}

function remember(key: string, value: unknown): void {
  if (memo.size >= MEMO_LIMIT) {
    const oldest = memo.keys().next()
    if (!oldest.done) memo.delete(oldest.value)
  }
  memo.set(key, {
    expires: Date.now() + WAREHOUSE_CACHE_SECONDS * 1000,
    value,
  })
}

/**
 * Serves `load` from the read cache for WAREHOUSE_CACHE_SECONDS. Values go
 * through JSON either way, so a hit and a miss return the same shapes
 * (timestamps as ISO strings). Failures are never cached.
 */
export async function cachedWarehouseRead<T>(
  queries: readonly WarehouseQuery[],
  schema: z.ZodType<T>,
  load: () => Promise<unknown>,
): Promise<T> {
  const key = await cacheKey(queries)
  const remembered = memo.get(key)
  if (remembered && remembered.expires > Date.now()) {
    const parsed = schema.safeParse(remembered.value)
    if (parsed.success) return parsed.data
  }
  const cache = edgeCache()
  const url = `${CACHE_ORIGIN}/${key}`
  if (cache) {
    try {
      const hit = await cache.match(url)
      if (hit) {
        const parsed = schema.safeParse(await hit.json())
        if (parsed.success) {
          remember(key, parsed.data)
          return parsed.data
        }
      }
    } catch {
      // Best effort: fall through to the database.
    }
  }
  const json = JSON.stringify(await load())
  const value = schema.parse(z.unknown().parse(JSON.parse(json)))
  remember(key, value)
  if (cache) {
    try {
      await cache.put(
        url,
        new Response(json, {
          headers: {
            "content-type": "application/json",
            "cache-control": `public, max-age=${WAREHOUSE_CACHE_SECONDS}`,
          },
        }),
      )
    } catch {
      // Best effort: the per-isolate memo still holds the value.
    }
  }
  return value
}

/** Test hook. */
export function clearWarehouseCache(): void {
  memo.clear()
}

/** Rows are unvalidated; callers parse them with a zod schema. */
export async function queryWarehouse(query: WarehouseQuery): Promise<Rows> {
  return cachedWarehouseRead([query], rowsSchema, () =>
    warehouseSql().query(query.text, query.params),
  )
}

/** Several reads in one HTTP round trip, in one read-only transaction. */
export async function queryWarehouseBatch(
  queries: readonly WarehouseQuery[],
): Promise<Rows[]> {
  return cachedWarehouseRead(queries, batchSchema, () => {
    const sql = warehouseSql()
    return sql.transaction(
      queries.map((query) => sql.query(query.text, query.params)),
      { readOnly: true },
    )
  })
}

/**
 * A default "until now" bound rounded up to the cache window, so requests
 * without an explicit range share a cache key. Rounding up never hides a
 * row; it only lets the window end slightly in the future.
 */
export function cacheableNow(nowSeconds: number): number {
  return (
    Math.ceil(nowSeconds / WAREHOUSE_CACHE_SECONDS) * WAREHOUSE_CACHE_SECONDS
  )
}

export const PROJECTION_CHECKPOINT_QUERY: WarehouseQuery = {
  text: `SELECT last_block::text AS "block", updated_at AS "updatedAt"
    FROM matchbox.indexer_checkpoints
    WHERE network = $1 AND stream = 'projection'`,
  params: [WAREHOUSE_NETWORK],
}

const checkpointRowSchema = z.object({
  block: z.string(),
  updatedAt: z.union([z.string(), z.date()]),
})

export function parseIndexedThrough(
  rows: Record<string, unknown>[],
): IndexedThrough | undefined {
  const row = checkpointRowSchema.safeParse(rows[0])
  if (!row.success) return undefined
  const updatedAt = new Date(row.data.updatedAt)
  if (Number.isNaN(updatedAt.getTime())) return undefined
  return { block: row.data.block, updatedAt: updatedAt.toISOString() }
}
