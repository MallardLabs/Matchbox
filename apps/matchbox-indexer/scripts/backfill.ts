import { parseArgs } from "node:util"
import { createLogger } from "@repo/shared/logger"
import { Pool } from "pg"
import { type IngestDeps, ingestRange } from "../src/ingest/ingest"
import { networkConfig, networkSchema } from "../src/ingest/networks"
import { RpcClient } from "../src/ingest/rpc"
import { PgIngestStore } from "../src/ingest/store"
import { loadDirectDatabaseUrl } from "./database"

// pnpm --filter @repo/matchbox-indexer backfill -- --network mezo \
//   --from 5000000 [--to N] [--concurrency 4] [--max-db-mb 900]
//
// Resumable: windows commit in order with the checkpoint, and re-ingesting a
// range is a no-op. Stops cleanly (checkpoint intact) if the database grows
// past --max-db-mb, so the Neon branch cap is never hit mid-write.

const logger = createLogger("matchbox-indexer-backfill")

const SIZE_CHECK_EVERY = 25

const { values } = parseArgs({
  options: {
    network: { type: "string", default: "mezo" },
    from: { type: "string" },
    to: { type: "string" },
    concurrency: { type: "string", default: "4" },
    "max-db-mb": { type: "string", default: "900" },
    "skip-discovery": { type: "boolean", default: false },
  },
})

class SizeLimitReached extends Error {}

async function databaseMegabytes(pool: Pool): Promise<number> {
  const result = await pool.query<{ bytes: string }>(
    "SELECT pg_database_size(current_database())::text AS bytes",
  )
  return Number(BigInt(result.rows[0]?.bytes ?? "0") / 1_000_000n)
}

async function main(): Promise<void> {
  const network = networkSchema.parse(values.network)
  const config = networkConfig(network)
  const concurrency = Number.parseInt(values.concurrency ?? "4", 10)
  const maxDbMb = Number.parseInt(values["max-db-mb"] ?? "900", 10)
  const pool = new Pool({
    connectionString: loadDirectDatabaseUrl(),
    max: concurrency + 1,
    application_name: "matchbox-indexer-backfill",
  })
  const rpc = new RpcClient({ endpoints: config.endpoints, network })
  const deps: IngestDeps = { config, rpc, store: new PgIngestStore(pool) }

  try {
    const from = values.from ? BigInt(values.from) : config.startBlock
    const head = (await rpc.blockNumber()) - config.confirmations
    const to = values.to ? BigInt(values.to) : head
    const totalBlocks = Number(to - from + 1n)
    const startedAt = Date.now()
    let windows = 0
    let logs = 0
    let transactions = 0

    logger.info({
      message: "Backfill starting",
      network,
      from: from.toString(),
      to: to.toString(),
      concurrency,
      databaseMb: await databaseMegabytes(pool),
    })

    const summary = await ingestRange(deps, {
      from,
      to,
      concurrency,
      discoverFirst: !values["skip-discovery"],
      onWindow: async (result) => {
        windows++
        logs += result.logs.length
        transactions += result.transactions.length
        if (windows % SIZE_CHECK_EVERY !== 0 && result.to !== to) return
        const done = Number(result.to - from + 1n)
        const elapsed = (Date.now() - startedAt) / 1000
        const databaseMb = await databaseMegabytes(pool)
        logger.info({
          message: "Backfill progress",
          block: result.to.toString(),
          percent: Math.round((done / totalBlocks) * 1000) / 10,
          logs,
          transactions,
          elapsedSeconds: Math.round(elapsed),
          etaSeconds: Math.round((elapsed / done) * (totalBlocks - done)),
          databaseMb,
        })
        if (databaseMb > maxDbMb) {
          throw new SizeLimitReached(
            `Database is ${databaseMb} MB, over --max-db-mb ${maxDbMb}; stopped at block ${result.to}`,
          )
        }
      },
    })

    const contracts = await deps.store.loadContracts(network)
    logger.info({
      message: "Backfill complete",
      network,
      from: summary.from.toString(),
      to: summary.to.toString(),
      windows: summary.windows,
      logs: summary.logs,
      transactions: summary.transactions,
      contracts: contracts.length,
      seconds: Math.round((Date.now() - startedAt) / 1000),
      databaseMb: await databaseMegabytes(pool),
    })
  } finally {
    await pool.end()
  }
}

main().catch((error: unknown) => {
  logger.error({
    message:
      error instanceof SizeLimitReached ? "Backfill paused" : "Backfill failed",
    error: error instanceof Error ? error.message : String(error),
  })
  process.exitCode = 1
})
