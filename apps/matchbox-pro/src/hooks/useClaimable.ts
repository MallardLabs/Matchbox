import { chunkArray } from "@/lib/chunk"
import { BRIBE_EARNED_ABI } from "@/lib/escrowAbi"
import { useNetwork } from "@/lib/network"
import { QUERY_PROFILES } from "@/lib/queryProfiles"
import { referencePriceUsd, tokenUsdMicro } from "@/lib/tokenUsd"
import { useQuery } from "@tanstack/react-query"
import { useMemo } from "react"
import type { Address } from "viem"
import { usePublicClient } from "wagmi"
import { useBtcPrice, useMezoPrice } from "./usePrices"
import { useTopology } from "./useTopology"

export type ClaimableRow = {
  tokenId: bigint
  bribeAddress: Address
  gaugeAddress: Address
  tokens: Address[]
  rewards: Array<{
    tokenAddress: Address
    symbol: string
    decimals: number
    earned: bigint
    usdMicro: bigint
    priceAvailable: boolean
  }>
}

export function useClaimable(tokenIds: bigint[]) {
  const { chainId } = useNetwork()
  const publicClient = usePublicClient({ chainId })
  const topologyQuery = useTopology()
  const topology = topologyQuery.data
  const { data: btcPrice = null } = useBtcPrice()
  const { data: mezoPrice = null } = useMezoPrice()
  const tokenKey = tokenIds
    .map((id) => id.toString())
    .sort()
    .join(",")

  const queries = useMemo(() => {
    if (!topology || tokenIds.length === 0) return []
    const rows: Array<{
      tokenId: bigint
      bribeAddress: Address
      gaugeAddress: Address
      tokenAddress: Address
      symbol: string
      decimals: number
    }> = []
    for (const tokenId of tokenIds) {
      for (const gauge of topology.gauges) {
        if (!gauge.bribeAddress) continue
        for (const token of gauge.rewardTokens) {
          rows.push({
            tokenId,
            bribeAddress: gauge.bribeAddress,
            gaugeAddress: gauge.gaugeAddress,
            tokenAddress: token.tokenAddress,
            symbol: token.symbol,
            decimals: token.decimals,
          })
        }
      }
    }
    return rows
  }, [tokenIds, topology])

  const earnedQuery = useQuery({
    queryKey: ["claimable-earned", chainId, tokenKey, topology?.generatedAt],
    enabled: !!publicClient && queries.length > 0,
    ...QUERY_PROFILES.SHORT_CACHE,
    queryFn: async () => {
      if (!publicClient) return []
      const values = new Array<bigint | null>(queries.length).fill(null)
      for (const batch of chunkArray(
        queries.map((query, index) => ({ query, index })),
        200,
      )) {
        const results = await publicClient.multicall({
          contracts: batch.map(({ query }) => ({
            address: query.bribeAddress,
            abi: BRIBE_EARNED_ABI,
            functionName: "earned",
            args: [query.tokenAddress, query.tokenId],
          })),
          allowFailure: true,
        })
        results.forEach((result, i) => {
          const original = batch[i]?.index
          if (original === undefined) return
          values[original] =
            result.status === "success"
              ? ((result.result as bigint | undefined) ?? 0n)
              : null
        })
      }
      return values
    },
  })

  const { rows, totalMicro, claims } = useMemo(() => {
    const map = new Map<string, ClaimableRow>()
    let totalMicro = 0n
    queries.forEach((query, index) => {
      const earned = earnedQuery.data?.[index] ?? 0n
      if (earned <= 0n) return
      const usdMicro = tokenUsdMicro({
        amount: earned,
        decimals: query.decimals,
        tokenAddress: query.tokenAddress,
        symbol: query.symbol,
        btcPriceUsd: btcPrice,
        mezoPriceUsd: mezoPrice,
      })
      totalMicro += usdMicro
      const key = `${query.tokenId}-${query.bribeAddress.toLowerCase()}`
      const existing = map.get(key)
      const reward = {
        tokenAddress: query.tokenAddress,
        symbol: query.symbol,
        decimals: query.decimals,
        earned,
        usdMicro,
        priceAvailable:
          referencePriceUsd({
            tokenAddress: query.tokenAddress,
            symbol: query.symbol,
            btcPriceUsd: btcPrice,
            mezoPriceUsd: mezoPrice,
          }) !== null,
      }
      if (existing) {
        existing.rewards.push(reward)
        existing.tokens.push(query.tokenAddress)
      } else {
        map.set(key, {
          tokenId: query.tokenId,
          bribeAddress: query.bribeAddress,
          gaugeAddress: query.gaugeAddress,
          tokens: [query.tokenAddress],
          rewards: [reward],
        })
      }
    })

    const rows = Array.from(map.values())
    const byLock = new Map<
      string,
      { tokenId: bigint; bribes: Address[]; tokens: Address[][] }
    >()
    for (const row of rows) {
      const id = row.tokenId.toString()
      const current = byLock.get(id) ?? {
        tokenId: row.tokenId,
        bribes: [],
        tokens: [],
      }
      current.bribes.push(row.bribeAddress)
      current.tokens.push(row.tokens)
      byLock.set(id, current)
    }

    return {
      rows,
      totalMicro,
      claims: Array.from(byLock.values()),
    }
  }, [btcPrice, earnedQuery.data, mezoPrice, queries])

  return {
    rows,
    totalMicro,
    claims,
    isLoading:
      tokenIds.length > 0 && (topologyQuery.isLoading || earnedQuery.isLoading),
    isFetching: topologyQuery.isFetching || earnedQuery.isFetching,
    error: topologyQuery.error ?? earnedQuery.error,
    failedReads:
      earnedQuery.data?.filter((value) => value === null).length ?? 0,
    updatedAt: earnedQuery.dataUpdatedAt,
    indexedAt: topology?.generatedAt,
    refetch: async () => {
      await topologyQuery.refetch()
      return earnedQuery.refetch()
    },
  }
}
