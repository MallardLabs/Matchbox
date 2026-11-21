import { getContractConfig } from "@/config/contracts"
import { QUERY_PROFILES } from "@/config/queryProfiles"
import { useNetwork } from "@/contexts/NetworkContext"
import { useGatedWriteContract } from "@/hooks/useGatedWalletWrites"
import {
  hasFailedRead,
  lockReadRefetchInterval,
  toLockReadFields,
} from "@/utils/lockReads"
import { useCallback, useEffect } from "react"
import {
  useAccount,
  useReadContracts,
  useWaitForTransactionReceipt,
} from "wagmi"

type Lock = {
  tokenId: bigint
  managedTokenId: bigint | undefined
  amount: bigint
  end: bigint
  isPermanent: boolean
  boost: bigint
  votingPower: bigint
  unboostedVotingPower: bigint
  /** False when the lock reads failed or are pending: show it as unavailable. */
  hasLockData: boolean
}

type VeMEZOLock = Omit<Lock, "managedTokenId" | "unboostedVotingPower">

type RefetchFn = () => Promise<unknown>

type ReadResults = readonly ({ status: string } | undefined)[] | undefined

/**
 * A failed `balanceOf` or `ownerToNFTokenIdList` read drops locks from the list
 * without a trace, so the page would say "no locks" or show a short total.
 */
function isLockListUnavailable({
  isBalanceError,
  balanceData,
  isTokenIdsError,
  tokenIds,
}: {
  isBalanceError: boolean
  balanceData: ReadResults
  isTokenIdsError: boolean
  tokenIds: ReadResults
}): boolean {
  return (
    isBalanceError ||
    hasFailedRead(balanceData) ||
    isTokenIdsError ||
    hasFailedRead(tokenIds)
  )
}

export function useVeBTCLocks() {
  const { address } = useAccount()
  const { chainId, isNetworkReady } = useNetwork()
  const contracts = getContractConfig(chainId)

  const {
    data: balanceData,
    isError: isBalanceError,
    refetch: refetchBalance,
  } = useReadContracts({
    contracts: [
      {
        ...contracts.veBTC,
        functionName: "balanceOf",
        args: address ? [address] : undefined,
      },
    ],
    query: {
      ...QUERY_PROFILES.SHORT_CACHE,
      refetchInterval: (query) => lockReadRefetchInterval(query.state),
      enabled: isNetworkReady && !!address,
    },
  })

  const balance = balanceData?.[0]?.result as bigint | undefined

  const {
    data: tokenIds,
    isError: isTokenIdsError,
    refetch: refetchTokenIds,
  } = useReadContracts({
    contracts:
      balance !== undefined && address
        ? Array.from({ length: Number(balance) }, (_, i) => ({
            ...contracts.veBTC,
            functionName: "ownerToNFTokenIdList",
            args: [address, BigInt(i)],
          }))
        : [],
    query: {
      ...QUERY_PROFILES.SHORT_CACHE,
      refetchInterval: (query) => lockReadRefetchInterval(query.state),
      enabled: isNetworkReady && !!balance && balance > 0n,
    },
  })

  const tokenIdList =
    tokenIds?.map((r) => r.result as bigint).filter((id) => id !== undefined) ??
    []

  const {
    data: lockData,
    isLoading,
    refetch: refetchLockData,
  } = useReadContracts({
    contracts: tokenIdList.flatMap((tokenId) => [
      {
        ...contracts.veBTC,
        functionName: "locked",
        args: [tokenId],
      },
      {
        ...contracts.veBTC,
        functionName: "votingPowerOfNFT",
        args: [tokenId],
      },
      {
        ...contracts.veBTC,
        functionName: "unboostedVotingPowerOfNFT",
        args: [tokenId],
      },
      {
        ...contracts.veBTC,
        functionName: "idToManaged",
        args: [tokenId],
      },
    ]),
    query: {
      ...QUERY_PROFILES.SHORT_CACHE,
      refetchInterval: (query) => lockReadRefetchInterval(query.state),
      enabled: isNetworkReady && tokenIdList.length > 0,
    },
  })

  const locks: Lock[] =
    tokenIdList.map((tokenId, i) => {
      const lockFields = toLockReadFields(
        lockData?.[i * 4],
        lockData?.[i * 4 + 1],
      )
      const unboostedVotingPower = lockData?.[i * 4 + 2]?.result as
        | bigint
        | undefined
      const managedTokenIdResult = lockData?.[i * 4 + 3]?.result as
        | bigint
        | undefined

      return {
        tokenId,
        managedTokenId:
          managedTokenIdResult && managedTokenIdResult > 0n
            ? managedTokenIdResult
            : undefined,
        ...lockFields,
        unboostedVotingPower: unboostedVotingPower ?? 0n,
      }
    }) ?? []

  const lockListUnavailable = isLockListUnavailable({
    isBalanceError,
    balanceData,
    isTokenIdsError,
    tokenIds,
  })
  const refetch = useCallback(
    () => Promise.all([refetchBalance(), refetchTokenIds(), refetchLockData()]),
    [refetchBalance, refetchTokenIds, refetchLockData],
  )

  return {
    locks,
    isLoading,
    lockListUnavailable,
    refetch,
  }
}

export function useVeMEZOLocks(): {
  locks: VeMEZOLock[]
  isLoading: boolean
  /** True when the lock count or a token id read failed: the list may be short. */
  lockListUnavailable: boolean
  refetch: RefetchFn
} {
  const { address } = useAccount()
  const { chainId, isNetworkReady } = useNetwork()
  const contracts = getContractConfig(chainId)

  const {
    data: balanceData,
    isError: isBalanceError,
    refetch: refetchBalance,
  } = useReadContracts({
    contracts: [
      {
        ...contracts.veMEZO,
        functionName: "balanceOf",
        args: address ? [address] : undefined,
      },
    ],
    query: {
      ...QUERY_PROFILES.SHORT_CACHE,
      refetchInterval: (query) => lockReadRefetchInterval(query.state),
      enabled: isNetworkReady && !!address,
    },
  })

  const balance = balanceData?.[0]?.result as bigint | undefined

  const {
    data: tokenIds,
    isError: isTokenIdsError,
    refetch: refetchTokenIds,
  } = useReadContracts({
    contracts:
      balance !== undefined && address
        ? Array.from({ length: Number(balance) }, (_, i) => ({
            ...contracts.veMEZO,
            functionName: "ownerToNFTokenIdList",
            args: [address, BigInt(i)],
          }))
        : [],
    query: {
      ...QUERY_PROFILES.SHORT_CACHE,
      refetchInterval: (query) => lockReadRefetchInterval(query.state),
      enabled: isNetworkReady && !!balance && balance > 0n,
    },
  })

  const tokenIdList =
    tokenIds?.map((r) => r.result as bigint).filter((id) => id !== undefined) ??
    []

  const {
    data: lockData,
    isLoading,
    refetch: refetchLockData,
  } = useReadContracts({
    contracts: tokenIdList.flatMap((tokenId) => [
      {
        ...contracts.veMEZO,
        functionName: "locked",
        args: [tokenId],
      },
      {
        ...contracts.veMEZO,
        functionName: "votingPowerOfNFT",
        args: [tokenId],
      },
    ]),
    query: {
      ...QUERY_PROFILES.SHORT_CACHE,
      refetchInterval: (query) => lockReadRefetchInterval(query.state),
      enabled: isNetworkReady && tokenIdList.length > 0,
    },
  })

  const locks: VeMEZOLock[] =
    tokenIdList.map((tokenId, i) => {
      return {
        tokenId,
        ...toLockReadFields(lockData?.[i * 2], lockData?.[i * 2 + 1]),
      }
    }) ?? []

  const lockListUnavailable = isLockListUnavailable({
    isBalanceError,
    balanceData,
    isTokenIdsError,
    tokenIds,
  })
  const refetch = useCallback(
    () => Promise.all([refetchBalance(), refetchTokenIds(), refetchLockData()]),
    [refetchBalance, refetchTokenIds, refetchLockData],
  )

  return {
    locks,
    isLoading,
    lockListUnavailable,
    refetch,
  }
}

export function useMEZOBalance(): {
  balance: bigint | undefined
  allowance: bigint | undefined
  refetch: RefetchFn
} {
  const { address } = useAccount()
  const { chainId, isNetworkReady } = useNetwork()
  const contracts = getContractConfig(chainId)

  const { data, refetch } = useReadContracts({
    contracts: [
      {
        ...contracts.mezoToken,
        functionName: "balanceOf",
        args: address ? [address] : undefined,
      },
      {
        ...contracts.mezoToken,
        functionName: "allowance",
        args:
          address && contracts.veMEZO.address
            ? [address, contracts.veMEZO.address]
            : undefined,
      },
    ],
    query: {
      ...QUERY_PROFILES.SHORT_CACHE,
      enabled: isNetworkReady && !!address,
    },
  })

  return {
    balance: data?.[0]?.result as bigint | undefined,
    allowance: data?.[1]?.result as bigint | undefined,
    refetch,
  }
}

export function useApproveMEZO(): {
  approve: (amount: bigint) => void
  hash: `0x${string}` | undefined
  isPending: boolean
  isConfirming: boolean
  isSuccess: boolean
  error: Error | null
  reset: () => void
} {
  const { chainId } = useNetwork()
  const contracts = getContractConfig(chainId)

  const {
    writeContract,
    data: hash,
    variables,
    isPending,
    error,
    reset,
  } = useGatedWriteContract()

  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash,
    chainId: variables?.chainId ?? chainId,
  })

  const approve = (amount: bigint) => {
    if (!contracts.veMEZO.address) return
    writeContract({
      ...contracts.mezoToken,
      chainId,
      functionName: "approve",
      args: [contracts.veMEZO.address, amount],
    })
  }

  return {
    approve,
    hash,
    isPending,
    isConfirming,
    isSuccess,
    error,
    reset,
  }
}

// Lock duration options for veMEZO (in seconds)
export const LOCK_DURATION_OPTIONS = [
  { label: "1 Year", value: 365 * 24 * 60 * 60 },
  { label: "2 Years", value: 2 * 365 * 24 * 60 * 60 },
  { label: "3 Years", value: 3 * 365 * 24 * 60 * 60 },
  { label: "4 Years", value: 4 * 365 * 24 * 60 * 60 },
] as const

export function useCreateVeMEZOLock(): {
  createLock: (amount: bigint, lockDuration: number) => void
  hash: `0x${string}` | undefined
  isPending: boolean
  isConfirming: boolean
  isSuccess: boolean
  error: Error | null
  reset: () => void
} {
  const { chainId } = useNetwork()
  const contracts = getContractConfig(chainId)
  const { refetch: refetchBalance } = useMEZOBalance()

  const {
    writeContract,
    data: hash,
    variables,
    isPending,
    error,
    reset,
  } = useGatedWriteContract()

  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash,
    chainId: variables?.chainId ?? chainId,
  })

  useEffect(() => {
    if (isSuccess) {
      refetchBalance()
    }
  }, [isSuccess, refetchBalance])

  const createLock = (amount: bigint, lockDuration: number) => {
    const veMEZOAddress = contracts.veMEZO.address
    if (!veMEZOAddress) return
    writeContract({
      address: veMEZOAddress,
      abi: contracts.veMEZO.abi,
      chainId,
      functionName: "createLock",
      args: [amount, BigInt(lockDuration)],
    })
  }

  return {
    createLock,
    hash,
    isPending,
    isConfirming,
    isSuccess,
    error,
    reset,
  }
}
