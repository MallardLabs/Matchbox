import { writeFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { z } from "zod"
import { ACTION } from "../../../src/decode/constants"
import { staticSourcesFor } from "../../../src/decode/dispatch"
import {
  type CanonicalRow,
  EXPLORER_340_URL,
  canonicalRow,
} from "../../../src/decode/parity"
import { ACTIVITY_FIELDS } from "../../../src/decode/rows"

// Builds explorer-rows.json: real explorer rows (matchbox-explorer 3.4.0)
// with the exact log and transaction behind each, fetched from Mezo RPC.
//   npx tsx test/decode/fixtures/build-fixtures.ts
// Re-run only to refresh fixtures; tests read the JSON offline.

const RPC_URL = "https://rpc-internal.mezo.org"
const FROZEN_AT = 12_073_396
const PER_SOURCE = 2

const scalar = z.union([z.string(), z.boolean(), z.number()]).nullable()
const pageSchema = z.object({
  data: z.object({
    activityEvents: z.array(z.record(z.string(), scalar.optional())),
  }),
})

const rpcLogSchema = z.object({
  address: z.string(),
  topics: z.array(z.string()),
  data: z.string(),
  blockNumber: z.string(),
  blockHash: z.string(),
  blockTimestamp: z.string().optional(),
  transactionHash: z.string(),
  transactionIndex: z.string(),
  logIndex: z.string(),
})

const rpcTxSchema = z.object({
  hash: z.string(),
  from: z.string(),
  to: z.string().nullable(),
  input: z.string(),
  blockNumber: z.string(),
  transactionIndex: z.string(),
})

const rpcBlockSchema = z.object({ timestamp: z.string() })

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function rpc<T>(
  method: string,
  params: unknown[],
  schema: z.ZodType<T>,
): Promise<T> {
  const response = await fetch(RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  })
  const body = z
    .object({ result: schema.optional(), error: z.unknown().optional() })
    .parse(await response.json())
  if (body.result === undefined) {
    throw new Error(`${method} failed: ${JSON.stringify(body.error)}`)
  }
  return body.result
}

async function explorerRows(actionType: string): Promise<CanonicalRow[]> {
  const selection = ACTIVITY_FIELDS.map(([field]) => field).join(" ")
  const query = `{ activityEvents(first: 60, orderBy: blockNumber, orderDirection: desc,
    where: { actionType: ${actionType}, blockNumber_lte: "${FROZEN_AT}" }) { ${selection} } }`
  const response = await fetch(EXPLORER_340_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  })
  return pageSchema
    .parse(await response.json())
    .data.activityEvents.map((row) => canonicalRow(row))
}

const staticAddresses = new Set<string>(
  staticSourcesFor("mezo").map((source) => source.address),
)

// Template an address was spawned as, judged from the explorer row. Null for
// static sources.
function templateFor(row: CanonicalRow): string | null {
  if (row.contractAddress && staticAddresses.has(row.contractAddress)) {
    return null
  }
  switch (row.source) {
    case "BRIBE_VOTING_REWARD":
      return "BribeVotingReward"
    case "FEE_VOTING_REWARD":
      return "FeeVotingReward"
    case "GAUGE":
      return "Gauge"
    case "POOL":
      return "Pool"
    case "POOLS_VOTER":
      // Bribe NotifyReward rows carry source POOLS_VOTER.
      return "BribeVotingReward"
    default:
      throw new Error(`No template for ${row.id} (${row.source})`)
  }
}

async function main(): Promise<void> {
  const fixtures: unknown[] = []
  for (const actionType of Object.values(ACTION)) {
    const rows = await explorerRows(actionType)
    await sleep(300)
    const perSource = new Map<string, number>()
    for (const row of rows) {
      const key = `${row.source}:${row.contractAddress}`
      const taken = perSource.get(row.source ?? "") ?? 0
      if (taken >= PER_SOURCE || row.blockNumber == null) continue
      perSource.set(row.source ?? "", taken + 1)

      const block = `0x${BigInt(row.blockNumber).toString(16)}`
      const logs = await rpc(
        "eth_getLogs",
        [{ fromBlock: block, toBlock: block, address: row.contractAddress }],
        z.array(rpcLogSchema),
      )
      const log = logs.find(
        (candidate) => BigInt(candidate.logIndex).toString() === row.logIndex,
      )
      if (log === undefined)
        throw new Error(`Log not found for ${row.id} (${key})`)
      const tx = await rpc(
        "eth_getTransactionByHash",
        [log.transactionHash],
        rpcTxSchema,
      )
      // Mezo returns blockTimestamp "0x0" on every log; read the block.
      const timestamp = (
        await rpc("eth_getBlockByNumber", [block, false], rpcBlockSchema)
      ).timestamp
      fixtures.push({
        template: templateFor(row),
        log: {
          blockNumber: BigInt(log.blockNumber).toString(),
          blockHash: log.blockHash.toLowerCase(),
          blockTimestamp: BigInt(timestamp).toString(),
          txHash: log.transactionHash.toLowerCase(),
          txIndex: Number(BigInt(log.transactionIndex)),
          logIndex: Number(BigInt(log.logIndex)),
          address: log.address.toLowerCase(),
          topics: log.topics.map((topic) => topic.toLowerCase()),
          data: log.data.toLowerCase(),
        },
        tx: {
          hash: tx.hash.toLowerCase(),
          from: tx.from.toLowerCase(),
          to: tx.to?.toLowerCase() ?? null,
          // Handlers only read the selector; keep fixtures small.
          input: tx.input.slice(0, 10).toLowerCase(),
        },
        expected: row,
      })
      await sleep(150)
    }
    process.stdout.write(`${actionType}: ${perSource.size} sources\n`)
  }
  const target = fileURLToPath(new URL("./explorer-rows.json", import.meta.url))
  await writeFile(target, `${JSON.stringify(fixtures, null, 2)}\n`)
  process.stdout.write(`wrote ${fixtures.length} fixtures\n`)
}

main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`,
  )
  process.exitCode = 1
})
