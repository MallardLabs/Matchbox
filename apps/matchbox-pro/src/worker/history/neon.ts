import { z } from "zod"
import { persistedGet, persistedPut, timedGet, timedSet } from "./store"

// Minimal Neon serverless-HTTP client (the protocol `@neondatabase/serverless`
// `neon()` speaks): one POST per read-only batch, every value as text. Kept
// dependency-free so the Pro Worker needs no driver; rows are validated by
// the callers' zod schemas.

export type SqlQuery = { text: string; params: unknown[] }

export type SqlRow = Record<string, string | null>

export class WarehouseUnavailableError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, { cause })
    this.name = "WarehouseUnavailableError"
  }
}

const resultSchema = z.object({
  fields: z.array(z.object({ name: z.string() })),
  rows: z.array(z.array(z.string().nullable())),
})
const batchSchema = z.object({ results: z.array(resultSchema) })

/** `{a,b}` with quoting, for `= ANY($n::text[])` parameters. */
export function pgArray(values: readonly string[]): string {
  return `{${values
    .map((value) => `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`)
    .join(",")}}`
}

function serialize(value: unknown): string | null {
  if (value === null || value === undefined) return null
  if (Array.isArray(value)) return pgArray(value.map(String))
  if (typeof value === "bigint" || typeof value === "number") {
    return value.toString()
  }
  if (typeof value === "boolean") return value ? "true" : "false"
  return String(value)
}

export function sqlEndpoint(connectionString: string): string {
  const host = new URL(connectionString).hostname
  return `https://${host.replace(/^[^.]+\./, "api.")}/sql`
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

/** A read slower than this counts as the warehouse being unavailable. */
export const WAREHOUSE_TIMEOUT_MS = 6_000

/** Several reads in one HTTP round trip, in one read-only transaction. */
export async function queryBatch(
  connectionString: string,
  queries: readonly SqlQuery[],
  fetcher: typeof fetch = fetch,
  timeoutMs: number = WAREHOUSE_TIMEOUT_MS,
): Promise<SqlRow[][]> {
  let response: Response
  try {
    response = await fetcher(sqlEndpoint(connectionString), {
      signal: AbortSignal.timeout(timeoutMs),
      method: "POST",
      headers: {
        "content-type": "application/json",
        "Neon-Connection-String": connectionString,
        "Neon-Raw-Text-Output": "true",
        "Neon-Array-Mode": "true",
        "Neon-Batch-Read-Only": "true",
        "Neon-Batch-Isolation-Level": "RepeatableRead",
      },
      body: JSON.stringify({
        queries: queries.map((query) => ({
          query: query.text,
          params: query.params.map(serialize),
        })),
      }),
    })
  } catch (error) {
    throw new WarehouseUnavailableError("Warehouse unreachable", error)
  }
  if (!response.ok) {
    throw new WarehouseUnavailableError(`Warehouse HTTP ${response.status}`)
  }
  const parsed = batchSchema.safeParse(await response.json())
  if (!parsed.success) {
    throw new WarehouseUnavailableError("Warehouse response malformed")
  }
  return parsed.data.results.map((result) =>
    result.rows.map((row) =>
      Object.fromEntries(
        result.fields.map((field, index) => [field.name, row[index] ?? null]),
      ),
    ),
  )
}

// ------------------------------------------------------------- cache

/**
 * How long a warehouse answer is reused. The indexer writes every 15 minutes
 * and Neon (Free plan) stays awake 5 minutes after any query, so a shorter
 * TTL would keep compute running under steady traffic; 300 s keeps it within
 * the monthly CU-hours. Callers quantise "now" in params to this boundary so
 * requests share keys.
 */
export const WAREHOUSE_TTL_SECONDS = 300

const cachedRowsSchema = z.object({
  at: z.number().int().nonnegative(),
  results: z.array(z.array(z.record(z.string(), z.string().nullable()))),
})

/** Rounds a Unix time up to the next cache boundary. */
export function quantiseNow(seconds: number): number {
  return Math.ceil(seconds / WAREHOUSE_TTL_SECONDS) * WAREHOUSE_TTL_SECONDS
}

/** SHA-256 of the endpoint, query texts and serialized params. */
export async function warehouseCacheKey(
  connectionString: string,
  queries: readonly SqlQuery[],
): Promise<string> {
  const material = JSON.stringify({
    endpoint: sqlEndpoint(connectionString),
    queries: queries.map((query) => [query.text, query.params.map(serialize)]),
  })
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(material),
  )
  const hex = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("")
  return `warehouse:${hex}`
}

/**
 * After a failed read (quota spent and the project suspended, an outage, a
 * timeout) the warehouse is skipped for this long, per isolate, so requests
 * go straight to the fallback instead of each waiting on Neon.
 */
export const WAREHOUSE_BREAKER_MS = 120_000
const BREAKER_KEY = "warehouse:breaker"

export function warehouseBreakerOpen(): boolean {
  return timedGet<boolean>(BREAKER_KEY) === true
}

/**
 * `queryBatch` behind a 300 s cache: a per-isolate memo, then the Workers
 * Cache API (per colo), then Neon. Failures are never cached; one trips the
 * breaker, and while it's open only cached answers are served.
 */
export async function queryBatchCached(
  connectionString: string,
  queries: readonly SqlQuery[],
  fetcher: typeof fetch = fetch,
  nowMs: () => number = Date.now,
  timeoutMs: number = WAREHOUSE_TIMEOUT_MS,
): Promise<SqlRow[][]> {
  const key = await warehouseCacheKey(connectionString, queries)
  const ttlMs = WAREHOUSE_TTL_SECONDS * 1000
  const memo = timedGet<SqlRow[][]>(key)
  if (memo) return memo
  const stored = cachedRowsSchema.safeParse(await persistedGet(key))
  if (stored.success && stored.data.at + ttlMs > nowMs()) {
    timedSet(key, stored.data.results, stored.data.at + ttlMs - nowMs())
    return stored.data.results
  }
  if (warehouseBreakerOpen()) {
    throw new WarehouseUnavailableError("Warehouse skipped (breaker open)")
  }
  let results: SqlRow[][]
  try {
    results = await queryBatch(connectionString, queries, fetcher, timeoutMs)
  } catch (error) {
    if (error instanceof WarehouseUnavailableError) {
      timedSet(BREAKER_KEY, true, WAREHOUSE_BREAKER_MS)
    }
    throw error
  }
  timedSet(key, results, ttlMs)
  await persistedPut(key, { at: nowMs(), results }, WAREHOUSE_TTL_SECONDS)
  return results
}
