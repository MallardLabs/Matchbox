import { getContractConfig } from "@/config/contracts"
import { QUERY_PROFILES } from "@/config/queryProfiles"
import { useNetwork } from "@/contexts/NetworkContext"
import { useBtcPrice } from "@/hooks/useBtcPrice"
import { useMezoPrice } from "@/hooks/useMezoPrice"
import { useTokenList } from "@/hooks/useTokenList"
import {
  type MezoGaugeIdentity,
  mezoGaugeAddresses,
  resolveDistributionDate,
  resolveMezoGaugeRows,
} from "@/lib/mezoGauges"
import { tokenUsdMicroValue } from "@/utils/validatorApy"
import { getTokenUsdPrice } from "@repo/shared"
import { useCallback, useMemo } from "react"
import type { Address } from "viem"
import { erc20Abi, zeroAddress } from "viem"
import { useReadContracts } from "wagmi"

const WEEK_SECONDS = 604_800

export type MezoGaugeIncentive = {
  tokenAddress: Address
  symbol: string
  decimals: number
  amount: bigint
  valueMicroUsd: bigint | null
}

export type MezoGaugeRow = {
  gauge: Address
  identity: MezoGaugeIdentity
  isAlive: boolean
  weight: bigint
  incentivesMicroUsd: bigint
  unpricedIncentiveCount: number
  incentives: MezoGaugeIncentive[]
  distributionDate: Date
}

type GaugeBribe = { gauge: Address; gaugeIndex: number; bribe: Address }
type RewardSlot = GaugeBribe & { index: number }
type ResolvedSlot = RewardSlot & { token: Address }

function currentEpochStart(nowSeconds: number): bigint {
  return BigInt(Math.floor(nowSeconds / WEEK_SECONDS) * WEEK_SECONDS)
}

export default function useMezoGauges(): {
  rows: MezoGaugeRow[] | undefined
  totalWeight: bigint | undefined
  maxVotingNum: bigint | undefined
  epochStart: bigint
  isLoading: boolean
  isError: boolean
  refetch: () => void
} {
  const { chainId, isNetworkReady } = useNetwork()
  const contracts = getContractConfig(chainId)
  const gaugeAddresses = useMemo(() => mezoGaugeAddresses(), [])
  const { tokens: knownTokens } = useTokenList()
  const { price: btcPrice, isLoading: isLoadingBtc } = useBtcPrice()
  const { price: mezoPrice, isLoading: isLoadingMezo } = useMezoPrice()
  const epochStart = useMemo(
    () => currentEpochStart(Math.floor(Date.now() / 1000)),
    [],
  )
  const voteEpochEnd = useMemo(
    () => new Date(Number(epochStart + BigInt(WEEK_SECONDS)) * 1000),
    [epochStart],
  )

  const {
    data: gaugeStateData,
    isError: isGaugeStateError,
    refetch: refetchGaugeState,
  } = useReadContracts({
    contracts: gaugeAddresses.flatMap((gauge) => [
      {
        ...contracts.thirdPartyVoter,
        functionName: "isAlive" as const,
        args: [gauge],
      },
      {
        ...contracts.thirdPartyVoter,
        functionName: "weights" as const,
        args: [gauge],
      },
      {
        ...contracts.thirdPartyVoter,
        functionName: "gaugeToBribe" as const,
        args: [gauge],
      },
    ]),
    query: {
      ...QUERY_PROFILES.SHORT_CACHE,
      enabled: isNetworkReady && gaugeAddresses.length > 0,
    },
  })

  const { data: voterStatsData, refetch: refetchVoterStats } = useReadContracts(
    {
      contracts: [
        {
          ...contracts.thirdPartyVoter,
          functionName: "totalWeight" as const,
        },
        {
          ...contracts.thirdPartyVoter,
          functionName: "maxVotingNum" as const,
        },
      ],
      query: {
        ...QUERY_PROFILES.SHORT_CACHE,
        enabled: isNetworkReady,
      },
    },
  )

  const activeBribes = useMemo<GaugeBribe[] | undefined>(() => {
    if (!gaugeStateData) return undefined
    return gaugeAddresses.flatMap((gauge, gaugeIndex) => {
      const bribe = gaugeStateData[gaugeIndex * 3 + 2]?.result as
        | Address
        | undefined
      return bribe && bribe !== zeroAddress
        ? [{ gauge, gaugeIndex, bribe }]
        : []
    })
  }, [gaugeAddresses, gaugeStateData])

  const {
    data: lengthsData,
    isError: isLengthsError,
    refetch: refetchLengths,
  } = useReadContracts({
    contracts: (activeBribes ?? []).map(({ bribe }) => ({
      address: bribe,
      abi: contracts.bribe.abi,
      chainId,
      functionName: "rewardsListLength" as const,
    })),
    query: {
      ...QUERY_PROFILES.SHORT_CACHE,
      enabled: isNetworkReady && (activeBribes?.length ?? 0) > 0,
    },
  })

  const tokenSlots = useMemo<RewardSlot[] | undefined>(() => {
    if (activeBribes === undefined) return undefined
    if (activeBribes.length === 0) return []
    if (!lengthsData) return undefined
    return activeBribes.flatMap((entry, bribeIndex) => {
      const length = Number(
        (lengthsData[bribeIndex]?.result as bigint | undefined) ?? 0n,
      )
      return Array.from({ length }, (_, index) => ({ ...entry, index }))
    })
  }, [activeBribes, lengthsData])

  const {
    data: rewardsData,
    isError: isRewardsError,
    refetch: refetchRewards,
  } = useReadContracts({
    contracts: (tokenSlots ?? []).map(({ bribe, index }) => ({
      address: bribe,
      abi: contracts.bribe.abi,
      chainId,
      functionName: "rewards" as const,
      args: [BigInt(index)],
    })),
    query: {
      ...QUERY_PROFILES.SHORT_CACHE,
      enabled: isNetworkReady && (tokenSlots?.length ?? 0) > 0,
    },
  })

  const resolvedSlots = useMemo((): ResolvedSlot[] | undefined => {
    if (tokenSlots === undefined) return undefined
    if (tokenSlots.length === 0) return []
    if (!rewardsData) return undefined
    return tokenSlots.flatMap((slot, index) => {
      const token = rewardsData[index]?.result as Address | undefined
      return token && token !== zeroAddress ? [{ ...slot, token }] : []
    })
  }, [rewardsData, tokenSlots])

  const {
    data: epochRewardsData,
    isError: isEpochRewardsError,
    refetch: refetchEpochRewards,
  } = useReadContracts({
    contracts: (resolvedSlots ?? []).map(({ bribe, token }) => ({
      address: bribe,
      abi: contracts.bribe.abi,
      chainId,
      functionName: "tokenRewardsPerEpoch" as const,
      args: [token, epochStart],
    })),
    query: {
      ...QUERY_PROFILES.SHORT_CACHE,
      enabled: isNetworkReady && (resolvedSlots?.length ?? 0) > 0,
    },
  })

  const unknownTokens = useMemo(() => {
    const known = new Set(
      knownTokens.map((token) => token.address.toLowerCase()),
    )
    const addresses = new Map<string, Address>()
    for (const { token } of resolvedSlots ?? []) {
      if (token && !known.has(token.toLowerCase())) {
        addresses.set(token.toLowerCase(), token)
      }
    }
    return Array.from(addresses.values())
  }, [knownTokens, resolvedSlots])

  const { data: metadataData } = useReadContracts({
    contracts: unknownTokens.flatMap((address) => [
      { address, abi: erc20Abi, chainId, functionName: "symbol" as const },
      { address, abi: erc20Abi, chainId, functionName: "decimals" as const },
    ]),
    query: {
      ...QUERY_PROFILES.SHORT_CACHE,
      enabled: isNetworkReady && unknownTokens.length > 0,
    },
  })

  const tokenMetadata = useMemo(() => {
    const result = new Map<string, { symbol: string; decimals: number }>()
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
  }, [knownTokens, metadataData, unknownTokens])

  const incentivesByGauge = useMemo(() => {
    const result = new Map<
      string,
      {
        incentivesMicroUsd: bigint
        unpricedIncentiveCount: number
        incentives: MezoGaugeIncentive[]
      }
    >()
    for (const gauge of gaugeAddresses) {
      result.set(gauge.toLowerCase(), {
        incentivesMicroUsd: 0n,
        unpricedIncentiveCount: 0,
        incentives: [],
      })
    }
    if (resolvedSlots === undefined) return undefined
    if (resolvedSlots.length > 0 && !epochRewardsData) return undefined
    if (isLoadingBtc || isLoadingMezo) return undefined

    resolvedSlots.forEach((slot, index) => {
      const amount =
        (epochRewardsData?.[index]?.result as bigint | undefined) ?? 0n
      if (amount <= 0n || !slot.token) return
      const metadata = tokenMetadata.get(slot.token.toLowerCase()) ?? {
        symbol: `${slot.token.slice(0, 6)}…`,
        decimals: 18,
      }
      const price = getTokenUsdPrice(
        slot.token,
        metadata.symbol,
        btcPrice,
        mezoPrice,
      )
      const valueMicroUsd =
        price === null
          ? null
          : tokenUsdMicroValue(amount, metadata.decimals, String(price))
      const bucket = result.get(slot.gauge.toLowerCase())
      if (!bucket) return
      bucket.incentives.push({
        tokenAddress: slot.token,
        symbol: metadata.symbol,
        decimals: metadata.decimals,
        amount,
        valueMicroUsd,
      })
      if (valueMicroUsd === null) {
        bucket.unpricedIncentiveCount += 1
      } else {
        bucket.incentivesMicroUsd += valueMicroUsd
      }
    })
    return result
  }, [
    btcPrice,
    epochRewardsData,
    gaugeAddresses,
    isLoadingBtc,
    isLoadingMezo,
    mezoPrice,
    resolvedSlots,
    tokenMetadata,
  ])

  const rows = useMemo(() => {
    if (gaugeAddresses.length === 0) return []
    if (!gaugeStateData || incentivesByGauge === undefined) return undefined

    const items = gaugeAddresses.flatMap((gauge, gaugeIndex) => {
      const isAlive = gaugeStateData[gaugeIndex * 3]?.result as
        | boolean
        | undefined
      if (isAlive === undefined) return []
      const incentives = incentivesByGauge.get(gauge.toLowerCase())
      return [
        {
          gauge,
          isAlive,
          weight:
            (gaugeStateData[gaugeIndex * 3 + 1]?.result as
              | bigint
              | undefined) ?? 0n,
          incentivesMicroUsd: incentives?.incentivesMicroUsd ?? 0n,
          unpricedIncentiveCount: incentives?.unpricedIncentiveCount ?? 0,
          incentives: incentives?.incentives ?? [],
        },
      ]
    })

    return resolveMezoGaugeRows(items).map((row) => ({
      ...row,
      distributionDate: resolveDistributionDate(
        voteEpochEnd,
        row.identity.distributionEpochOffset,
      ),
    }))
  }, [gaugeAddresses, gaugeStateData, incentivesByGauge, voteEpochEnd])

  const isError =
    isGaugeStateError || isLengthsError || isRewardsError || isEpochRewardsError

  const isLoading = rows === undefined && !isError

  const refetch = useCallback(() => {
    void refetchGaugeState()
    void refetchVoterStats()
    void refetchLengths()
    void refetchRewards()
    void refetchEpochRewards()
  }, [
    refetchEpochRewards,
    refetchGaugeState,
    refetchLengths,
    refetchRewards,
    refetchVoterStats,
  ])

  return {
    rows,
    totalWeight: voterStatsData?.[0]?.result as bigint | undefined,
    maxVotingNum: voterStatsData?.[1]?.result as bigint | undefined,
    epochStart,
    isLoading,
    isError,
    refetch,
  }
}
