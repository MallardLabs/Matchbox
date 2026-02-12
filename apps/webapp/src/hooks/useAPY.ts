import { useGaugeTopology } from "@/hooks/useGaugeTopology"
import type { GaugeTopologyResponse } from "@/types/gaugeTopology"
import { getTokenUsdPrice } from "@repo/shared"
import { useMemo } from "react"
import type { Address } from "viem"
import { useBtcPrice } from "./useBtcPrice"
import { useMezoPrice } from "./useMezoPrice"

const EPOCHS_PER_YEAR = 52

export type TokenIncentive = {
  tokenAddress: string
  symbol: string
  amount: bigint
  decimals: number
  usdValue: number
}

export type GaugeAPYData = {
  gaugeAddress: Address
  apy: number | null
  totalIncentivesUSD: number
  totalVeMEZOWeight: bigint
  isLoading: boolean
  incentivesByToken: TokenIncentive[]
}

/**
 * Shared logic to calculate APY from incentives and weight
 */
export function calculateAPYFromData(
  totalIncentivesUSD: number,
  totalWeight: bigint | undefined,
  mezoPrice: number | null,
): number | null {
  // No incentives = no APY
  if (totalIncentivesUSD === 0) {
    return null
  }

  // If totalWeight is undefined, data isn't ready
  if (totalWeight === undefined) {
    return null
  }

  // If mezo price isn't available yet, return null instead of infinity
  if (mezoPrice === null || mezoPrice === 0) {
    return null
  }

  // Has incentives but no votes = infinite APY (first voter gets all rewards)
  if (totalWeight === 0n) {
    return Number.POSITIVE_INFINITY
  }

  // Convert veMEZO weight to a number (18 decimals)
  const totalVeMEZOAmount = Number(totalWeight) / 1e18

  // Value of veMEZO votes in USD
  const totalVeMEZOValueUSD = totalVeMEZOAmount * mezoPrice

  if (totalVeMEZOValueUSD <= 0) return Number.POSITIVE_INFINITY

  // APY = (weekly rewards / total position value) * 52 weeks * 100%
  const weeklyReturn = totalIncentivesUSD / totalVeMEZOValueUSD
  const annualReturn = weeklyReturn * EPOCHS_PER_YEAR
  const apyPercent = annualReturn * 100

  return apyPercent
}

/**
 * Calculate APY for a single gauge
 * APY = (Total Epoch Incentives USD / (Total veMEZO votes * MEZO Price)) * 52 * 100
 */
export function useGaugeAPY(
  gaugeAddress: Address | undefined,
  totalWeight: bigint | undefined,
): GaugeAPYData {
  const { price: btcPrice } = useBtcPrice()
  const { price: mezoPrice } = useMezoPrice()
  const { topology, isLoading: isLoadingTopology } = useGaugeTopology({
    enabled: !!gaugeAddress,
  })

  const incentivesByToken = useMemo(() => {
    if (!gaugeAddress) return []

    const gauge = topology?.gauges.find(
      (entry) => entry.gaugeAddress.toLowerCase() === gaugeAddress.toLowerCase(),
    )
    if (!gauge) return []

    return gauge.rewardTokens
      .map((token) => {
        const amount = BigInt(token.epochAmount)
        const tokenAmount = Number(amount) / Math.pow(10, token.decimals)
        const price = getTokenUsdPrice(
          token.tokenAddress,
          token.symbol,
          btcPrice,
          mezoPrice,
        )
        const usdValue = price !== null ? tokenAmount * price : 0

        return {
          tokenAddress: token.tokenAddress.toLowerCase(),
          symbol: token.symbol,
          amount,
          decimals: token.decimals,
          usdValue,
        }
      })
      .filter((token) => token.amount > 0n)
  }, [gaugeAddress, topology, btcPrice, mezoPrice])

  const totalIncentivesUSD = useMemo(
    () => incentivesByToken.reduce((sum, token) => sum + token.usdValue, 0),
    [incentivesByToken],
  )

  // Calculate APY
  const apy = useMemo(
    () => calculateAPYFromData(totalIncentivesUSD, totalWeight, mezoPrice),
    [totalWeight, totalIncentivesUSD, mezoPrice],
  )

  return {
    gaugeAddress: gaugeAddress ?? ("0x" as Address),
    apy,
    totalIncentivesUSD,
    totalVeMEZOWeight: totalWeight ?? 0n,
    isLoading: isLoadingTopology,
    incentivesByToken,
  }
}

/**
 * Calculate APY for multiple gauges at once (more efficient)
 */
export function useGaugesAPY(
  gauges: Array<{ address: Address; totalWeight: bigint }>,
): {
  apyMap: Map<string, GaugeAPYData>
  isLoading: boolean
} {
  const { price: btcPrice } = useBtcPrice()
  const { price: mezoPrice } = useMezoPrice()
  const { topology, isLoading: isLoadingTopology } = useGaugeTopology({
    enabled: gauges.length > 0,
  })

  const topologyMap = useMemo(() => {
    const map = new Map<string, GaugeTopologyResponse["gauges"][number]>()
    for (const gauge of topology?.gauges ?? []) {
      map.set(gauge.gaugeAddress.toLowerCase(), gauge)
    }
    return map
  }, [topology])

  const apyMap = useMemo(() => {
    const map = new Map<string, GaugeAPYData>()

    gauges.forEach((gauge) => {
      const topologyGauge = topologyMap.get(gauge.address.toLowerCase())
      const incentivesByToken: TokenIncentive[] = []
      let totalIncentivesUSD = 0

      for (const rewardToken of topologyGauge?.rewardTokens ?? []) {
        const amount = BigInt(rewardToken.epochAmount)
        if (amount <= 0n) continue

        const tokenAmount = Number(amount) / Math.pow(10, rewardToken.decimals)
        const price = getTokenUsdPrice(
          rewardToken.tokenAddress,
          rewardToken.symbol,
          btcPrice,
          mezoPrice,
        )
        const usdValue = price !== null ? tokenAmount * price : 0
        totalIncentivesUSD += usdValue

        incentivesByToken.push({
          tokenAddress: rewardToken.tokenAddress.toLowerCase(),
          symbol: rewardToken.symbol,
          amount,
          decimals: rewardToken.decimals,
          usdValue,
        })
      }

      map.set(gauge.address.toLowerCase(), {
        gaugeAddress: gauge.address,
        apy: calculateAPYFromData(totalIncentivesUSD, gauge.totalWeight, mezoPrice),
        totalIncentivesUSD,
        totalVeMEZOWeight: gauge.totalWeight,
        isLoading: false,
        incentivesByToken,
      })
    })

    return map
  }, [gauges, topologyMap, btcPrice, mezoPrice])

  return {
    apyMap,
    isLoading: isLoadingTopology || (gauges.length > 0 && !topology),
  }
}

/**
 * Format APY for display
 */
export function formatAPY(apy: number | null): string {
  if (apy === null) return "—"
  if (!Number.isFinite(apy)) return "∞"
  if (apy === 0) return "0%"
  if (apy < 0.01) return "<0.01%"
  if (apy >= 10000) return `${(apy / 1000).toFixed(1)}k%`
  if (apy >= 1000) return `${apy.toFixed(0)}%`
  if (apy >= 100) return `${apy.toFixed(1)}%`
  return `${apy.toFixed(2)}%`
}

/**
 * Calculate projected APY for a gauge after adding a user's vote
 */
export function calculateProjectedAPY(
  currentAPYData: GaugeAPYData | undefined,
  userVotePercentage: number,
  userVotingPower: bigint,
  mezoPrice: number | null,
): number | null {
  if (!currentAPYData || currentAPYData.totalIncentivesUSD === 0) {
    return null
  }

  if (userVotePercentage <= 0) {
    return currentAPYData.apy
  }

  // Calculate user's vote weight: (percentage / 100) * votingPower
  const userVoteWeight =
    (BigInt(Math.floor(userVotePercentage * 100)) * userVotingPower) / 10000n
  const newTotalWeight = currentAPYData.totalVeMEZOWeight + userVoteWeight

  if (newTotalWeight === 0n) {
    return Number.POSITIVE_INFINITY
  }

  if (!mezoPrice || mezoPrice === 0) {
    return null
  }

  // APY = (incentives / (weight * price)) * 52 * 100
  const newTotalVeMEZOValueUSD = (Number(newTotalWeight) / 1e18) * mezoPrice
  if (newTotalVeMEZOValueUSD === 0) return Number.POSITIVE_INFINITY

  const weeklyReturn =
    currentAPYData.totalIncentivesUSD / newTotalVeMEZOValueUSD
  return weeklyReturn * EPOCHS_PER_YEAR * 100
}

/**
 * Calculate APY for veMEZO voting based on used weights
 * APY = (Total Claimable Rewards USD / (Used veMEZO Weight * MEZO Price)) * 52 * 100
 */
export function useVotingAPY(
  totalClaimableUSD: number,
  usedWeight: bigint | undefined,
): { apy: number | null } {
  const { price: mezoPrice } = useMezoPrice()

  const apy = useMemo(
    () => calculateAPYFromData(totalClaimableUSD, usedWeight, mezoPrice),
    [totalClaimableUSD, usedWeight, mezoPrice],
  )

  return { apy }
}

export type VoteAllocation = {
  gaugeAddress: Address
  weight: bigint
}

export type ProjectedTokenReward = {
  tokenAddress: string
  symbol: string
  amount: bigint
  decimals: number
  usdValue: number
}

/**
 * Calculate upcoming/projected APY based on user's vote proportion vs total votes
 * This shows what the user will earn next epoch based on their current vote allocations.
 *
 * Formula:
 * For each gauge the user voted on:
 *   userShare = userVoteWeight / totalGaugeWeight
 *   userIncentives += gaugeIncentivesUSD * userShare
 *
 * upcomingAPY = (userIncentives / usedWeightUSD) * 52 * 100
 */
export function useUpcomingVotingAPY(
  voteAllocations: VoteAllocation[],
  apyMap: Map<string, GaugeAPYData>,
  usedWeight: bigint | undefined,
): {
  upcomingAPY: number | null
  projectedIncentivesUSD: number
  projectedRewardsByToken: ProjectedTokenReward[]
} {
  const { price: mezoPrice } = useMezoPrice()

  const result = useMemo(() => {
    if (voteAllocations.length === 0) {
      return {
        upcomingAPY: null,
        projectedIncentivesUSD: 0,
        projectedRewardsByToken: [],
      }
    }

    // Calculate user's proportional share of incentives across all voted gauges
    let totalUserIncentivesUSD = 0
    const tokenRewardsMap = new Map<string, ProjectedTokenReward>()

    for (const allocation of voteAllocations) {
      const gaugeKey = allocation.gaugeAddress.toLowerCase()
      const gaugeData = apyMap.get(gaugeKey)

      if (
        gaugeData &&
        gaugeData.totalVeMEZOWeight > 0n &&
        gaugeData.totalIncentivesUSD > 0
      ) {
        // Calculate user's share of this gauge's incentives
        const userShare =
          Number(allocation.weight) / Number(gaugeData.totalVeMEZOWeight)
        const userIncentivesFromGauge = gaugeData.totalIncentivesUSD * userShare
        totalUserIncentivesUSD += userIncentivesFromGauge

        // Calculate user's share of each token from this gauge
        for (const tokenIncentive of gaugeData.incentivesByToken) {
          const userTokenAmount = BigInt(
            Math.floor(Number(tokenIncentive.amount) * userShare),
          )
          const userTokenUSD = tokenIncentive.usdValue * userShare

          const existing = tokenRewardsMap.get(tokenIncentive.tokenAddress)
          if (existing) {
            existing.amount += userTokenAmount
            existing.usdValue += userTokenUSD
          } else {
            tokenRewardsMap.set(tokenIncentive.tokenAddress, {
              tokenAddress: tokenIncentive.tokenAddress,
              symbol: tokenIncentive.symbol,
              amount: userTokenAmount,
              decimals: tokenIncentive.decimals,
              usdValue: userTokenUSD,
            })
          }
        }
      }
    }

    const projectedRewardsByToken = Array.from(tokenRewardsMap.values())

    const upcomingAPY = calculateAPYFromData(
      totalUserIncentivesUSD,
      usedWeight,
      mezoPrice,
    )

    return {
      upcomingAPY,
      projectedIncentivesUSD: totalUserIncentivesUSD,
      projectedRewardsByToken,
    }
  }, [voteAllocations, apyMap, usedWeight, mezoPrice])

  return result
}
