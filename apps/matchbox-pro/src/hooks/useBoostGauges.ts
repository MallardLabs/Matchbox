import { boostMultiplierNumber } from "@/lib/boost"
import { getContractConfig } from "@/lib/contracts"
import { useNetwork } from "@/lib/network"
import calculateOptimalVeMEZO from "@/lib/optimalVeMEZO"
import { QUERY_PROFILES } from "@/lib/queryProfiles"
import { useMemo } from "react"
import type { Address } from "viem"
import { useReadContract, useReadContracts } from "wagmi"
import { profileForGauge, useGaugeProfiles } from "./useProfiles"

export type BoostGauge = {
  address: Address
  veBTCTokenId: bigint | undefined
  veBTCWeight: bigint | undefined
  unboostedVeBTCWeight: bigint | undefined
  totalWeight: bigint
  isAlive: boolean
  optimalVeMEZO: bigint | undefined
  optimalAdditionalVeMEZO: bigint | undefined
  boostMultiplier: number
  needsBoost: boolean
}

function tokenIdFromProfile(value: string | undefined): bigint | undefined {
  if (!value) return undefined
  try {
    const tokenId = BigInt(value)
    return tokenId > 0n ? tokenId : undefined
  } catch {
    return undefined
  }
}

export function useBoostGauges() {
  const { chainId } = useNetwork()
  const contracts = getContractConfig(chainId)
  const { data: profiles } = useGaugeProfiles()

  const { data: lengthData, isLoading: loadingLength } = useReadContract({
    ...contracts.boostVoter,
    functionName: "length",
    query: QUERY_PROFILES.SHORT_CACHE,
  })
  const length = lengthData ?? 0n

  const { data: addressRows, isLoading: loadingAddresses } = useReadContracts({
    contracts: Array.from({ length: Number(length) }, (_, i) => ({
      ...contracts.boostVoter,
      functionName: "gauges" as const,
      args: [BigInt(i)],
    })),
    query: {
      ...QUERY_PROFILES.SHORT_CACHE,
      enabled: length > 0n,
    },
  })
  // Memoized on wagmi's structurally-shared data so `gauges` keeps its identity
  // across renders; every downstream memo keys off it.
  const addresses = useMemo(
    () =>
      addressRows?.flatMap((row) =>
        typeof row.result === "string" ? [row.result] : [],
      ) ?? [],
    [addressRows],
  )

  const { data: gaugeData, isLoading: loadingData } = useReadContracts({
    contracts: addresses.flatMap((address) => [
      {
        ...contracts.boostVoter,
        functionName: "weights" as const,
        args: [address],
      },
      {
        ...contracts.boostVoter,
        functionName: "isAlive" as const,
        args: [address],
      },
    ]),
    query: {
      ...QUERY_PROFILES.SHORT_CACHE,
      enabled: addresses.length > 0,
    },
  })

  const { data: supplies } = useReadContracts({
    contracts: [
      { ...contracts.veMEZO, functionName: "totalVotingPower" as const },
      {
        ...contracts.veBTC,
        functionName: "unboostedTotalVotingPower" as const,
      },
    ],
    query: QUERY_PROFILES.SHORT_CACHE,
  })
  const veMezoTotal =
    typeof supplies?.[0]?.result === "bigint" ? supplies[0].result : 0n
  const veBtcTotal =
    typeof supplies?.[1]?.result === "bigint" ? supplies[1].result : 0n

  const tokenIds = useMemo(
    () =>
      addresses.map((address) =>
        tokenIdFromProfile(profileForGauge(profiles, address)?.vebtc_token_id),
      ),
    [addresses, profiles],
  )

  const indexedIds = useMemo(
    () =>
      tokenIds.flatMap((tokenId, index) =>
        tokenId !== undefined ? [{ tokenId, index }] : [],
      ),
    [tokenIds],
  )

  const { data: lockData } = useReadContracts({
    contracts: indexedIds.flatMap(({ tokenId }) => [
      {
        ...contracts.veBTC,
        functionName: "votingPowerOfNFT" as const,
        args: [tokenId],
      },
      {
        ...contracts.veBTC,
        functionName: "unboostedVotingPowerOfNFT" as const,
        args: [tokenId],
      },
      {
        ...contracts.boostVoter,
        functionName: "getBoost" as const,
        args: [tokenId],
      },
    ]),
    query: {
      ...QUERY_PROFILES.SHORT_CACHE,
      enabled: indexedIds.length > 0,
    },
  })

  const gauges: BoostGauge[] = useMemo(() => {
    const byIndex = new Map<
      number,
      {
        veBTCWeight: bigint | undefined
        unboosted: bigint | undefined
        boostWad: bigint | undefined
      }
    >()
    indexedIds.forEach((entry, i) => {
      const vp = lockData?.[i * 3]?.result
      const unboosted = lockData?.[i * 3 + 1]?.result
      const boostWad = lockData?.[i * 3 + 2]?.result
      byIndex.set(entry.index, {
        veBTCWeight: typeof vp === "bigint" ? vp : undefined,
        unboosted: typeof unboosted === "bigint" ? unboosted : undefined,
        boostWad: typeof boostWad === "bigint" ? boostWad : undefined,
      })
    })

    return addresses.map((address, i) => {
      const weightResult = gaugeData?.[i * 2]?.result
      const totalWeight = typeof weightResult === "bigint" ? weightResult : 0n
      const isAlive = Boolean(gaugeData?.[i * 2 + 1]?.result)
      const lock = byIndex.get(i)
      const unboostedVeBTCWeight = lock?.unboosted
      const optimal = calculateOptimalVeMEZO(
        unboostedVeBTCWeight,
        totalWeight,
        veBtcTotal,
        veMezoTotal,
      )
      const boostMultiplier =
        lock?.boostWad !== undefined
          ? Number(lock.boostWad) / 1e18
          : unboostedVeBTCWeight && unboostedVeBTCWeight > 0n
            ? boostMultiplierNumber({
                unboostedNftVp: unboostedVeBTCWeight,
                gaugeVeMezoWeight: totalWeight,
                veBtcSystemTotal: veBtcTotal,
                veMezoSystemTotal: veMezoTotal,
              })
            : 1
      return {
        address,
        veBTCTokenId: tokenIds[i],
        veBTCWeight: lock?.veBTCWeight,
        unboostedVeBTCWeight,
        totalWeight,
        isAlive,
        optimalVeMEZO: optimal?.optimalVeMEZO,
        optimalAdditionalVeMEZO: optimal?.optimalAdditionalVeMEZO,
        boostMultiplier,
        needsBoost: isAlive && boostMultiplier < 5,
      }
    })
  }, [
    addresses,
    gaugeData,
    indexedIds,
    lockData,
    tokenIds,
    veBtcTotal,
    veMezoTotal,
  ])

  return {
    gauges,
    isLoading: loadingLength || loadingAddresses || loadingData,
    veMezoTotal,
    veBtcTotal,
  }
}
