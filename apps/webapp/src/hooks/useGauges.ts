import { getContractConfig } from "@/config/contracts"
import { CHAIN_ID, NON_STAKING_GAUGE_ABI } from "@repo/shared/contracts"
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
  optimalAdditionalVeMEZO: bigint | undefined
  boostMultiplier: number
}

export function useBoostGauges() {
  const contracts = getContractConfig(CHAIN_ID.testnet)

  const { data: lengthData, isLoading: isLoadingLength } = useReadContract({
    ...contracts.boostVoter,
    functionName: "length",
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
        enabled: length > 0n,
      },
    })

  const addresses =
    gaugeAddresses?.map((r) => r.result as Address).filter(Boolean) ?? []

  // Fetch gauge data: weights, isAlive, and rewardsBeneficiary for each gauge
  const { data: gaugeData, isLoading: isLoadingGaugeData } = useReadContracts({
    contracts: addresses.flatMap((address) => [
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
      {
        address,
        abi: NON_STAKING_GAUGE_ABI,
        functionName: "rewardsBeneficiary",
      },
    ]),
    query: {
      enabled: addresses.length > 0,
    },
  })

  // Extract beneficiaries from gauge data (every 3rd result starting at index 2)
  const beneficiaries = useMemo(() => {
    if (!gaugeData) return []
    return addresses.map(
      (_, i) => gaugeData[i * 3 + 2]?.result as Address | undefined,
    )
  }, [gaugeData, addresses])

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
        enabled: uniqueBeneficiaries.length > 0,
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
    const queries: { beneficiary: Address; index: number }[] = []
    for (const { beneficiary, count } of beneficiaryTokenCounts) {
      for (let i = 0; i < count; i++) {
        queries.push({ beneficiary, index: i })
      }
    }
    return queries
  }, [beneficiaryTokenCounts])

  const { data: tokenIdResults, isLoading: isLoadingTokenIds } =
    useReadContracts({
      contracts: tokenIdQueries.map(({ beneficiary, index }) => ({
        ...contracts.veBTC,
        functionName: "ownerToNFTokenIdList",
        args: [beneficiary, BigInt(index)],
      })),
      query: {
        enabled: tokenIdQueries.length > 0,
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
        enabled: allTokenIds.length > 0,
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

  // Get token IDs for our gauge addresses
  const tokenIds = addresses.map((addr) =>
    gaugeToTokenId.get(addr.toLowerCase()),
  )

  // Fetch veBTC voting power for each token
  const { data: veBTCVotingPowers } = useReadContracts({
    contracts: tokenIds
      .filter((id): id is bigint => id !== undefined && id > 0n)
      .map((tokenId) => ({
        ...contracts.veBTC,
        functionName: "votingPowerOfNFT",
        args: [tokenId],
      })),
    query: {
      enabled: tokenIds.some((id) => id !== undefined && id > 0n),
    },
  })

  // Fetch boost multipliers for each veBTC token
  const { data: boostData } = useReadContracts({
    contracts: tokenIds
      .filter((id): id is bigint => id !== undefined && id > 0n)
      .map((tokenId) => ({
        ...contracts.boostVoter,
        functionName: "getBoost",
        args: [tokenId],
      })),
    query: {
      enabled: tokenIds.some((id) => id !== undefined && id > 0n),
    },
  })

  // Fetch totals for optimal veMEZO calculation
  const { data: totalsData } = useReadContracts({
    contracts: [
      {
        ...contracts.veMEZO,
        functionName: "totalVotingPower",
      },
      {
        ...contracts.veBTC,
        functionName: "totalVotingPower",
      },
    ],
  })

  const veMEZOTotalVotingPower = totalsData?.[0]?.result as bigint | undefined
  const veBTCTotalVotingPower = totalsData?.[1]?.result as bigint | undefined

  // Build maps of token ID to voting power and boost
  const tokenIdToVotingPower = new Map<string, bigint>()
  const tokenIdToBoost = new Map<string, bigint>()
  let vpIndex = 0
  for (const tokenId of tokenIds) {
    if (tokenId !== undefined && tokenId > 0n) {
      const vp = veBTCVotingPowers?.[vpIndex]?.result as bigint | undefined
      if (vp !== undefined) {
        tokenIdToVotingPower.set(tokenId.toString(), vp)
      }
      const boost = boostData?.[vpIndex]?.result as bigint | undefined
      if (boost !== undefined) {
        tokenIdToBoost.set(tokenId.toString(), boost)
      }
      vpIndex++
    }
  }

  // Calculate optimal additional veMEZO for each gauge
  // Formula: (gaugeVeBTCWeight * veMEZOTotalVotingPower) / veBTCTotalVotingPower
  // Uses Rational for precise division, then manually converts to 18-decimal fixed point
  const calculateOptimalAdditionalVeMEZO = (
    gaugeVeBTCWeight: bigint | undefined,
  ): bigint | undefined => {
    if (
      !veMEZOTotalVotingPower ||
      !veBTCTotalVotingPower ||
      !gaugeVeBTCWeight ||
      gaugeVeBTCWeight === 0n
    ) {
      return undefined
    }

    if (veBTCTotalVotingPower === 0n) {
      return undefined
    }

    try {
      // Use Rational for precise division math
      // All values are 18-decimal fixed point, so represent as rationals with 10^18 denominator
      const scale = 10n ** 18n
      const veBTCWeight = Rational(gaugeVeBTCWeight, scale)
      const veMEZOTotal = Rational(veMEZOTotalVotingPower, scale)
      const veBTCTotal = Rational(veBTCTotalVotingPower, scale)

      // Calculate (veBTCWeight * veMEZOTotal) / veBTCTotal
      // Result is a rational representing the actual value (not scaled)
      const result = veBTCWeight.multiply(veMEZOTotal).divide(veBTCTotal)

      // Simplify to reduce the numerator/denominator before scaling
      // Without this, the rational accumulates huge unsimplified values
      const simplified = result.simplify()

      // Convert back to 18-decimal fixed point: multiply by 10^18
      // Using (p * scale) / q ensures we get the correct bigint representation
      return (simplified.p * scale) / simplified.q
    } catch (error) {
      console.error("calculateOptimalAdditionalVeMEZO error:", {
        gaugeVeBTCWeight: gaugeVeBTCWeight.toString(),
        veMEZOTotalVotingPower: veMEZOTotalVotingPower.toString(),
        veBTCTotalVotingPower: veBTCTotalVotingPower.toString(),
        error,
      })
      return undefined
    }
  }

  const gauges: BoostGauge[] = addresses.map((address, i) => {
    // gaugeData has 3 entries per gauge: weights, isAlive, rewardsBeneficiary
    const totalWeight = (gaugeData?.[i * 3]?.result as bigint) ?? 0n
    const isAlive = (gaugeData?.[i * 3 + 1]?.result as boolean) ?? false
    const veBTCTokenId = gaugeToTokenId.get(address.toLowerCase()) ?? 0n
    const gaugeVeBTCWeight = tokenIdToVotingPower.get(veBTCTokenId.toString())
    const boost = tokenIdToBoost.get(veBTCTokenId.toString())
    const boostMultiplier = boost !== undefined ? Number(boost) / 1e18 : 1

    return {
      address,
      veBTCTokenId,
      veBTCWeight: gaugeVeBTCWeight,
      totalWeight,
      isAlive,
      optimalAdditionalVeMEZO:
        calculateOptimalAdditionalVeMEZO(gaugeVeBTCWeight),
      boostMultiplier,
    }
  })

  // Combine all loading states - page should show loading until all critical data is ready
  const isLoading =
    isLoadingLength ||
    (length > 0n && isLoadingAddresses) ||
    (addresses.length > 0 && isLoadingGaugeData) ||
    (uniqueBeneficiaries.length > 0 && isLoadingBalances) ||
    (tokenIdQueries.length > 0 && isLoadingTokenIds) ||
    (allTokenIds.length > 0 && isLoadingTokenMap)

  return {
    gauges,
    isLoading,
    totalGauges: Number(length),
  }
}

export function useBoostGaugeForToken(tokenId: bigint | undefined) {
  const contracts = getContractConfig(CHAIN_ID.testnet)

  const {
    data: gaugeAddress,
    isLoading,
    refetch,
  } = useReadContract({
    ...contracts.boostVoter,
    functionName: "boostableTokenIdToGauge",
    args: tokenId !== undefined ? [tokenId] : undefined,
    query: {
      enabled: tokenId !== undefined,
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
  const contracts = getContractConfig(CHAIN_ID.testnet)

  const { data: boost, isLoading } = useReadContract({
    ...contracts.boostVoter,
    functionName: "getBoost",
    args: tokenId !== undefined ? [tokenId] : undefined,
    query: {
      enabled: tokenId !== undefined,
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
  const contracts = getContractConfig(CHAIN_ID.testnet)

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
  const contracts = getContractConfig(CHAIN_ID.testnet)

  const { data, isLoading } = useReadContract({
    ...contracts.boostVoter,
    functionName: "weights",
    args: gaugeAddress ? [gaugeAddress] : undefined,
    query: {
      enabled: !!gaugeAddress,
    },
  })

  return {
    weight: data as bigint | undefined,
    isLoading,
  }
}
