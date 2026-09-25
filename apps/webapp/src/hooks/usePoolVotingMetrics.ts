import { getContractConfig } from "@/config/contracts"
import { QUERY_PROFILES } from "@/config/queryProfiles"
import { useNetwork } from "@/contexts/NetworkContext"
import { useBtcPrice } from "@/hooks/useBtcPrice"
import { useMezoPrice } from "@/hooks/useMezoPrice"
import type { Pool } from "@/hooks/usePools"
import { useTokenList } from "@/hooks/useTokenList"
import { useDexTokenPrices } from "@/hooks/useTokenPrices"
import { addNullableMicroUsd, totalRewardMicroUsd } from "@/utils/poolVoting"
import {
  calculateValidatorApyBasisPoints,
  tokenUsdMicroValue,
} from "@/utils/validatorApy"
import { getTokenPriceType, getTokenUsdPrice } from "@repo/shared"
import { useCallback, useMemo } from "react"
import type { Address } from "viem"
import { erc20Abi, zeroAddress } from "viem"
import { useReadContract, useReadContracts } from "wagmi"

const WEEK_SECONDS = 7 * 24 * 60 * 60
const READS_PER_POOL = 4

export type PoolVoteRewardToken = {
  tokenAddress: Address
  symbol: string
  decimals: number
  amount: bigint
  valueMicroUsd: bigint | null
}

export type PoolVotingMetric = {
  weight: bigint
  isAlive: boolean
  bribes: PoolVoteRewardToken[]
  voterFees: PoolVoteRewardToken[]
  bribesMicroUsd: bigint | null
  voterFeesMicroUsd: bigint | null
  totalRewardsMicroUsd: bigint | null
  apyBasisPoints: bigint | null
}

export type GaugedPool = Pool & { gauge: Address }

type RewardKind = "bribes" | "voterFees"
type RewardContract = { pool: GaugedPool; kind: RewardKind; reward: Address }
type RewardTokenSlot = RewardContract & { index: number }
type TokenMetadata = { symbol: string; decimals: number }

function currentEpochStart(nowSeconds: number): number {
  return Math.floor(nowSeconds / WEEK_SECONDS) * WEEK_SECONDS
}

export function isGaugedPool(pool: Pool): pool is GaugedPool {
  return pool.gauge !== null && pool.gauge !== zeroAddress
}

// Reads everything a veBTC voter earns for backing a pool this epoch. Pool
// votes pay out of two reward contracts per gauge: the external bribe and the
// fee reward, which receives the trading fees the gauge harvested when the
// epoch flipped. Both are keyed by epoch start, so the current-epoch entries
// are exactly what this epoch's voters split pro rata.
export function usePoolVotingMetrics(pools: GaugedPool[]): {
  map: Map<string, PoolVotingMetric>
  totalWeight: bigint
  btcPriceUsd: string | null
  isLoading: boolean
  error: Error | null
  refetch: () => void
} {
  const { chainId, isNetworkReady } = useNetwork()
  const contracts = getContractConfig(chainId)
  const { tokens: knownTokens } = useTokenList()
  const { price: btcPrice, isLoading: isLoadingBtc } = useBtcPrice()
  const { price: mezoPrice, isLoading: isLoadingMezo } = useMezoPrice()

  const {
    data: totalWeightData,
    isLoading: isLoadingTotalWeight,
    refetch: refetchTotalWeight,
  } = useReadContract({
    ...contracts.poolsVoter,
    functionName: "totalWeight",
    query: { ...QUERY_PROFILES.SHORT_CACHE, enabled: isNetworkReady },
  })

  const {
    data: gaugeData,
    isLoading: isLoadingGauges,
    error: gaugeError,
    refetch: refetchGauges,
  } = useReadContracts({
    contracts: pools.flatMap((pool) => [
      {
        ...contracts.poolsVoter,
        functionName: "weights" as const,
        args: [pool.address] as const,
      },
      {
        ...contracts.poolsVoter,
        functionName: "isAlive" as const,
        args: [pool.gauge] as const,
      },
      {
        ...contracts.poolsVoter,
        functionName: "gaugeToBribe" as const,
        args: [pool.gauge] as const,
      },
      {
        ...contracts.poolsVoter,
        functionName: "gaugeToFees" as const,
        args: [pool.gauge] as const,
      },
    ]),
    query: {
      ...QUERY_PROFILES.SHORT_CACHE,
      enabled: isNetworkReady && pools.length > 0,
    },
  })

  const rewardContracts = useMemo<RewardContract[]>(
    () =>
      pools.flatMap((pool, poolIndex) => {
        const base = poolIndex * READS_PER_POOL
        const bribe = gaugeData?.[base + 2]?.result as Address | undefined
        const fees = gaugeData?.[base + 3]?.result as Address | undefined
        return [
          ...(bribe && bribe !== zeroAddress
            ? [{ pool, kind: "bribes" as const, reward: bribe }]
            : []),
          ...(fees && fees !== zeroAddress
            ? [{ pool, kind: "voterFees" as const, reward: fees }]
            : []),
        ]
      }),
    [gaugeData, pools],
  )

  const {
    data: lengthsData,
    isLoading: isLoadingLengths,
    refetch: refetchLengths,
  } = useReadContracts({
    contracts: rewardContracts.map(({ reward }) => ({
      address: reward,
      abi: contracts.bribe.abi,
      chainId,
      functionName: "rewardsListLength" as const,
    })),
    query: {
      ...QUERY_PROFILES.SHORT_CACHE,
      enabled: isNetworkReady && rewardContracts.length > 0,
    },
  })

  const tokenSlots = useMemo<RewardTokenSlot[]>(() => {
    const slots: RewardTokenSlot[] = []
    rewardContracts.forEach((entry, entryIndex) => {
      const length = Number(
        (lengthsData?.[entryIndex]?.result as bigint | undefined) ?? 0n,
      )
      for (let index = 0; index < length; index++) {
        slots.push({ ...entry, index })
      }
    })
    return slots
  }, [lengthsData, rewardContracts])

  const {
    data: rewardTokensData,
    isLoading: isLoadingRewardTokens,
    refetch: refetchRewardTokens,
  } = useReadContracts({
    contracts: tokenSlots.map(({ reward, index }) => ({
      address: reward,
      abi: contracts.bribe.abi,
      chainId,
      functionName: "rewards" as const,
      args: [BigInt(index)],
    })),
    query: {
      ...QUERY_PROFILES.SHORT_CACHE,
      enabled: isNetworkReady && tokenSlots.length > 0,
    },
  })

  const resolvedSlots = useMemo(
    () =>
      tokenSlots.flatMap((slot, index) => {
        const token = rewardTokensData?.[index]?.result as Address | undefined
        return token && token !== zeroAddress ? [{ ...slot, token }] : []
      }),
    [rewardTokensData, tokenSlots],
  )
  const epochStart = useMemo(
    () => currentEpochStart(Math.floor(Date.now() / 1_000)),
    [],
  )
  const {
    data: epochRewardsData,
    isLoading: isLoadingEpochRewards,
    refetch: refetchEpochRewards,
  } = useReadContracts({
    contracts: resolvedSlots.map(({ reward, token }) => ({
      address: reward,
      abi: contracts.bribe.abi,
      chainId,
      functionName: "tokenRewardsPerEpoch" as const,
      args: [token, BigInt(epochStart)],
    })),
    query: {
      ...QUERY_PROFILES.SHORT_CACHE,
      enabled: isNetworkReady && resolvedSlots.length > 0,
    },
  })

  // Fee rewards pay out in the pool's own tokens, which the pools API already
  // describes (and prices), so only tokens neither source knows need RPC reads.
  const poolTokens = useMemo(() => {
    const result = new Map<
      string,
      TokenMetadata & { priceUsd: string | null }
    >()
    for (const pool of pools) {
      for (const token of [pool.token0, pool.token1]) {
        result.set(token.address.toLowerCase(), {
          symbol: token.symbol,
          decimals: token.decimals,
          priceUsd: token.price,
        })
      }
    }
    return result
  }, [pools])

  const unknownTokens = useMemo(() => {
    const addresses = new Map<string, Address>()
    for (const { token } of resolvedSlots) {
      const lower = token.toLowerCase()
      if (
        !poolTokens.has(lower) &&
        !knownTokens.some((known) => known.address.toLowerCase() === lower)
      ) {
        addresses.set(lower, token)
      }
    }
    return Array.from(addresses.values())
  }, [knownTokens, poolTokens, resolvedSlots])
  const { data: metadataData, isLoading: isLoadingMetadata } = useReadContracts(
    {
      contracts: unknownTokens.flatMap((address) => [
        { address, abi: erc20Abi, chainId, functionName: "symbol" as const },
        { address, abi: erc20Abi, chainId, functionName: "decimals" as const },
      ]),
      query: {
        ...QUERY_PROFILES.SHORT_CACHE,
        enabled: isNetworkReady && unknownTokens.length > 0,
      },
    },
  )

  const tokenMetadata = useMemo(() => {
    const result = new Map<string, TokenMetadata>()
    for (const [address, token] of poolTokens) {
      result.set(address, { symbol: token.symbol, decimals: token.decimals })
    }
    for (const token of knownTokens) {
      result.set(token.address.toLowerCase(), {
        symbol: token.symbol,
        decimals: token.decimals,
      })
    }
    unknownTokens.forEach((address, index) => {
      result.set(address.toLowerCase(), {
        symbol:
          (metadataData?.[index * 2]?.result as string | undefined) ??
          `${address.slice(0, 6)}…`,
        decimals:
          (metadataData?.[index * 2 + 1]?.result as number | undefined) ?? 18,
      })
    })
    return result
  }, [knownTokens, metadataData, poolTokens, unknownTokens])

  const dexAddresses = useMemo(
    () =>
      resolvedSlots.flatMap(({ token }) => {
        const metadata = tokenMetadata.get(token.toLowerCase())
        return getTokenPriceType(token, metadata?.symbol) === "unknown"
          ? [token]
          : []
      }),
    [resolvedSlots, tokenMetadata],
  )
  const { prices: dexPrices, isLoading: isLoadingDex } =
    useDexTokenPrices(dexAddresses)

  const map = useMemo(() => {
    const metrics = new Map<string, PoolVotingMetric>()
    pools.forEach((pool, poolIndex) => {
      const base = poolIndex * READS_PER_POOL
      metrics.set(pool.address.toLowerCase(), {
        weight: (gaugeData?.[base]?.result as bigint | undefined) ?? 0n,
        isAlive: (gaugeData?.[base + 1]?.result as boolean | undefined) ?? true,
        bribes: [],
        voterFees: [],
        bribesMicroUsd: 0n,
        voterFeesMicroUsd: 0n,
        totalRewardsMicroUsd: 0n,
        apyBasisPoints: null,
      })
    })

    resolvedSlots.forEach((slot, index) => {
      const amount =
        (epochRewardsData?.[index]?.result as bigint | undefined) ?? 0n
      if (amount <= 0n) return
      const lower = slot.token.toLowerCase()
      const metadata = tokenMetadata.get(lower) ?? {
        symbol: `${slot.token.slice(0, 6)}…`,
        decimals: 18,
      }
      const marketPrice =
        getTokenUsdPrice(slot.token, metadata.symbol, btcPrice, mezoPrice) ??
        dexPrices.get(lower) ??
        null
      const priceUsd =
        marketPrice === null
          ? (poolTokens.get(lower)?.priceUsd ?? null)
          : String(marketPrice)
      const metric = metrics.get(slot.pool.address.toLowerCase())
      if (!metric) return
      metric[slot.kind].push({
        tokenAddress: slot.token,
        symbol: metadata.symbol,
        decimals: metadata.decimals,
        amount,
        valueMicroUsd:
          priceUsd === null
            ? null
            : tokenUsdMicroValue(amount, metadata.decimals, priceUsd),
      })
    })

    for (const metric of metrics.values()) {
      metric.bribesMicroUsd = totalRewardMicroUsd(metric.bribes)
      metric.voterFeesMicroUsd = totalRewardMicroUsd(metric.voterFees)
      metric.totalRewardsMicroUsd = addNullableMicroUsd(
        metric.bribesMicroUsd,
        metric.voterFeesMicroUsd,
      )
      metric.apyBasisPoints =
        metric.totalRewardsMicroUsd === null || btcPrice === null
          ? null
          : calculateValidatorApyBasisPoints(
              metric.totalRewardsMicroUsd,
              metric.weight,
              String(btcPrice),
            )
    }
    return metrics
  }, [
    btcPrice,
    dexPrices,
    epochRewardsData,
    gaugeData,
    mezoPrice,
    poolTokens,
    pools,
    resolvedSlots,
    tokenMetadata,
  ])

  const refetch = useCallback(() => {
    void refetchTotalWeight()
    void refetchGauges()
    void refetchLengths()
    void refetchRewardTokens()
    void refetchEpochRewards()
  }, [
    refetchEpochRewards,
    refetchGauges,
    refetchLengths,
    refetchRewardTokens,
    refetchTotalWeight,
  ])

  return {
    map,
    totalWeight: (totalWeightData as bigint | undefined) ?? 0n,
    btcPriceUsd: btcPrice === null ? null : String(btcPrice),
    isLoading:
      isLoadingTotalWeight ||
      isLoadingGauges ||
      isLoadingLengths ||
      isLoadingRewardTokens ||
      isLoadingEpochRewards ||
      isLoadingMetadata ||
      isLoadingBtc ||
      isLoadingMezo ||
      isLoadingDex,
    error: gaugeError ?? null,
    refetch,
  }
}
