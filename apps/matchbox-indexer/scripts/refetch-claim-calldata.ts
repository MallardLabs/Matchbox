import { parseArgs } from "node:util"
import { createLogger } from "@repo/shared/logger"
import { Pool } from "pg"
import { z } from "zod"
import { CLAIM_SELECTORS, storedInput } from "../src/decode/calldata"
import { VOTER_ADDRESSES } from "../src/decode/constants"
import { networkConfig, networkSchema } from "../src/ingest/networks"
import { RpcClient, lowerHexSchema } from "../src/ingest/rpc"
import { loadDirectDatabaseUrl } from "./database"

// Restores the full calldata of voter claim transactions stored while ingest
// kept only the selector (before migration 0007), so the decoder can read the
// claimed lock's tokenId. Idempotent: rows that already hold more than the
// selector are skipped. Replay the projection afterwards.
//   pnpm --filter @repo/matchbox-indexer refetch:claims -- [--network mezo] [--dry-run]

const logger = createLogger("matchbox-indexer-refetch-claims")

const BATCH = 500

// pnpm 9 forwards the "--" separator to the script; drop it.
const { values } = parseArgs({
  args: process.argv.slice(2).filter((arg) => arg !== "--"),
  options: {
    network: { type: "string", default: "mezo" },
    "dry-run": { type: "boolean", default: false },
  },
})

const hashRowSchema = z.object({ hash: lowerHexSchema })

async function main(): Promise<void> {
  const network = networkSchema.parse(values.network)
  const config = networkConfig(network)
  const pool = new Pool({
    connectionString: loadDirectDatabaseUrl(),
    max: 1,
    application_name: "matchbox-indexer-refetch-claims",
  })
  const rpc = new RpcClient({ endpoints: config.endpoints, network })
  try {
    const result = await pool.query(
      `SELECT hash FROM matchbox_raw.transactions
       WHERE network = $1 AND to_address = ANY($2::text[])
         AND input = ANY($3::text[])`,
      [network, [...VOTER_ADDRESSES], [...CLAIM_SELECTORS]],
    )
    const hashes = z
      .array(hashRowSchema)
      .parse(result.rows)
      .map((row) => row.hash)
    logger.info({
      message: "Voter claim transactions stored with the selector only",
      network,
      count: hashes.length,
    })
    if (values["dry-run"]) return

    let updated = 0
    for (let index = 0; index < hashes.length; index += BATCH) {
      const transactions = await rpc.getTransactions(
        hashes.slice(index, index + BATCH),
      )
      const result = await pool.query(
        `UPDATE matchbox_raw.transactions AS t
         SET input = v.input
         FROM unnest($2::text[], $3::text[]) AS v(hash, input)
         WHERE t.network = $1 AND t.hash = v.hash AND length(v.input) > 10`,
        [
          network,
          transactions.map((tx) => tx.hash),
          transactions.map((tx) => storedInput(tx)),
        ],
      )
      updated += result.rowCount ?? 0
      logger.info({
        message: "Restored claim calldata",
        done: Math.min(index + BATCH, hashes.length),
        of: hashes.length,
        updated,
      })
    }
  } finally {
    await pool.end()
  }
}

main().catch((error: unknown) => {
  logger.error({
    message: "Claim calldata refetch failed",
    error: error instanceof Error ? error.message : String(error),
  })
  process.exitCode = 1
})
