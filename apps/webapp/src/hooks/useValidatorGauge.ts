import { getContractConfig } from "@/config/contracts"
import { QUERY_PROFILES } from "@/config/queryProfiles"
import { useNetwork } from "@/contexts/NetworkContext"
import { useInfiniteQuery } from "@tanstack/react-query"
import { useCallback, useMemo } from "react"
import type { Address, Hex } from "viem"
import {
  useAccount,
  useReadContract,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi"
import { z } from "zod"

export function useValidatorGaugeState(
  gaugeAddress: Address | undefined,
  rewardsEnabled = true,
  operatorAddress?: Address,
) {
  const { chainId, isNetworkReady } = useNetwork()
  const { address: viewerAddress } = useAccount()
  const contracts = getContractConfig(chainId)
  const beneficiary = useReadContract({
    address: gaugeAddress,
    abi: [
      {
        inputs: [],
        name: "rewardsBeneficiary",
        outputs: [{ type: "address" }],
        stateMutability: "view",
        type: "function",
      },
    ] as const,
    chainId,
    functionName: "rewardsBeneficiary",
    query: {
      ...QUERY_PROFILES.REALTIME,
      enabled: isNetworkReady && !!gaugeAddress,
    },
  })
  const isPrivilegedViewer =
    !!viewerAddress &&
    (viewerAddress.toLowerCase() === operatorAddress?.toLowerCase() ||
      viewerAddress.toLowerCase() ===
        (beneficiary.data as Address | undefined)?.toLowerCase())
  const shouldReadRewards = rewardsEnabled || isPrivilegedViewer
  const claimable = useReadContract({
    ...contracts.validatorsVoter,
    functionName: "claimable",
    args: gaugeAddress ? [gaugeAddress] : undefined,
    query: {
      ...QUERY_PROFILES.REALTIME,
      enabled: isNetworkReady && !!gaugeAddress && shouldReadRewards,
    },
  })
  const refetch = useCallback(async () => {
    await Promise.all([beneficiary.refetch(), claimable.refetch()])
  }, [beneficiary.refetch, claimable.refetch])
  return {
    beneficiary: beneficiary.data as Address | undefined,
    claimable: claimable.data as bigint | undefined,
    isLoading:
      beneficiary.isLoading || (shouldReadRewards && claimable.isLoading),
    refetch,
  }
}

export function useValidatorTokenAllowlisted(token: Address | undefined) {
  const { chainId, isNetworkReady } = useNetwork()
  const contracts = getContractConfig(chainId)
  const result = useReadContract({
    ...contracts.validatorsVoter,
    functionName: "isWhitelistedToken",
    args: token ? [token] : undefined,
    query: {
      ...QUERY_PROFILES.SHORT_CACHE,
      enabled: isNetworkReady && !!token,
    },
  })
  return {
    isAllowlisted: result.data as boolean | undefined,
    isLoading: result.isLoading,
  }
}

type ValidatorWriteState = {
  hash: Hex | undefined
  isPending: boolean
  isConfirming: boolean
  isSuccess: boolean
  error: Error | null
  reset: () => void
}

export function useAddValidatorIncentive(): ValidatorWriteState & {
  addIncentive: (gauge: Address, token: Address, amount: bigint) => void
} {
  const { chainId } = useNetwork()
  const contracts = getContractConfig(chainId)
  const write = useWriteContract()
  const receipt = useWaitForTransactionReceipt({ hash: write.data })
  return {
    addIncentive: (gauge: Address, token: Address, amount: bigint) =>
      write.writeContract({
        ...contracts.validatorsVoter,
        functionName: "addBribes",
        args: [gauge, [token], [amount]],
      }),
    hash: write.data as Hex | undefined,
    isPending: write.isPending,
    isConfirming: receipt.isLoading,
    isSuccess: receipt.isSuccess,
    error: write.error,
    reset: write.reset,
  }
}

export function useClaimValidatorRewards(): ValidatorWriteState & {
  claim: (gauge: Address) => void
} {
  const { chainId } = useNetwork()
  const contracts = getContractConfig(chainId)
  const write = useWriteContract()
  const receipt = useWaitForTransactionReceipt({ hash: write.data })
  return {
    claim: (gauge: Address) =>
      write.writeContract({
        ...contracts.validatorsVoter,
        functionName: "claimRewards",
        args: [gauge],
      }),
    hash: write.data as Hex | undefined,
    isPending: write.isPending,
    isConfirming: receipt.isLoading,
    isSuccess: receipt.isSuccess,
    error: write.error,
    reset: write.reset,
  }
}

export function useSwitchValidatorBeneficiary(gauge: Address | undefined): Omit<
  ValidatorWriteState,
  "hash"
> & {
  switchBeneficiary: (next: Address) => void
} {
  const { chainId } = useNetwork()
  const write = useWriteContract()
  const receipt = useWaitForTransactionReceipt({ hash: write.data })
  return {
    switchBeneficiary: (next: Address) => {
      if (!gauge) return
      write.writeContract({
        address: gauge,
        chainId,
        abi: [
          {
            inputs: [{ name: "newBeneficiary", type: "address" }],
            name: "switchRewardsBeneficiary",
            outputs: [],
            stateMutability: "nonpayable",
            type: "function",
          },
        ] as const,
        functionName: "switchRewardsBeneficiary",
        args: [next],
      })
    },
    isPending: write.isPending,
    isConfirming: receipt.isLoading,
    isSuccess: receipt.isSuccess,
    error: write.error,
    reset: write.reset,
  }
}

const historyItemSchema = z.object({
  id: z.string(),
  timestamp: z.number(),
  amount: z.string().optional(),
  txHash: z.string().optional(),
  explorerUrl: z.string().optional(),
})
const historyResponseSchema = z.object({
  data: z.array(historyItemSchema),
  page: z.number(),
  hasMore: z.boolean(),
})

export function useValidatorRewardHistory(
  gauge: Address | undefined,
  enabled: boolean,
) {
  const { chainId } = useNetwork()
  const query = useInfiniteQuery({
    queryKey: ["validator-reward-history", chainId, gauge],
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      if (!gauge) return { data: [], page: 0, hasMore: false }
      const params = new URLSearchParams({
        network: chainId === 31611 ? "testnet" : "mainnet",
        from: "0",
        limit: "20",
        page: String(pageParam),
        actionTypes: "REWARD_DISTRIBUTED",
        contract: "validatorsVoter",
        gauge,
      })
      const response = await fetch(`/api/activity?${params}`, {
        cache: "no-store",
      })
      if (!response.ok) throw new Error("Unable to load reward history")
      return historyResponseSchema.parse(await response.json())
    },
    getNextPageParam: (page) => (page.hasMore ? page.page + 1 : undefined),
    enabled: enabled && !!gauge,
    ...QUERY_PROFILES.SHORT_CACHE,
  })
  const items = useMemo(
    () => query.data?.pages.flatMap((page) => page.data) ?? [],
    [query.data],
  )
  return { ...query, items }
}

export function useIsValidatorBeneficiary(beneficiary: Address | undefined) {
  const { address } = useAccount()
  return (
    !!address &&
    !!beneficiary &&
    address.toLowerCase() === beneficiary.toLowerCase()
  )
}
