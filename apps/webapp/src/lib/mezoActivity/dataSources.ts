import {
  ACTION_TYPE_MAP,
  ACTIVITY_EVENT_FIELDS,
  type ActivityEventRow,
  mapActivityEventRow,
} from "@/lib/mezoActivity/activityEvent"
import { fetchEarnVoteActivity } from "@/lib/mezoActivity/earnVotes"
import { sortActivityDesc } from "@/lib/mezoActivity/normalize"
import { fetchWarehouseActivity } from "@/lib/mezoActivity/warehouse"
import { type IndexedThrough, isWarehouseSource } from "@/lib/warehouse"
import type { MezoActivityItem } from "@/types/mezoActivity"
import { CHAIN_ID, type SupportedChainId } from "@repo/shared/contracts"

const MATCHBOX_EXPLORER_SUBGRAPH_BY_CHAIN: Record<SupportedChainId, string> = {
  [CHAIN_ID.mainnet]:
    process.env.MATCHBOX_EXPLORER_SUBGRAPH_MEZO_URL ??
    "https://api.goldsky.com/api/public/project_cmoiy2fc3z9sl01rk465n7poh/subgraphs/matchbox-explorer/live/gn",
  [CHAIN_ID.testnet]:
    process.env.MATCHBOX_EXPLORER_SUBGRAPH_MEZO_TESTNET_URL ??
    "https://api.goldsky.com/api/public/project_cmoiy2fc3z9sl01rk465n7poh/subgraphs/matchbox-explorer-testnet/live/gn",
}

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

type ExplorerActivityResponse = {
  data?: {
    activityEvents: ActivityEventRow[]
  }
  errors?: Array<{ message: string }>
}

function buildWhereClause(options: SourceOptions): string {
  const parts: string[] = [
    `timestamp_gte: "${options.fromTimestamp}"`,
    `timestamp_lte: "${options.toTimestamp}"`,
  ]
  if (options.actionTypes && options.actionTypes.length > 0) {
    const list = options.actionTypes.map((t) => t).join(", ")
    parts.push(`actionType_in: [${list}]`)
  }
  if (options.actor) {
    parts.push(`actor: "${options.actor.toLowerCase()}"`)
  }
  if (options.recipient) {
    parts.push(`recipient: "${options.recipient.toLowerCase()}"`)
  }
  if (options.gauge) {
    parts.push(`gauge: "${options.gauge.toLowerCase()}"`)
  }
  if (options.source) {
    parts.push(`source: ${options.source}`)
  }
  return `{ ${parts.join(", ")} }`
}

// The Graph caps the `first` argument at 1000. Asking for 1001 (limit + 1 to
// peek ahead for hasMore) silently errors out and returns []. Clamp here.
const SUBGRAPH_FIRST_MAX = 1000

async function fetchExplorerActivityRaw(
  options: SourceOptions,
): Promise<MezoActivityItem[]> {
  const endpoint = MATCHBOX_EXPLORER_SUBGRAPH_BY_CHAIN[options.chainId]
  const fetchSize = Math.min(options.limit + 1, SUBGRAPH_FIRST_MAX)
  const skip = Math.max(options.page, 0) * options.limit
  const where = buildWhereClause(options)
  const orderDirection = options.orderDirection === "asc" ? "asc" : "desc"
  const query = `
      query {
        activityEvents(
          first: ${fetchSize},
          skip: ${skip},
          orderBy: timestamp,
          orderDirection: ${orderDirection},
          where: ${where}
        ) {
          ${ACTIVITY_EVENT_FIELDS.join("\n          ")}
        }
      }
    `
  const response = await fetch(endpoint, {
    method: "POST",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  })
  if (!response.ok) {
    throw new Error(`Explorer subgraph request failed with ${response.status}`)
  }
  const json = (await response.json()) as ExplorerActivityResponse
  if (json.errors?.length) {
    throw new Error(
      `Explorer subgraph errors: ${json.errors.map((e) => e.message).join("; ")}`,
    )
  }
  const items: MezoActivityItem[] = []
  for (const event of json.data?.activityEvents ?? []) {
    const item = mapActivityEventRow(event, "subgraph")
    if (item) items.push(item)
  }
  return items
}

async function fetchExplorerActivity(
  options: SourceOptions,
): Promise<MezoActivityItem[]> {
  if (options.actor) {
    const [actorItems, recipientItems] = await Promise.all([
      fetchExplorerActivityRaw({ ...options, recipient: undefined }),
      fetchExplorerActivityRaw({
        ...options,
        actor: undefined,
        recipient: options.actor,
      }),
    ])

    const merged = [...actorItems]
    const seen = new Set(merged.map((x) => x.id))
    for (const item of recipientItems) {
      if (!seen.has(item.id)) {
        merged.push(item)
      }
    }
    return merged
  }

  return fetchExplorerActivityRaw(options)
}

// Votes and abstains come from Mezo's earn-votes subgraph on mainnet; the
// explorer no longer serves them.
const EARN_VOTE_ACTION_TYPES = new Set(["BOOST_VOTE", "BOOST_ABSTAIN"])

function includesEarnVotes(options: SourceOptions): boolean {
  if (options.chainId !== CHAIN_ID.mainnet) return false
  if (!options.actionTypes || options.actionTypes.length === 0) return true
  return options.actionTypes.some((type) => EARN_VOTE_ACTION_TYPES.has(type))
}

function explorerActionTypesFor(
  actionTypes: string[] | undefined,
): string[] | undefined {
  const requested =
    actionTypes && actionTypes.length > 0
      ? actionTypes
      : Object.keys(ACTION_TYPE_MAP)
  const remaining = requested.filter(
    (actionType) => !EARN_VOTE_ACTION_TYPES.has(actionType),
  )
  return remaining.length > 0 ? remaining : undefined
}

export type ActivitySourceName = "explorer" | "votes"

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

/**
 * Explorer subgraph only, every requested action type included. Pages with
 * `skip`, so any depth works.
 */
export async function fetchExplorerOnlyActivity(
  options: SourceOptions,
): Promise<MezoActivityResult> {
  const explorerItems = await fetchExplorerActivity(options)
  const merged = sortActivity(explorerItems, options.orderDirection)
  // When limit ≥ 1000 we couldn't peek ahead (capped at 1000). Treat a full
  // page as "maybe more" so callers can page forward.
  const hasMore =
    options.limit >= SUBGRAPH_FIRST_MAX
      ? merged.length >= SUBGRAPH_FIRST_MAX
      : merged.length > options.limit
  return {
    data: merged.slice(0, options.limit),
    hasMore,
    page: options.page,
    degraded: [],
  }
}

export async function fetchMezoActivity(
  options: SourceOptions,
): Promise<MezoActivityResult> {
  if (isWarehouseSource(options.chainId)) {
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
  }

  if (!includesEarnVotes(options)) return fetchExplorerOnlyActivity(options)

  // Two sources can't share a `skip`, so read the first (page + 1) × limit
  // rows of each, merge, then slice the page. Depth is capped at 1000 rows.
  const page = options.page > 0 ? options.page : 0
  const limit = options.limit > 0 ? options.limit : 0
  const windowLimit = Math.min((page + 1) * limit, SUBGRAPH_FIRST_MAX)
  const peekLimit =
    windowLimit >= SUBGRAPH_FIRST_MAX ? windowLimit : windowLimit + 1
  const explorerTypes = explorerActionTypesFor(options.actionTypes)
  const [votes, explorer] = await Promise.allSettled([
    peekLimit > 0
      ? fetchEarnVoteActivity({
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
      : Promise.resolve([]),
    explorerTypes && peekLimit > 0
      ? fetchExplorerActivity({
          ...options,
          page: 0,
          limit: peekLimit,
          actionTypes: explorerTypes,
        })
      : Promise.resolve([]),
  ])
  if (votes.status === "rejected" && explorer.status === "rejected") {
    throw new AggregateError(
      [votes.reason, explorer.reason],
      "All activity sources failed",
    )
  }
  const degraded: ActivitySourceName[] = []
  if (votes.status === "rejected") {
    console.error("Activity votes source failed", votes.reason)
    degraded.push("votes")
  }
  if (explorer.status === "rejected") {
    console.error("Activity explorer source failed", explorer.reason)
    degraded.push("explorer")
  }
  const voteItems = votes.status === "fulfilled" ? votes.value : []
  const explorerItems = explorer.status === "fulfilled" ? explorer.value : []
  const merged = sortActivity(
    [...voteItems, ...explorerItems],
    options.orderDirection,
  )
  const start = page * limit
  const end = start + limit
  const hasMore =
    merged.length > end ||
    (windowLimit >= SUBGRAPH_FIRST_MAX &&
      (voteItems.length >= windowLimit || explorerItems.length >= windowLimit))
  return {
    data: merged.slice(start, end),
    hasMore,
    page: options.page,
    degraded,
  }
}
