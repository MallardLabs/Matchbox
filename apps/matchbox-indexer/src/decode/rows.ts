import type { Address, Hex } from "viem"
import type { Network } from "../ingest/networks"

// Projection rows. Field names and meaning match the explorer subgraph
// entities in apps/activity-subgraph/schema.graphql on main, except the
// warehouse-only rows at the end (reward deposits, trove updates). Addresses
// and hashes are lowercase hex; amounts stay bigint end to end.
//
// Account, Gauge, Token, GaugeEpoch and ActivityStats are not ported: they
// only hold counters, nothing reads them, and no handler output depends on
// them.

export type ActivityEventRow = {
  // False for rows matchbox-explorer 3.4.0 would not have produced (a
  // warehouse-only contract, or a voter log before the explorer's start
  // block). Not an explorer field: the parity check compares only true rows.
  explorerParity: boolean
  id: string
  actionType: string
  boostContext: string
  source: string
  txHash: Hex
  txFrom: Address | null
  logIndex: bigint
  blockNumber: bigint
  timestamp: bigint
  actor: Address | null
  recipient: Address | null
  tokenId: bigint | null
  amount: bigint | null
  duration: bigint | null
  prevAmount: bigint | null
  prevDuration: bigint | null
  prevIsPermanent: boolean | null
  postAmount: bigint | null
  postDuration: bigint | null
  postIsPermanent: boolean | null
  mergeSourceTokenId: bigint | null
  mergeDestTokenId: bigint | null
  mergeDestPrevAmount: bigint | null
  mergeDestPrevDuration: bigint | null
  mergeDestPrevIsPermanent: boolean | null
  token: Address | null
  gauge: Address | null
  pool: Address | null
  rewardContract: Address | null
  rewardType: string | null
  metadata: string | null
  boostableTokenId: bigint | null
  boost: bigint | null
  weight: bigint | null
  totalWeight: bigint | null
  pokeMethod: string | null
  period: bigint | null
  newPeriod: bigint | null
  firstRecipientAmount: bigint | null
  secondRecipientAmount: bigint | null
  oldRate: bigint | null
  newRate: bigint | null
  emission: bigint | null
  rebase: bigint | null
  rewards: bigint | null
  totalSupply: bigint | null
  epochIndex: bigint | null
  epochStart: bigint | null
  epochEnd: bigint | null
  distributionId: bigint | null
  merkleRoot: Hex | null
  contractAddress: Address
}

export type ActivityField = keyof ActivityEventRow
export type FieldKind = "text" | "numeric" | "bool"

// One entry per ActivityEvent field: [row field, SQL column, kind]. Drives
// the SQL insert, the GraphQL selection for parity, and row comparison.
export const ACTIVITY_FIELDS: ReadonlyArray<
  readonly [ActivityField, string, FieldKind]
> = [
  ["id", "id", "text"],
  ["actionType", "action_type", "text"],
  ["boostContext", "boost_context", "text"],
  ["source", "source", "text"],
  ["txHash", "tx_hash", "text"],
  ["txFrom", "tx_from", "text"],
  ["logIndex", "log_index", "numeric"],
  ["blockNumber", "block_number", "numeric"],
  ["timestamp", "timestamp", "numeric"],
  ["actor", "actor", "text"],
  ["recipient", "recipient", "text"],
  ["tokenId", "token_id", "numeric"],
  ["amount", "amount", "numeric"],
  ["duration", "duration", "numeric"],
  ["prevAmount", "prev_amount", "numeric"],
  ["prevDuration", "prev_duration", "numeric"],
  ["prevIsPermanent", "prev_is_permanent", "bool"],
  ["postAmount", "post_amount", "numeric"],
  ["postDuration", "post_duration", "numeric"],
  ["postIsPermanent", "post_is_permanent", "bool"],
  ["mergeSourceTokenId", "merge_source_token_id", "numeric"],
  ["mergeDestTokenId", "merge_dest_token_id", "numeric"],
  ["mergeDestPrevAmount", "merge_dest_prev_amount", "numeric"],
  ["mergeDestPrevDuration", "merge_dest_prev_duration", "numeric"],
  ["mergeDestPrevIsPermanent", "merge_dest_prev_is_permanent", "bool"],
  ["token", "token", "text"],
  ["gauge", "gauge", "text"],
  ["pool", "pool", "text"],
  ["rewardContract", "reward_contract", "text"],
  ["rewardType", "reward_type", "text"],
  ["metadata", "metadata", "text"],
  ["boostableTokenId", "boostable_token_id", "numeric"],
  ["boost", "boost", "numeric"],
  ["weight", "weight", "numeric"],
  ["totalWeight", "total_weight", "numeric"],
  ["pokeMethod", "poke_method", "text"],
  ["period", "period", "numeric"],
  ["newPeriod", "new_period", "numeric"],
  ["firstRecipientAmount", "first_recipient_amount", "numeric"],
  ["secondRecipientAmount", "second_recipient_amount", "numeric"],
  ["oldRate", "old_rate", "numeric"],
  ["newRate", "new_rate", "numeric"],
  ["emission", "emission", "numeric"],
  ["rebase", "rebase", "numeric"],
  ["rewards", "rewards", "numeric"],
  ["totalSupply", "total_supply", "numeric"],
  ["epochIndex", "epoch_index", "numeric"],
  ["epochStart", "epoch_start", "numeric"],
  ["epochEnd", "epoch_end", "numeric"],
  ["distributionId", "distribution_id", "numeric"],
  ["merkleRoot", "merkle_root", "text"],
  ["contractAddress", "contract_address", "text"],
]

export type LockPositionRow = {
  id: string
  tokenId: bigint
  contractAddress: Address
  owner: Address | null
  amount: bigint
  unlockAt: bigint | null
  createdAt: bigint | null
  lastExtendedAt: bigint | null
  withdrawnAt: bigint | null
  isPermanent: boolean
  isWithdrawn: boolean
  isMerged: boolean
  mergedIntoTokenId: bigint | null
  mergedAt: bigint | null
  boost: bigint | null
  activityCount: bigint
}

export type VoteRow = {
  id: string
  voterContract: Address
  tokenId: bigint
  gauge: Address
  owner: Address
  currentWeight: bigint
  lastUpdatedEpoch: bigint
  lastUpdatedAt: bigint
  isActive: boolean
}

// Reward contract (bribe or fee) to its pool and gauge.
export type BribeToPoolRow = {
  id: Address
  poolAddress: Address
  gaugeAddress: Address
}

// The voters whose GaugeCreated spawns a VoterBribeReward data source.
export type BribeVoterSource =
  | "BOOST_VOTER"
  | "THIRD_PARTY_VOTER"
  | "VALIDATORS_VOTER"

type DataSourceBase = {
  network: Network
  address: Address
  createdBlock: bigint
}

// A template data source created by a handler, as graph-node's
// `Template.create(address)` would. VoterBribeReward is warehouse-only and
// carries the voter and gauge its claims are attributed to.
export type DynamicDataSource =
  | (DataSourceBase & { template: ExplorerTemplateName })
  | (DataSourceBase & {
      template: "VoterBribeReward"
      voterSource: BribeVoterSource
      gauge: Address
    })

export type ExplorerTemplateName =
  | "BribeVotingReward"
  | "FeeVotingReward"
  | "Gauge"
  | "Pool"

export type TemplateName = ExplorerTemplateName | "VoterBribeReward"

// One 4-argument NotifyReward on a reward contract: `amount` of `token`
// deposited for the voters of the epoch starting at `epochStart` (the
// contract's own epoch, from the event). Warehouse-only.
export type RewardDepositRow = {
  txHash: Hex
  logIndex: bigint
  blockNumber: bigint
  timestamp: bigint
  txFrom: Address
  rewardContract: Address
  rewardType: "Bribe" | "Fee"
  // POOLS_VOTER for pool gauges, else the voter that created the bribe.
  voterSource: string
  gauge: Address
  pool: Address | null
  token: Address
  epochStart: bigint
  amount: bigint
  // NotifyReward.from: the voter for BribesAdded deposits, else the caller.
  depositor: Address
}

// What a TroveUpdated did, from the emitter, its operation code and the
// change against the trove's previous state.
export type TroveAction =
  | "LOAN_OPENED"
  | "LOAN_REPAID"
  | "LOAN_BORROWED"
  | "LOAN_COLL_ADDED"
  | "LOAN_COLL_WITHDRAWN"
  | "LOAN_ADJUSTED"
  | "LOAN_REFINANCED"
  | "LOAN_CLOSED"
  | "LOAN_REWARDS_APPLIED"
  | "LOAN_LIQUIDATED"
  | "LOAN_REDEEMED"
  | "LOAN_UNKNOWN"

export type TroveEmitter = "BORROWER_OPERATIONS" | "TROVE_MANAGER"

// One mUSD TroveUpdated: the trove's state after the operation, and the
// change from its previous TroveUpdated. Warehouse-only.
export type TroveUpdateRow = {
  txHash: Hex
  logIndex: bigint
  blockNumber: bigint
  timestamp: bigint
  txFrom: Address
  contractAddress: Address
  emitter: TroveEmitter
  borrower: Address
  operation: number
  action: TroveAction
  principal: bigint
  interest: bigint
  coll: bigint
  stake: bigint
  // Null on the pre-1.0.2 event, which did not carry them.
  interestRate: bigint | null
  lastInterestUpdateTime: bigint | null
  // Null when this is the borrower's first TroveUpdated.
  prevPrincipal: bigint | null
  prevInterest: bigint | null
  prevColl: bigint | null
  // Interest accrued since the previous update, by the contract's
  // InterestRateMath. Null when either side lacks the rate or update time.
  accruedInterest: bigint | null
  // Signed: debt (principal + interest) after, minus debt just before the
  // operation (previous debt plus accrued interest). Negative is a repayment.
  debtChange: bigint | null
  collChange: bigint | null
}

export function emptyActivity(): Omit<
  ActivityEventRow,
  | "id"
  | "actionType"
  | "boostContext"
  | "source"
  | "txHash"
  | "txFrom"
  | "logIndex"
  | "blockNumber"
  | "timestamp"
  | "contractAddress"
> {
  return {
    explorerParity: true,
    actor: null,
    recipient: null,
    tokenId: null,
    amount: null,
    duration: null,
    prevAmount: null,
    prevDuration: null,
    prevIsPermanent: null,
    postAmount: null,
    postDuration: null,
    postIsPermanent: null,
    mergeSourceTokenId: null,
    mergeDestTokenId: null,
    mergeDestPrevAmount: null,
    mergeDestPrevDuration: null,
    mergeDestPrevIsPermanent: null,
    token: null,
    gauge: null,
    pool: null,
    rewardContract: null,
    rewardType: null,
    metadata: null,
    boostableTokenId: null,
    boost: null,
    weight: null,
    totalWeight: null,
    pokeMethod: null,
    period: null,
    newPeriod: null,
    firstRecipientAmount: null,
    secondRecipientAmount: null,
    oldRate: null,
    newRate: null,
    emission: null,
    rebase: null,
    rewards: null,
    totalSupply: null,
    epochIndex: null,
    epochStart: null,
    epochEnd: null,
    distributionId: null,
    merkleRoot: null,
  }
}
