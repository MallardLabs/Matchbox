import { fetchEarnVoteActivity } from "@/lib/mezoActivity/earnVotes"
import { sortActivityDesc } from "@/lib/mezoActivity/normalize"
import { fetchWarehouseActivity } from "@/lib/mezoActivity/warehouse"
import { EARN_PAGE_SIZE } from "@/lib/mezoEarn"
import {
  type IndexedThrough,
  WarehouseUnavailableError,
  recordWarehouseFailure,
  warehouseReadable,
} from "@/lib/warehouse"
import type { MezoActivityItem } from "@/types/mezoActivity"
import { CHAIN_ID, type SupportedChainId } from "@repo/shared/contracts"

export type SourceOptions = {
  chainId: SupportedChainId
  fromTimestamp: number
  toTimestamp: number
  limit: number
  page: number
  actionTypes?: string[]
  // Most callers want the newest events first; pre-flight count helpers want
  // the oldest to estimate the historical span. Defaults to "desc".
  orderDirection?: "asc" | "desc"
  actor?: string | undefined
  recipient?: string | undefined
  gauge?: string | undefined
  source?: string | undefined
}

// Votes and abstains are the only activity outside the warehouse: Mezo's
// earn-votes subgraph serves them on mainnet.
const EARN_VOTE_ACTION_TYPES = new Set(["BOOST_VOTE", "BOOST_ABSTAIN"])

function includesEarnVotes(options: SourceOptions): boolean {
  if (options.chainId !== CHAIN_ID.mainnet) return false
  if (!options.actionTypes || options.actionTypes.length === 0) return true
  return options.actionTypes.some((type) => EARN_VOTE_ACTION_TYPES.has(type))
}

// "warehouse": the warehouse did not serve the page, so it holds earn-votes
// rows only. When earn-votes fails as well, the read throws.
export type ActivitySourceName = "warehouse"

export type MezoActivityResult = {
  data: MezoActivityItem[]
  hasMore: boolean
  page: number
  // Sources that failed; the data is partial when this is non-empty.
  degraded: ActivitySourceName[]
  // Warehouse reads only: the last block the projection has processed.
  indexedThrough?: IndexedThrough | undefined
}

function sortActivity(
  items: MezoActivityItem[],
  orderDirection: "asc" | "desc" | undefined,
): MezoActivityItem[] {
  const sorted = sortActivityDesc(items)
  return orderDirection === "asc" ? sorted.reverse() : sorted
}

export async function fetchMezoActivity(
  options: SourceOptions,
): Promise<MezoActivityResult> {
  // A failed or timed-out warehouse read (Neon down, or its Free quota
  // spent) falls back to earn-votes, marked "warehouse" in `degraded`; the
  // breaker then skips the warehouse for a while.
  if (warehouseReadable(options.chainId)) {
    try {
      // The warehouse decodes every action type, votes included, and pages
      // with a true offset.
      const result = await fetchWarehouseActivity(options)
      return {
        data: result.data,
        hasMore: result.hasMore,
        page: options.page,
        degraded: [],
        indexedThrough: result.indexedThrough,
      }
    } catch (error) {
      recordWarehouseFailure("activity", error)
    }
  }

  if (!includesEarnVotes(options)) {
    if (options.chainId !== CHAIN_ID.mainnet) {
      throw new WarehouseUnavailableError(
        "No activity source: the warehouse and earn-votes are mainnet only",
      )
    }
    return {
      data: [],
      hasMore: false,
      page: options.page,
      degraded: ["warehouse"],
    }
  }
  return fetchEarnVotesOnly(options)
}

// Mezo's earn-votes alone. It pages by cursor, not offset, so read the first
// (page + 1) × limit rows and slice the page. Depth is capped at
// EARN_PAGE_SIZE rows.
async function fetchEarnVotesOnly(
  options: SourceOptions,
): Promise<MezoActivityResult> {
  const page = options.page > 0 ? options.page : 0
  const limit = options.limit > 0 ? options.limit : 0
  const windowLimit = Math.min((page + 1) * limit, EARN_PAGE_SIZE)
  const peekLimit =
    windowLimit >= EARN_PAGE_SIZE ? windowLimit : windowLimit + 1
  let votes: MezoActivityItem[]
  try {
    votes =
      peekLimit > 0
        ? await fetchEarnVoteActivity({
            chainId: options.chainId,
            fromTimestamp: options.fromTimestamp,
            toTimestamp: options.toTimestamp,
            limit: peekLimit,
            orderDirection: options.orderDirection,
            actionTypes: options.actionTypes,
            actor: options.actor,
            gauge: options.gauge,
            source: options.source,
          })
        : []
  } catch (error) {
    throw new AggregateError(
      [error],
      "All activity sources failed: warehouse and earn-votes",
    )
  }
  const sorted = sortActivity(votes, options.orderDirection)
  const start = page * limit
  const end = start + limit
  return {
    data: sorted.slice(start, end),
    hasMore:
      sorted.length > end ||
      (windowLimit >= EARN_PAGE_SIZE && votes.length >= windowLimit),
    page: options.page,
    degraded: ["warehouse"],
  }
}
