import type { Logger } from "@repo/logger"
import type { NetworkSlug } from "@repo/platform-contracts/network"
import type {
  ApiStore,
  ChainStateRow,
  ReconciliationTarget,
} from "../store/api-store"
import type { ChainReader } from "./chain-reader"

export const reconcileBatchSize = 40
export const reconcileConcurrency = 3

export type NetworkReconcileSummary = {
  network: NetworkSlug
  status: "ok" | "skipped" | "failed"
  targets: number
  rows: number
  failedBatches: number
  blockNumber: string | null
}

export type ReconcileSummary = {
  status: "ok" | "failed"
  durationMs: number
  networks: NetworkReconcileSummary[]
}

export type ReconcileOptions = {
  store: ApiStore
  readers: Partial<Record<NetworkSlug, ChainReader>>
  now: () => Date
  logger: Logger
  batchSize?: number
  concurrency?: number
}

function chunk<Item>(items: readonly Item[], size: number): Item[][] {
  const chunks: Item[][] = []
  for (let start = 0; start < items.length; start += size) {
    chunks.push(items.slice(start, start + size))
  }
  return chunks
}

/** Runs `worker` over `items` with at most `limit` in flight. */
async function mapBounded<Item, Result>(
  items: readonly Item[],
  limit: number,
  worker: (item: Item) => Promise<Result>,
): Promise<Result[]> {
  const results: Result[] = []
  let next = 0
  async function lane(): Promise<void> {
    while (next < items.length) {
      const index = next
      next += 1
      const item = items[index]
      if (item !== undefined) results[index] = await worker(item)
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => lane()),
  )
  return results
}

async function reconcileNetwork(
  network: NetworkSlug,
  targets: readonly ReconciliationTarget[],
  reader: ChainReader | undefined,
  options: ReconcileOptions,
): Promise<NetworkReconcileSummary> {
  const summary: NetworkReconcileSummary = {
    network,
    status: "ok",
    targets: targets.length,
    rows: 0,
    failedBatches: 0,
    blockNumber: null,
  }
  if (targets.length === 0) return summary
  if (reader === undefined) return { ...summary, status: "skipped" }
  const log = options.logger.child({ network })
  let blockNumber: bigint
  try {
    blockNumber = await reader.blockNumber()
  } catch (error) {
    log.error({ message: "Reconciliation block number failed", error })
    return { ...summary, status: "failed" }
  }
  summary.blockNumber = blockNumber.toString()
  const checkedAt = options.now().toISOString()
  const batches = chunk(targets, options.batchSize ?? reconcileBatchSize)
  const results = await mapBounded(
    batches,
    options.concurrency ?? reconcileConcurrency,
    async function readOne(batch): Promise<ChainStateRow[] | null> {
      try {
        return await reader.readBatch(batch, blockNumber, checkedAt)
      } catch (error) {
        log.warn({
          message: "Reconciliation batch failed",
          size: batch.length,
          error,
        })
        return null
      }
    },
  )
  const rows: ChainStateRow[] = []
  for (const result of results) {
    if (result === null) summary.failedBatches += 1
    else rows.push(...result)
  }
  if (rows.length === 0) {
    return { ...summary, status: summary.failedBatches > 0 ? "failed" : "ok" }
  }
  try {
    await options.store.upsertChainState(rows)
    summary.rows = rows.length
  } catch (error) {
    log.error({ message: "Reconciliation upsert failed", error })
    return { ...summary, status: "failed" }
  }
  return summary
}

/**
 * Reconciles `mbx_api_gauge_chain_state` from live chain reads. Never
 * throws: every failure is logged and reflected in the summary.
 */
export default async function reconcileChainState(
  options: ReconcileOptions,
): Promise<ReconcileSummary> {
  const startedAt = options.now().getTime()
  const networks: NetworkReconcileSummary[] = []
  let status: ReconcileSummary["status"] = "ok"
  try {
    const targets = await options.store.listProfilesForReconciliation()
    for (const network of ["mezo", "mezo-testnet"] as const) {
      const summary = await reconcileNetwork(
        network,
        targets.filter((target) => target.network === network),
        options.readers[network],
        options,
      )
      if (summary.status === "failed") status = "failed"
      networks.push(summary)
    }
  } catch (error) {
    status = "failed"
    options.logger.error({ message: "Reconciliation failed", error })
  }
  const result: ReconcileSummary = {
    status,
    durationMs: options.now().getTime() - startedAt,
    networks,
  }
  options.logger.info({ message: "Chain state reconciliation", ...result })
  return result
}
