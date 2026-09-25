import { getContractConfig } from "@/lib/contracts"
import { useNetwork } from "@/lib/network"
import { QUERY_PROFILES } from "@/lib/queryProfiles"
import { useMemo } from "react"
import { useReadContracts } from "wagmi"
import { useEpoch } from "./useEpoch"

export type BatchVoteState = {
  tokenId: bigint
  lastVoted: bigint | undefined
  usedWeight: bigint | undefined
  hasVotedThisEpoch: boolean | undefined
}

export function useBatchVoteState(tokenIds: bigint[]): {
  voteStateMap: Map<string, BatchVoteState>
  isLoading: boolean
} {
  const { chainId, isNetworkReady } = useNetwork()
  const contracts = getContractConfig(chainId)
  const { epochStart } = useEpoch()
  const enabled = isNetworkReady && tokenIds.length > 0

  const { data: lastVotedData, isLoading: loadingVoted } = useReadContracts({
    contracts: tokenIds.map((tokenId) => ({
      ...contracts.boostVoter,
      functionName: "lastVoted" as const,
      args: [tokenId],
    })),
    query: { ...QUERY_PROFILES.SHORT_CACHE, enabled },
  })

  const { data: usedWeightsData, isLoading: loadingWeights } = useReadContracts(
    {
      contracts: tokenIds.map((tokenId) => ({
        ...contracts.boostVoter,
        functionName: "usedWeights" as const,
        args: [tokenId],
      })),
      query: { ...QUERY_PROFILES.SHORT_CACHE, enabled },
    },
  )

  const voteStateMap = useMemo(() => {
    const map = new Map<string, BatchVoteState>()
    tokenIds.forEach((tokenId, i) => {
      const lastVoted = lastVotedData?.[i]?.result
      const usedWeight = usedWeightsData?.[i]?.result
      const last = typeof lastVoted === "bigint" ? lastVoted : undefined
      map.set(tokenId.toString(), {
        tokenId,
        lastVoted: last,
        usedWeight: typeof usedWeight === "bigint" ? usedWeight : undefined,
        hasVotedThisEpoch:
          last !== undefined && epochStart !== undefined
            ? last >= epochStart
            : undefined,
      })
    })
    return map
  }, [epochStart, lastVotedData, tokenIds, usedWeightsData])

  return {
    voteStateMap,
    isLoading: loadingVoted || loadingWeights,
  }
}
