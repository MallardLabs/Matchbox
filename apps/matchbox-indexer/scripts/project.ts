import { createLogger } from "@repo/shared/logger"
import { z } from "zod"
import {
  DECODER_VERSION,
  resetProjection,
  runProjection,
} from "../src/decode/index"
import { createDatabasePool } from "./database"

// Projects raw logs into the explorer-compatible tables.
//   tsx scripts/project.ts [--network mezo] [--to <block>] [--replay]
// --replay clears the network's projection first and rebuilds it from the
// first raw log under the current decoder version.

const logger = createLogger("matchbox-indexer-project")

const argsSchema = z.object({
  network: z.enum(["mezo", "mezo-testnet"]),
  to: z.bigint(),
  replay: z.boolean(),
  batch: z.number().int().positive(),
})

function argValue(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`)
  return index === -1 ? undefined : process.argv[index + 1]
}

async function main(): Promise<void> {
  const args = argsSchema.parse({
    network: argValue("network") ?? "mezo",
    to: BigInt(argValue("to") ?? "9223372036854775807"),
    replay: process.argv.includes("--replay"),
    batch: Number.parseInt(argValue("batch") ?? "5000", 10),
  })
  const pool = createDatabasePool()
  const client = await pool.connect()
  try {
    if (args.replay) {
      await resetProjection(client, args.network)
      logger.info({ message: "Projection reset", network: args.network })
    }
    const started = Date.now()
    const result = await runProjection(client, args.network, args.to, {
      batchSize: args.batch,
    })
    logger.info({
      message: "Projection complete",
      network: args.network,
      decoderVersion: DECODER_VERSION,
      fromBlock: result.fromBlock.toString(),
      throughBlock: result.throughBlock.toString(),
      logsScanned: result.logsScanned,
      logsHandled: result.logsHandled,
      activitiesWritten: result.activitiesWritten,
      seconds: Math.round((Date.now() - started) / 1000),
    })
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch((error: unknown) => {
  logger.error({
    message: "Projection failed",
    error: error instanceof Error ? error.message : String(error),
  })
  process.exitCode = 1
})
