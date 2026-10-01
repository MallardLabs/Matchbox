import { createLogger } from "@repo/shared/logger"
import type { Address } from "viem"
import type { RawLog, RawTx, RegisteredContract } from "../types"
import {
  type Discovery,
  FACTORY_TOPICS,
  type PoolLink,
  discoverFromLog,
  factoryContracts,
  mergeContract,
} from "./discovery"
import type { NetworkConfig } from "./networks"
import { type RpcClient, compareLogs } from "./rpc"
import { STATIC_CONTRACTS } from "./static-contracts"
import { type IngestStore, LOGS_STREAM } from "./store"
import { FILTER_GROUPS, filterGroupOf, topic0sFor } from "./topics"

const logger = createLogger("matchbox-indexer-ingest")

const GROUP_TOPIC0S = FILTER_GROUPS.map(topic0sFor)

export type IngestDeps = {
  config: NetworkConfig
  rpc: RpcClient
  store: IngestStore
  // Defaults to STATIC_CONTRACTS for the network; tests inject their own.
  staticContracts?: RegisteredContract[]
}

export type BlockWindow = { from: bigint; to: bigint }

export type WindowResult = BlockWindow & {
  logs: RawLog[]
  transactions: RawTx[]
  contracts: RegisteredContract[]
  poolLinks: PoolLink[]
}

export type IngestSummary = BlockWindow & {
  windows: number
  logs: number
  transactions: number
  contracts: number
}

// Inclusive [from, to] split into windows of at most `size` blocks.
export function blockWindows(
  from: bigint,
  to: bigint,
  size: bigint,
): BlockWindow[] {
  const windows: BlockWindow[] = []
  for (let start = from; start <= to; start += size) {
    const end = start + size - 1n
    windows.push({ from: start, to: end < to ? end : to })
  }
  return windows
}

// Mutable view of matchbox.contracts kept in sync with what was committed.
export class ContractSet {
  private readonly byAddress = new Map<Address, RegisteredContract>()

  constructor(contracts: Iterable<RegisteredContract> = []) {
    for (const contract of contracts) this.add(contract)
  }

  add(contract: RegisteredContract): void {
    this.byAddress.set(
      contract.address,
      mergeContract(this.byAddress.get(contract.address), contract),
    )
  }

  link(link: PoolLink): void {
    const pool = this.byAddress.get(link.pool)
    if (pool)
      this.byAddress.set(link.pool, {
        ...pool,
        gauge: pool.gauge ?? link.gauge,
      })
  }

  has(address: Address): boolean {
    return this.byAddress.has(address)
  }

  get size(): number {
    return this.byAddress.size
  }

  factories(): Map<Address, RegisteredContract> {
    return factoryContracts(this.byAddress.values())
  }

  // Contracts that can have emitted logs by `block`.
  activeAt(block: bigint): RegisteredContract[] {
    return [...this.byAddress.values()].filter(
      (contract) => contract.createdBlock <= block,
    )
  }
}

// One eth_getLogs filter per topic group, each restricted to the events the
// decoder handles for those kinds.
export async function fetchLogs(
  deps: IngestDeps,
  window: BlockWindow,
  contracts: RegisteredContract[],
): Promise<RawLog[]> {
  const groups = FILTER_GROUPS.map((): Address[] => [])
  for (const contract of contracts) {
    groups[filterGroupOf(contract.kind)]?.push(contract.address)
  }
  return deps.rpc.getLogsForFilters(
    window.from,
    window.to,
    groups.map((addresses, index) => ({
      addresses: [...new Set(addresses)].sort(),
      topic0s: GROUP_TOPIC0S[index],
    })),
  )
}

function mergeDiscoveries(discoveries: Discovery[]): Discovery {
  return {
    children: discoveries.flatMap((discovery) => discovery.children),
    poolLinks: discoveries.flatMap((discovery) => discovery.poolLinks),
  }
}

// Fetches one window. Factory logs inside the window can register children;
// the children's logs from the same window are fetched before returning, so a
// gauge created mid-window never loses its first deposit.
export async function fetchWindow(
  deps: IngestDeps,
  window: BlockWindow,
  known: ContractSet,
): Promise<WindowResult> {
  const logs = await fetchLogs(deps, window, known.activeAt(window.to))
  const newChildren: RegisteredContract[] = []
  const poolLinks: PoolLink[] = []
  const pendingChildren = new Set<Address>()

  const factories = known.factories()
  let scan = logs
  while (scan.length > 0) {
    const discovery = mergeDiscoveries(
      scan.map((log) => discoverFromLog(log, factories)),
    )
    poolLinks.push(...discovery.poolLinks)
    const fresh = discovery.children.filter(
      (child) =>
        !known.has(child.address) && !pendingChildren.has(child.address),
    )
    for (const child of discovery.children) {
      if (!known.has(child.address)) newChildren.push(child)
    }
    for (const child of fresh) pendingChildren.add(child.address)
    if (fresh.length === 0) break
    // Children never spawn children, so this loop runs at most twice.
    scan = await fetchLogs(deps, window, fresh)
    logs.push(...scan)
  }

  logs.sort(compareLogs)
  const hashes = [...new Set(logs.map((log) => log.txHash))]
  const stored = await deps.store.knownTransactions(deps.config.network, hashes)
  const transactions = await deps.rpc.getTransactions(
    hashes.filter((hash) => !stored.has(hash)),
  )
  return { ...window, logs, transactions, contracts: newChildren, poolLinks }
}

async function mapConcurrent<T, R>(
  items: T[],
  concurrency: number,
  work: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let next = 0
  async function worker(): Promise<void> {
    while (next < items.length) {
      const index = next++
      results[index] = await work(items[index] as T)
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, worker),
  )
  return results
}

export async function seedStaticContracts(deps: IngestDeps): Promise<void> {
  await deps.store.upsertContracts(
    deps.staticContracts ?? STATIC_CONTRACTS[deps.config.network],
    [],
  )
}

// Registers every factory child created in [from, to] before any window is
// fetched, so windows can then be fetched in parallel with a complete
// address set. Factory logs are scanned by topic only; they are stored as raw
// logs later by the main pass.
export async function discoverRange(
  deps: IngestDeps,
  range: BlockWindow,
  concurrency: number,
): Promise<number> {
  const known = new ContractSet(
    await deps.store.loadContracts(deps.config.network),
  )
  const factories = known.factories()
  const windows = blockWindows(range.from, range.to, deps.config.windowSize)
  const batches = await mapConcurrent(windows, concurrency, (window) =>
    deps.rpc.getLogs(
      window.from,
      window.to,
      [...factories.keys()],
      FACTORY_TOPICS,
    ),
  )
  const factoryLogs = batches.flat().sort(compareLogs)
  const discovery = mergeDiscoveries(
    factoryLogs.map((log) => discoverFromLog(log, factories)),
  )
  const fresh = discovery.children.filter((child) => !known.has(child.address))
  await deps.store.upsertContracts(discovery.children, discovery.poolLinks)
  logger.info({
    message: "Discovered factory children",
    network: deps.config.network,
    from: range.from.toString(),
    to: range.to.toString(),
    factoryLogs: factoryLogs.length,
    newContracts: fresh.length,
  })
  return fresh.length
}

export type IngestRangeOptions = BlockWindow & {
  concurrency?: number
  // Run discoverRange first. Needed for parallel backfills; the head-following
  // cron fetches one window at a time and discovers in-window instead.
  discoverFirst?: boolean
  // Runs after each committed window; throwing stops the range cleanly.
  onWindow?: (result: WindowResult) => void | Promise<void>
}

export async function ingestRange(
  deps: IngestDeps,
  options: IngestRangeOptions,
): Promise<IngestSummary> {
  const concurrency = Math.max(1, options.concurrency ?? 1)
  await seedStaticContracts(deps)
  if (options.discoverFirst) {
    await discoverRange(deps, options, concurrency)
  }
  const known = new ContractSet(
    await deps.store.loadContracts(deps.config.network),
  )
  const windows = blockWindows(options.from, options.to, deps.config.windowSize)
  const summary: IngestSummary = {
    from: options.from,
    to: options.to,
    windows: 0,
    logs: 0,
    transactions: 0,
    contracts: 0,
  }

  // Fetch a batch in parallel, commit it in block order so the checkpoint
  // only ever covers fully ingested blocks.
  for (let index = 0; index < windows.length; index += concurrency) {
    const batch = windows.slice(index, index + concurrency)
    const results = await Promise.all(
      batch.map((window) => fetchWindow(deps, window, known)),
    )
    for (const result of results) {
      await deps.store.commitWindow({
        network: deps.config.network,
        stream: LOGS_STREAM,
        fromBlock: result.from,
        toBlock: result.to,
        startBlock: deps.config.startBlock,
        logs: result.logs,
        transactions: result.transactions,
        contracts: result.contracts,
        poolLinks: result.poolLinks,
      })
      for (const contract of result.contracts) known.add(contract)
      for (const link of result.poolLinks) known.link(link)
      summary.windows++
      summary.logs += result.logs.length
      summary.transactions += result.transactions.length
      summary.contracts += result.contracts.length
      await options.onWindow?.(result)
    }
  }
  return summary
}

export type HeadStatus = {
  head: bigint
  safeHead: bigint
  lastBlock: bigint | null
  lag: bigint | null
}

export async function headStatus(deps: IngestDeps): Promise<HeadStatus> {
  const [head, lastBlock] = await Promise.all([
    deps.rpc.blockNumber(),
    deps.store.getCheckpoint(deps.config.network, LOGS_STREAM),
  ])
  const safeHead = head - deps.config.confirmations
  return {
    head,
    safeHead,
    lastBlock,
    lag: lastBlock === null ? null : safeHead - lastBlock,
  }
}

// One cron tick: ingest from the checkpoint towards head minus confirmations,
// at most `maxBlocks` blocks. Returns null when already caught up.
export async function ingestToHead(
  deps: IngestDeps,
  maxBlocks: bigint,
): Promise<IngestSummary | null> {
  const status = await headStatus(deps)
  const from =
    status.lastBlock === null ? deps.config.startBlock : status.lastBlock + 1n
  if (from > status.safeHead) return null
  const limit = from + maxBlocks - 1n
  const to = limit < status.safeHead ? limit : status.safeHead
  return ingestRange(deps, { from, to, concurrency: 1 })
}
