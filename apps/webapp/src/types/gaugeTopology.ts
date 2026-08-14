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
  /** Boost gauges registered on BoostVoter — voted with veMEZO. */
  gauges: GaugeTopologyEntry[]
  /**
   * Validator gauges registered on ValidatorsVoter — voted with veBTC.
   * Kept in a separate list because the two voters key `earned()` by NFTs from
   * different escrows: a veMEZO id and a veBTC id can collide numerically, so
   * querying one voter's bribes with the other's token ids returns bogus
   * balances.
   */
  validatorGauges: GaugeTopologyEntry[]
}
