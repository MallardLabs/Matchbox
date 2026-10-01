import { createLogger } from "@repo/shared/logger"
import type { ClientBase } from "pg"
import {
  type Address,
  DecodeLogDataMismatch,
  DecodeLogTopicsMismatch,
  type Hex,
  isAddress,
  isHex,
} from "viem"
import { z } from "zod"
import type { Network, RawLog, RawTx } from "../types"
import { lockKeysForLog, resolveHandler } from "./dispatch"
import { lower } from "./helpers"
import { PgStore } from "./pg-store"
import type { Store } from "./store"

// Projects matchbox_raw into the explorer-compatible tables, strictly in
// (block_number, log_index) order, past the 'projection' checkpoint and no
// further than the ingest 'logs' checkpoint. Each batch commits its rows and
// the checkpoint together, so a crash resumes cleanly.

// Bump on any change to handler semantics; the tables must then be replayed.
export const DECODER_VERSION = 1

const PROJECTION_STREAM = "projection"
const LOGS_STREAM = "logs"
const DEFAULT_BATCH_SIZE = 5_000

const logger = createLogger("matchbox-indexer-projection")

export class ProjectionReplayRequiredError extends Error {
  constructor(network: Network, built: number) {
    super(
      `${network} projection was built with decoder v${built}, current is v${DECODER_VERSION}. Run scripts/project.ts --replay.`,
    )
    this.name = "ProjectionReplayRequiredError"
  }
}

const hexSchema = z.custom<Hex>(
  (value) => typeof value === "string" && isHex(value),
)
const addressSchema = z
  .custom<Address>(
    (value) => typeof value === "string" && isAddress(value, { strict: false }),
  )
  .transform((value) => lower(value))

const rawRowSchema = z.object({
  block_number: z.string().transform(BigInt),
  block_hash: hexSchema.transform((value) => lower(value)),
  block_timestamp: z.string().transform(BigInt),
  transaction_hash: hexSchema.transform((value) => lower(value)),
  transaction_index: z.coerce.number().int(),
  log_index: z.coerce.number().int(),
  address: addressSchema,
  topics: z.string().nullable(),
  data: hexSchema.nullable(),
  tx_hash: hexSchema.nullable(),
  from_address: addressSchema.nullable(),
  to_address: addressSchema.nullable(),
  input: hexSchema.nullable(),
})

type RawRow = z.infer<typeof rawRowSchema>

export type LogWithTx = { log: RawLog; tx: RawTx | null }

function splitTopics(topics: string | null): Hex[] {
  if (topics === null || topics.trim() === "") return []
  return topics.split(",").map(function parseTopic(topic) {
    return hexSchema.parse(lower(topic.trim()))
  })
}

function toLogWithTx(network: Network, row: RawRow): LogWithTx {
  const log: RawLog = {
    network,
    blockNumber: row.block_number,
    blockHash: row.block_hash,
    blockTimestamp: row.block_timestamp,
    txHash: row.transaction_hash,
    txIndex: row.transaction_index,
    logIndex: row.log_index,
    address: row.address,
    topics: splitTopics(row.topics),
    data: row.data ?? "0x",
  }
  const tx: RawTx | null =
    row.tx_hash === null || row.from_address === null
      ? null
      : {
          network,
          hash: row.tx_hash,
          blockNumber: row.block_number,
          txIndex: row.transaction_index,
          from: row.from_address,
          to: row.to_address,
          input: row.input ?? "0x",
        }
  return { log, tx }
}

async function readCheckpoint(
  db: ClientBase,
  network: Network,
  stream: string,
): Promise<bigint | null> {
  const result = await db.query(
    `SELECT last_block::text AS last_block FROM matchbox.indexer_checkpoints
     WHERE network = $1 AND stream = $2`,
    [network, stream],
  )
  const row = z
    .array(z.object({ last_block: z.string().transform(BigInt) }))
    .parse(result.rows)[0]
  return row?.last_block ?? null
}

async function writeCheckpoint(
  db: ClientBase,
  network: Network,
  block: bigint,
): Promise<void> {
  await db.query(
    `INSERT INTO matchbox.indexer_checkpoints (network, stream, last_block, updated_at)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (network, stream) DO UPDATE
       SET last_block = EXCLUDED.last_block, updated_at = now()`,
    [network, PROJECTION_STREAM, block.toString()],
  )
}

async function firstRawBlock(
  db: ClientBase,
  network: Network,
): Promise<bigint | null> {
  const result = await db.query(
    `SELECT min(block_number)::text AS first FROM matchbox_raw.logs
     WHERE network = $1`,
    [network],
  )
  const first = z
    .array(z.object({ first: z.string().nullable() }))
    .parse(result.rows)[0]?.first
  return first === undefined || first === null ? null : BigInt(first) - 1n
}

export type ProjectionStatus = {
  projectedBlock: bigint | null
  ingestedBlock: bigint | null
  // Blocks ingested but not yet projected; null before either has run.
  lag: bigint | null
  builtWithDecoderVersion: number | null
  replayRequired: boolean
}

// Read-only snapshot for health checks.
export async function projectionStatus(
  db: ClientBase,
  network: Network,
): Promise<ProjectionStatus> {
  const projectedBlock = await readCheckpoint(db, network, PROJECTION_STREAM)
  const ingestedBlock = await readCheckpoint(db, network, LOGS_STREAM)
  const result = await db.query(
    "SELECT decoder_version FROM matchbox.projection_state WHERE network = $1",
    [network],
  )
  const built =
    z
      .array(z.object({ decoder_version: z.number().int() }))
      .parse(result.rows)[0]?.decoder_version ?? null
  return {
    projectedBlock,
    ingestedBlock,
    lag:
      projectedBlock === null || ingestedBlock === null
        ? null
        : ingestedBlock - projectedBlock,
    builtWithDecoderVersion: built,
    replayRequired: built !== null && built !== DECODER_VERSION,
  }
}

async function ensureDecoderVersion(
  db: ClientBase,
  network: Network,
): Promise<void> {
  const result = await db.query(
    "SELECT decoder_version FROM matchbox.projection_state WHERE network = $1",
    [network],
  )
  const built = z
    .array(z.object({ decoder_version: z.number().int() }))
    .parse(result.rows)[0]?.decoder_version
  if (built === undefined) {
    await db.query(
      `INSERT INTO matchbox.projection_state (network, decoder_version)
       VALUES ($1, $2)`,
      [network, DECODER_VERSION],
    )
    return
  }
  if (built !== DECODER_VERSION) {
    throw new ProjectionReplayRequiredError(network, built)
  }
}

async function readBatch(
  db: ClientBase,
  network: Network,
  afterBlock: bigint,
  throughBlock: bigint,
  limit: number,
): Promise<RawRow[]> {
  const result = await db.query(
    `SELECT l.block_number::text AS block_number, l.block_hash,
            l.block_timestamp::text AS block_timestamp, l.transaction_hash,
            l.transaction_index, l.log_index, l.address, l.topics, l.data,
            t.hash AS tx_hash, t.from_address, t.to_address, t.input
     FROM matchbox_raw.logs l
     LEFT JOIN matchbox_raw.transactions t
       ON t.network = l.network AND t.hash = l.transaction_hash
     WHERE l.network = $1 AND l.block_number > $2 AND l.block_number <= $3
     ORDER BY l.block_number, l.log_index
     LIMIT $4`,
    [network, afterBlock.toString(), throughBlock.toString(), limit],
  )
  return z.array(rawRowSchema).parse(result.rows)
}

// Runs one block's logs in log order. A template created in this block also
// covers the block's earlier logs: graph-node runs a new data source over the
// whole block it was created in.
export function projectBlock(entries: LogWithTx[], store: Store): number {
  let handled = 0
  const deferred: LogWithTx[] = []

  function run(entry: LogWithTx): boolean {
    const handler = resolveHandler(entry.log, store)
    if (handler === undefined) return false
    if (entry.tx === null) {
      throw new Error(
        `Missing transaction ${entry.log.txHash} for handled log ${entry.log.logIndex}`,
      )
    }
    // Mezo's eth_getLogs reports blockTimestamp 0x0; a zero here means raw
    // ingest stored it instead of the block's timestamp.
    if (entry.log.blockTimestamp === 0n) {
      throw new Error(
        `Block ${entry.log.blockNumber} has timestamp 0 in matchbox_raw.logs`,
      )
    }
    try {
      handler(entry.log, entry.tx, store)
    } catch (error) {
      // graph-node skips a trigger whose log does not decode against the
      // handler's event (same topic0, different indexed layout). Handlers
      // decode before mutating anything, so skipping leaves no partial state.
      if (
        error instanceof DecodeLogTopicsMismatch ||
        error instanceof DecodeLogDataMismatch
      ) {
        logger.warn({
          message: "Skipped log that does not match its handler's event",
          txHash: entry.log.txHash,
          logIndex: entry.log.logIndex,
          address: entry.log.address,
        })
        return true
      }
      throw error
    }
    handled += 1
    return true
  }

  for (const entry of entries) {
    if (!run(entry)) deferred.push(entry)
  }
  for (const entry of deferred) {
    const source = store.getDataSource(entry.log.address)
    if (source?.createdBlock === entry.log.blockNumber) run(entry)
  }
  return handled
}

export type ProjectionResult = {
  fromBlock: bigint
  throughBlock: bigint
  logsScanned: number
  logsHandled: number
  activitiesWritten: number
}

export async function runProjection(
  db: ClientBase,
  network: Network,
  toBlock: bigint,
  options: { batchSize?: number; maxBlocks?: bigint } = {},
): Promise<ProjectionResult> {
  const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE
  await ensureDecoderVersion(db, network)
  const projected =
    (await readCheckpoint(db, network, PROJECTION_STREAM)) ?? -1n
  const ingested = await readCheckpoint(db, network, LOGS_STREAM)
  let upper =
    ingested === null ? projected : ingested < toBlock ? ingested : toBlock
  // Bounds one call, e.g. a cron tick catching up after an outage. The
  // first call on an empty projection starts from the first raw log, so the
  // bound counts from there rather than from block 0.
  if (options.maxBlocks !== undefined) {
    const floor = projected >= 0n ? projected : await firstRawBlock(db, network)
    if (floor !== null && upper > floor + options.maxBlocks) {
      upper = floor + options.maxBlocks
    }
  }
  const result: ProjectionResult = {
    fromBlock: projected + 1n,
    throughBlock: projected,
    logsScanned: 0,
    logsHandled: 0,
    activitiesWritten: 0,
  }
  if (upper <= projected) return result

  const store = new PgStore(network, DECODER_VERSION)
  await store.load(db)

  let cursor = projected
  while (cursor < upper) {
    const rows = await readBatch(db, network, cursor, upper, batchSize)
    let complete = rows
    let checkpoint = upper
    if (rows.length === batchSize) {
      // Keep whole blocks together; the last block may be cut off.
      const lastRow = rows[rows.length - 1]
      if (lastRow === undefined) break
      const lastBlock = lastRow.block_number
      complete = rows.filter((row) => row.block_number < lastBlock)
      checkpoint = lastBlock - 1n
      if (complete.length === 0) {
        // One block holds more logs than a batch: read that block whole.
        complete = await readBatch(
          db,
          network,
          lastBlock - 1n,
          lastBlock,
          Number.MAX_SAFE_INTEGER,
        )
        checkpoint = lastBlock
      }
    }

    const entries = complete.map((row) => toLogWithTx(network, row))
    await store.prefetchLocks(
      db,
      entries.flatMap((entry) => lockKeysForLog(entry.log)),
    )

    let blockEntries: LogWithTx[] = []
    for (const entry of entries) {
      const current = blockEntries[0]
      if (current && current.log.blockNumber !== entry.log.blockNumber) {
        result.logsHandled += projectBlock(blockEntries, store)
        blockEntries = []
      }
      blockEntries.push(entry)
    }
    if (blockEntries.length > 0) {
      result.logsHandled += projectBlock(blockEntries, store)
    }

    await db.query("BEGIN")
    try {
      result.activitiesWritten += await store.flush(db)
      await writeCheckpoint(db, network, checkpoint)
      await db.query("COMMIT")
    } catch (error) {
      await db.query("ROLLBACK")
      throw error
    }

    result.logsScanned += entries.length
    result.throughBlock = checkpoint
    cursor = checkpoint
    logger.info({
      message: "Projected batch",
      network,
      throughBlock: checkpoint.toString(),
      logsScanned: result.logsScanned,
      activitiesWritten: result.activitiesWritten,
    })
  }
  return result
}

// Clears the projection for one network so runProjection rebuilds it from the
// first raw log under the current decoder version.
export async function resetProjection(
  db: ClientBase,
  network: Network,
): Promise<void> {
  await db.query("BEGIN")
  try {
    for (const table of [
      "matchbox.activity_events",
      "matchbox.lock_positions",
      "matchbox.votes",
      "matchbox.bribe_to_pool",
      "matchbox.projection_data_sources",
      "matchbox.projection_state",
    ]) {
      await db.query(`DELETE FROM ${table} WHERE network = $1`, [network])
    }
    await db.query(
      "DELETE FROM matchbox.indexer_checkpoints WHERE network = $1 AND stream = $2",
      [network, PROJECTION_STREAM],
    )
    await db.query("COMMIT")
  } catch (error) {
    await db.query("ROLLBACK")
    throw error
  }
}
