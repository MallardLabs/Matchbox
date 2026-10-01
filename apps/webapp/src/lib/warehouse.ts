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

/** Rows are unvalidated; callers parse them with a zod schema. */
export async function queryWarehouse(
  query: WarehouseQuery,
): Promise<Record<string, unknown>[]> {
  return warehouseSql().query(query.text, query.params)
}

/** Several reads in one HTTP round trip, in one read-only transaction. */
export async function queryWarehouseBatch(
  queries: readonly WarehouseQuery[],
): Promise<Record<string, unknown>[][]> {
  const sql = warehouseSql()
  return sql.transaction(
    queries.map((query) => sql.query(query.text, query.params)),
    { readOnly: true },
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
