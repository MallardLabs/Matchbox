import { CHAIN_ID, type SupportedChainId } from "@repo/shared/contracts"
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

export async function fetchGaugeTopology(
  chainId: SupportedChainId,
  signal?: AbortSignal,
): Promise<GaugeTopologyResponse> {
  const response = await fetch(
    `/api/topology?chainId=${chainId}`,
    signal ? { signal } : {},
  )
  if (!response.ok) {
    throw new Error(`Failed to fetch gauge topology (${response.status})`)
  }
  return (await response.json()) as GaugeTopologyResponse
}

export function topologyChainId(value: number): SupportedChainId {
  return value === CHAIN_ID.testnet ? CHAIN_ID.testnet : CHAIN_ID.mainnet
}
