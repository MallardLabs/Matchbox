import type { Pool, PoolClient } from "pg"
import type { Address, Hex } from "viem"
import { storedInput } from "../decode/calldata"
import type { Network, RawLog, RawTx, RegisteredContract } from "../types"
import { type PoolLink, mergeContract } from "./discovery"

export const LOGS_STREAM = "logs"

export type WindowCommit = {
  network: Network
  stream: string
  fromBlock: bigint
  toBlock: bigint
  // The network's first ingest block. A checkpoint is only created by a
  // window that starts there, so it always means "every block up to here".
  startBlock: bigint
  logs: RawLog[]
  transactions: RawTx[]
  contracts: RegisteredContract[]
  poolLinks: PoolLink[]
}

export interface IngestStore {
  loadContracts(network: Network): Promise<RegisteredContract[]>
  upsertContracts(
    contracts: RegisteredContract[],
    poolLinks: PoolLink[],
  ): Promise<void>
  knownTransactions(network: Network, hashes: Hex[]): Promise<Set<Hex>>
  getCheckpoint(network: Network, stream: string): Promise<bigint | null>
  // Logs, transactions, registry changes and the checkpoint land together or
  // not at all. The checkpoint covers a contiguous prefix of the chain: it
  // advances only when the window starts at or before checkpoint + 1, and it
  // never moves backwards. Re-ingesting or skipping ahead leaves it alone.
  commitWindow(commit: WindowCommit): Promise<void>
}

export function nextCheckpoint(
  current: bigint | null,
  commit: Pick<WindowCommit, "fromBlock" | "toBlock" | "startBlock">,
): bigint | null {
  if (current === null) {
    return commit.fromBlock <= commit.startBlock ? commit.toBlock : null
  }
  if (commit.fromBlock > current + 1n) return current
  return commit.toBlock > current ? commit.toBlock : current
}

// No decoder handler reads past the calldata selector (src/decode/calldata.ts
// proves it per handler), so only the selector is persisted. Full calldata was
// about 80% of each transaction row.
export function persistedTx(tx: RawTx): RawTx {
  return { ...tx, input: storedInput(tx.input) }
}

export function rawLogId(log: Pick<RawLog, "txHash" | "logIndex">): string {
  return `${log.txHash.toLowerCase()}-${log.logIndex}`
}

// One row per address, merged the way the database upsert merges them, so a
// single INSERT ... ON CONFLICT never touches the same row twice.
export function dedupeContracts(
  contracts: RegisteredContract[],
): RegisteredContract[] {
  const byKey = new Map<string, RegisteredContract>()
  for (const contract of contracts) {
    const key = `${contract.network}:${contract.address}`
    byKey.set(key, mergeContract(byKey.get(key), contract))
  }
  return [...byKey.values()]
}

type ContractRow = {
  network: Network
  address: string
  kind: RegisteredContract["kind"]
  template: string
  parent: string | null
  pool: string | null
  gauge: string | null
  created_block: string
  created_tx: string | null
}

function fromRow(row: ContractRow): RegisteredContract {
  return {
    network: row.network,
    address: row.address as Address,
    kind: row.kind,
    template: row.template,
    parent: row.parent as Address | null,
    pool: row.pool as Address | null,
    gauge: row.gauge as Address | null,
    createdBlock: BigInt(row.created_block),
    createdTx: row.created_tx as Hex | null,
  }
}

type Executor = Pick<PoolClient, "query">

async function upsertContractRows(
  executor: Executor,
  contracts: RegisteredContract[],
): Promise<void> {
  const rows = dedupeContracts(contracts)
  if (rows.length === 0) return
  await executor.query(
    `INSERT INTO matchbox.contracts
       (network, address, kind, template, parent, pool, gauge, created_block, created_tx)
     SELECT * FROM unnest(
       $1::text[], $2::text[], $3::text[], $4::text[], $5::text[],
       $6::text[], $7::text[], $8::bigint[], $9::text[]
     )
     ON CONFLICT (network, address) DO UPDATE SET
       parent = COALESCE(matchbox.contracts.parent, EXCLUDED.parent),
       pool = COALESCE(matchbox.contracts.pool, EXCLUDED.pool),
       gauge = COALESCE(matchbox.contracts.gauge, EXCLUDED.gauge),
       created_block = LEAST(matchbox.contracts.created_block, EXCLUDED.created_block),
       created_tx = COALESCE(matchbox.contracts.created_tx, EXCLUDED.created_tx)`,
    [
      rows.map((row) => row.network),
      rows.map((row) => row.address),
      rows.map((row) => row.kind),
      rows.map((row) => row.template),
      rows.map((row) => row.parent),
      rows.map((row) => row.pool),
      rows.map((row) => row.gauge),
      rows.map((row) => row.createdBlock.toString()),
      rows.map((row) => row.createdTx),
    ],
  )
}

async function applyPoolLinks(
  executor: Executor,
  links: PoolLink[],
): Promise<void> {
  if (links.length === 0) return
  await executor.query(
    `UPDATE matchbox.contracts AS c
     SET gauge = COALESCE(c.gauge, l.gauge)
     FROM unnest($1::text[], $2::text[], $3::text[]) AS l(network, pool, gauge)
     WHERE c.network = l.network AND c.address = l.pool`,
    [
      links.map((link) => link.network),
      links.map((link) => link.pool),
      links.map((link) => link.gauge),
    ],
  )
}

async function insertLogs(executor: Executor, logs: RawLog[]): Promise<void> {
  if (logs.length === 0) return
  await executor.query(
    `INSERT INTO matchbox_raw.logs
       (id, network, block_number, block_hash, block_timestamp,
        transaction_hash, transaction_index, log_index, address, topics, data)
     SELECT * FROM unnest(
       $1::text[], $2::text[], $3::bigint[], $4::text[], $5::bigint[],
       $6::text[], $7::bigint[], $8::bigint[], $9::text[], $10::text[], $11::text[]
     )
     ON CONFLICT DO NOTHING`,
    [
      logs.map(rawLogId),
      logs.map((log) => log.network),
      logs.map((log) => log.blockNumber.toString()),
      logs.map((log) => log.blockHash),
      logs.map((log) => log.blockTimestamp.toString()),
      logs.map((log) => log.txHash),
      logs.map((log) => log.txIndex.toString()),
      logs.map((log) => log.logIndex.toString()),
      logs.map((log) => log.address),
      logs.map((log) => log.topics.join(",")),
      logs.map((log) => log.data),
    ],
  )
}

async function insertTransactions(
  executor: Executor,
  transactions: RawTx[],
): Promise<void> {
  if (transactions.length === 0) return
  await executor.query(
    `INSERT INTO matchbox_raw.transactions
       (network, hash, block_number, transaction_index, from_address, to_address, input)
     SELECT * FROM unnest(
       $1::text[], $2::text[], $3::bigint[], $4::int[], $5::text[], $6::text[], $7::text[]
     )
     ON CONFLICT DO NOTHING`,
    [
      transactions.map((tx) => tx.network),
      transactions.map((tx) => tx.hash),
      transactions.map((tx) => tx.blockNumber.toString()),
      transactions.map((tx) => tx.txIndex),
      transactions.map((tx) => tx.from),
      transactions.map((tx) => tx.to),
      transactions.map((tx) => storedInput(tx.input)),
    ],
  )
}

export class PgIngestStore implements IngestStore {
  constructor(private readonly pool: Pool) {}

  async loadContracts(network: Network): Promise<RegisteredContract[]> {
    const result = await this.pool.query<ContractRow>(
      `SELECT network, address, kind, template, parent, pool, gauge,
              created_block::text, created_tx
       FROM matchbox.contracts WHERE network = $1`,
      [network],
    )
    return result.rows.map(fromRow)
  }

  async upsertContracts(
    contracts: RegisteredContract[],
    poolLinks: PoolLink[],
  ): Promise<void> {
    await this.inTransaction(async (client) => {
      await upsertContractRows(client, contracts)
      await applyPoolLinks(client, poolLinks)
    })
  }

  async knownTransactions(network: Network, hashes: Hex[]): Promise<Set<Hex>> {
    if (hashes.length === 0) return new Set()
    const result = await this.pool.query<{ hash: Hex }>(
      `SELECT hash FROM matchbox_raw.transactions
       WHERE network = $1 AND hash = ANY($2::text[])`,
      [network, hashes],
    )
    return new Set(result.rows.map((row) => row.hash))
  }

  async getCheckpoint(
    network: Network,
    stream: string,
  ): Promise<bigint | null> {
    const result = await this.pool.query<{ last_block: string }>(
      `SELECT last_block::text FROM matchbox.indexer_checkpoints
       WHERE network = $1 AND stream = $2`,
      [network, stream],
    )
    const row = result.rows[0]
    return row ? BigInt(row.last_block) : null
  }

  async commitWindow(commit: WindowCommit): Promise<void> {
    await this.inTransaction(async (client) => {
      await upsertContractRows(client, commit.contracts)
      await applyPoolLinks(client, commit.poolLinks)
      await insertLogs(client, commit.logs)
      await insertTransactions(client, commit.transactions)
      const current = await client.query<{ last_block: string }>(
        `SELECT last_block::text FROM matchbox.indexer_checkpoints
         WHERE network = $1 AND stream = $2
         FOR UPDATE`,
        [commit.network, commit.stream],
      )
      const currentBlock = current.rows[0]
        ? BigInt(current.rows[0].last_block)
        : null
      const next = nextCheckpoint(currentBlock, commit)
      if (next === null || next === currentBlock) return
      await client.query(
        `INSERT INTO matchbox.indexer_checkpoints (network, stream, last_block, updated_at)
         VALUES ($1, $2, $3, now())
         ON CONFLICT (network, stream) DO UPDATE SET
           last_block = EXCLUDED.last_block,
           updated_at = now()`,
        [commit.network, commit.stream, next.toString()],
      )
    })
  }

  private async inTransaction(
    work: (client: PoolClient) => Promise<void>,
  ): Promise<void> {
    const client = await this.pool.connect()
    try {
      await client.query("BEGIN")
      await work(client)
      await client.query("COMMIT")
    } catch (error) {
      await client.query("ROLLBACK")
      throw error
    } finally {
      client.release()
    }
  }
}

// Same semantics as PgIngestStore, held in memory. Used by tests and dry runs.
export class MemoryIngestStore implements IngestStore {
  readonly contracts = new Map<string, RegisteredContract>()
  readonly logs = new Map<string, RawLog>()
  readonly transactions = new Map<string, RawTx>()
  readonly checkpoints = new Map<string, bigint>()
  commits = 0

  async loadContracts(network: Network): Promise<RegisteredContract[]> {
    return [...this.contracts.values()].filter(
      (contract) => contract.network === network,
    )
  }

  async upsertContracts(
    contracts: RegisteredContract[],
    poolLinks: PoolLink[],
  ): Promise<void> {
    for (const contract of dedupeContracts(contracts)) {
      const key = `${contract.network}:${contract.address}`
      this.contracts.set(key, mergeContract(this.contracts.get(key), contract))
    }
    for (const link of poolLinks) {
      const key = `${link.network}:${link.pool}`
      const pool = this.contracts.get(key)
      if (pool)
        this.contracts.set(key, { ...pool, gauge: pool.gauge ?? link.gauge })
    }
  }

  async knownTransactions(network: Network, hashes: Hex[]): Promise<Set<Hex>> {
    return new Set(
      hashes.filter((hash) => this.transactions.has(`${network}:${hash}`)),
    )
  }

  async getCheckpoint(
    network: Network,
    stream: string,
  ): Promise<bigint | null> {
    return this.checkpoints.get(`${network}:${stream}`) ?? null
  }

  async commitWindow(commit: WindowCommit): Promise<void> {
    await this.upsertContracts(commit.contracts, commit.poolLinks)
    for (const log of commit.logs) {
      const id = rawLogId(log)
      if (!this.logs.has(id)) this.logs.set(id, log)
    }
    for (const tx of commit.transactions) {
      const key = `${tx.network}:${tx.hash}`
      if (!this.transactions.has(key)) {
        this.transactions.set(key, persistedTx(tx))
      }
    }
    const key = `${commit.network}:${commit.stream}`
    const next = nextCheckpoint(this.checkpoints.get(key) ?? null, commit)
    if (next !== null) this.checkpoints.set(key, next)
    this.commits++
  }
}
