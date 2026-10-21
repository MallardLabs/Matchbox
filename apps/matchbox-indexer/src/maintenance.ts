import type { ClientBase } from "pg"
import { z } from "zod"
import type { Network } from "./ingest/networks"

// Raw retention and the storage guard that keep the warehouse inside Neon's
// Free plan (1 GB per project; Neon refuses writes past the cap). See
// GO-LIVE.md, "Free-tier budget".

// About seven days of Mezo blocks (3.84 s each). Raw logs and transactions
// older than that, and already projected, are deleted after each tick:
// nothing outside the projection reads matchbox_raw, and a replay
// re-ingests history from RPC chunk by chunk (scripts/rebuild.ts).
export const RAW_RETENTION_BLOCKS = 160_000n
// The most raw blocks one Worker tick deletes, so a first prune of a full
// raw table stays inside the indexer role's 10 s statement timeout.
export const MAX_PRUNE_BLOCKS_PER_TICK = 250_000n
// Writes stop at this share of the cap.
export const WRITE_GUARD_PERCENT = 90n
// Neon Free's per-project storage, when neon.max_cluster_size is not set.
export const DEFAULT_CAP_BYTES = 1_073_741_824n

const LOGS_STREAM = "logs"
const PROJECTION_STREAM = "projection"

type Queryable = Pick<ClientBase, "query">

export type PruneInput = {
  projected: bigint | null
  ingested: bigint | null
  firstRaw: bigint | null
  retention?: bigint
  maxBlocks?: bigint | null
}

// Last raw block that may be deleted: projected, and older than the
// retention window behind ingest. Null when there is nothing to delete.
export function pruneThrough(input: PruneInput): bigint | null {
  const { projected, ingested, firstRaw } = input
  if (projected === null || ingested === null || firstRaw === null) return null
  const behindIngest = ingested - (input.retention ?? RAW_RETENTION_BLOCKS)
  let through = projected < behindIngest ? projected : behindIngest
  const maxBlocks =
    input.maxBlocks === undefined ? MAX_PRUNE_BLOCKS_PER_TICK : input.maxBlocks
  if (maxBlocks !== null && through > firstRaw + maxBlocks - 1n) {
    through = firstRaw + maxBlocks - 1n
  }
  return through < firstRaw ? null : through
}

const checkpointRowSchema = z.object({
  stream: z.string(),
  last_block: z.string().transform(BigInt),
})

const firstRawSchema = z.object({ first: z.string().nullable() })

export type PruneResult = {
  throughBlock: bigint
  logs: number
  transactions: number
}

// Deletes raw logs and transactions at or below pruneThrough(). Both go in
// one transaction; the caller passes a client it does not share.
export async function pruneRaw(
  db: ClientBase,
  network: Network,
  options: { retention?: bigint; maxBlocks?: bigint | null } = {},
): Promise<PruneResult | null> {
  const checkpoints = await db.query(
    `SELECT stream, last_block::text AS last_block
     FROM matchbox.indexer_checkpoints
     WHERE network = $1 AND stream = ANY($2::text[])`,
    [network, [LOGS_STREAM, PROJECTION_STREAM]],
  )
  const byStream = new Map(
    z
      .array(checkpointRowSchema)
      .parse(checkpoints.rows)
      .map((row) => [row.stream, row.last_block]),
  )
  const first = await db.query(
    `SELECT min(block_number)::text AS first FROM matchbox_raw.logs
     WHERE network = $1`,
    [network],
  )
  const firstRaw = z.array(firstRawSchema).parse(first.rows)[0]?.first ?? null
  const through = pruneThrough({
    projected: byStream.get(PROJECTION_STREAM) ?? null,
    ingested: byStream.get(LOGS_STREAM) ?? null,
    firstRaw: firstRaw === null ? null : BigInt(firstRaw),
    ...(options.retention === undefined
      ? {}
      : { retention: options.retention }),
    ...(options.maxBlocks === undefined
      ? {}
      : { maxBlocks: options.maxBlocks }),
  })
  if (through === null) return null

  await db.query("BEGIN")
  try {
    const logs = await db.query(
      `DELETE FROM matchbox_raw.logs
       WHERE network = $1 AND block_number <= $2`,
      [network, through.toString()],
    )
    const transactions = await db.query(
      `DELETE FROM matchbox_raw.transactions
       WHERE network = $1 AND block_number <= $2`,
      [network, through.toString()],
    )
    await db.query("COMMIT")
    return {
      throughBlock: through,
      logs: logs.rowCount ?? 0,
      transactions: transactions.rowCount ?? 0,
    }
  } catch (error) {
    await db.query("ROLLBACK")
    throw error
  }
}

export type DatabaseUsage = {
  bytes: bigint
  capBytes: bigint
  // False at or above WRITE_GUARD_PERCENT of the cap: ingest and projection
  // pause until someone frees space or raises the cap.
  writable: boolean
}

export function usageOf(bytes: bigint, capBytes: bigint): DatabaseUsage {
  return {
    bytes,
    capBytes,
    writable: bytes * 100n < capBytes * WRITE_GUARD_PERCENT,
  }
}

const usageRowSchema = z.object({
  bytes: z.string().transform(BigInt),
  cap: z.string().nullable(),
})

// pg_database_size against Neon's cluster cap (neon.max_cluster_size).
export async function databaseUsage(db: Queryable): Promise<DatabaseUsage> {
  const result = await db.query(
    `SELECT pg_database_size(current_database())::text AS bytes,
            pg_size_bytes(current_setting('neon.max_cluster_size', true))::text AS cap`,
  )
  const row = z.array(usageRowSchema).parse(result.rows)[0]
  if (row === undefined) throw new Error("pg_database_size returned no row")
  const cap = row.cap === null ? 0n : BigInt(row.cap)
  return usageOf(row.bytes, cap > 0n ? cap : DEFAULT_CAP_BYTES)
}
