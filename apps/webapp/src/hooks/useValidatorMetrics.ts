import { getContractConfig } from "@/config/contracts"
import { QUERY_PROFILES } from "@/config/queryProfiles"
import { useNetwork } from "@/contexts/NetworkContext"
import { useBtcPrice } from "@/hooks/useBtcPrice"
import { useMezoPrice } from "@/hooks/useMezoPrice"
import { useTokenList } from "@/hooks/useTokenList"
import { useDexTokenPrices } from "@/hooks/useTokenPrices"
import type { Validator } from "@/lib/validators"
import {
  calculateValidatorApyBasisPoints,
  tokenUsdMicroValue,
} from "@/utils/validatorApy"
import { getTokenPriceType, getTokenUsdPrice } from "@repo/shared"
import { useCallback, useMemo } from "react"
import type { Address } from "viem"
import { erc20Abi, zeroAddress } from "viem"
import { useReadContracts } from "wagmi"

const WEEK_SECONDS = 7 * 24 * 60 * 60

export type ValidatorIncentiveMetric = {
  tokenAddress: Address
  symbol: string
  decimals: number
  amount: bigint
  valueMicroUsd: bigint | null
}

export type ValidatorMetric = {
  incentives: ValidatorIncentiveMetric[]
  totalIncentivesMicroUsd: bigint | null
  apyBasisPoints: bigint | null
}

type ValidatorBribe = { validator: Validator; bribe: Address }
type ValidatorTokenSlot = ValidatorBribe & { index: number }

function currentEpochStart(nowSeconds: number): number {
  return Math.floor(nowSeconds / WEEK_SECONDS) * WEEK_SECONDS
}

export function useValidatorMetrics(validators: Validator[]): {
  map: Map<string, ValidatorMetric>
  btcPriceUsd: string | null
  isLoading: boolean
  refetch: () => void
} {
  const { chainId, isNetworkReady } = useNetwork()
  const contracts = getContractConfig(chainId)
  const { tokens: knownTokens } = useTokenList()
  const { price: btcPrice, isLoading: isLoadingBtc } = useBtcPrice()
  const { price: mezoPrice, isLoading: isLoadingMezo } = useMezoPrice()

  const activeBribes = useMemo<ValidatorBribe[]>(
    () =>
      validators.flatMap((validator) =>
        validator.bribe === zeroAddress
          ? []
          : [{ validator, bribe: validator.bribe }],
      ),
    [validators],
  )

  const {
    data: lengthsData,
    isLoading: isLoadingLengths,
    refetch: refetchLengths,
  } = useReadContracts({
    contracts: activeBribes.map(({ bribe }) => ({
      address: bribe,
      abi: contracts.bribe.abi,
      chainId,
      functionName: "rewardsListLength" as const,
    })),
    query: {
      ...QUERY_PROFILES.SHORT_CACHE,
      enabled: isNetworkReady && activeBribes.length > 0,
    },
  })

  const tokenSlots = useMemo<ValidatorTokenSlot[]>(() => {
    const slots: ValidatorTokenSlot[] = []
    activeBribes.forEach((entry, entryIndex) => {
      const length = Number(
        (lengthsData?.[entryIndex]?.result as bigint | undefined) ?? 0n,
      )
      for (let index = 0; index < length; index++) {
        slots.push({ ...entry, index })
      }
    })
    return slots
  }, [activeBribes, lengthsData])

  const {
    data: rewardsData,
    isLoading: isLoadingRewards,
    refetch: refetchRewards,
  } = useReadContracts({
    contracts: tokenSlots.map(({ bribe, index }) => ({
      address: bribe,
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
        const token = rewardsData?.[index]?.result as Address | undefined
        return token && token !== zeroAddress ? [{ ...slot, token }] : []
      }),
    [tokenSlots, rewardsData],
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
    contracts: resolvedSlots.map(({ bribe, token }) => ({
      address: bribe,
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

  const unknownTokens = useMemo(() => {
    const addresses = new Map<string, Address>()
    for (const { token } of resolvedSlots) {
      if (
        !knownTokens.some(
          (known) => known.address.toLowerCase() === token.toLowerCase(),
        )
      ) {
        addresses.set(token.toLowerCase(), token)
      }
    }
    return Array.from(addresses.values())
  }, [knownTokens, resolvedSlots])
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
    const metrics = new Map<string, ValidatorMetric>()
    for (const validator of validators) {
      metrics.set(validator.gauge.toLowerCase(), {
        incentives: [],
        totalIncentivesMicroUsd: 0n,
        apyBasisPoints: null,
      })
    }

    resolvedSlots.forEach((slot, index) => {
      const amount =
        (epochRewardsData?.[index]?.result as bigint | undefined) ?? 0n
      if (amount <= 0n) return
      const metadata = tokenMetadata.get(slot.token.toLowerCase()) ?? {
        symbol: `${slot.token.slice(0, 6)}…`,
        decimals: 18,
      }
      const price =
        getTokenUsdPrice(slot.token, metadata.symbol, btcPrice, mezoPrice) ??
        dexPrices.get(slot.token.toLowerCase()) ??
        null
      const valueMicroUsd =
        price === null
          ? null
          : tokenUsdMicroValue(amount, metadata.decimals, String(price))
      const metric = metrics.get(slot.validator.gauge.toLowerCase())
      if (!metric) return
      metric.incentives.push({
        tokenAddress: slot.token,
        symbol: metadata.symbol,
        decimals: metadata.decimals,
        amount,
        valueMicroUsd,
      })
      metric.totalIncentivesMicroUsd =
        metric.totalIncentivesMicroUsd === null || valueMicroUsd === null
          ? null
          : metric.totalIncentivesMicroUsd + valueMicroUsd
    })

    for (const validator of validators) {
      const metric = metrics.get(validator.gauge.toLowerCase())
      if (!metric) continue
      metric.apyBasisPoints =
        metric.totalIncentivesMicroUsd === null || btcPrice === null
          ? null
          : calculateValidatorApyBasisPoints(
              metric.totalIncentivesMicroUsd,
              BigInt(validator.weight),
              String(btcPrice),
            )
    }
    return metrics
  }, [
    btcPrice,
    dexPrices,
    epochRewardsData,
    mezoPrice,
    resolvedSlots,
    tokenMetadata,
    validators,
  ])

  const refetch = useCallback(() => {
    void refetchLengths()
    void refetchRewards()
    void refetchEpochRewards()
  }, [refetchEpochRewards, refetchLengths, refetchRewards])

  return {
    map,
    btcPriceUsd: btcPrice === null ? null : String(btcPrice),
    isLoading:
      isLoadingLengths ||
      isLoadingRewards ||
      isLoadingEpochRewards ||
      isLoadingMetadata ||
      isLoadingBtc ||
      isLoadingMezo ||
      isLoadingDex,
    refetch,
  }
}
