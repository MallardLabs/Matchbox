import { parseArgs } from "node:util"
import { createLogger } from "@repo/shared/logger"
import { Pool, type PoolClient } from "pg"
import { z } from "zod"
import {
  DECODER_VERSION,
  resetProjection,
  runProjection,
} from "../src/decode/index"
import {
  type IngestDeps,
  discoverRange,
  historyStartBlock,
  ingestRange,
  seedStaticContracts,
} from "../src/ingest/ingest"
import { networkConfig, networkSchema } from "../src/ingest/networks"
import { RpcClient } from "../src/ingest/rpc"
import { PgIngestStore } from "../src/ingest/store"
import { databaseUsage, pruneRaw } from "../src/maintenance"
import { loadDirectDatabaseUrl } from "./database"

// The warehouse's full load, and its replay once raw history is pruned
// (src/maintenance.ts). Walks history in chunks: ingest a chunk from RPC,
// project it, then prune the raw rows it no longer needs, so the database
// never holds more raw than one chunk plus the retention window. That keeps
// a load inside Neon Free's 1 GB.
//   pnpm --filter @repo/matchbox-indexer rebuild:history -- --network mezo \
//     [--replay] [--from N] [--to N] [--chunk 500000] [--concurrency 4]
//
// --replay clears the projection first (a decoder version change). Without
// it, the run resumes after the projection checkpoint. --from defaults to
// block 178,630 (mUSD), --to to head minus confirmations. Needs the owner's
// direct URL: projection batches can exceed the indexer role's timeout.
// (The package script is rebuild:history: `pnpm rebuild` is a pnpm command.)

const logger = createLogger("matchbox-indexer-rebuild")

// pnpm 9 forwards the "--" separator to the script; drop it.
const { values } = parseArgs({
  args: process.argv.slice(2).filter((arg) => arg !== "--"),
  options: {
    network: { type: "string", default: "mezo" },
    from: { type: "string" },
    to: { type: "string" },
    chunk: { type: "string", default: "500000" },
    concurrency: { type: "string", default: "4" },
    replay: { type: "boolean", default: false },
  },
})

const checkpointSchema = z.object({ last_block: z.string().transform(BigInt) })

// Neon Free suspends the compute after 5 minutes without a query and drops
// every connection, and the RPC-only stretches (the factory pre-scan, a
// chunk's fetch) run longer than that. A cheap query every minute keeps it
// awake for the run.
const HEARTBEAT_MS = 60_000

async function withClient<T>(
  pool: Pool,
  run: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect()
  try {
    return await run(client)
  } finally {
    client.release()
  }
}

async function projectionCheckpoint(
  pool: Pool,
  network: string,
): Promise<bigint | null> {
  const result = await pool.query(
    `SELECT last_block::text AS last_block FROM matchbox.indexer_checkpoints
     WHERE network = $1 AND stream = 'projection'`,
    [network],
  )
  return z.array(checkpointSchema).parse(result.rows)[0]?.last_block ?? null
}

function megabytes(bytes: bigint): number {
  return Number(bytes / 1_000_000n)
}

async function main(): Promise<void> {
  const network = networkSchema.parse(values.network)
  const config = networkConfig(network)
  const chunk = BigInt(values.chunk ?? "500000")
  const concurrency = Number.parseInt(values.concurrency ?? "4", 10)
  if (chunk < config.windowSize) {
    throw new Error(
      `--chunk must be at least one window (${config.windowSize})`,
    )
  }
  const pool = new Pool({
    connectionString: loadDirectDatabaseUrl(),
    max: concurrency + 2,
    application_name: "matchbox-indexer-rebuild",
  })
  const rpc = new RpcClient({ endpoints: config.endpoints, network })
  const deps: IngestDeps = { config, rpc, store: new PgIngestStore(pool) }
  // An idle pooled connection the server closes is replaced on next use.
  pool.on("error", (error) => {
    logger.warn({
      message: "Idle database connection closed",
      error: error.message,
    })
  })
  const heartbeat = setInterval(() => {
    pool.query("SELECT 1").catch(() => {
      // The next real query reconnects (and wakes the compute) if needed.
    })
  }, HEARTBEAT_MS)
  const startedAt = Date.now()

  try {
    if (values.replay) {
      await withClient(pool, (client) => resetProjection(client, network))
      logger.info({ message: "Projection reset", network })
    }
    const head = (await rpc.blockNumber()) - config.confirmations
    const to = values.to ? BigInt(values.to) : head
    let cursor = values.from ? BigInt(values.from) : historyStartBlock(deps)
    const projected = await projectionCheckpoint(pool, network)
    if (projected !== null && projected + 1n > cursor) cursor = projected + 1n
    const first = cursor

    logger.info({
      message: "Rebuild starting",
      network,
      from: cursor.toString(),
      to: to.toString(),
      chunk: chunk.toString(),
      decoderVersion: DECODER_VERSION,
    })

    // Register every factory child once, up front, so the chunks' parallel
    // windows see the full address set (a per-chunk pre-scan repeats most of
    // this work).
    await seedStaticContracts(deps)
    await discoverRange(deps, { from: cursor, to }, concurrency)

    while (cursor <= to) {
      const usage = await databaseUsage(pool)
      if (!usage.writable) {
        throw new Error(
          `Database is ${megabytes(usage.bytes)} MB of ${megabytes(usage.capBytes)} MB; stopped before block ${cursor}`,
        )
      }
      const end = cursor + chunk - 1n < to ? cursor + chunk - 1n : to
      const ingested = await ingestRange(deps, {
        from: cursor,
        to: end,
        concurrency,
      })
      const result = await withClient(pool, (client) =>
        runProjection(client, network, end),
      )
      // No per-run cap: the owner role has no statement timeout.
      const pruned = await withClient(pool, (client) =>
        pruneRaw(client, network, { maxBlocks: null }),
      )
      logger.info({
        message: "Rebuild chunk done",
        through: end.toString(),
        percent:
          Math.round(
            (Number(end - first + 1n) / Number(to - first + 1n)) * 1000,
          ) / 10,
        logs: ingested.logs,
        activitiesWritten: result.activitiesWritten,
        prunedThrough: pruned?.throughBlock.toString() ?? null,
        databaseMb: megabytes((await databaseUsage(pool)).bytes),
        elapsedSeconds: Math.round((Date.now() - startedAt) / 1000),
      })
      cursor = end + 1n
    }
    logger.info({
      message: "Rebuild complete",
      network,
      through: to.toString(),
      seconds: Math.round((Date.now() - startedAt) / 1000),
      databaseMb: megabytes((await databaseUsage(pool)).bytes),
    })
  } finally {
    clearInterval(heartbeat)
    await pool.end()
  }
}

main().catch((error: unknown) => {
  logger.error({
    message: "Rebuild failed",
    error: error instanceof Error ? error.message : String(error),
  })
  process.exitCode = 1
})
