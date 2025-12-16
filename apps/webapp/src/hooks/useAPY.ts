import { getContractConfig } from "@/config/contracts"
import { CHAIN_ID } from "@repo/shared/contracts"
import { useMemo } from "react"
import type { Address } from "viem"
import { useReadContracts } from "wagmi"
import { useBtcPrice } from "./useBtcPrice"

// MEZO token price - same as in TokenPrices component
const MEZO_PRICE = 0.22

// MEZO token address (only token that uses MEZO price, everything else is BTC-based on this L2)
const MEZO_TOKEN_ADDRESS = "0x7b7c000000000000000000000000000000000001".toLowerCase()

// Epoch duration in seconds (7 days)
const EPOCH_DURATION = 7 * 24 * 60 * 60
const EPOCHS_PER_YEAR = 52

function getEpochStart(timestamp: number): bigint {
  return BigInt(Math.floor(timestamp / EPOCH_DURATION) * EPOCH_DURATION)
}

export type GaugeAPYData = {
  gaugeAddress: Address
  apy: number | null
  totalIncentivesUSD: number
  totalVeMEZOWeight: bigint
  isLoading: boolean
}

/**
 * Calculate APY for a single gauge
 * APY = (Total Epoch Incentives USD / (Total veMEZO votes * MEZO Price)) * 52 * 100
 */
export function useGaugeAPY(
  gaugeAddress: Address | undefined,
  totalWeight: bigint | undefined
): GaugeAPYData {
  const { price: btcPrice } = useBtcPrice()
  const contracts = getContractConfig(CHAIN_ID.testnet)

  // Get bribe address for the gauge
  const { data: bribeAddressData, isLoading: isLoadingBribe } = useReadContracts({
    contracts: gaugeAddress
      ? [
          {
            ...contracts.boostVoter,
            functionName: "gaugeToBribe",
            args: [gaugeAddress],
          },
        ]
      : [],
    query: {
      enabled: !!gaugeAddress,
    },
  })

  const bribeAddress = bribeAddressData?.[0]?.result as Address | undefined
  const hasBribe =
    bribeAddress !== undefined &&
    bribeAddress !== "0x0000000000000000000000000000000000000000"

  // Get rewards list length
  const { data: rewardsLengthData, isLoading: isLoadingLength } = useReadContracts({
    contracts: hasBribe
      ? [
          {
            address: bribeAddress!,
            abi: [
              {
                inputs: [],
                name: "rewardsListLength",
                outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
                stateMutability: "view",
                type: "function",
              },
            ] as const,
            functionName: "rewardsListLength" as const,
          },
        ]
      : [],
    query: {
      enabled: hasBribe,
    },
  })

  const rewardsLength = Number(rewardsLengthData?.[0]?.result ?? 0n)

  // Get all reward token addresses
  const { data: rewardTokensData, isLoading: isLoadingTokens } = useReadContracts({
    contracts: Array.from({ length: rewardsLength }, (_, i) => ({
      address: bribeAddress!,
      abi: [
        {
          inputs: [{ internalType: "uint256", name: "", type: "uint256" }],
          name: "rewards",
          outputs: [{ internalType: "address", name: "", type: "address" }],
          stateMutability: "view",
          type: "function",
        },
      ] as const,
      functionName: "rewards" as const,
      args: [BigInt(i)],
    })),
    query: {
      enabled: hasBribe && rewardsLength > 0,
    },
  })

  const tokenAddresses = rewardTokensData?.map((r) => r.result as Address).filter(Boolean) ?? []

  const currentEpochStart = getEpochStart(Math.floor(Date.now() / 1000))

  // Get token rewards per epoch and decimals for each token
  const { data: tokenDataResults, isLoading: isLoadingRewards } = useReadContracts({
    contracts: tokenAddresses.flatMap((tokenAddress) => [
      {
        address: bribeAddress!,
        abi: [
          {
            inputs: [
              { internalType: "address", name: "token", type: "address" },
              { internalType: "uint256", name: "epochStart", type: "uint256" },
            ],
            name: "tokenRewardsPerEpoch",
            outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
            stateMutability: "view",
            type: "function",
          },
        ] as const,
        functionName: "tokenRewardsPerEpoch" as const,
        args: [tokenAddress, currentEpochStart],
      },
      {
        address: tokenAddress,
        abi: [
          {
            inputs: [],
            name: "decimals",
            outputs: [{ internalType: "uint8", name: "", type: "uint8" }],
            stateMutability: "view",
            type: "function",
          },
        ] as const,
        functionName: "decimals" as const,
      },
    ]),
    query: {
      enabled: hasBribe && tokenAddresses.length > 0,
    },
  })

  // Calculate total incentives in USD
  const totalIncentivesUSD = useMemo(() => {
    if (!tokenDataResults || tokenAddresses.length === 0) return 0

    let total = 0
    tokenAddresses.forEach((tokenAddress, i) => {
      const amount = tokenDataResults[i * 2]?.result as bigint | undefined
      const decimals = tokenDataResults[i * 2 + 1]?.result as number | undefined
      
      if (amount && amount > 0n) {
        const tokenAmount = Number(amount) / Math.pow(10, decimals ?? 18)
        const tokenKey = tokenAddress.toLowerCase()
        
        // Get price for this token
        // On this Bitcoin L2, assume everything except MEZO is BTC-denominated
        const isMezo = tokenKey === MEZO_TOKEN_ADDRESS
        const price = isMezo ? MEZO_PRICE : (btcPrice ?? 0)
        
        total += tokenAmount * price
      }
    })
    
    return total
  }, [tokenDataResults, tokenAddresses, btcPrice])

  // Calculate APY
  const apy = useMemo(() => {
    if (!totalWeight || totalWeight === 0n || totalIncentivesUSD === 0) {
      return null
    }

    // Convert veMEZO weight to a number (18 decimals)
    const totalVeMEZOAmount = Number(totalWeight) / 1e18
    
    // Value of veMEZO votes in USD
    const totalVeMEZOValueUSD = totalVeMEZOAmount * MEZO_PRICE
    
    if (totalVeMEZOValueUSD === 0) return null

    // APY = (weekly rewards / total position value) * 52 weeks * 100%
    const weeklyReturn = totalIncentivesUSD / totalVeMEZOValueUSD
    const annualReturn = weeklyReturn * EPOCHS_PER_YEAR
    const apyPercent = annualReturn * 100

    return apyPercent
  }, [totalWeight, totalIncentivesUSD])

  const isLoading =
    isLoadingBribe || isLoadingLength || isLoadingTokens || isLoadingRewards

  return {
    gaugeAddress: gaugeAddress ?? ("0x" as Address),
    apy,
    totalIncentivesUSD,
    totalVeMEZOWeight: totalWeight ?? 0n,
    isLoading,
  }
}

/**
 * Calculate APY for multiple gauges at once (more efficient)
 */
export function useGaugesAPY(
  gauges: Array<{ address: Address; totalWeight: bigint }>
): {
  apyMap: Map<string, GaugeAPYData>
  isLoading: boolean
} {
  const { price: btcPrice } = useBtcPrice()
  const contracts = getContractConfig(CHAIN_ID.testnet)

  const gaugeAddresses = gauges.map((g) => g.address)

  // Get bribe addresses for all gauges
  const { data: bribeAddressesData, isLoading: isLoadingBribes } = useReadContracts({
    contracts: gaugeAddresses.map((address) => ({
      ...contracts.boostVoter,
      functionName: "gaugeToBribe",
      args: [address],
    })),
    query: {
      enabled: gaugeAddresses.length > 0,
    },
  })

  // Extract valid bribe addresses
  const bribeInfos = useMemo(() => {
    if (!bribeAddressesData) return []
    return gaugeAddresses.map((gaugeAddr, i) => {
      const bribeAddress = bribeAddressesData[i]?.result as Address | undefined
      const hasBribe =
        bribeAddress !== undefined &&
        bribeAddress !== "0x0000000000000000000000000000000000000000"
      return { gaugeAddress: gaugeAddr, bribeAddress: hasBribe ? bribeAddress : undefined }
    })
  }, [bribeAddressesData, gaugeAddresses])

  const validBribes = bribeInfos.filter((b) => b.bribeAddress)

  // Get rewards list length for all bribe contracts
  const { data: rewardsLengthData, isLoading: isLoadingLengths } = useReadContracts({
    contracts: validBribes.map(({ bribeAddress }) => ({
      address: bribeAddress!,
      abi: [
        {
          inputs: [],
          name: "rewardsListLength",
          outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
          stateMutability: "view",
          type: "function",
        },
      ] as const,
      functionName: "rewardsListLength" as const,
    })),
    query: {
      enabled: validBribes.length > 0,
    },
  })

  // Build queries for all reward tokens
  const rewardTokenQueries = useMemo(() => {
    if (!rewardsLengthData) return []
    const queries: Array<{ gaugeAddress: Address; bribeAddress: Address; tokenIndex: number }> = []
    validBribes.forEach(({ gaugeAddress, bribeAddress }, i) => {
      const length = Number(rewardsLengthData[i]?.result ?? 0n)
      for (let j = 0; j < length; j++) {
        queries.push({ gaugeAddress, bribeAddress: bribeAddress!, tokenIndex: j })
      }
    })
    return queries
  }, [validBribes, rewardsLengthData])

  // Get all reward token addresses
  const { data: rewardTokensData, isLoading: isLoadingTokens } = useReadContracts({
    contracts: rewardTokenQueries.map(({ bribeAddress, tokenIndex }) => ({
      address: bribeAddress,
      abi: [
        {
          inputs: [{ internalType: "uint256", name: "", type: "uint256" }],
          name: "rewards",
          outputs: [{ internalType: "address", name: "", type: "address" }],
          stateMutability: "view",
          type: "function",
        },
      ] as const,
      functionName: "rewards" as const,
      args: [BigInt(tokenIndex)],
    })),
    query: {
      enabled: rewardTokenQueries.length > 0,
    },
  })

  const currentEpochStart = getEpochStart(Math.floor(Date.now() / 1000))

  // Get token rewards per epoch and decimals
  const { data: tokenRewardsData, isLoading: isLoadingRewards } = useReadContracts({
    contracts: rewardTokenQueries.flatMap(({ bribeAddress }, i) => {
      const tokenAddress = rewardTokensData?.[i]?.result as Address | undefined
      return [
        {
          address: bribeAddress,
          abi: [
            {
              inputs: [
                { internalType: "address", name: "token", type: "address" },
                { internalType: "uint256", name: "epochStart", type: "uint256" },
              ],
              name: "tokenRewardsPerEpoch",
              outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
              stateMutability: "view",
              type: "function",
            },
          ] as const,
          functionName: "tokenRewardsPerEpoch" as const,
          args: [tokenAddress ?? "0x0000000000000000000000000000000000000000", currentEpochStart],
        },
        {
          address: tokenAddress ?? "0x0000000000000000000000000000000000000000",
          abi: [
            {
              inputs: [],
              name: "decimals",
              outputs: [{ internalType: "uint8", name: "", type: "uint8" }],
              stateMutability: "view",
              type: "function",
            },
          ] as const,
          functionName: "decimals" as const,
        },
      ]
    }),
    query: {
      enabled: rewardTokenQueries.length > 0 && !!rewardTokensData,
    },
  })

  // Calculate APY for each gauge
  const apyMap = useMemo(() => {
    const map = new Map<string, GaugeAPYData>()

    // Initialize all gauges with default values
    gauges.forEach((gauge) => {
      map.set(gauge.address.toLowerCase(), {
        gaugeAddress: gauge.address,
        apy: null,
        totalIncentivesUSD: 0,
        totalVeMEZOWeight: gauge.totalWeight,
        isLoading: false,
      })
    })

    // Calculate incentives per gauge
    const gaugeIncentives = new Map<string, number>()
    rewardTokenQueries.forEach((query, i) => {
      const tokenAddress = rewardTokensData?.[i]?.result as Address | undefined
      const amount = tokenRewardsData?.[i * 2]?.result as bigint | undefined
      const decimals = tokenRewardsData?.[i * 2 + 1]?.result as number | undefined

      if (tokenAddress && amount && amount > 0n) {
        const tokenAmount = Number(amount) / Math.pow(10, decimals ?? 18)
        const tokenKey = tokenAddress.toLowerCase()

        // Get price for this token
        // On this Bitcoin L2, assume everything except MEZO is BTC-denominated
        const isMezo = tokenKey === MEZO_TOKEN_ADDRESS
        const price = isMezo ? MEZO_PRICE : (btcPrice ?? 0)

        const usdValue = tokenAmount * price
        const gaugeKey = query.gaugeAddress.toLowerCase()
        const current = gaugeIncentives.get(gaugeKey) ?? 0
        gaugeIncentives.set(gaugeKey, current + usdValue)
      }
    })

    // Calculate APY for each gauge
    gauges.forEach((gauge) => {
      const gaugeKey = gauge.address.toLowerCase()
      const totalIncentivesUSD = gaugeIncentives.get(gaugeKey) ?? 0
      const totalWeight = gauge.totalWeight

      let apy: number | null = null
      if (totalWeight && totalWeight > 0n && totalIncentivesUSD > 0) {
        const totalVeMEZOAmount = Number(totalWeight) / 1e18
        const totalVeMEZOValueUSD = totalVeMEZOAmount * MEZO_PRICE

        if (totalVeMEZOValueUSD > 0) {
          const weeklyReturn = totalIncentivesUSD / totalVeMEZOValueUSD
          const annualReturn = weeklyReturn * EPOCHS_PER_YEAR
          apy = annualReturn * 100
        }
      }

      map.set(gaugeKey, {
        gaugeAddress: gauge.address,
        apy,
        totalIncentivesUSD,
        totalVeMEZOWeight: totalWeight,
        isLoading: false,
      })
    })

    return map
  }, [gauges, rewardTokenQueries, rewardTokensData, tokenRewardsData, btcPrice])

  const isLoading =
    isLoadingBribes || isLoadingLengths || isLoadingTokens || isLoadingRewards

  return {
    apyMap,
    isLoading,
  }
}

/**
 * Format APY for display
 */
export function formatAPY(apy: number | null): string {
  if (apy === null) return "—"
  if (apy === 0) return "0%"
  if (apy < 0.01) return "<0.01%"
  if (apy >= 10000) return `${(apy / 1000).toFixed(1)}k%`
  if (apy >= 1000) return `${apy.toFixed(0)}%`
  if (apy >= 100) return `${apy.toFixed(1)}%`
  return `${apy.toFixed(2)}%`
}

/**
 * Calculate APY for veMEZO voting based on used weights
 * APY = (Total Claimable Rewards USD / (Used veMEZO Weight * MEZO Price)) * 52 * 100
 */
export function useVotingAPY(
  totalClaimableUSD: number,
  usedWeight: bigint | undefined
): { apy: number | null } {
  const apy = useMemo(() => {
    if (!usedWeight || usedWeight === 0n || totalClaimableUSD === 0) {
      return null
    }

    // Convert used veMEZO weight to a number (18 decimals)
    const usedVeMEZOAmount = Number(usedWeight) / 1e18
    
    // Value of used veMEZO votes in USD
    const usedVeMEZOValueUSD = usedVeMEZOAmount * MEZO_PRICE
    
    if (usedVeMEZOValueUSD === 0) return null

    // APY = (weekly rewards / total position value) * 52 weeks * 100%
    const weeklyReturn = totalClaimableUSD / usedVeMEZOValueUSD
    const annualReturn = weeklyReturn * EPOCHS_PER_YEAR
    const apyPercent = annualReturn * 100

    return apyPercent
  }, [totalClaimableUSD, usedWeight])

  return { apy }
}

export type VoteAllocation = {
  gaugeAddress: Address
  weight: bigint
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
  usedWeight: bigint | undefined
): { upcomingAPY: number | null; projectedIncentivesUSD: number } {
  const result = useMemo(() => {
    if (!usedWeight || usedWeight === 0n || voteAllocations.length === 0) {
      return { upcomingAPY: null, projectedIncentivesUSD: 0 }
    }

    // Calculate user's proportional share of incentives across all voted gauges
    let totalUserIncentivesUSD = 0

    for (const allocation of voteAllocations) {
      const gaugeKey = allocation.gaugeAddress.toLowerCase()
      const gaugeData = apyMap.get(gaugeKey)
      
      if (gaugeData && gaugeData.totalVeMEZOWeight > 0n && gaugeData.totalIncentivesUSD > 0) {
        // Calculate user's share of this gauge's incentives
        const userShare = Number(allocation.weight) / Number(gaugeData.totalVeMEZOWeight)
        const userIncentivesFromGauge = gaugeData.totalIncentivesUSD * userShare
        totalUserIncentivesUSD += userIncentivesFromGauge
      }
    }

    if (totalUserIncentivesUSD === 0) {
      return { upcomingAPY: null, projectedIncentivesUSD: 0 }
    }

    // Convert used veMEZO weight to USD value
    const usedVeMEZOAmount = Number(usedWeight) / 1e18
    const usedVeMEZOValueUSD = usedVeMEZOAmount * MEZO_PRICE

    if (usedVeMEZOValueUSD === 0) {
      return { upcomingAPY: null, projectedIncentivesUSD: totalUserIncentivesUSD }
    }

    // Calculate APY: (weekly rewards / total position value) * 52 weeks * 100%
    const weeklyReturn = totalUserIncentivesUSD / usedVeMEZOValueUSD
    const annualReturn = weeklyReturn * EPOCHS_PER_YEAR
    const apyPercent = annualReturn * 100

    return { upcomingAPY: apyPercent, projectedIncentivesUSD: totalUserIncentivesUSD }
  }, [voteAllocations, apyMap, usedWeight])

  return result
}

