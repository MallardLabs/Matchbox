import { normalizeAddress } from "@/lib/mezoActivity/normalize"
import type {
  MezoActivityActionType,
  MezoActivityContract,
  MezoActivityItem,
  MezoActivitySource,
  MezoPokeMethod,
} from "@/types/mezoActivity"
import type { Hash } from "viem"

// The explorer subgraph's ActivityEvent, as both the explorer GraphQL API and
// the warehouse (matchbox.activity_events) return it: big integers as decimal
// strings, addresses and hashes as hex strings, absent fields as null.
export type ActivityEventRow = {
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

// Every field the activity readers select, in GraphQL (camelCase) names. The
// warehouse columns are the snake_case form of the same names.
export const ACTIVITY_EVENT_FIELDS = [
  "id",
  "actionType",
  "boostContext",
  "source",
  "txHash",
  "txFrom",
  "logIndex",
  "blockNumber",
  "timestamp",
  "actor",
  "recipient",
  "tokenId",
  "amount",
  "duration",
  "prevAmount",
  "prevDuration",
  "prevIsPermanent",
  "postAmount",
  "postDuration",
  "postIsPermanent",
  "mergeSourceTokenId",
  "mergeDestTokenId",
  "mergeDestPrevAmount",
  "mergeDestPrevDuration",
  "mergeDestPrevIsPermanent",
  "token",
  "gauge",
  "pool",
  "rewardContract",
  "rewardType",
  "boostableTokenId",
  "boost",
  "weight",
  "totalWeight",
  "pokeMethod",
  "metadata",
  "period",
  "newPeriod",
  "firstRecipientAmount",
  "secondRecipientAmount",
  "emission",
  "rebase",
  "rewards",
  "epochIndex",
  "epochStart",
  "epochEnd",
  "distributionId",
] as const satisfies readonly (keyof ActivityEventRow)[]

export const ACTION_TYPE_MAP: Record<string, MezoActivityActionType> = {
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

const CONTRACT_MAP: Record<string, MezoActivityContract> = {
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

/**
 * Map one ActivityEvent row to the UI item. `source` records where the row
 * came from. Rows with an action type the UI doesn't know are dropped.
 */
export function mapActivityEventRow(
  event: ActivityEventRow,
  source: MezoActivitySource,
): MezoActivityItem | undefined {
  const actionType = ACTION_TYPE_MAP[event.actionType]
  if (!actionType) return undefined
  const actorAddress = normalizeAddress(event.actor ?? undefined)
  const recipientAddress = normalizeAddress(event.recipient ?? undefined)
  const txFromAddress = normalizeAddress(event.txFrom ?? undefined)
  const tokenAddress = normalizeAddress(event.token ?? undefined)
  // Prefer gauge; fall back to pool so LP/swap rows still resolve "where".
  const gaugeAddress = normalizeAddress(event.gauge ?? event.pool ?? undefined)
  const txHash = maybeHash(event.txHash)
  const pokeMethod = mapPokeMethod(event.pokeMethod)
  const contract = CONTRACT_MAP[event.source]
  return {
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
    ...(event.prevDuration ? { prevDuration: BigInt(event.prevDuration) } : {}),
    ...(event.prevIsPermanent !== null && event.prevIsPermanent !== undefined
      ? { prevIsPermanent: event.prevIsPermanent }
      : {}),
    ...(event.postAmount ? { postAmount: BigInt(event.postAmount) } : {}),
    ...(event.postDuration ? { postDuration: BigInt(event.postDuration) } : {}),
    ...(event.postIsPermanent !== null && event.postIsPermanent !== undefined
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
    ...(event.totalWeight ? { totalWeight: BigInt(event.totalWeight) } : {}),
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
    source,
    logIndex: Number(event.logIndex),
  } satisfies MezoActivityItem
}
