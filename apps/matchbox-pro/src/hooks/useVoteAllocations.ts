import { VOTE_LIST_SCAN, voterConfig } from "@/features/vote/contracts"
import { useNetwork } from "@/lib/network"
import { QUERY_PROFILES } from "@/lib/queryProfiles"
import { useMemo } from "react"
import type { Address } from "viem"
import { useReadContracts } from "wagmi"
import {
  type VoteAllocation,
  aggregateAllocations,
  allocationsByToken as toAllocationsByToken,
  votePairs,
  votedGaugesFromScan,
} from "./personalProjected"

export type { VoteAllocation } from "./personalProjected"

/**
 * Each veMEZO lock's boost-gauge votes. Reads only the gauges a lock voted
 * for (`gaugeVote` list, then `votes` for those) instead of `votes` against
 * every gauge, which was 700+ reads per lock.
 */
export function useAllVoteAllocations(tokenIds: bigint[]): {
  allocationsByToken: Map<string, VoteAllocation[]>
  aggregatedAllocations: VoteAllocation[]
  /** Unique gauges on any lock's vote list, known before `votes` returns. */
  votedGauges: Address[]
  isLoading: boolean
  error: Error | null
} {
  const { chainId, isNetworkReady } = useNetwork()
  const voter = voterConfig(chainId, "vemezo")
  const enabled = isNetworkReady && tokenIds.length > 0

  const scan = useReadContracts({
    contracts: tokenIds.flatMap((tokenId) =>
      Array.from({ length: VOTE_LIST_SCAN }, (_, index) => ({
        address: voter.address,
        abi: voter.abi,
        chainId: voter.chainId,
        functionName: "gaugeVote" as const,
        args: [tokenId, BigInt(index)] as const,
      })),
    ),
    query: { ...QUERY_PROFILES.SHORT_CACHE, enabled },
  })

  const pairs = useMemo(
    () =>
      votePairs(
        tokenIds,
        votedGaugesFromScan(tokenIds.length, scan.data, VOTE_LIST_SCAN),
      ),
    [scan.data, tokenIds],
  )

  const votedGauges = useMemo(() => {
    const unique = new Map<string, Address>()
    for (const pair of pairs) unique.set(pair.gauge.toLowerCase(), pair.gauge)
    return [...unique.values()]
  }, [pairs])

  const votes = useReadContracts({
    contracts: pairs.map((pair) => ({
      address: voter.address,
      abi: voter.abi,
      chainId: voter.chainId,
      functionName: "votes" as const,
      args: [pair.tokenId, pair.gauge] as const,
    })),
    query: {
      ...QUERY_PROFILES.SHORT_CACHE,
      enabled: enabled && pairs.length > 0,
    },
  })

  const allocationsByToken = useMemo(
    () => toAllocationsByToken(tokenIds, pairs, votes.data),
    [pairs, tokenIds, votes.data],
  )
  const aggregatedAllocations = useMemo(
    () => aggregateAllocations(allocationsByToken),
    [allocationsByToken],
  )

  return {
    allocationsByToken,
    aggregatedAllocations,
    votedGauges,
    isLoading: scan.isLoading || votes.isLoading,
    error:
      scan.error ??
      votes.error ??
      (votes.data?.some((row) => row.status === "failure")
        ? new Error("Some vote allocations could not be read")
        : null),
  }
}
