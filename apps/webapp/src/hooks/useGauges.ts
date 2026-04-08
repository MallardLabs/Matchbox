import { getContractConfig } from "@/config/contracts"
import { QUERY_PROFILES } from "@/config/queryProfiles"
import { useAllGaugeProfilesFromContext } from "@/contexts/GaugeProfilesContext"
import { useNetwork } from "@/contexts/NetworkContext"
import { boostMultiplierNumberFromCalculatorInputs } from "@/utils/boostMultiplierFromCalculatorInputs"
import { NON_STAKING_GAUGE_ABI } from "@repo/shared/contracts"
import { Rational } from "@thesis-co/cent"
import { useMemo } from "react"
import type { Address } from "viem"
import { useReadContract, useReadContracts } from "wagmi"

export type BoostGauge = {
  address: Address
  veBTCTokenId: bigint
  veBTCWeight: bigint | undefined
  totalWeight: bigint
  isAlive: boolean
  optimalVeMEZO: bigint | undefined
  optimalAdditionalVeMEZO: bigint | undefined
  boostMultiplier: number
}

export type UseBoostGaugesOptions = {
  includeOwnership?: boolean
  enabled?: boolean
}

export function useBoostGauges(options: UseBoostGaugesOptions = {}) {
  const { chainId, isNetworkReady } = useNetwork()
  const { profiles: gaugeProfiles } = useAllGaugeProfilesFromContext()
  const includeOwnership = options.includeOwnership ?? false
  const enabled = (options.enabled ?? true) && isNetworkReady
  const contracts = getContractConfig(chainId)

  const { data: lengthData, isLoading: isLoadingLength } = useReadContract({
    ...contracts.boostVoter,
    functionName: "length",
    query: {
      ...QUERY_PROFILES.SHORT_CACHE,
      enabled,
    },
  })

  const length = lengthData ?? 0n

  const { data: gaugeAddresses, isLoading: isLoadingAddresses } =
    useReadContracts({
      contracts: Array.from({ length: Number(length) }, (_, i) => ({
        ...contracts.boostVoter,
        functionName: "gauges",
        args: [BigInt(i)],
      })),
      query: {
        ...QUERY_PROFILES.SHORT_CACHE,
        enabled: enabled && length > 0n,
      },
    })

  const addresses =
    gaugeAddresses
      ?.map((r) => r.result as Address | undefined)
      .filter((value): value is Address => !!value && value.startsWith("0x")) ??
    []

  const gaugeDataStride = includeOwnership ? 3 : 2

  // Fetch gauge data. rewardsBeneficiary is only needed for ownership mapping.
  const { data: gaugeData, isLoading: isLoadingGaugeData } = useReadContracts({
    contracts: addresses.flatMap((address) => {
      const baseContracts = [
        {
          ...contracts.boostVoter,
          functionName: "weights",
          args: [address],
        },
        {
          ...contracts.boostVoter,
          functionName: "isAlive",
          args: [address],
        },
      ]

      if (!includeOwnership) {
        return baseContracts
      }

      return [
        ...baseContracts,
        {
          address,
          abi: NON_STAKING_GAUGE_ABI,
          functionName: "rewardsBeneficiary",
        },
      ]
    }),
    query: {
      ...QUERY_PROFILES.SHORT_CACHE,
      enabled: enabled && addresses.length > 0,
    },
  })

  const beneficiaries = useMemo(() => {
    if (!includeOwnership || !gaugeData) return []

    return addresses.map(
      (_, i) => gaugeData[i * 3 + 2]?.result as Address | undefined,
    )
  }, [includeOwnership, gaugeData, addresses])

  // Get unique beneficiaries to query their veBTC balances
  const uniqueBeneficiaries = useMemo(() => {
    const unique = new Set<Address>()
    for (const b of beneficiaries) {
      if (b && b !== "0x0000000000000000000000000000000000000000") {
        unique.add(b)
      }
    }
    return Array.from(unique)
  }, [beneficiaries])

  // Fetch veBTC balance for each unique beneficiary
  const { data: beneficiaryBalances, isLoading: isLoadingBalances } =
    useReadContracts({
      contracts: uniqueBeneficiaries.map((beneficiary) => ({
        ...contracts.veBTC,
        functionName: "balanceOf",
        args: [beneficiary],
      })),
      query: {
        ...QUERY_PROFILES.SHORT_CACHE,
        enabled: enabled && includeOwnership && uniqueBeneficiaries.length > 0,
      },
    })

  // Build beneficiary → balance map
  const beneficiaryToBalance = useMemo(() => {
    const map = new Map<string, bigint>()
    if (beneficiaryBalances) {
      uniqueBeneficiaries.forEach((addr, i) => {
        const balance = beneficiaryBalances[i]?.result as bigint | undefined
        if (balance !== undefined) {
          map.set(addr.toLowerCase(), balance)
        }
      })
    }
    return map
  }, [beneficiaryBalances, uniqueBeneficiaries])

  // Calculate total token count needed to query ownerToNFTokenIdList
  const beneficiaryTokenCounts = useMemo(() => {
    return uniqueBeneficiaries.map((addr) => ({
      beneficiary: addr,
      count: Number(beneficiaryToBalance.get(addr.toLowerCase()) ?? 0n),
    }))
  }, [uniqueBeneficiaries, beneficiaryToBalance])

  // Fetch all tokenIds for all beneficiaries using ownerToNFTokenIdList
  const tokenIdQueries = useMemo(() => {
    if (!includeOwnership) return []

    const queries: { beneficiary: Address; index: number }[] = []
    for (const { beneficiary, count } of beneficiaryTokenCounts) {
      for (let i = 0; i < count; i++) {
        queries.push({ beneficiary, index: i })
      }
    }
    return queries
  }, [beneficiaryTokenCounts, includeOwnership])

  const { data: tokenIdResults, isLoading: isLoadingTokenIds } =
    useReadContracts({
      contracts: tokenIdQueries.map(({ beneficiary, index }) => ({
        ...contracts.veBTC,
        functionName: "ownerToNFTokenIdList",
        args: [beneficiary, BigInt(index)],
      })),
      query: {
        ...QUERY_PROFILES.SHORT_CACHE,
        enabled: enabled && includeOwnership && tokenIdQueries.length > 0,
      },
    })

  // Build beneficiary → tokenIds map
  const beneficiaryToTokenIds = useMemo(() => {
    const map = new Map<string, bigint[]>()
    if (tokenIdResults) {
      tokenIdQueries.forEach((query, i) => {
        const tokenId = tokenIdResults[i]?.result as bigint | undefined
        if (tokenId !== undefined) {
          const key = query.beneficiary.toLowerCase()
          const existing = map.get(key) ?? []
          existing.push(tokenId)
          map.set(key, existing)
        }
      })
    }
    return map
  }, [tokenIdResults, tokenIdQueries])

  // Get all unique tokenIds to check against boostableTokenIdToGauge
  const allTokenIds = useMemo(() => {
    const ids = new Set<bigint>()
    for (const tokenIds of beneficiaryToTokenIds.values()) {
      for (const id of tokenIds) {
        ids.add(id)
      }
    }
    return Array.from(ids)
  }, [beneficiaryToTokenIds])

  // Query boostableTokenIdToGauge for each tokenId
  const { data: tokenIdToGaugeResults, isLoading: isLoadingTokenMap } =
    useReadContracts({
      contracts: allTokenIds.map((tokenId) => ({
        ...contracts.boostVoter,
        functionName: "boostableTokenIdToGauge",
        args: [tokenId],
      })),
      query: {
        ...QUERY_PROFILES.SHORT_CACHE,
        enabled: enabled && includeOwnership && allTokenIds.length > 0,
      },
    })

  // Build gauge → tokenId map (reverse lookup)
  const gaugeToTokenId = useMemo(() => {
    const map = new Map<string, bigint>()
    if (tokenIdToGaugeResults) {
      allTokenIds.forEach((tokenId, i) => {
        const gaugeAddr = tokenIdToGaugeResults[i]?.result as
          | Address
          | undefined
        if (
          gaugeAddr &&
          gaugeAddr !== "0x0000000000000000000000000000000000000000"
        ) {
          map.set(gaugeAddr.toLowerCase(), tokenId)
        }
      })
    }
    return map
  }, [tokenIdToGaugeResults, allTokenIds])

  const profileTokenIds = useMemo(() => {
    const map = new Map<string, bigint>()

    for (const [gaugeAddress, profile] of gaugeProfiles.entries()) {
      try {
        map.set(gaugeAddress, BigInt(profile.vebtc_token_id))
      } catch {
        // Ignore malformed profile records and fall back to on-chain discovery.
      }
    }

    return map
  }, [gaugeProfiles])

  // Prefer the live on-chain mapping, but fall back to the stored gauge profile
  // so public, logged-out sessions can still resolve veBTC-derived metadata.
  const tokenIds = useMemo(
    () =>
      addresses.map((addr) => {
        const gaugeKey = addr.toLowerCase()
        return gaugeToTokenId.get(gaugeKey) ?? profileTokenIds.get(gaugeKey)
      }),
    [addresses, gaugeToTokenId, profileTokenIds],
  )

  // Fetch boosted/effective veBTC voting power for display.
  const { data: veBTCVotingPowers, isLoading: isLoadingVotingPowers } =
    useReadContracts({
      contracts: tokenIds
        .filter((id): id is bigint => id !== undefined && id > 0n)
        .map((tokenId) => ({
          ...contracts.veBTC,
          functionName: "votingPowerOfNFT",
          args: [tokenId],
        })),
      query: {
        ...QUERY_PROFILES.SHORT_CACHE,
        enabled:
          enabled &&
          includeOwnership &&
          tokenIds.some((id) => id !== undefined && id > 0n),
      },
    })

  // Fetch the unboosted baseline separately so optimal veMEZO keeps using the
  // correct 5x target math without changing the displayed gauge weight.
  const { data: unboostedVeBTCVotingPowers } = useReadContracts({
    contracts: tokenIds
      .filter((id): id is bigint => id !== undefined && id > 0n)
      .map((tokenId) => ({
        ...contracts.veBTC,
        functionName: "unboostedVotingPowerOfNFT",
        args: [tokenId],
      })),
    query: {
      ...QUERY_PROFILES.SHORT_CACHE,
      enabled:
        enabled &&
        includeOwnership &&
        tokenIds.some((id) => id !== undefined && id > 0n),
    },
  })

  // Fetch system totals for optimal veMEZO calculation and boost (same as BoostCalculator).
  // Boost on-chain uses gauge veMEZO weight vs *total active vote weight* across
  // all gauges (`boostVoter.totalWeight`), not veMEZO escrow `totalVotingPower()`.
  // Using the latter inflated "Optimal veMEZO" whenever much veMEZO was idle,
  // which disagreed with `getBoost` (e.g. 5× boost while UI showed a large shortfall).
  const { data: totalsData, isLoading: isLoadingSystemTotals } =
    useReadContracts({
      contracts: includeOwnership
        ? [
            {
              ...contracts.boostVoter,
              functionName: "totalWeight",
            },
            {
              ...contracts.veBTC,
              functionName: "unboostedTotalVotingPower",
            },
          ]
        : [],
      query: {
        ...QUERY_PROFILES.SHORT_CACHE,
        enabled: enabled && includeOwnership,
      },
    })

  const veMEZOVoterTotalWeight = totalsData?.[0]?.result as bigint | undefined
  const veBTCSupply = totalsData?.[1]?.result as bigint | undefined

  // Build maps of token ID to voting power and boost
  const tokenIdToVotingPower = new Map<string, bigint>()
  const tokenIdToUnboostedVotingPower = new Map<string, bigint>()
  let vpIndex = 0
  for (const tokenId of tokenIds) {
    if (tokenId !== undefined && tokenId > 0n) {
      const vp = veBTCVotingPowers?.[vpIndex]?.result as bigint | undefined
      if (vp !== undefined) {
        tokenIdToVotingPower.set(tokenId.toString(), vp)
      }
      const unboostedVp = unboostedVeBTCVotingPowers?.[vpIndex]?.result as
        | bigint
        | undefined
      if (unboostedVp !== undefined) {
        tokenIdToUnboostedVotingPower.set(tokenId.toString(), unboostedVp)
      }
      vpIndex++
    }
  }

  // Calculate the total and remaining veMEZO needed for 5x boost.
  // Formula:
  //   targetVeMEZO = (gaugeVeBTCWeight * boostVoterTotalWeight) / totalUnboostedVeBTCVotingPower
  //   additionalVeMEZO = max(targetVeMEZO - currentGaugeVeMEZOWeight, 0)
  const calculateOptimalVeMEZO = (
    gaugeVeBTCWeight: bigint | undefined,
    currentGaugeVeMEZOWeight: bigint,
  ): { optimalVeMEZO: bigint; optimalAdditionalVeMEZO: bigint } | undefined => {
    if (
      !veMEZOVoterTotalWeight ||
      veMEZOVoterTotalWeight === 0n ||
      !veBTCSupply ||
      !gaugeVeBTCWeight ||
      gaugeVeBTCWeight === 0n
    ) {
      return undefined
    }

    if (veBTCSupply === 0n) {
      return undefined
    }

    try {
      // Use Rational for precise division math
      // All values are 18-decimal fixed point, so represent as rationals with 10^18 denominator
      const scale = 10n ** 18n
      const veBTCWeight = Rational(gaugeVeBTCWeight, scale)
      const veMEZOTotal = Rational(veMEZOVoterTotalWeight, scale)
      const veBTCTotal = Rational(veBTCSupply, scale)

      // Calculate the total veMEZO target for 5x boost.
      const result = veBTCWeight.multiply(veMEZOTotal).divide(veBTCTotal)
      const simplified = result.simplify()
      const optimalTarget = (simplified.p * scale) / simplified.q
      const optimalAdditionalVeMEZO =
        optimalTarget > currentGaugeVeMEZOWeight
          ? optimalTarget - currentGaugeVeMEZOWeight
          : 0n

      return {
        optimalVeMEZO: optimalTarget,
        optimalAdditionalVeMEZO,
      }
    } catch (error) {
      console.error("calculateOptimalVeMEZO error:", {
        gaugeVeBTCWeight: gaugeVeBTCWeight.toString(),
        currentGaugeVeMEZOWeight: currentGaugeVeMEZOWeight.toString(),
        veMEZOVoterTotalWeight: veMEZOVoterTotalWeight.toString(),
        veBTCSupply: veBTCSupply.toString(),
        error,
      })
      return undefined
    }
  }

  const gauges: BoostGauge[] = addresses.map((address, i) => {
    const totalWeight =
      (gaugeData?.[i * gaugeDataStride]?.result as unknown as bigint) ?? 0n
    const isAlive =
      (gaugeData?.[i * gaugeDataStride + 1]?.result as unknown as boolean) ??
      false
    const veBTCTokenId = includeOwnership ? (tokenIds[i] ?? 0n) : 0n
    const gaugeVeBTCWeight = tokenIdToVotingPower.get(veBTCTokenId.toString())
    const gaugeUnboostedVeBTCWeight = tokenIdToUnboostedVotingPower.get(
      veBTCTokenId.toString(),
    )
    const boostMultiplier =
      includeOwnership &&
      veMEZOVoterTotalWeight !== undefined &&
      veMEZOVoterTotalWeight > 0n &&
      veBTCSupply !== undefined &&
      veBTCSupply > 0n &&
      gaugeUnboostedVeBTCWeight !== undefined &&
      gaugeUnboostedVeBTCWeight > 0n
        ? boostMultiplierNumberFromCalculatorInputs({
            unboostedNftVp: gaugeUnboostedVeBTCWeight,
            gaugeVeMezoWeight: totalWeight,
            unboostedVeBtcTotal: veBTCSupply,
            boostVoterTotalWeight: veMEZOVoterTotalWeight,
          })
        : 1
    const optimalVeMEZOData = includeOwnership
      ? calculateOptimalVeMEZO(gaugeUnboostedVeBTCWeight, totalWeight)
      : undefined

    return {
      address,
      veBTCTokenId,
      veBTCWeight: includeOwnership ? gaugeVeBTCWeight : undefined,
      totalWeight,
      isAlive,
      optimalVeMEZO: optimalVeMEZOData?.optimalVeMEZO,
      optimalAdditionalVeMEZO: optimalVeMEZOData?.optimalAdditionalVeMEZO,
      boostMultiplier,
    }
  })

  // Combine all loading states - page should show loading until all critical data is ready
  const isLoading =
    isLoadingLength ||
    (length > 0n && isLoadingAddresses) ||
    (addresses.length > 0 && isLoadingGaugeData) ||
    (includeOwnership && uniqueBeneficiaries.length > 0 && isLoadingBalances) ||
    (includeOwnership && tokenIdQueries.length > 0 && isLoadingTokenIds) ||
    (includeOwnership && allTokenIds.length > 0 && isLoadingTokenMap) ||
    (includeOwnership &&
      tokenIds.some((id) => id !== undefined && id > 0n) &&
      isLoadingVotingPowers) ||
    (includeOwnership && isLoadingSystemTotals)

  return {
    gauges,
    isLoading,
    totalGauges: Number(length),
  }
}

export function useBoostGaugeForToken(tokenId: bigint | undefined) {
  const { chainId, isNetworkReady } = useNetwork()
  const contracts = getContractConfig(chainId)

  const {
    data: gaugeAddress,
    isLoading,
    refetch,
  } = useReadContract({
    ...contracts.boostVoter,
    functionName: "boostableTokenIdToGauge",
    args: tokenId !== undefined ? [tokenId] : undefined,
    query: {
      ...QUERY_PROFILES.SHORT_CACHE,
      enabled: isNetworkReady && tokenId !== undefined,
    },
  })

  const hasGauge =
    gaugeAddress !== undefined &&
    gaugeAddress !== "0x0000000000000000000000000000000000000000"

  return {
    gaugeAddress: hasGauge ? (gaugeAddress as Address) : undefined,
    hasGauge,
    isLoading,
    refetch,
  }
}

export function useBoostInfo(tokenId: bigint | undefined) {
  const { chainId, isNetworkReady } = useNetwork()
  const contracts = getContractConfig(chainId)

  const { data: boost, isLoading } = useReadContract({
    ...contracts.boostVoter,
    functionName: "getBoost",
    args: tokenId !== undefined ? [tokenId] : undefined,
    query: {
      ...QUERY_PROFILES.SHORT_CACHE,
      enabled: isNetworkReady && tokenId !== undefined,
    },
  })

  const boostMultiplier = boost !== undefined ? Number(boost) / 1e18 : 1

  return {
    boost,
    boostMultiplier,
    isLoading,
  }
}

export function useVoterTotals() {
  const { chainId, isNetworkReady } = useNetwork()
  const contracts = getContractConfig(chainId)

  const { data, isLoading } = useReadContracts({
    contracts: [
      {
        ...contracts.boostVoter,
        functionName: "totalWeight",
      },
      {
        ...contracts.veMEZO,
        functionName: "totalVotingPower",
      },
      {
        ...contracts.veBTC,
        functionName: "totalVotingPower",
      },
      {
        ...contracts.veBTC,
        functionName: "unboostedTotalVotingPower",
      },
    ],
    query: {
      ...QUERY_PROFILES.SHORT_CACHE,
      enabled: isNetworkReady,
    },
  })

  return {
    boostVoterTotalWeight: data?.[0]?.result as bigint | undefined,
    veMEZOTotalVotingPower: data?.[1]?.result as bigint | undefined,
    veBTCTotalVotingPower: data?.[2]?.result as bigint | undefined,
    veBTCUnboostedTotalVotingPower: data?.[3]?.result as bigint | undefined,
    isLoading,
  }
}

export function useGaugeWeight(gaugeAddress: Address | undefined) {
  const { chainId, isNetworkReady } = useNetwork()
  const contracts = getContractConfig(chainId)

  const { data, isLoading } = useReadContract({
    ...contracts.boostVoter,
    functionName: "weights",
    args: gaugeAddress ? [gaugeAddress] : undefined,
    query: {
      ...QUERY_PROFILES.SHORT_CACHE,
      enabled: isNetworkReady && !!gaugeAddress,
    },
  })

  return {
    weight: data as bigint | undefined,
    isLoading,
  }
}

// Batch hook to fetch gauge addresses and boost info for multiple veBTC token IDs
export type BatchGaugeData = {
  tokenId: bigint
  gaugeAddress: Address | undefined
  hasGauge: boolean
  boostMultiplier: number
}

export function useBatchGaugeData(tokenIds: bigint[]) {
  const { chainId, isNetworkReady } = useNetwork()
  const contracts = getContractConfig(chainId)

  // Fetch gauge addresses for all token IDs
  const { data: gaugeAddressesData, isLoading: isLoadingGauges } =
    useReadContracts({
      contracts: tokenIds.map((tokenId) => ({
        ...contracts.boostVoter,
        functionName: "boostableTokenIdToGauge",
        args: [tokenId],
      })),
      query: {
        ...QUERY_PROFILES.SHORT_CACHE,
        enabled: isNetworkReady && tokenIds.length > 0,
      },
    })

  // Fetch boost multipliers for all token IDs
  const { data: boostData, isLoading: isLoadingBoost } = useReadContracts({
    contracts: tokenIds.map((tokenId) => ({
      ...contracts.boostVoter,
      functionName: "getBoost",
      args: [tokenId],
    })),
    query: {
      ...QUERY_PROFILES.SHORT_CACHE,
      enabled: isNetworkReady && tokenIds.length > 0,
    },
  })

  const gaugeDataMap = useMemo(() => {
    const map = new Map<string, BatchGaugeData>()
    tokenIds.forEach((tokenId, i) => {
      const gaugeAddress = gaugeAddressesData?.[i]?.result as
        | Address
        | undefined
      const hasGauge =
        gaugeAddress !== undefined &&
        gaugeAddress !== "0x0000000000000000000000000000000000000000"
      const boost = boostData?.[i]?.result as bigint | undefined
      const boostMultiplier = boost !== undefined ? Number(boost) / 1e18 : 1

      map.set(tokenId.toString(), {
        tokenId,
        gaugeAddress: hasGauge ? gaugeAddress : undefined,
        hasGauge,
        boostMultiplier,
      })
    })
    return map
  }, [tokenIds, gaugeAddressesData, boostData])

  return {
    gaugeDataMap,
    isLoading: isLoadingGauges || isLoadingBoost,
  }
}
