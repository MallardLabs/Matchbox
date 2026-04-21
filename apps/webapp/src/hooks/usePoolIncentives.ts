import { getContractConfig } from "@/config/contracts"
import { QUERY_PROFILES } from "@/config/queryProfiles"
import { useNetwork } from "@/contexts/NetworkContext"
import { useTokenList } from "@/hooks/useTokenList"
import { useCallback, useMemo } from "react"
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

const WEEK_SECONDS = 7 * 24 * 60 * 60
function currentEpochStartSec(nowSec: number): number {
  return Math.floor(nowSec / WEEK_SECONDS) * WEEK_SECONDS
}

export function usePoolBribeIncentives(bribeAddress: Address | undefined): {
  incentives: PoolIncentive[]
  nextEpochIncentives: PoolIncentive[]
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

  // Current-epoch rewards: tokenRewardsPerEpoch(token, currentEpochStart).
  // Velodrome V2 ExternalBribe writes notifyRewardAmount() into
  // tokenRewardsPerEpoch[token][getEpochStart(block.timestamp)]. `left()` on
  // ExternalBribe tracks remaining streaming duration and is NOT the epoch pot.
  const epochStartCurrent = useMemo(
    () => currentEpochStartSec(Math.floor(Date.now() / 1000)),
    [],
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
      functionName: "tokenRewardsPerEpoch" as const,
      args: [t, BigInt(epochStartCurrent)],
    })),
    query: {
      ...QUERY_PROFILES.SHORT_CACHE,
      enabled: isNetworkReady && !!bribeAddress && tokenAddresses.length > 0,
    },
  })

  // Next-epoch rewards: tokenRewardsPerEpoch(token, nextEpochStart).
  const nextEpochStart = useMemo(
    () => epochStartCurrent + WEEK_SECONDS,
    [epochStartCurrent],
  )
  const {
    data: nextEpochData,
    isLoading: isLoadingNext,
    refetch: refetchNext,
  } = useReadContracts({
    contracts: tokenAddresses.map((t) => ({
      address: bribeAddress,
      abi: contracts.bribe.abi,
      chainId,
      functionName: "tokenRewardsPerEpoch" as const,
      args: [t, BigInt(nextEpochStart)],
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
        (addr) =>
          !tokens.some((t) => t.address.toLowerCase() === addr.toLowerCase()),
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

  const buildIncentive = useCallback(
    (addr: Address, amount: bigint): PoolIncentive => {
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
    },
    [tokens, unknownTokens, metaData],
  )

  const incentives = useMemo<PoolIncentive[]>(() => {
    return tokenAddresses.map((addr, i) => {
      const amount = (leftData?.[i]?.result as bigint | undefined) ?? 0n
      return buildIncentive(addr, amount)
    })
  }, [tokenAddresses, leftData, buildIncentive])

  const nextEpochIncentives = useMemo<PoolIncentive[]>(() => {
    return tokenAddresses.map((addr, i) => {
      const amount = (nextEpochData?.[i]?.result as bigint | undefined) ?? 0n
      return buildIncentive(addr, amount)
    })
  }, [tokenAddresses, nextEpochData, buildIncentive])

  return {
    incentives,
    nextEpochIncentives,
    isLoading:
      isLoadingLength || isLoadingAddresses || isLoadingLeft || isLoadingNext,
    refetch: () => {
      void refetchLength()
      void refetchAddresses()
      void refetchLeft()
      void refetchNext()
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
