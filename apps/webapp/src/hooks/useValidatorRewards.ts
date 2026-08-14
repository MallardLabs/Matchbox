import { getContractConfig } from "@/config/contracts"
import { QUERY_PROFILES } from "@/config/queryProfiles"
import { useNetwork } from "@/contexts/NetworkContext"
import {
  type ProjectedTokenReward,
  type TokenIncentive,
  type VotedGaugeIncentives,
  calculateAPYFromData,
  calculateProjectedRewards,
} from "@/hooks/useAPY"
import { useBtcPrice } from "@/hooks/useBtcPrice"
import { useGaugeTopology } from "@/hooks/useGaugeTopology"
import { useMezoPrice } from "@/hooks/useMezoPrice"
import { useDexTokenPrices } from "@/hooks/useTokenPrices"
import type { VoteAllocation } from "@/hooks/useVoting"
import { tokenUsdMicroValue } from "@/utils/validatorApy"
import { getTokenPriceType, getTokenUsdPrice } from "@repo/shared"
import { useMemo } from "react"
import type { Address } from "viem"
import { useReadContracts } from "wagmi"

export type ValidatorGaugeIncentives = VotedGaugeIncentives & {
  gaugeAddress: Address
  bribeAddress: Address | null
  /** Annualized return for a veBTC voter at the gauge's current weight. */
  apy: number | null
}

type EnabledOption = { enabled?: boolean }

/**
 * Current-epoch incentive pool for every validator gauge, priced in USD and
 * paired with the gauge's veBTC vote weight.
 *
 * Enumerated from the topology API's ValidatorsVoter list rather than the
 * validator registry, because a validator that has left the set keeps its gauge
 * (and any bribes still owed to voters) even though the registry no longer
 * returns its operator.
 */
export function useValidatorGaugeIncentives(options: EnabledOption = {}): {
  incentivesByGauge: Map<string, ValidatorGaugeIncentives>
  validatorGaugeAddresses: Address[]
  isLoading: boolean
} {
  const { chainId, isNetworkReady } = useNetwork()
  const contracts = getContractConfig(chainId)
  const enabled = (options.enabled ?? true) && isNetworkReady
  const { price: btcPrice } = useBtcPrice()
  const { price: mezoPrice } = useMezoPrice()
  const { validatorGauges, isLoading: isLoadingTopology } = useGaugeTopology({
    enabled,
  })

  const validatorGaugeAddresses = useMemo(
    () => validatorGauges.map((gauge) => gauge.gaugeAddress),
    [validatorGauges],
  )

  const { data: weightData, isLoading: isLoadingWeights } = useReadContracts({
    contracts: validatorGaugeAddresses.map((gaugeAddress) => ({
      ...contracts.validatorsVoter,
      functionName: "weights" as const,
      args: [gaugeAddress] as const,
    })),
    query: {
      ...QUERY_PROFILES.SHORT_CACHE,
      enabled: enabled && validatorGaugeAddresses.length > 0,
    },
  })

  const dexAddresses = useMemo(
    () =>
      validatorGauges.flatMap((gauge) =>
        gauge.rewardTokens
          .filter(
            (token) =>
              getTokenPriceType(token.tokenAddress, token.symbol) === "unknown",
          )
          .map((token) => token.tokenAddress),
      ),
    [validatorGauges],
  )
  const { prices: dexPrices, isLoading: isLoadingDex } =
    useDexTokenPrices(dexAddresses)

  const incentivesByGauge = useMemo(() => {
    const map = new Map<string, ValidatorGaugeIncentives>()

    validatorGauges.forEach((gauge, index) => {
      const totalWeight = (weightData?.[index]?.result as bigint) ?? 0n
      const incentivesByToken: TokenIncentive[] = []
      let totalIncentivesUSD = 0

      for (const rewardToken of gauge.rewardTokens) {
        const amount = BigInt(rewardToken.epochAmount)
        if (amount <= 0n) continue

        const tokenAmount = Number(amount) / 10 ** rewardToken.decimals
        const price =
          getTokenUsdPrice(
            rewardToken.tokenAddress,
            rewardToken.symbol,
            btcPrice,
            mezoPrice,
          ) ??
          dexPrices.get(rewardToken.tokenAddress.toLowerCase()) ??
          null
        const usdValue = price !== null ? tokenAmount * price : 0
        totalIncentivesUSD += usdValue

        incentivesByToken.push({
          tokenAddress: rewardToken.tokenAddress.toLowerCase(),
          symbol: rewardToken.symbol,
          amount,
          decimals: rewardToken.decimals,
          usdValue,
          // Exact micro-USD alongside the float, matching useGaugesAPY, so the
          // optimizer's precise path can consume validator incentives too.
          valueMicroUsd:
            price === null
              ? null
              : tokenUsdMicroValue(amount, rewardToken.decimals, String(price)),
        })
      }

      map.set(gauge.gaugeAddress.toLowerCase(), {
        gaugeAddress: gauge.gaugeAddress,
        bribeAddress: gauge.bribeAddress,
        totalWeight,
        totalIncentivesUSD,
        incentivesByToken,
        // Validator gauges weigh votes in veBTC, so BTC prices the denominator.
        apy: calculateAPYFromData(totalIncentivesUSD, totalWeight, btcPrice),
      })
    })

    return map
  }, [validatorGauges, weightData, btcPrice, mezoPrice, dexPrices])

  return {
    incentivesByGauge,
    validatorGaugeAddresses,
    isLoading: isLoadingTopology || isLoadingWeights || isLoadingDex,
  }
}

/**
 * Per-veBTC-NFT validator vote allocations, plus the weight each NFT has
 * committed to ValidatorsVoter this epoch.
 */
export function useValidatorVoteAllocations(
  veBTCTokenIds: bigint[],
  gaugeAddresses: Address[],
): {
  allocationsByToken: Map<string, VoteAllocation[]>
  aggregatedAllocations: VoteAllocation[]
  usedWeightsByToken: Map<string, bigint>
  totalUsedWeight: bigint
  isLoading: boolean
  refetch: () => Promise<void>
} {
  const { chainId, isNetworkReady } = useNetwork()
  const contracts = getContractConfig(chainId)
  const hasQueryTargets = veBTCTokenIds.length > 0 && gaugeAddresses.length > 0

  const {
    data: voteData,
    isLoading: isLoadingVotes,
    refetch: refetchVotes,
  } = useReadContracts({
    contracts: veBTCTokenIds.flatMap((tokenId) =>
      gaugeAddresses.map((gaugeAddress) => ({
        ...contracts.validatorsVoter,
        functionName: "votes" as const,
        args: [tokenId, gaugeAddress] as const,
      })),
    ),
    query: {
      ...QUERY_PROFILES.SHORT_CACHE,
      enabled: isNetworkReady && hasQueryTargets,
    },
  })

  const {
    data: usedWeightData,
    isLoading: isLoadingUsedWeights,
    refetch: refetchUsedWeights,
  } = useReadContracts({
    contracts: veBTCTokenIds.map((tokenId) => ({
      ...contracts.validatorsVoter,
      functionName: "usedWeights" as const,
      args: [tokenId] as const,
    })),
    query: {
      ...QUERY_PROFILES.SHORT_CACHE,
      enabled: isNetworkReady && veBTCTokenIds.length > 0,
    },
  })

  const { allocationsByToken, aggregatedAllocations } = useMemo(() => {
    const byToken = new Map<string, VoteAllocation[]>()
    const aggregatedWeights = new Map<string, bigint>()

    veBTCTokenIds.forEach((tokenId, tokenIndex) => {
      const tokenAllocations: VoteAllocation[] = []

      gaugeAddresses.forEach((gaugeAddress, gaugeIndex) => {
        const dataIndex = tokenIndex * gaugeAddresses.length + gaugeIndex
        const weight = (voteData?.[dataIndex]?.result as bigint) ?? 0n
        if (weight <= 0n) return

        tokenAllocations.push({ gaugeAddress, weight })
        const gaugeKey = gaugeAddress.toLowerCase()
        aggregatedWeights.set(
          gaugeKey,
          (aggregatedWeights.get(gaugeKey) ?? 0n) + weight,
        )
      })

      byToken.set(tokenId.toString(), tokenAllocations)
    })

    const gaugeByKey = new Map(
      gaugeAddresses.map((gaugeAddress) => [
        gaugeAddress.toLowerCase(),
        gaugeAddress,
      ]),
    )

    return {
      allocationsByToken: byToken,
      aggregatedAllocations: Array.from(aggregatedWeights.entries()).flatMap(
        ([gaugeKey, weight]) => {
          const gaugeAddress = gaugeByKey.get(gaugeKey)
          return gaugeAddress ? [{ gaugeAddress, weight }] : []
        },
      ),
    }
  }, [voteData, veBTCTokenIds, gaugeAddresses])

  const { usedWeightsByToken, totalUsedWeight } = useMemo(() => {
    const byToken = new Map<string, bigint>()
    let total = 0n

    veBTCTokenIds.forEach((tokenId, index) => {
      const weight = (usedWeightData?.[index]?.result as bigint) ?? 0n
      byToken.set(tokenId.toString(), weight)
      total += weight
    })

    return { usedWeightsByToken: byToken, totalUsedWeight: total }
  }, [usedWeightData, veBTCTokenIds])

  return {
    allocationsByToken,
    aggregatedAllocations,
    usedWeightsByToken,
    totalUsedWeight,
    isLoading:
      (hasQueryTargets && isLoadingVotes) ||
      (veBTCTokenIds.length > 0 && isLoadingUsedWeights),
    refetch: async () => {
      await Promise.all([refetchVotes(), refetchUsedWeights()])
    },
  }
}

/**
 * What a veBTC voter is on track to receive from validator gauges when the
 * current epoch flips, based on the votes already cast.
 */
export function useUpcomingValidatorRewards(
  voteAllocations: VoteAllocation[],
  incentivesByGauge: Map<string, ValidatorGaugeIncentives>,
  usedWeight: bigint | undefined,
): {
  upcomingAPY: number | null
  projectedIncentivesUSD: number
  projectedRewardsByToken: ProjectedTokenReward[]
} {
  const { price: btcPrice } = useBtcPrice()

  return useMemo(() => {
    if (voteAllocations.length === 0) {
      return {
        upcomingAPY: null,
        projectedIncentivesUSD: 0,
        projectedRewardsByToken: [],
      }
    }

    const { projectedIncentivesUSD, projectedRewardsByToken } =
      calculateProjectedRewards(voteAllocations, (gaugeKey) =>
        incentivesByGauge.get(gaugeKey),
      )

    return {
      upcomingAPY: calculateAPYFromData(
        projectedIncentivesUSD,
        usedWeight,
        btcPrice,
      ),
      projectedIncentivesUSD,
      projectedRewardsByToken,
    }
  }, [voteAllocations, incentivesByGauge, usedWeight, btcPrice])
}
