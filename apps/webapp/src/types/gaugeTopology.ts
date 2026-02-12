import type { SupportedChainId } from "@repo/shared/contracts"
import type { Address } from "viem"

export type GaugeRewardToken = {
  tokenAddress: Address
  symbol: string
  decimals: number
  epochAmount: string
}

export type GaugeTopologyEntry = {
  gaugeAddress: Address
  bribeAddress: Address | null
  rewardTokens: GaugeRewardToken[]
}

export type GaugeTopologyResponse = {
  chainId: SupportedChainId
  generatedAt: string
  epochStart: string
  gauges: GaugeTopologyEntry[]
}
