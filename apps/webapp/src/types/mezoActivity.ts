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

export type MezoBoostContext =
  | "matchboxGaugeBoost"
  | "mezoVeBtcPairBoost"
  | "unknown"

export type MezoActivitySource = "subgraph" | "api" | "rpcLogs"

export type MezoActivityItem = {
  id: string
  blockNumber: bigint
  timestamp: number
  txHash?: Hash
  actorAddress?: Address
  tokenId?: bigint
  amount?: bigint
  duration?: bigint
  gaugeAddress?: Address
  actionType: MezoActivityActionType
  boostContext: MezoBoostContext
  source: MezoActivitySource
  logIndex?: number
  explorerUrl?: string
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
  "blockNumber" | "tokenId" | "amount" | "duration"
> & {
  blockNumber: string
  tokenId?: string
  amount?: string
  duration?: string
  explorerUrl?: string
}

export type MezoActivityApiResponse = {
  success: boolean
  data: MezoActivityApiItem[]
  nextCursor: MezoActivityCursor | null
  meta?: MezoActivityMeta
}
