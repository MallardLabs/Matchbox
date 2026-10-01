import { createLogger } from "@repo/shared/logger"
import { createDatabasePool } from "./database"

const logger = createLogger("matchbox-indexer-verify")

async function main(): Promise<void> {
  const pool = createDatabasePool()
  try {
    const schemas = await pool.query<{ schema_name: string }>(`
      SELECT schema_name
      FROM information_schema.schemata
      WHERE schema_name IN ('matchbox_raw', 'matchbox', 'matchbox_pro', 'matchbox_scan')
      ORDER BY schema_name
    `)
    const scanTables = await pool.query<{ count: string }>(`
      SELECT count(*)::text AS count
      FROM information_schema.tables
      WHERE table_schema = 'matchbox_scan'
    `)
    const rawColumns = await pool.query<{ column_name: string }>(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'matchbox_raw' AND table_name = 'logs'
      ORDER BY ordinal_position
    `)
    const logKey = await pool.query<{ conname: string }>(`
      SELECT conname
      FROM pg_constraint
      WHERE conrelid = 'matchbox_raw.logs'::regclass
        AND conname = 'logs_network_tx_log_key'
        AND contype = 'u'
    `)
    const ingestTables = await pool.query<{ name: string }>(`
      SELECT table_schema || '.' || table_name AS name
      FROM information_schema.tables
      WHERE (table_schema, table_name) IN (
        ('matchbox_raw', 'transactions'),
        ('matchbox', 'contracts'),
        ('matchbox', 'indexer_checkpoints')
      )
    `)

    if (schemas.rowCount !== 4) {
      throw new Error("Expected all four Matchbox schemas")
    }
    if (scanTables.rows[0]?.count !== "0") {
      throw new Error("matchbox_scan must remain empty")
    }
    if (logKey.rowCount !== 1) {
      throw new Error("(network, transaction_hash, log_index) must be unique")
    }
    if (ingestTables.rowCount !== 3) {
      throw new Error("Ingest tables are missing; run the 0003 migration")
    }

    logger.info({
      message: "Warehouse verification passed",
      schemas: schemas.rows.map((row) => row.schema_name),
      rawColumnCount: rawColumns.rowCount,
    })
  } finally {
    await pool.end()
  }
}

main().catch((error: unknown) => {
  logger.error({
    message: "Warehouse verification failed",
    error: error instanceof Error ? error.message : String(error),
  })
  process.exitCode = 1
})
