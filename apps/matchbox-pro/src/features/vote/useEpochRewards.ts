import { useNetwork } from "@/lib/network"
import { QUERY_PROFILES } from "@/lib/queryProfiles"
import {
  groupRewards,
  rewardPairs,
  rewardSlots,
  tokenMeta,
  uniqueTokens,
} from "@/worker/vote/mappers"
import { useMemo } from "react"
import type { Address } from "viem"
import { useReadContracts } from "wagmi"
import type { WireRewardToken } from "./contract"
import { REWARD_ABI, TOKEN_META_ABI } from "./contracts"

const NO_PRICES = new Map<string, string>()

/**
 * Browser fallback for the Worker's reward reads, with the same mappers:
 * `rewardsListLength` → `rewards(i)` → `tokenRewardsPerEpoch` + metadata.
 */
export function useEpochRewards(
  rewardContracts: readonly Address[],
  epochStart: bigint | undefined,
  enabled: boolean,
): { byContract: Map<string, WireRewardToken[]>; isLoading: boolean } {
  const { chainId } = useNetwork()
  const on = enabled && rewardContracts.length > 0

  const lengths = useReadContracts({
    contracts: rewardContracts.map((address) => ({
      address,
      abi: REWARD_ABI,
      chainId,
      functionName: "rewardsListLength" as const,
    })),
    query: { ...QUERY_PROFILES.SHORT_CACHE, enabled: on },
  })
  const slots = useMemo(
    () => rewardSlots(rewardContracts, lengths.data ?? []),
    [lengths.data, rewardContracts],
  )

  const tokens = useReadContracts({
    contracts: slots.map((slot) => ({
      address: slot.contract,
      abi: REWARD_ABI,
      chainId,
      functionName: "rewards" as const,
      args: [slot.index] as const,
    })),
    query: { ...QUERY_PROFILES.SHORT_CACHE, enabled: on && slots.length > 0 },
  })
  const pairs = useMemo(
    () => rewardPairs(slots, tokens.data ?? []),
    [slots, tokens.data],
  )
  const unique = useMemo(() => uniqueTokens(pairs), [pairs])

  const amounts = useReadContracts({
    contracts: pairs.map((pair) => ({
      address: pair.contract,
      abi: REWARD_ABI,
      chainId,
      functionName: "tokenRewardsPerEpoch" as const,
      args: [pair.token, epochStart ?? 0n] as const,
    })),
    query: {
      ...QUERY_PROFILES.SHORT_CACHE,
      enabled: on && pairs.length > 0 && epochStart !== undefined,
    },
  })
  const meta = useReadContracts({
    contracts: unique.flatMap((address) => [
      {
        address,
        abi: TOKEN_META_ABI,
        chainId,
        functionName: "symbol" as const,
      },
      {
        address,
        abi: TOKEN_META_ABI,
        chainId,
        functionName: "decimals" as const,
      },
    ]),
    query: { ...QUERY_PROFILES.LONG_CACHE, enabled: on && unique.length > 0 },
  })

  const byContract = useMemo(
    () =>
      groupRewards(
        pairs,
        amounts.data ?? [],
        tokenMeta(unique, meta.data ?? []),
        NO_PRICES,
      ),
    [amounts.data, meta.data, pairs, unique],
  )

  return {
    byContract,
    isLoading:
      on &&
      (lengths.isLoading ||
        tokens.isLoading ||
        amounts.isLoading ||
        meta.isLoading),
  }
}
