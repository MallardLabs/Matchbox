import {
  normalizeAddress,
  sortActivityDesc,
} from "@/lib/mezoActivity/normalize"
import type {
  MezoActivityActionType,
  MezoActivityCursor,
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
  cursor?: MezoActivityCursor
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
  gauge?: string | null
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
  if (options.cursor) {
    parts.push(`timestamp_lte: "${options.cursor.timestamp}"`)
    parts.push(`id_lt: "${options.cursor.id}"`)
  }
  return `{ ${parts.join(", ")} }`
}

async function fetchExplorerActivity(
  options: SourceOptions,
): Promise<MezoActivityItem[]> {
  const endpoint = MATCHBOX_EXPLORER_SUBGRAPH_BY_CHAIN[options.chainId]
  const fetchSize = options.limit + 1
  const where = buildWhereClause(options)
  const query = `
      query {
        activityEvents(
          first: ${fetchSize},
          orderBy: timestamp,
          orderDirection: desc,
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
          gauge
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
    const recipientAddress = normalizeAddress(event.recipient ?? undefined)
    const txFromAddress = normalizeAddress(event.txFrom ?? undefined)
    const gaugeAddress = normalizeAddress(event.gauge ?? undefined)
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
        ...(event.weight ? { weight: BigInt(event.weight) } : {}),
        ...(event.totalWeight
          ? { totalWeight: BigInt(event.totalWeight) }
          : {}),
        ...(event.boost ? { boost: BigInt(event.boost) } : {}),
        ...(gaugeAddress ? { gaugeAddress } : {}),
        ...(pokeMethod ? { pokeMethod } : {}),
        ...(contract ? { contract } : {}),
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

export async function fetchMezoActivity(options: SourceOptions): Promise<{
  data: MezoActivityItem[]
  nextCursor: MezoActivityCursor | null
}> {
  const explorerItems = await fetchExplorerActivity(options)
  const merged = sortActivityDesc(explorerItems)
  const hasMore = merged.length > options.limit
  const page = merged.slice(0, options.limit)
  const last = page[page.length - 1]

  return {
    data: page,
    nextCursor:
      hasMore && last
        ? {
            timestamp: last.timestamp,
            id: last.id,
            logIndex: last.logIndex ?? -1,
          }
        : null,
  }
}
