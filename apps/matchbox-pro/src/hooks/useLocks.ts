import { getContractConfig } from "@/lib/contracts"
import { useNetwork } from "@/lib/network"
import { QUERY_PROFILES } from "@/lib/queryProfiles"
import { useMemo } from "react"
import { useAccount, useReadContract, useReadContracts } from "wagmi"

export type VeMEZOLock = {
  tokenId: bigint
  amount: bigint
  end: bigint
  isPermanent: boolean
  votingPower: bigint
}

export type VeBTCLock = VeMEZOLock & {
  unboostedVotingPower: bigint
}

type LockedResult = { amount: bigint; end: bigint; isPermanent: boolean }

// Both escrows share one ABI; veBTC additionally reads unboosted power.
function useEscrowLocks(kind: "veMEZO" | "veBTC") {
  const { address } = useAccount()
  const { chainId } = useNetwork()
  const escrow = getContractConfig(chainId)[kind]
  const readsPerLock = kind === "veBTC" ? 3 : 2

  const balanceRead = useReadContract({
    ...escrow,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { ...QUERY_PROFILES.SHORT_CACHE, enabled: !!address },
  })
  const balance = balanceRead.data

  const tokenIdsRead = useReadContracts({
    contracts:
      balance !== undefined && address
        ? Array.from({ length: Number(balance) }, (_, i) => ({
            ...escrow,
            functionName: "ownerToNFTokenIdList" as const,
            args: [address, BigInt(i)] as const,
          }))
        : [],
    query: {
      ...QUERY_PROFILES.SHORT_CACHE,
      enabled: !!balance && balance > 0n,
    },
  })

  // wagmi keeps `data` referentially stable between refetches, so memoizing
  // on it keeps `locks` stable for consumers' own memos.
  const tokenIdList = useMemo(
    () =>
      tokenIdsRead.data?.flatMap((row) =>
        typeof row.result === "bigint" ? [row.result] : [],
      ) ?? [],
    [tokenIdsRead.data],
  )

  const lockRead = useReadContracts({
    contracts: tokenIdList.flatMap((tokenId) => [
      { ...escrow, functionName: "locked" as const, args: [tokenId] as const },
      {
        ...escrow,
        functionName: "votingPowerOfNFT" as const,
        args: [tokenId] as const,
      },
      ...(kind === "veBTC"
        ? [
            {
              ...escrow,
              functionName: "unboostedVotingPowerOfNFT" as const,
              args: [tokenId] as const,
            },
          ]
        : []),
    ]),
    query: {
      ...QUERY_PROFILES.SHORT_CACHE,
      enabled: tokenIdList.length > 0,
    },
  })
  const lockData = lockRead.data

  const locks: VeBTCLock[] = useMemo(
    () =>
      tokenIdList.map((tokenId, i) => {
        const offset = i * readsPerLock
        const locked = lockData?.[offset]?.result as LockedResult | undefined
        return {
          tokenId,
          amount: locked?.amount ?? 0n,
          end: locked?.end ?? 0n,
          isPermanent: locked?.isPermanent ?? false,
          votingPower:
            (lockData?.[offset + 1]?.result as bigint | undefined) ?? 0n,
          unboostedVotingPower:
            (lockData?.[offset + 2]?.result as bigint | undefined) ?? 0n,
        }
      }),
    [lockData, readsPerLock, tokenIdList],
  )

  const isLoading =
    !!address &&
    (balanceRead.isLoading ||
      (balance !== undefined &&
        balance > 0n &&
        (tokenIdsRead.isLoading || lockRead.isLoading)))
  const error =
    balanceRead.error ??
    tokenIdsRead.error ??
    lockRead.error ??
    ([...(tokenIdsRead.data ?? []), ...(lockData ?? [])].some(
      (row) => row.status === "failure",
    )
      ? new Error("Some locks could not be read. Refresh to try again.")
      : null)

  return {
    locks,
    isLoading,
    error,
    refetch: async () => {
      await balanceRead.refetch()
      await tokenIdsRead.refetch()
      await lockRead.refetch()
    },
  }
}

export function useVeMEZOLocks(): Omit<
  ReturnType<typeof useEscrowLocks>,
  "locks"
> & { locks: VeMEZOLock[] } {
  return useEscrowLocks("veMEZO")
}

export function useVeBTCLocks() {
  return useEscrowLocks("veBTC")
}
