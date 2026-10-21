import { createLogger } from "@repo/shared/logger"
import type { PoolClient } from "pg"
import { createDatabasePool } from "./database"

// VACUUM FULL the raw tables after a migration that rewrote or trimmed rows
// (0005_slim_raw). It cannot run inside a migration transaction. A full vacuum
// writes a new copy of the table before dropping the old one, so a table is
// skipped when that copy would not fit under Neon's cluster size cap.

const logger = createLogger("matchbox-indexer-vacuum")

const TABLES = ["matchbox_raw.transactions", "matchbox_raw.logs"] as const
// Leave this much of the cap unused while a copy is being written.
const HEADROOM = 0.95

type Sizes = { database: number; table: number; cap: number | null }

async function main(): Promise<void> {
  const pool = createDatabasePool()
  const client = await pool.connect()
  try {
    await client.query("SET statement_timeout = 0")
    for (const table of TABLES) {
      const before = await sizes(client, table)
      if (
        before.cap !== null &&
        before.database + before.table > before.cap * HEADROOM
      ) {
        logger.warn({
          message:
            "Skipping VACUUM FULL: the rewrite would not fit under the cap",
          table,
          ...megabytes(before),
        })
        continue
      }
      const startedAt = Date.now()
      await client.query(`VACUUM (FULL, ANALYZE) ${table}`)
      const after = await sizes(client, table)
      logger.info({
        message: "Vacuumed",
        table,
        seconds: Math.round((Date.now() - startedAt) / 1000),
        tableMbBefore: Math.round(before.table / 1e6),
        tableMbAfter: Math.round(after.table / 1e6),
        databaseMbAfter: Math.round(after.database / 1e6),
      })
    }
  } finally {
    client.release()
    await pool.end()
  }
}

async function sizes(client: PoolClient, table: string): Promise<Sizes> {
  const result = await client.query<{
    database: string
    table: string
    cap: string | null
  }>(
    `SELECT pg_database_size(current_database())::text AS database,
            pg_total_relation_size($1::regclass)::text AS table,
            pg_size_bytes(current_setting('neon.max_cluster_size', true))::text AS cap`,
    [table],
  )
  const row = result.rows[0]
  if (!row) throw new Error("Size query returned no row")
  return {
    database: Number(row.database),
    table: Number(row.table),
    cap: row.cap === null ? null : Number(row.cap),
  }
}

function megabytes(value: Sizes) {
  return {
    databaseMb: Math.round(value.database / 1e6),
    tableMb: Math.round(value.table / 1e6),
    capMb: value.cap === null ? null : Math.round(value.cap / 1e6),
  }
}

main().catch((error: unknown) => {
  logger.error({
    message: "Vacuum failed",
    error: error instanceof Error ? error.message : String(error),
  })
  process.exitCode = 1
})
