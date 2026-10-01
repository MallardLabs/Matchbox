import { fetchEarnVoteActivity } from "@/lib/mezoActivity/earnVotes"
import {
  normalizeAddress,
  sortActivityDesc,
} from "@/lib/mezoActivity/normalize"
import type {
  MezoActivityActionType,
  MezoActivityItem,
  MezoPokeMethod,
} from "@/types/mezoActivity"
import { CHAIN_ID, type SupportedChainId } from "@repo/shared/contracts"
import type { Hash } from "viem"

const MATCHBOX_EXPLORER_SUBGRAPH_BY_CHAIN: Record<SupportedChainId, string> = {
  [CHAIN_ID.mainnet]:
    process.env.MATCHBOX_EXPLORER_SUBGRAPH_MEZO_URL ??
    "https://api.goldsky.com/api/public/project_cmoiy2fc3z9sl01rk465n7poh/subgraphs/matchbox-explorer/live/gn",
  [CHAIN_ID.testnet]:
    process.env.MATCHBOX_EXPLORER_SUBGRAPH_MEZO_TESTNET_URL ??
    "https://api.goldsky.com/api/public/project_cmoiy2fc3z9sl01rk465n7poh/subgraphs/matchbox-explorer-testnet/live/gn",
}

type SourceOptions = {
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

type ExplorerActivityEvent = {
  id: string
  actionType: string
  boostContext: string
  source: string
  txHash: string
  txFrom?: string | null
  logIndex: string
  blockNumber: string
  timestamp: string
  actor?: string | null
  recipient?: string | null
  tokenId?: string | null
  amount?: string | null
  duration?: string | null
  prevAmount?: string | null
  prevDuration?: string | null
  prevIsPermanent?: boolean | null
  postAmount?: string | null
  postDuration?: string | null
  postIsPermanent?: boolean | null
  mergeSourceTokenId?: string | null
  mergeDestTokenId?: string | null
  mergeDestPrevAmount?: string | null
  mergeDestPrevDuration?: string | null
  mergeDestPrevIsPermanent?: boolean | null
  token?: string | null
  gauge?: string | null
  pool?: string | null
  rewardContract?: string | null
  rewardType?: string | null
  boostableTokenId?: string | null
  boost?: string | null
  weight?: string | null
  totalWeight?: string | null
  pokeMethod?: string | null
  metadata?: string | null
  period?: string | null
  newPeriod?: string | null
  firstRecipientAmount?: string | null
  secondRecipientAmount?: string | null
  emission?: string | null
  rebase?: string | null
  rewards?: string | null
  epochIndex?: string | null
  epochStart?: string | null
  epochEnd?: string | null
  distributionId?: string | null
}

const POKE_METHODS: ReadonlySet<MezoPokeMethod> = new Set([
  "poke",
  "pokeBoost",
  "pokeBoosts",
])

function mapPokeMethod(
  value: string | null | undefined,
): MezoPokeMethod | undefined {
  if (!value) return undefined
  return POKE_METHODS.has(value as MezoPokeMethod)
    ? (value as MezoPokeMethod)
    : undefined
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
  LOCK_TRANSFERRED: "lockTransferred",
  LOCK_MERGED: "lockMerged",
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
  THIRD_PARTY_GAUGE_CREATED: "thirdPartyGaugeCreated",
  VALIDATOR_GAUGE_CREATED: "validatorGaugeCreated",
  VALIDATOR_LEFT: "validatorLeft",
  PERIOD_UPDATED: "periodUpdated",
  EPOCH_PROCESSED: "epochProcessed",
  EMISSIONS_ENABLED: "emissionsEnabled",
  REBASE_CLAIMED: "rebaseClaimed",
  REBASE_CHECKPOINT: "rebaseCheckpoint",
  MERKLE_CLAIMED: "merkleClaimed",
  MERKLE_DISTRIBUTION_ADDED: "merkleDistributionAdded",
  SAVINGS_DEPOSIT: "savingsDeposit",
  SAVINGS_WITHDRAW: "savingsWithdraw",
  SAVINGS_YIELD_CLAIMED: "savingsYieldClaimed",
  PROTOCOL_YIELD_RECEIVED: "protocolYieldReceived",
  STRATEGY_YIELD_RECEIVED: "strategyYieldReceived",
  PCV_DISTRIBUTION: "pcvDistribution",
  PCV_DEBT_PAYMENT: "pcvDebtPayment",
  VOTE_FEE_CLAIMED: "voteFeeClaimed",
  VOTE_BRIBE_CLAIMED: "voteBribeClaimed",
  LP_ADDED: "lpAdded",
  LP_REMOVED: "lpRemoved",
  LP_STAKED: "lpStaked",
  LP_UNSTAKED: "lpUnstaked",
  SWAP: "swap",
  POOL_CREATED: "poolCreated",
}

const CONTRACT_MAP: Record<
  string,
  import("@/types/mezoActivity").MezoActivityContract
> = {
  VOTING_ESCROW: "votingEscrow",
  BOOST_VOTER: "boostVoter",
  POOLS_VOTER: "poolsVoter",
  THIRD_PARTY_VOTER: "thirdPartyVoter",
  VALIDATORS_VOTER: "validatorsVoter",
  CHAIN_FEE_SPLITTER: "chainFeeSplitter",
  MEZO_CHAIN_SPLITTER: "mezoChainSplitter",
  MEZO_ECOSYSTEM_SPLITTER: "mezoEcosystemSplitter",
  MEZO_MINTER: "mezoMinter",
  MEZO_REBASE_DISTRIBUTOR: "rebaseDistributor",
  MEZO_MERKLE_DISTRIBUTOR: "merkleDistributor",
  MUSD_SAVINGS_RATE: "musdSavingsRate",
  PCV: "pcv",
  POOL_FACTORY: "poolFactory",
  POOL: "pool",
  GAUGE: "gauge",
  FEE_VOTING_REWARD: "feeVotingReward",
  BRIBE_VOTING_REWARD: "bribeVotingReward",
}

function mapBoostContext(value: string): MezoActivityItem["boostContext"] {
  if (value === "MATCHBOX_GAUGE_BOOST") return "matchboxGaugeBoost"
  if (value === "MEZO_VEBTC_PAIR_BOOST") return "mezoVeBtcPairBoost"
  return "unknown"
}

function maybeHash(value: string | undefined): Hash | undefined {
  return value && /^0x[a-fA-F0-9]{64}$/.test(value)
    ? (value as Hash)
    : undefined
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
          id
          actionType
          boostContext
          source
          txHash
          txFrom
          logIndex
          blockNumber
          timestamp
          actor
          recipient
          tokenId
          amount
          duration
          prevAmount
          prevDuration
          prevIsPermanent
          postAmount
          postDuration
          postIsPermanent
          mergeSourceTokenId
          mergeDestTokenId
          mergeDestPrevAmount
          mergeDestPrevDuration
          mergeDestPrevIsPermanent
          token
          gauge
          pool
          rewardContract
          rewardType
          boostableTokenId
          boost
          weight
          totalWeight
          pokeMethod
          metadata
          period
          newPeriod
          firstRecipientAmount
          secondRecipientAmount
          emission
          rebase
          rewards
          epochIndex
          epochStart
          epochEnd
          distributionId
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
  const events = json.data?.activityEvents ?? []
  return events.flatMap((event) => {
    const actionType = ACTION_TYPE_MAP[event.actionType]
    if (!actionType) return []
    const actorAddress = normalizeAddress(event.actor ?? undefined)
    const recipientAddress = normalizeAddress(event.recipient ?? undefined)
    const txFromAddress = normalizeAddress(event.txFrom ?? undefined)
    const tokenAddress = normalizeAddress(event.token ?? undefined)
    // Prefer gauge; fall back to pool so LP/swap rows still resolve "where".
    const gaugeAddress = normalizeAddress(
      event.gauge ?? event.pool ?? undefined,
    )
    const txHash = maybeHash(event.txHash)
    const pokeMethod = mapPokeMethod(event.pokeMethod)
    const contract = CONTRACT_MAP[event.source]
    return [
      {
        id: event.id,
        blockNumber: BigInt(event.blockNumber),
        timestamp: Number(event.timestamp),
        ...(txHash ? { txHash } : {}),
        ...(txFromAddress ? { txFrom: txFromAddress } : {}),
        ...(actorAddress ? { actorAddress } : {}),
        ...(recipientAddress ? { recipient: recipientAddress } : {}),
        ...(event.tokenId ? { tokenId: BigInt(event.tokenId) } : {}),
        ...(event.amount ? { amount: BigInt(event.amount) } : {}),
        ...(event.duration ? { duration: BigInt(event.duration) } : {}),
        ...(event.prevAmount ? { prevAmount: BigInt(event.prevAmount) } : {}),
        ...(event.prevDuration
          ? { prevDuration: BigInt(event.prevDuration) }
          : {}),
        ...(event.prevIsPermanent !== null &&
        event.prevIsPermanent !== undefined
          ? { prevIsPermanent: event.prevIsPermanent }
          : {}),
        ...(event.postAmount ? { postAmount: BigInt(event.postAmount) } : {}),
        ...(event.postDuration
          ? { postDuration: BigInt(event.postDuration) }
          : {}),
        ...(event.postIsPermanent !== null &&
        event.postIsPermanent !== undefined
          ? { postIsPermanent: event.postIsPermanent }
          : {}),
        ...(event.mergeSourceTokenId
          ? { mergeSourceTokenId: BigInt(event.mergeSourceTokenId) }
          : {}),
        ...(event.mergeDestTokenId
          ? { mergeDestTokenId: BigInt(event.mergeDestTokenId) }
          : {}),
        ...(event.mergeDestPrevAmount
          ? { mergeDestPrevAmount: BigInt(event.mergeDestPrevAmount) }
          : {}),
        ...(event.mergeDestPrevDuration
          ? { mergeDestPrevDuration: BigInt(event.mergeDestPrevDuration) }
          : {}),
        ...(event.mergeDestPrevIsPermanent !== null &&
        event.mergeDestPrevIsPermanent !== undefined
          ? { mergeDestPrevIsPermanent: event.mergeDestPrevIsPermanent }
          : {}),
        ...(event.weight ? { weight: BigInt(event.weight) } : {}),
        ...(event.totalWeight
          ? { totalWeight: BigInt(event.totalWeight) }
          : {}),
        ...(event.boost ? { boost: BigInt(event.boost) } : {}),
        ...(event.boostableTokenId
          ? { boostableTokenId: BigInt(event.boostableTokenId) }
          : {}),
        ...(tokenAddress ? { tokenAddress } : {}),
        ...(gaugeAddress ? { gaugeAddress } : {}),
        ...(pokeMethod ? { pokeMethod } : {}),
        ...(contract ? { contract } : {}),
        ...(event.rewardType ? { rewardType: event.rewardType } : {}),
        ...(event.metadata ? { metadata: event.metadata } : {}),
        ...(event.period ? { period: BigInt(event.period) } : {}),
        ...(event.newPeriod ? { newPeriod: BigInt(event.newPeriod) } : {}),
        ...(event.firstRecipientAmount
          ? { firstRecipientAmount: BigInt(event.firstRecipientAmount) }
          : {}),
        ...(event.secondRecipientAmount
          ? { secondRecipientAmount: BigInt(event.secondRecipientAmount) }
          : {}),
        ...(event.emission ? { emission: BigInt(event.emission) } : {}),
        ...(event.rebase ? { rebase: BigInt(event.rebase) } : {}),
        ...(event.rewards ? { rewards: BigInt(event.rewards) } : {}),
        ...(event.epochIndex ? { epochIndex: BigInt(event.epochIndex) } : {}),
        ...(event.epochStart ? { epochStart: BigInt(event.epochStart) } : {}),
        ...(event.epochEnd ? { epochEnd: BigInt(event.epochEnd) } : {}),
        ...(event.distributionId
          ? { distributionId: BigInt(event.distributionId) }
          : {}),
        actionType,
        boostContext: mapBoostContext(event.boostContext),
        source: "subgraph" as const,
        logIndex: Number(event.logIndex),
      } satisfies MezoActivityItem,
    ]
  })
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
  if (!includesEarnVotes(options)) {
    // Single source: the explorer pages with `skip`, so any depth works.
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
