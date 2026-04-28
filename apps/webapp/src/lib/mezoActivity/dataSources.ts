import { normalizeAddress, sortActivityDesc } from "@/lib/mezoActivity/normalize"
import type {
  MezoActivityActionType,
  MezoActivityCursor,
  MezoActivityItem,
} from "@/types/mezoActivity"
import { CHAIN_ID, type SupportedChainId } from "@repo/shared/contracts"
import type { Hash } from "viem"

const MATCHBOX_EXPLORER_SUBGRAPH_BY_CHAIN: Record<SupportedChainId, string> = {
  [CHAIN_ID.mainnet]:
    process.env.MATCHBOX_EXPLORER_SUBGRAPH_MEZO_URL ??
    "https://api.goldsky.com/api/public/project_cmoiy2fc3z9sl01rk465n7poh/subgraphs/matchbox-explorer/1.0.0/gn",
  [CHAIN_ID.testnet]:
    process.env.MATCHBOX_EXPLORER_SUBGRAPH_MEZO_TESTNET_URL ??
    "https://api.goldsky.com/api/public/project_cmoiy2fc3z9sl01rk465n7poh/subgraphs/matchbox-explorer-testnet/1.0.0/gn",
}

type SourceOptions = {
  chainId: SupportedChainId
  fromTimestamp: number
  toTimestamp: number
  limit: number
  cursor?: MezoActivityCursor
}

type ExplorerActivityEvent = {
  id: string
  actionType: string
  boostContext: string
  source: string
  txHash: string
  logIndex: string
  blockNumber: string
  timestamp: string
  actor?: string | null
  tokenId?: string | null
  amount?: string | null
  duration?: string | null
  gauge?: string | null
  boostableTokenId?: string | null
  boost?: string | null
  weight?: string | null
  totalWeight?: string | null
}

type ExplorerActivityResponse = {
  data?: {
    activityEvents: ExplorerActivityEvent[]
  }
  errors?: Array<{ message: string }>
}

const ACTION_TYPE_MAP: Record<string, MezoActivityActionType> = {
  LOCK_CREATED: "lockCreated",
  LOCK_AMOUNT_INCREASED: "lockAmountIncreased",
  LOCK_EXTENDED: "lockExtended",
  LOCK_WITHDRAWN: "lockWithdrawn",
  LOCK_PERMANENT: "lockPermanent",
  LOCK_PERMANENT_UNLOCKED: "lockPermanentUnlocked",
  BOOST_VOTE: "boostVote",
  BOOST_ABSTAIN: "boostAbstain",
  BOOST_POKE: "boostPoke",
  PAIR_CREATED: "pairCreated",
  GAUGE_CREATED: "gaugeCreated",
  GAUGE_KILLED: "gaugeKilled",
  GAUGE_REVIVED: "gaugeRevived",
  BOOSTABLE_TOKEN_BURNED: "boostableTokenBurned",
  INCENTIVE_ADDED: "incentiveAdded",
  REWARD_DISTRIBUTED: "rewardDistributed",
  REWARD_NOTIFIED: "rewardNotified",
}

function mapBoostContext(value: string): MezoActivityItem["boostContext"] {
  if (value === "MATCHBOX_GAUGE_BOOST") return "matchboxGaugeBoost"
  if (value === "MEZO_VEBTC_PAIR_BOOST") return "mezoVeBtcPairBoost"
  return "unknown"
}

function maybeHash(value: string | undefined): Hash | undefined {
  return value && /^0x[a-fA-F0-9]{64}$/.test(value) ? (value as Hash) : undefined
}

function applyCursor(items: MezoActivityItem[], cursor?: MezoActivityCursor) {
  if (!cursor) return items
  return items.filter((item) => {
    if (item.timestamp < cursor.timestamp) return true
    if (item.timestamp > cursor.timestamp) return false
    const itemIndex = item.logIndex ?? -1
    if (itemIndex < cursor.logIndex) return true
    if (itemIndex > cursor.logIndex) return false
    return item.id < cursor.id
  })
}

async function fetchExplorerActivity(
  options: SourceOptions,
): Promise<MezoActivityItem[]> {
  const endpoint = MATCHBOX_EXPLORER_SUBGRAPH_BY_CHAIN[options.chainId]
  const query = `
      query {
        activityEvents(
          first: ${Math.max(options.limit * 2, 50)},
          orderBy: timestamp,
          orderDirection: desc,
          where: {
            timestamp_gte: "${options.fromTimestamp}",
            timestamp_lte: "${options.toTimestamp}"
          }
        ) {
          id
          actionType
          boostContext
          source
          txHash
          logIndex
          blockNumber
          timestamp
          actor
          tokenId
          amount
          duration
          gauge
          boostableTokenId
          boost
          weight
          totalWeight
        }
      }
    `
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  })
  if (!response.ok) return []
  const json = (await response.json()) as ExplorerActivityResponse
  if (json.errors?.length) return []
  const events = json.data?.activityEvents ?? []
  return events.flatMap((event) => {
    const actionType = ACTION_TYPE_MAP[event.actionType]
    if (!actionType) return []
    const actorAddress = normalizeAddress(event.actor ?? undefined)
    const gaugeAddress = normalizeAddress(event.gauge ?? undefined)
    const txHash = maybeHash(event.txHash)
    return [
      {
        id: event.id,
        blockNumber: BigInt(event.blockNumber),
        timestamp: Number(event.timestamp),
        ...(txHash ? { txHash } : {}),
        ...(actorAddress ? { actorAddress } : {}),
        ...(event.tokenId ? { tokenId: BigInt(event.tokenId) } : {}),
        ...(event.amount ? { amount: BigInt(event.amount) } : {}),
        ...(event.duration ? { duration: BigInt(event.duration) } : {}),
        ...(gaugeAddress ? { gaugeAddress } : {}),
        actionType,
        boostContext: mapBoostContext(event.boostContext),
        source: "subgraph" as const,
        logIndex: Number(event.logIndex),
      } satisfies MezoActivityItem,
    ]
  })
}

export async function fetchMezoActivity(options: SourceOptions): Promise<{
  data: MezoActivityItem[]
  nextCursor: MezoActivityCursor | null
}> {
  const explorerItems = await fetchExplorerActivity(options)
  const merged = sortActivityDesc(explorerItems)
  const filteredByCursor = applyCursor(merged, options.cursor)
  const page = filteredByCursor.slice(0, options.limit)
  const last = page[page.length - 1]

  return {
    data: page,
    nextCursor: last
      ? {
          timestamp: last.timestamp,
          id: last.id,
          logIndex: last.logIndex ?? -1,
        }
      : null,
  }
}
