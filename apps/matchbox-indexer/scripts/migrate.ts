import { resolve } from "node:path"
import { createLogger } from "@repo/shared/logger"
import type { Pool, PoolClient } from "pg"
import { createDatabasePool, repositoryRoot } from "./database"
import { type MigrationFile, readMigrations } from "./migration-lib"

const logger = createLogger("matchbox-indexer-migrate")

const migrationSets = [
  {
    schema: "matchbox",
    directory: resolve(
      repositoryRoot,
      "apps/matchbox-indexer/db/migrations/matchbox",
    ),
  },
  {
    schema: "matchbox_pro",
    directory: resolve(
      repositoryRoot,
      "apps/matchbox-indexer/db/migrations/matchbox-pro",
    ),
  },
] as const

async function ensureLedger(pool: Pool, schema: string): Promise<void> {
  await pool.query(`CREATE SCHEMA IF NOT EXISTS ${schema}`)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${schema}.schema_migrations (
      filename text PRIMARY KEY,
      checksum text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `)
}

async function applyMigration(
  client: PoolClient,
  schema: string,
  migration: MigrationFile,
): Promise<void> {
  await client.query("BEGIN")
  try {
    await client.query(migration.sql)
    await client.query(
      `INSERT INTO ${schema}.schema_migrations (filename, checksum) VALUES ($1, $2)`,
      [migration.filename, migration.checksum],
    )
    await client.query("COMMIT")
  } catch (error) {
    await client.query("ROLLBACK")
    throw error
  }
}

async function migrateSet(
  pool: Pool,
  schema: string,
  directory: string,
  dryRun: boolean,
): Promise<number> {
  await ensureLedger(pool, schema)
  const migrations = await readMigrations(directory)
  const result = await pool.query<{ filename: string; checksum: string }>(
    `SELECT filename, checksum FROM ${schema}.schema_migrations`,
  )
  const applied = new Map(
    result.rows.map((row) => [row.filename, row.checksum]),
  )
  let pending = 0

  for (const migration of migrations) {
    const recordedChecksum = applied.get(migration.filename)
    if (recordedChecksum !== undefined) {
      if (recordedChecksum !== migration.checksum) {
        throw new Error(
          `Migration ${schema}/${migration.filename} changed after it was applied. Add a new immutable migration instead.`,
        )
      }
      continue
    }

    pending += 1
    if (dryRun) {
      logger.info({
        message: "Migration is pending",
        schema,
        filename: migration.filename,
      })
      continue
    }

    const client = await pool.connect()
    try {
      await applyMigration(client, schema, migration)
      logger.info({
        message: "Migration applied",
        schema,
        filename: migration.filename,
      })
    } finally {
      client.release()
    }
  }

  return pending
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes("--dry-run")
  const pool = createDatabasePool()
  try {
    let pending = 0
    for (const migrationSet of migrationSets) {
      pending += await migrateSet(
        pool,
        migrationSet.schema,
        migrationSet.directory,
        dryRun,
      )
    }
    logger.info({
      message: dryRun ? "Migration dry run complete" : "Migrations complete",
      pending,
    })
  } finally {
    await pool.end()
  }
}

main().catch((error: unknown) => {
  logger.error({
    message: "Migration failed",
    error: error instanceof Error ? error.message : String(error),
  })
  process.exitCode = 1
})
