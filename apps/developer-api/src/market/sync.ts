import type { Logger } from "@repo/logger"
import { epochSeconds, epochStartOf } from "@repo/platform-contracts/market"
import type { NetworkSlug } from "@repo/platform-contracts/network"
import type { ReferencePrices } from "./prices"
import type { MarketReader } from "./reader"
import { buildSnapshot } from "./snapshot"
import type { MarketStore, SnapshotWriteSummary } from "./store"

export type NetworkMarketSummary = {
  network: NetworkSlug
  status: "ok" | "skipped" | "failed"
  blockNumber: string | null
  gauges: number
  write: SnapshotWriteSummary | null
}

export type MarketSyncSummary = {
  status: "ok" | "failed"
  durationMs: number
  networks: NetworkMarketSummary[]
}

export type MarketSyncOptions = {
  store: MarketStore
  readers: Partial<Record<NetworkSlug, MarketReader>>
  /** Called once per run; a failed source yields a null price. */
  readPrices: () => Promise<ReferencePrices>
  /** Boost gauge → veBTC token id from curated profiles (fallback). */
  profileBoostTokens: (network: NetworkSlug) => Promise<Map<string, string>>
  now: () => Date
  logger: Logger
}

const networks: readonly NetworkSlug[] = ["mezo", "mezo-testnet"]

async function syncNetwork(
  network: NetworkSlug,
  reader: MarketReader | undefined,
  prices: ReferencePrices,
  options: MarketSyncOptions,
): Promise<NetworkMarketSummary> {
  const summary: NetworkMarketSummary = {
    network,
    status: "ok",
    blockNumber: null,
    gauges: 0,
    write: null,
  }
  if (reader === undefined) return { ...summary, status: "skipped" }
  const log = options.logger.child({ network })
  try {
    const takenAt = options.now()
    const current = epochStartOf(Math.floor(takenAt.getTime() / 1000))
    const [stored, profiles, blockNumber] = await Promise.all([
      options.store.boostTokens(network, current),
      options.profileBoostTokens(network).catch((error: unknown) => {
        log.warn({ message: "Profile boost tokens unavailable", error })
        return new Map<string, string>()
      }),
      reader.blockNumber(),
    ])
    summary.blockNumber = blockNumber.toString()
    // Chain-resolved tokens win over curated profile tokens.
    const knownBoostTokens = new Map([...profiles, ...stored])
    const read = await reader.read({
      blockNumber,
      epochStarts: [current, current + epochSeconds],
      knownBoostTokens,
    })
    summary.gauges = read.gauges.length
    summary.write = await options.store.saveSnapshot(
      buildSnapshot(read, prices, takenAt),
    )
    return summary
  } catch (error) {
    log.error({ message: "Market snapshot failed", error })
    return { ...summary, status: "failed" }
  }
}

/** Snapshots gauges and incentives for every network with a reader. */
export default async function syncMarket(
  options: MarketSyncOptions,
): Promise<MarketSyncSummary> {
  const started = options.now().getTime()
  const prices = await options.readPrices()
  const results: NetworkMarketSummary[] = []
  for (const network of networks) {
    results.push(
      await syncNetwork(network, options.readers[network], prices, options),
    )
  }
  const summary: MarketSyncSummary = {
    status: results.some((result) => result.status === "failed")
      ? "failed"
      : "ok",
    durationMs: options.now().getTime() - started,
    networks: results,
  }
  const entry = { message: "Market snapshot finished", ...summary }
  if (summary.status === "ok") options.logger.info(entry)
  else options.logger.warn(entry)
  return summary
}
