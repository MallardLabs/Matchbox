import { writeFile } from "node:fs/promises"
import { createLogger } from "@repo/shared/logger"
import { z } from "zod"
import {
  type ActionParity,
  type CanonicalRow,
  canonicalRow,
  compareRows,
  fetchExplorerRows,
} from "../src/decode/parity"
import { ACTIVITY_FIELDS } from "../src/decode/rows"
import { createDatabasePool } from "./database"

// Compares matchbox.activity_events with the frozen matchbox-explorer 3.4.0
// subgraph for every row at or below --through (default: the block the
// subgraph paused at). Exits non-zero on any difference.
//   tsx scripts/parity.ts [--network mezo] [--through 12073396] [--out file]

const logger = createLogger("matchbox-indexer-parity")

const EXPLORER_FROZEN_AT = 12_073_396n

function argValue(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`)
  return index === -1 ? undefined : process.argv[index + 1]
}

const argsSchema = z.object({
  network: z.enum(["mezo", "mezo-testnet"]),
  through: z.bigint(),
  out: z.string().optional(),
})

const scalar = z.union([z.string(), z.boolean(), z.number()]).nullable()

async function readWarehouseRows(
  network: string,
  through: bigint,
): Promise<CanonicalRow[]> {
  const pool = createDatabasePool()
  try {
    const columns = ACTIVITY_FIELDS.map(
      ([field, column, kind]) =>
        `${kind === "numeric" ? `${column}::text` : column} AS "${field}"`,
    ).join(", ")
    const result = await pool.query(
      `SELECT ${columns} FROM matchbox.activity_events
       WHERE network = $1 AND block_number <= $2`,
      [network, through.toString()],
    )
    return z
      .array(z.record(z.string(), scalar))
      .parse(result.rows)
      .map((row) => canonicalRow(row))
  } finally {
    await pool.end()
  }
}

function printTable(parity: ActionParity[]): void {
  const lines = parity.map((p) => {
    const fields = new Map<string, number>()
    for (const diff of p.fieldDiffs) {
      fields.set(diff.field, (fields.get(diff.field) ?? 0) + 1)
    }
    const fieldSummary = [...fields.entries()]
      .map(([field, count]) => `${field}:${count}`)
      .join(" ")
    return [
      p.actionType.padEnd(26),
      String(p.explorer).padStart(7),
      String(p.warehouse).padStart(7),
      String(p.missingIds.length).padStart(6),
      String(p.extraIds.length).padStart(6),
      String(p.fieldDiffs.length).padStart(6),
      fieldSummary,
    ].join(" ")
  })
  process.stdout.write(
    `${["actionType".padEnd(26), "explorer", "wareh.", "miss", "extra", "fdiff"].join(" ")}\n${lines.join("\n")}\n`,
  )
}

async function main(): Promise<void> {
  const args = argsSchema.parse({
    network: argValue("network") ?? "mezo",
    through: BigInt(argValue("through") ?? EXPLORER_FROZEN_AT.toString()),
    out: argValue("out"),
  })
  logger.info({
    message: "Loading explorer rows",
    through: args.through.toString(),
  })
  const explorerRows = await fetchExplorerRows(args.through)
  logger.info({ message: "Loading warehouse rows", count: explorerRows.length })
  const warehouseRows = await readWarehouseRows(args.network, args.through)
  const parity = compareRows(explorerRows, warehouseRows)
  printTable(parity)

  const failing = parity.filter(
    (p) =>
      p.missingIds.length > 0 ||
      p.extraIds.length > 0 ||
      p.fieldDiffs.length > 0,
  )
  if (args.out !== undefined) {
    await writeFile(
      args.out,
      JSON.stringify(
        failing.map((p) => ({
          ...p,
          missingIds: p.missingIds.slice(0, 50),
          extraIds: p.extraIds.slice(0, 50),
          fieldDiffs: p.fieldDiffs.slice(0, 50),
        })),
        null,
        2,
      ),
    )
  }
  logger.info({
    message: failing.length === 0 ? "Parity exact" : "Parity differences",
    explorerRows: explorerRows.length,
    warehouseRows: warehouseRows.length,
    failingActionTypes: failing.map((p) => p.actionType),
  })
  if (failing.length > 0) process.exitCode = 1
}

main().catch((error: unknown) => {
  logger.error({
    message: "Parity check failed",
    error: error instanceof Error ? error.message : String(error),
  })
  process.exitCode = 1
})
