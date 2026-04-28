import type { Address, Hash } from "viem"

export type MezoActivityActionType =
  | "lockCreated"
  | "lockExtended"
  | "boostVote"
  | "boostPoke"
  | "pairCreated"

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
}

export type MezoActivityFilter = "all" | "locks" | "boostMatchbox" | "boostPair" | "extensions"

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
}
