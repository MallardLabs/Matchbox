import { QUERY_PROFILES } from "@/config/queryProfiles"
import { getContractConfig } from "@/config/contracts"
import { useNetwork } from "@/contexts/NetworkContext"
import { useEffect } from "react"
import {
  useAccount,
  useReadContracts,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi"

type Lock = {
  tokenId: bigint
  amount: bigint
  end: bigint
  isPermanent: boolean
  boost: bigint
  votingPower: bigint
  unboostedVotingPower: bigint
}

type VeMEZOLock = Omit<Lock, "unboostedVotingPower">

type RefetchFn = () => Promise<unknown>

export function useVeBTCLocks() {
  const { address } = useAccount()
  const { chainId, isNetworkReady } = useNetwork()
  const contracts = getContractConfig(chainId)

  const { data: balanceData } = useReadContracts({
    contracts: [
      {
        ...contracts.veBTC,
        functionName: "balanceOf",
        args: address ? [address] : undefined,
      },
    ],
    query: {
      ...QUERY_PROFILES.SHORT_CACHE,
      enabled: isNetworkReady && !!address,
    },
  })

  const balance = balanceData?.[0]?.result as bigint | undefined

  const { data: tokenIds } = useReadContracts({
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
      enabled: isNetworkReady && !!balance && balance > 0n,
    },
  })

  const tokenIdList =
    tokenIds?.map((r) => r.result as bigint).filter(Boolean) ?? []

  const { data: lockData, isLoading } = useReadContracts({
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
    ]),
    query: {
      ...QUERY_PROFILES.SHORT_CACHE,
      enabled: isNetworkReady && tokenIdList.length > 0,
    },
  })

  const locks: Lock[] =
    tokenIdList.map((tokenId, i) => {
      const lockedResult = lockData?.[i * 3]?.result as
        | { amount: bigint; end: bigint; isPermanent: boolean; boost: bigint }
        | undefined
      const votingPower = lockData?.[i * 3 + 1]?.result as bigint | undefined
      const unboostedVotingPower = lockData?.[i * 3 + 2]?.result as
        | bigint
        | undefined

      return {
        tokenId,
        amount: lockedResult?.amount ?? 0n,
        end: lockedResult?.end ?? 0n,
        isPermanent: lockedResult?.isPermanent ?? false,
        boost: lockedResult?.boost ?? 0n,
        votingPower: votingPower ?? 0n,
        unboostedVotingPower: unboostedVotingPower ?? 0n,
      }
    }) ?? []

  return {
    locks,
    isLoading,
  }
}

export function useVeMEZOLocks(): {
  locks: VeMEZOLock[]
  isLoading: boolean
  refetch: RefetchFn
} {
  const { address } = useAccount()
  const { chainId, isNetworkReady } = useNetwork()
  const contracts = getContractConfig(chainId)

  const { data: balanceData } = useReadContracts({
    contracts: [
      {
        ...contracts.veMEZO,
        functionName: "balanceOf",
        args: address ? [address] : undefined,
      },
    ],
    query: {
      ...QUERY_PROFILES.SHORT_CACHE,
      enabled: isNetworkReady && !!address,
    },
  })

  const balance = balanceData?.[0]?.result as bigint | undefined

  const { data: tokenIds } = useReadContracts({
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
      enabled: isNetworkReady && !!balance && balance > 0n,
    },
  })

  const tokenIdList =
    tokenIds?.map((r) => r.result as bigint).filter(Boolean) ?? []

  const {
    data: lockData,
    isLoading,
    refetch,
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
      enabled: isNetworkReady && tokenIdList.length > 0,
    },
  })

  const locks: VeMEZOLock[] =
    tokenIdList.map((tokenId, i) => {
      const lockedResult = lockData?.[i * 2]?.result as
        | { amount: bigint; end: bigint; isPermanent: boolean; boost: bigint }
        | undefined
      const votingPower = lockData?.[i * 2 + 1]?.result as bigint | undefined

      return {
        tokenId,
        amount: lockedResult?.amount ?? 0n,
        end: lockedResult?.end ?? 0n,
        isPermanent: lockedResult?.isPermanent ?? false,
        boost: lockedResult?.boost ?? 0n,
        votingPower: votingPower ?? 0n,
      }
    }) ?? []

  return {
    locks,
    isLoading,
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
    isPending,
    error,
    reset,
  } = useWriteContract()

  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash,
  })

  const approve = (amount: bigint) => {
    if (!contracts.veMEZO.address) return
    writeContract({
      ...contracts.mezoToken,
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
    isPending,
    error,
    reset,
  } = useWriteContract()

  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash,
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
