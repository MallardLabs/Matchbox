import { getContractConfig } from "@/config/contracts"
import { QUERY_PROFILES } from "@/config/queryProfiles"
import { useNetwork } from "@/contexts/NetworkContext"
import { useTokenList } from "@/hooks/useTokenList"
import { useMemo } from "react"
import type { Address, Hex } from "viem"
import { erc20Abi, zeroAddress } from "viem"
import {
  useReadContract,
  useReadContracts,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi"

export type PoolIncentive = {
  tokenAddress: Address
  symbol: string
  decimals: number
  amount: bigint
  logoURI?: string
}

export function usePoolBribeAddress(gaugeAddress: Address | undefined): {
  bribeAddress: Address | undefined
  isLoading: boolean
  refetch: () => void
} {
  const { chainId, isNetworkReady } = useNetwork()
  const contracts = getContractConfig(chainId)

  const { data, isLoading, refetch } = useReadContract({
    ...contracts.poolsVoter,
    functionName: "gaugeToBribe",
    args: gaugeAddress ? [gaugeAddress] : undefined,
    query: {
      ...QUERY_PROFILES.SHORT_CACHE,
      enabled: isNetworkReady && !!gaugeAddress,
    },
  })

  const bribeAddress = data as Address | undefined
  const resolved =
    bribeAddress && bribeAddress !== zeroAddress ? bribeAddress : undefined

  return { bribeAddress: resolved, isLoading, refetch: () => void refetch() }
}

export function useIsPoolIncentiveTokenAllowlisted(
  tokenAddress: Address | undefined,
): { isAllowlisted: boolean | undefined; isLoading: boolean } {
  const { chainId, isNetworkReady } = useNetwork()
  const contracts = getContractConfig(chainId)

  const { data, isLoading } = useReadContract({
    ...contracts.poolsVoter,
    functionName: "isWhitelistedToken",
    args: tokenAddress ? [tokenAddress] : undefined,
    query: {
      ...QUERY_PROFILES.SHORT_CACHE,
      enabled: isNetworkReady && !!tokenAddress,
    },
  })

  return { isAllowlisted: data as boolean | undefined, isLoading }
}

export function usePoolBribeIncentives(bribeAddress: Address | undefined): {
  incentives: PoolIncentive[]
  isLoading: boolean
  refetch: () => void
} {
  const { chainId, isNetworkReady } = useNetwork()
  const contracts = getContractConfig(chainId)
  const { tokens } = useTokenList()

  const {
    data: lengthData,
    isLoading: isLoadingLength,
    refetch: refetchLength,
  } = useReadContract({
    address: bribeAddress,
    abi: contracts.bribe.abi,
    chainId,
    functionName: "rewardsListLength",
    query: {
      ...QUERY_PROFILES.SHORT_CACHE,
      enabled: isNetworkReady && !!bribeAddress,
    },
  })

  const length = Number((lengthData as bigint | undefined) ?? 0n)

  const {
    data: tokenAddressesData,
    isLoading: isLoadingAddresses,
    refetch: refetchAddresses,
  } = useReadContracts({
    contracts: Array.from({ length }, (_, i) => ({
      address: bribeAddress,
      abi: contracts.bribe.abi,
      chainId,
      functionName: "rewards" as const,
      args: [BigInt(i)],
    })),
    query: {
      ...QUERY_PROFILES.SHORT_CACHE,
      enabled: isNetworkReady && !!bribeAddress && length > 0,
    },
  })

  const tokenAddresses = useMemo(
    () =>
      (tokenAddressesData ?? [])
        .map((r) => r.result as Address | undefined)
        .filter((a): a is Address => !!a && a !== zeroAddress),
    [tokenAddressesData],
  )

  const {
    data: leftData,
    isLoading: isLoadingLeft,
    refetch: refetchLeft,
  } = useReadContracts({
    contracts: tokenAddresses.map((t) => ({
      address: bribeAddress,
      abi: contracts.bribe.abi,
      chainId,
      functionName: "left" as const,
      args: [t],
    })),
    query: {
      ...QUERY_PROFILES.SHORT_CACHE,
      enabled: isNetworkReady && !!bribeAddress && tokenAddresses.length > 0,
    },
  })

  // For any token we don't have in the known list, fetch symbol/decimals on-chain.
  const unknownTokens = useMemo(
    () =>
      tokenAddresses.filter(
        (addr) => !tokens.some((t) => t.address.toLowerCase() === addr.toLowerCase()),
      ),
    [tokenAddresses, tokens],
  )

  const { data: metaData } = useReadContracts({
    contracts: unknownTokens.flatMap((addr) => [
      {
        address: addr,
        abi: erc20Abi,
        chainId,
        functionName: "symbol" as const,
      },
      {
        address: addr,
        abi: erc20Abi,
        chainId,
        functionName: "decimals" as const,
      },
    ]),
    query: {
      enabled: isNetworkReady && unknownTokens.length > 0,
    },
  })

  const incentives = useMemo<PoolIncentive[]>(() => {
    return tokenAddresses.map((addr, i) => {
      const amount = (leftData?.[i]?.result as bigint | undefined) ?? 0n
      const known = tokens.find(
        (t) => t.address.toLowerCase() === addr.toLowerCase(),
      )
      if (known) {
        return {
          tokenAddress: addr,
          symbol: known.symbol,
          decimals: known.decimals,
          amount,
          ...(known.logoURI ? { logoURI: known.logoURI } : {}),
        }
      }
      const unknownIndex = unknownTokens.findIndex(
        (t) => t.toLowerCase() === addr.toLowerCase(),
      )
      const symbol =
        (metaData?.[unknownIndex * 2]?.result as string | undefined) ??
        `${addr.slice(0, 6)}…`
      const decimals =
        (metaData?.[unknownIndex * 2 + 1]?.result as number | undefined) ?? 18
      return { tokenAddress: addr, symbol, decimals, amount }
    })
  }, [tokenAddresses, leftData, metaData, tokens, unknownTokens])

  return {
    incentives,
    isLoading: isLoadingLength || isLoadingAddresses || isLoadingLeft,
    refetch: () => {
      void refetchLength()
      void refetchAddresses()
      void refetchLeft()
    },
  }
}

export type AddPoolIncentiveResult = {
  addIncentive: (
    bribeAddress: Address,
    tokenAddress: Address,
    amount: bigint,
  ) => void
  hash: Hex | undefined
  isPending: boolean
  isConfirming: boolean
  isSuccess: boolean
  error: Error | null
}

export function useAddPoolIncentive(): AddPoolIncentiveResult {
  const { chainId } = useNetwork()
  const contracts = getContractConfig(chainId)
  const { writeContract, data: hash, isPending, error } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash,
  })

  const addIncentive = (
    bribeAddress: Address,
    tokenAddress: Address,
    amount: bigint,
  ) => {
    if (amount <= 0n) return
    writeContract({
      address: bribeAddress,
      abi: contracts.bribe.abi,
      functionName: "notifyRewardAmount",
      args: [tokenAddress, amount],
    })
  }

  return {
    addIncentive,
    hash,
    isPending,
    isConfirming,
    isSuccess,
    error,
  }
}
