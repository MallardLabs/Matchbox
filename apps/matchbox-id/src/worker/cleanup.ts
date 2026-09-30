import type { Logger } from "@repo/logger"
import type { IdStore, PurgeCounts } from "./store/id-store"

/**
 * Hourly cron (`triggers.crons` in wrangler.jsonc): deletes expired SIWE
 * nonces, authorization requests, codes, tokens and empty token families in
 * bounded batches until a pass comes back short or the pass budget is spent.
 */

export const cleanupBatchSize = 1000
export const cleanupMaxPasses = 20

function total(counts: PurgeCounts): number {
  return Object.values(counts).reduce((sum, count) => sum + count, 0)
}

function largest(counts: PurgeCounts): number {
  return Math.max(...Object.values(counts))
}

export async function purgeExpiredRows(
  store: IdStore,
  now: Date,
  logger: Logger,
  options: { batchSize?: number; maxPasses?: number } = {},
): Promise<{ passes: number; deleted: number }> {
  const batchSize = options.batchSize ?? cleanupBatchSize
  const maxPasses = options.maxPasses ?? cleanupMaxPasses
  let passes = 0
  let deleted = 0
  while (passes < maxPasses) {
    const counts = await store.purgeExpired(now, batchSize)
    passes += 1
    deleted += total(counts)
    if (largest(counts) < batchSize) break
  }
  logger.info({ message: "Matchbox ID cleanup finished", passes, deleted })
  return { passes, deleted }
}
