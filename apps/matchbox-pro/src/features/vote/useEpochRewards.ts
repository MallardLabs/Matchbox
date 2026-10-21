import { useNetwork } from "@/lib/network"
import { QUERY_PROFILES } from "@/lib/queryProfiles"
import { useMemo } from "react"
import { type Address, getAddress, isAddress, zeroAddress } from "viem"
import { useReadContracts } from "wagmi"
import { REWARD_ABI, TOKEN_META_ABI } from "./contracts"
import type { RewardToken } from "./projection"

type UnpricedReward = Omit<RewardToken, "microUsd">

function asBigint(value: unknown): bigint | undefined {
  return typeof value === "bigint" ? value : undefined
}

function asAddress(value: unknown): Address | undefined {
  if (typeof value !== "string" || !isAddress(value, { strict: false }))
    return undefined
  const address = getAddress(value)
  return address === zeroAddress ? undefined : address
}

/**
 * Tokens deposited on bribe or fee reward contracts for one epoch:
 * `rewardsListLength` → `rewards(i)` → `tokenRewardsPerEpoch(token, epoch)`,
 * plus each token's symbol and decimals.
 */
export function useEpochRewards(
  rewardContracts: readonly Address[],
  epochStart: bigint | undefined,
): {
  byContract: Map<string, UnpricedReward[]>
  isLoading: boolean
} {
  const { chainId } = useNetwork()

  const lengths = useReadContracts({
    contracts: rewardContracts.map((address) => ({
      address,
      abi: REWARD_ABI,
      chainId,
      functionName: "rewardsListLength" as const,
    })),
    query: {
      ...QUERY_PROFILES.SHORT_CACHE,
      enabled: rewardContracts.length > 0,
    },
  })

  const slots = useMemo(
    () =>
      rewardContracts.flatMap((address, index) => {
        const length = asBigint(lengths.data?.[index]?.result) ?? 0n
        const capped = length > 16n ? 16 : Number(length)
        return Array.from({ length: capped }, (_, slot) => ({
          address,
          slot: BigInt(slot),
        }))
      }),
    [lengths.data, rewardContracts],
  )

  const tokens = useReadContracts({
    contracts: slots.map((slot) => ({
      address: slot.address,
      abi: REWARD_ABI,
      chainId,
      functionName: "rewards" as const,
      args: [slot.slot] as const,
    })),
    query: { ...QUERY_PROFILES.SHORT_CACHE, enabled: slots.length > 0 },
  })

  const pairs = useMemo(
    () =>
      slots.flatMap((slot, index) => {
        const token = asAddress(tokens.data?.[index]?.result)
        return token ? [{ contract: slot.address, token }] : []
      }),
    [slots, tokens.data],
  )
  const uniqueTokens = useMemo(
    () => [...new Map(pairs.map((pair) => [pair.token, pair.token])).values()],
    [pairs],
  )

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
      enabled: pairs.length > 0 && epochStart !== undefined,
    },
  })

  const meta = useReadContracts({
    contracts: uniqueTokens.flatMap((address) => [
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
    query: { ...QUERY_PROFILES.LONG_CACHE, enabled: uniqueTokens.length > 0 },
  })

  const byContract = useMemo(() => {
    const metaByToken = new Map(
      uniqueTokens.map((address, index) => {
        const symbol = meta.data?.[index * 2]?.result
        const decimals = meta.data?.[index * 2 + 1]?.result
        return [
          address,
          {
            symbol: typeof symbol === "string" && symbol ? symbol : "Token",
            decimals: typeof decimals === "number" ? decimals : 18,
          },
        ] as const
      }),
    )
    const map = new Map<string, UnpricedReward[]>()
    pairs.forEach((pair, index) => {
      const amount = asBigint(amounts.data?.[index]?.result) ?? 0n
      if (amount <= 0n) return
      const info = metaByToken.get(pair.token)
      const key = pair.contract.toLowerCase()
      const list = map.get(key) ?? []
      list.push({
        tokenAddress: pair.token,
        symbol: info?.symbol ?? "Token",
        decimals: info?.decimals ?? 18,
        amount,
      })
      map.set(key, list)
    })
    return map
  }, [amounts.data, meta.data, pairs, uniqueTokens])

  return {
    byContract,
    isLoading:
      lengths.isLoading ||
      tokens.isLoading ||
      amounts.isLoading ||
      meta.isLoading,
  }
}
