import { getContractConfig } from "@/config/contracts"
import { useNetwork } from "@/contexts/NetworkContext"
import { getTokenUsdPrice } from "@repo/shared"
import { useMemo } from "react"
import type { Address } from "viem"
import { useReadContract, useReadContracts } from "wagmi"
import { useBtcPrice } from "./useBtcPrice"
import { useMezoPrice } from "./useMezoPrice"

const EPOCHS_PER_YEAR = 52

// Cache the timestamp at module level to avoid re-fetching on every render
// This is fine because epoch boundaries don't change within a session
let cachedEpochTimestamp: bigint | null = null

function getStableEpochTimestamp(): bigint {
  if (cachedEpochTimestamp === null) {
    cachedEpochTimestamp = BigInt(Math.floor(Date.now() / 1000))
  }
  return cachedEpochTimestamp
}

/**
 * Hook to get the current epoch start from the contract
 * This ensures we use the same epoch boundaries as the contract
 */
function useContractEpochStart(): bigint | undefined {
  const { chainId } = useNetwork()
  const contracts = getContractConfig(chainId)

  const { data: epochStartData } = useReadContract({
    ...contracts.boostVoter,
    functionName: "epochStart",
    args: [getStableEpochTimestamp()],
  })

  return epochStartData as bigint | undefined
}

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
 * Calculate APY for a single gauge
 * APY = (Total Epoch Incentives USD / (Total veMEZO votes * MEZO Price)) * 52 * 100
 */
export function useGaugeAPY(
  gaugeAddress: Address | undefined,
  totalWeight: bigint | undefined,
): GaugeAPYData {
  const { price: btcPrice } = useBtcPrice()
  const { price: mezoPrice } = useMezoPrice()
  const { chainId } = useNetwork()
  const contracts = getContractConfig(chainId)
  const contractEpochStart = useContractEpochStart()

  // Get bribe address for the gauge
  const { data: bribeAddressData, isLoading: isLoadingBribe } =
    useReadContracts({
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
  const { data: rewardsLengthData, isLoading: isLoadingLength } =
    useReadContracts({
      contracts: hasBribe
        ? [
            {
              address: bribeAddress!,
              abi: [
                {
                  inputs: [],
                  name: "rewardsListLength",
                  outputs: [
                    { internalType: "uint256", name: "", type: "uint256" },
                  ],
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
  const { data: rewardTokensData, isLoading: isLoadingTokens } =
    useReadContracts({
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

  const tokenAddresses =
    rewardTokensData?.map((r) => r.result as Address).filter(Boolean) ?? []

  // Get token rewards per epoch, decimals, and symbol for each token
  const { data: tokenDataResults, isLoading: isLoadingRewards } =
    useReadContracts({
      contracts: tokenAddresses.flatMap((tokenAddress) => [
        {
          address: bribeAddress!,
          abi: [
            {
              inputs: [
                { internalType: "address", name: "token", type: "address" },
                {
                  internalType: "uint256",
                  name: "epochStart",
                  type: "uint256",
                },
              ],
              name: "tokenRewardsPerEpoch",
              outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
              stateMutability: "view",
              type: "function",
            },
          ] as const,
          functionName: "tokenRewardsPerEpoch" as const,
          args: [tokenAddress, contractEpochStart ?? 0n],
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
        {
          address: tokenAddress,
          abi: [
            {
              inputs: [],
              name: "symbol",
              outputs: [{ internalType: "string", name: "", type: "string" }],
              stateMutability: "view",
              type: "function",
            },
          ] as const,
          functionName: "symbol" as const,
        },
      ]),
      query: {
        enabled:
          hasBribe &&
          tokenAddresses.length > 0 &&
          contractEpochStart !== undefined,
      },
    })

  // Calculate total incentives in USD
  const totalIncentivesUSD = useMemo(() => {
    if (!tokenDataResults || tokenAddresses.length === 0) return 0

    let total = 0
    tokenAddresses.forEach((tokenAddress, i) => {
      const amount = tokenDataResults[i * 3]?.result as bigint | undefined
      const decimals = tokenDataResults[i * 3 + 1]?.result as number | undefined
      const symbol = tokenDataResults[i * 3 + 2]?.result as string | undefined

      if (amount && amount > 0n) {
        const tokenAmount = Number(amount) / Math.pow(10, decimals ?? 18)

        // Get price using the token pricing system
        const price = getTokenUsdPrice(
          tokenAddress,
          symbol,
          btcPrice,
          mezoPrice,
        )

        if (price !== null) {
          total += tokenAmount * price
        }
      }
    })

    return total
  }, [tokenDataResults, tokenAddresses, btcPrice, mezoPrice])

  // Calculate APY
  const apy = useMemo(() => {
    // No incentives = no APY
    if (totalIncentivesUSD === 0) {
      return null
    }

    // If totalWeight is undefined (not passed), return null (data not ready)
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

    if (totalVeMEZOValueUSD === 0) return Number.POSITIVE_INFINITY

    // APY = (weekly rewards / total position value) * 52 weeks * 100%
    const weeklyReturn = totalIncentivesUSD / totalVeMEZOValueUSD
    const annualReturn = weeklyReturn * EPOCHS_PER_YEAR
    const apyPercent = annualReturn * 100

    return apyPercent
  }, [totalWeight, totalIncentivesUSD, mezoPrice])

  const isLoading =
    isLoadingBribe || isLoadingLength || isLoadingTokens || isLoadingRewards

  return {
    gaugeAddress: gaugeAddress ?? ("0x" as Address),
    apy,
    totalIncentivesUSD,
    totalVeMEZOWeight: totalWeight ?? 0n,
    isLoading,
    incentivesByToken: [], // Single gauge doesn't track by token for now
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
  const { chainId } = useNetwork()
  const contracts = getContractConfig(chainId)
  const contractEpochStart = useContractEpochStart()

  const gaugeAddresses = useMemo(() => gauges.map((g) => g.address), [gauges])

  // Get bribe addresses for all gauges
  const { data: bribeAddressesData, isLoading: isLoadingBribes } =
    useReadContracts({
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
      return {
        gaugeAddress: gaugeAddr,
        bribeAddress: hasBribe ? bribeAddress : undefined,
      }
    })
  }, [bribeAddressesData, gaugeAddresses])

  const validBribes = useMemo(
    () => bribeInfos.filter((b) => b.bribeAddress),
    [bribeInfos],
  )

  // Get rewards list length for all bribe contracts
  const { data: rewardsLengthData, isLoading: isLoadingLengths } =
    useReadContracts({
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
    const queries: Array<{
      gaugeAddress: Address
      bribeAddress: Address
      tokenIndex: number
    }> = []
    validBribes.forEach(({ gaugeAddress, bribeAddress }, i) => {
      const length = Number(rewardsLengthData[i]?.result ?? 0n)
      for (let j = 0; j < length; j++) {
        queries.push({
          gaugeAddress,
          bribeAddress: bribeAddress!,
          tokenIndex: j,
        })
      }
    })
    return queries
  }, [validBribes, rewardsLengthData])

  // Get all reward token addresses
  const { data: rewardTokensData, isLoading: isLoadingTokens } =
    useReadContracts({
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

  // Build a resolved list of reward token queries with valid token addresses
  const resolvedRewardTokenQueries = useMemo(() => {
    if (!rewardTokensData) return []
    return rewardTokenQueries
      .map((query, i) => ({
        ...query,
        tokenAddress: rewardTokensData[i]?.result as Address | undefined,
      }))
      .filter(
        (query): query is typeof query & { tokenAddress: Address } =>
          !!query.tokenAddress &&
          query.tokenAddress !== "0x0000000000000000000000000000000000000000" &&
          // Filter out obviously invalid addresses (less than 20 non-zero bytes)
          !query.tokenAddress.match(/^0x0*[0-9a-fA-F]{1,8}$/),
      )
  }, [rewardTokensData, rewardTokenQueries])

  // Get token rewards per epoch, decimals, and symbol - only run when we have resolved token addresses
  const { data: tokenRewardsData, isLoading: isLoadingRewards } =
    useReadContracts({
      contracts: resolvedRewardTokenQueries.flatMap(
        ({ bribeAddress, tokenAddress }) => [
          {
            address: bribeAddress,
            abi: [
              {
                inputs: [
                  { internalType: "address", name: "token", type: "address" },
                  {
                    internalType: "uint256",
                    name: "epochStart",
                    type: "uint256",
                  },
                ],
                name: "tokenRewardsPerEpoch",
                outputs: [
                  { internalType: "uint256", name: "", type: "uint256" },
                ],
                stateMutability: "view",
                type: "function",
              },
            ] as const,
            functionName: "tokenRewardsPerEpoch" as const,
            args: [tokenAddress, contractEpochStart ?? 0n],
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
          {
            address: tokenAddress,
            abi: [
              {
                inputs: [],
                name: "symbol",
                outputs: [{ internalType: "string", name: "", type: "string" }],
                stateMutability: "view",
                type: "function",
              },
            ] as const,
            functionName: "symbol" as const,
          },
        ],
      ),
      query: {
        // Only run when we have actual token addresses resolved and epoch start is known
        enabled:
          resolvedRewardTokenQueries.length > 0 &&
          contractEpochStart !== undefined,
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
        incentivesByToken: [],
      })
    })

    // Calculate incentives per gauge (both total USD and by token)
    const gaugeIncentives = new Map<string, number>()
    const gaugeTokenIncentives = new Map<string, TokenIncentive[]>()

    resolvedRewardTokenQueries.forEach((query, i) => {
      const tokenAddress = query.tokenAddress
      const amount = tokenRewardsData?.[i * 3]?.result as bigint | undefined
      const decimals = tokenRewardsData?.[i * 3 + 1]?.result as
        | number
        | undefined
      const symbol = tokenRewardsData?.[i * 3 + 2]?.result as string | undefined

      if (tokenAddress && amount && amount > 0n) {
        const tokenAmount = Number(amount) / Math.pow(10, decimals ?? 18)
        const tokenKey = tokenAddress.toLowerCase()

        // Get price using the token pricing system
        const price = getTokenUsdPrice(
          tokenAddress,
          symbol,
          btcPrice,
          mezoPrice,
        )

        const usdValue = price !== null ? tokenAmount * price : 0
        const gaugeKey = query.gaugeAddress.toLowerCase()
        const current = gaugeIncentives.get(gaugeKey) ?? 0
        gaugeIncentives.set(gaugeKey, current + usdValue)

        // Track by token
        const existingTokens = gaugeTokenIncentives.get(gaugeKey) ?? []
        const existingToken = existingTokens.find(
          (t) => t.tokenAddress === tokenKey,
        )
        if (existingToken) {
          existingToken.amount += amount
          existingToken.usdValue += usdValue
        } else {
          existingTokens.push({
            tokenAddress: tokenKey,
            symbol: symbol ?? "???",
            amount,
            decimals: decimals ?? 18,
            usdValue,
          })
        }
        gaugeTokenIncentives.set(gaugeKey, existingTokens)
      }
    })

    // Calculate APY for each gauge
    gauges.forEach((gauge) => {
      const gaugeKey = gauge.address.toLowerCase()
      const totalIncentivesUSD = gaugeIncentives.get(gaugeKey) ?? 0
      const totalWeight = gauge.totalWeight
      const incentivesByToken = gaugeTokenIncentives.get(gaugeKey) ?? []

      let apy: number | null = null

      // No incentives = no APY
      if (totalIncentivesUSD > 0) {
        // If mezo price isn't available yet, return null instead of infinity
        if (mezoPrice === null || mezoPrice === 0) {
          apy = null
        }
        // Has incentives but no votes = infinite APY (first voter gets all rewards)
        else if (!totalWeight || totalWeight === 0n) {
          apy = Number.POSITIVE_INFINITY
        } else {
          const totalVeMEZOAmount = Number(totalWeight) / 1e18
          const totalVeMEZOValueUSD = totalVeMEZOAmount * mezoPrice

          if (totalVeMEZOValueUSD > 0) {
            const weeklyReturn = totalIncentivesUSD / totalVeMEZOValueUSD
            const annualReturn = weeklyReturn * EPOCHS_PER_YEAR
            apy = annualReturn * 100
          } else {
            apy = Number.POSITIVE_INFINITY
          }
        }
      }

      map.set(gaugeKey, {
        gaugeAddress: gauge.address,
        apy,
        totalIncentivesUSD,
        totalVeMEZOWeight: totalWeight,
        isLoading: false,
        incentivesByToken,
      })
    })

    return map
  }, [
    gauges,
    resolvedRewardTokenQueries,
    rewardTokensData,
    tokenRewardsData,
    btcPrice,
    mezoPrice,
  ])

  // Check if we're still loading - must account for cascading query dependencies
  // A later query being disabled (not loading) doesn't mean data is ready
  const isLoading =
    isLoadingBribes ||
    isLoadingLengths ||
    isLoadingTokens ||
    isLoadingRewards ||
    // Also loading if we expect data from cascading queries but don't have it yet
    (validBribes.length > 0 && !rewardsLengthData) ||
    (rewardTokenQueries.length > 0 && !rewardTokensData) ||
    (resolvedRewardTokenQueries.length > 0 && !tokenRewardsData)

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

  const apy = useMemo(() => {
    if (!usedWeight || usedWeight === 0n || totalClaimableUSD === 0) {
      return null
    }

    // Convert used veMEZO weight to a number (18 decimals)
    const usedVeMEZOAmount = Number(usedWeight) / 1e18

    // Value of used veMEZO votes in USD
    const usedVeMEZOValueUSD = usedVeMEZOAmount * (mezoPrice ?? 0)

    if (usedVeMEZOValueUSD === 0) return null

    // APY = (weekly rewards / total position value) * 52 weeks * 100%
    const weeklyReturn = totalClaimableUSD / usedVeMEZOValueUSD
    const annualReturn = weeklyReturn * EPOCHS_PER_YEAR
    const apyPercent = annualReturn * 100

    return apyPercent
  }, [totalClaimableUSD, usedWeight, mezoPrice])

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

    if (totalUserIncentivesUSD === 0) {
      return {
        upcomingAPY: null,
        projectedIncentivesUSD: 0,
        projectedRewardsByToken: [],
      }
    }

    const projectedRewardsByToken = Array.from(tokenRewardsMap.values())

    if (!usedWeight || usedWeight === 0n) {
      return {
        upcomingAPY: null,
        projectedIncentivesUSD: totalUserIncentivesUSD,
        projectedRewardsByToken,
      }
    }

    // Convert used veMEZO weight to USD value
    const usedVeMEZOAmount = Number(usedWeight) / 1e18
    const usedVeMEZOValueUSD = usedVeMEZOAmount * (mezoPrice ?? 0)

    if (usedVeMEZOValueUSD === 0) {
      return {
        upcomingAPY: null,
        projectedIncentivesUSD: totalUserIncentivesUSD,
        projectedRewardsByToken,
      }
    }

    // Calculate APY: (weekly rewards / total position value) * 52 weeks * 100%
    const weeklyReturn = totalUserIncentivesUSD / usedVeMEZOValueUSD
    const annualReturn = weeklyReturn * EPOCHS_PER_YEAR
    const apyPercent = annualReturn * 100

    return {
      upcomingAPY: apyPercent,
      projectedIncentivesUSD: totalUserIncentivesUSD,
      projectedRewardsByToken,
    }
  }, [voteAllocations, apyMap, usedWeight, mezoPrice])

  return result
}
