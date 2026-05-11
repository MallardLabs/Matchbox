import type { Address, Hash } from "viem"

export type MezoActivityActionType =
  | "lockCreated"
  | "lockAmountIncreased"
  | "lockExtended"
  | "lockWithdrawn"
  | "lockPermanent"
  | "lockPermanentUnlocked"
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
  weight?: bigint
  totalWeight?: bigint
  boost?: bigint
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

export type MezoActivityCursor = {
  id: string
  timestamp: number
  logIndex: number
}

export type MezoActivityResponse = {
  success: boolean
  data: MezoActivityItem[]
  nextCursor: MezoActivityCursor | null
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
  | "weight"
  | "totalWeight"
  | "boost"
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
  weight?: string
  totalWeight?: string
  boost?: string
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
  nextCursor: MezoActivityCursor | null
  meta?: MezoActivityMeta
}
