import type { Address, Hash } from "viem"

export type MezoActivityActionType =
  | "lockCreated"
  | "lockAmountIncreased"
  | "lockExtended"
  | "lockWithdrawn"
  | "lockPermanent"
  | "lockPermanentUnlocked"
  | "lockTransferred"
  | "lockMerged"
  | "boostVote"
  | "boostAbstain"
  | "boostPoke"
  | "pairCreated"
  | "gaugeCreated"
  | "gaugeKilled"
  | "gaugeRevived"
  | "boostableTokenBurned"
  | "incentiveAdded"
  | "rewardDistributed"
  | "rewardNotified"
  | "thirdPartyGaugeCreated"
  | "validatorGaugeCreated"
  | "validatorLeft"
  | "periodUpdated"
  | "epochProcessed"
  | "emissionsEnabled"
  | "rebaseClaimed"
  | "rebaseCheckpoint"
  | "merkleClaimed"
  | "merkleDistributionAdded"
  | "savingsDeposit"
  | "savingsWithdraw"
  | "savingsYieldClaimed"
  | "protocolYieldReceived"
  | "strategyYieldReceived"
  | "pcvDistribution"
  | "pcvDebtPayment"

export type MezoActivityVoterContext =
  | "pools"
  | "thirdParty"
  | "validators"
  | "boost"

export type MezoActivityProtocolContext =
  | "chainFeeSplitter"
  | "mezoChainSplitter"
  | "mezoEcosystemSplitter"
  | "mezoMinter"
  | "rebaseDistributor"
  | "merkleDistributor"
  | "musdSavingsRate"
  | "pcv"

export type MezoBoostContext =
  | "matchboxGaugeBoost"
  | "mezoVeBtcPairBoost"
  | "unknown"

export type MezoActivitySource = "subgraph" | "api" | "rpcLogs"

export type MezoActivityContract =
  | "votingEscrow"
  | "boostVoter"
  | "poolsVoter"
  | "thirdPartyVoter"
  | "validatorsVoter"
  | "chainFeeSplitter"
  | "mezoChainSplitter"
  | "mezoEcosystemSplitter"
  | "mezoMinter"
  | "rebaseDistributor"
  | "merkleDistributor"
  | "musdSavingsRate"
  | "pcv"
  | "unknown"

export type MezoPokeMethod = "poke" | "pokeBoost" | "pokeBoosts"

export type MezoActivityItem = {
  id: string
  blockNumber: bigint
  timestamp: number
  txHash?: Hash
  txFrom?: Address
  actorAddress?: Address
  tokenId?: bigint
  amount?: bigint
  duration?: bigint
  // Pre/post state snapshots populated for lock-track events. Effective
  // remaining seconds at event time (MAXTIME for permanent). Lets the
  // simulator compute Δve exactly without replaying token history.
  prevAmount?: bigint
  prevDuration?: bigint
  prevIsPermanent?: boolean
  postAmount?: bigint
  postDuration?: bigint
  postIsPermanent?: boolean
  // For lockMerged only — describes the destination NFT's pre-merge state
  // and the source tokenId being burned into it. The activity's prev*
  // fields describe the SOURCE NFT's pre-merge state.
  mergeSourceTokenId?: bigint
  mergeDestTokenId?: bigint
  mergeDestPrevAmount?: bigint
  mergeDestPrevDuration?: bigint
  mergeDestPrevIsPermanent?: boolean
  weight?: bigint
  totalWeight?: bigint
  boost?: bigint
  boostableTokenId?: bigint
  tokenAddress?: Address
  gaugeAddress?: Address
  recipient?: Address
  actionType: MezoActivityActionType
  boostContext: MezoBoostContext
  contract?: MezoActivityContract
  source: MezoActivitySource
  pokeMethod?: MezoPokeMethod
  logIndex?: number
  explorerUrl?: string
  metadata?: string
  period?: bigint
  newPeriod?: bigint
  firstRecipientAmount?: bigint
  secondRecipientAmount?: bigint
  emission?: bigint
  rebase?: bigint
  rewards?: bigint
  epochIndex?: bigint
  epochStart?: bigint
  epochEnd?: bigint
  distributionId?: bigint
}

export type MezoActivityResponse = {
  success: boolean
  data: MezoActivityItem[]
  page: number
  hasMore: boolean
  meta?: MezoActivityMeta
}

export type MezoActivityFilter =
  | "locks"
  | "boostMatchbox"
  | "boostPair"
  | "extensions"
  | "incentives"

export type MezoActivityTab = "activity" | "system"

export type MezoSystemFilter =
  | "automatedPokes"
  | "rewardDistributions"
  | "gaugeLifecycle"
  | "incentives"
  | "splitterPeriods"
  | "emissions"
  | "rebaseCheckpoints"
  | "pcvDistributions"
  | "savingsRate"

export type MezoActivityMeta = {
  coverage: {
    locks: "indexed"
    boosts: "indexed"
    extensions: "indexed"
    incentives: "indexed"
  }
  range: {
    fromTimestamp: number
    toTimestamp: number
  }
}

export type MezoActivityApiItem = Omit<
  MezoActivityItem,
  | "blockNumber"
  | "tokenId"
  | "amount"
  | "duration"
  | "prevAmount"
  | "prevDuration"
  | "postAmount"
  | "postDuration"
  | "mergeSourceTokenId"
  | "mergeDestTokenId"
  | "mergeDestPrevAmount"
  | "mergeDestPrevDuration"
  | "weight"
  | "totalWeight"
  | "boost"
  | "boostableTokenId"
  | "tokenAddress"
  | "period"
  | "newPeriod"
  | "firstRecipientAmount"
  | "secondRecipientAmount"
  | "emission"
  | "rebase"
  | "rewards"
  | "epochIndex"
  | "epochStart"
  | "epochEnd"
  | "distributionId"
> & {
  blockNumber: string
  tokenId?: string
  amount?: string
  duration?: string
  prevAmount?: string
  prevDuration?: string
  postAmount?: string
  postDuration?: string
  mergeSourceTokenId?: string
  mergeDestTokenId?: string
  mergeDestPrevAmount?: string
  mergeDestPrevDuration?: string
  weight?: string
  totalWeight?: string
  boost?: string
  boostableTokenId?: string
  tokenAddress?: Address
  period?: string
  newPeriod?: string
  firstRecipientAmount?: string
  secondRecipientAmount?: string
  emission?: string
  rebase?: string
  rewards?: string
  epochIndex?: string
  epochStart?: string
  epochEnd?: string
  distributionId?: string
  txFrom?: Address
  pokeMethod?: MezoPokeMethod
  explorerUrl?: string
}

export type MezoActivityApiResponse = {
  success: boolean
  data: MezoActivityApiItem[]
  page: number
  hasMore: boolean
  meta?: MezoActivityMeta
}
