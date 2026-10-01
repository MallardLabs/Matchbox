import { getContractConfig } from "@/lib/contracts"
import { useNetwork } from "@/lib/network"
import { QUERY_PROFILES } from "@/lib/queryProfiles"
import { useMemo } from "react"
import type { Address } from "viem"
import { useReadContracts } from "wagmi"

export type VoteAllocation = {
  gaugeAddress: Address
  weight: bigint
}

export function useAllVoteAllocations(
  tokenIds: bigint[],
  gaugeAddresses: Address[],
): {
  allocationsByToken: Map<string, VoteAllocation[]>
  aggregatedAllocations: VoteAllocation[]
  isLoading: boolean
  error: Error | null
} {
  const { chainId, isNetworkReady } = useNetwork()
  const contracts = getContractConfig(chainId)
  const { data, isLoading, error } = useReadContracts({
    contracts: tokenIds.flatMap((tokenId) =>
      gaugeAddresses.map((gaugeAddress) => ({
        ...contracts.boostVoter,
        functionName: "votes" as const,
        args: [tokenId, gaugeAddress],
      })),
    ),
    query: {
      ...QUERY_PROFILES.SHORT_CACHE,
      enabled:
        isNetworkReady && tokenIds.length > 0 && gaugeAddresses.length > 0,
    },
  })

  const allocationsByToken = useMemo(() => {
    const map = new Map<string, VoteAllocation[]>()
    tokenIds.forEach((tokenId, tokenIndex) => {
      const rows: VoteAllocation[] = []
      gaugeAddresses.forEach((gaugeAddress, gaugeIndex) => {
        const result =
          data?.[tokenIndex * gaugeAddresses.length + gaugeIndex]?.result
        const weight = typeof result === "bigint" ? result : 0n
        if (weight > 0n) rows.push({ gaugeAddress, weight })
      })
      map.set(tokenId.toString(), rows)
    })
    return map
  }, [data, gaugeAddresses, tokenIds])

  const aggregatedAllocations = useMemo(() => {
    const weights = new Map<string, bigint>()
    for (const rows of allocationsByToken.values()) {
      for (const row of rows) {
        const key = row.gaugeAddress.toLowerCase()
        weights.set(key, (weights.get(key) ?? 0n) + row.weight)
      }
    }
    return gaugeAddresses
      .map((gaugeAddress) => ({
        gaugeAddress,
        weight: weights.get(gaugeAddress.toLowerCase()) ?? 0n,
      }))
      .filter((row) => row.weight > 0n)
  }, [allocationsByToken, gaugeAddresses])

  return {
    allocationsByToken,
    aggregatedAllocations,
    isLoading,
    error:
      error ??
      (data?.some((row) => row.status === "failure")
        ? new Error("Some vote allocations could not be read")
        : null),
  }
}
