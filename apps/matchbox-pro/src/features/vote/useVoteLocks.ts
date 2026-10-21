import { useEpoch } from "@/hooks/useEpoch"
import { useVeBTCLocks, useVeMEZOLocks } from "@/hooks/useLocks"
import { getContractConfig } from "@/lib/contracts"
import { useNetwork } from "@/lib/network"
import { QUERY_PROFILES } from "@/lib/queryProfiles"
import { useEffect, useMemo, useState } from "react"
import { type Address, getAddress, isAddress, zeroAddress } from "viem"
import { useReadContracts } from "wagmi"
import { ESCROW_EXTRA_ABI, VOTE_LIST_SCAN, voterConfig } from "./contracts"
import { type VotingWindow, toVoteLock, votingWindow } from "./locks"
import type { VoteLock, VoteType } from "./model"

function nowSeconds(): bigint {
  return BigInt(Math.floor(Date.now() / 1000))
}

/** Wall clock in seconds, refreshed every 30s so window and countdown labels move. */
function useNowSeconds(): bigint {
  const [now, setNow] = useState(nowSeconds)
  useEffect(() => {
    const id = window.setInterval(() => setNow(nowSeconds()), 30_000)
    return () => window.clearInterval(id)
  }, [])
  return now
}

/**
 * The viewer's locks for one branch (veMEZO for boost voting, veBTC for
 * validators and pools) with per-branch eligibility: each voter keeps its own
 * once-per-epoch `lastVoted`.
 */
export function useVoteLocks(type: VoteType): {
  locks: VoteLock[]
  isLoading: boolean
  hasError: boolean
  window: VotingWindow
} {
  const { chainId } = useNetwork()
  const voter = voterConfig(chainId, type)
  const veMezo = useVeMEZOLocks()
  const veBtc = useVeBTCLocks()
  const source = type === "vemezo" ? veMezo : veBtc
  const escrow =
    getContractConfig(chainId)[type === "vemezo" ? "veMEZO" : "veBTC"]
  const { epochStart, epochNext } = useEpoch()
  const now = useNowSeconds()

  const tokenIds = useMemo(
    () => source.locks.map((lock) => lock.tokenId),
    [source.locks],
  )
  const powerless = useMemo(
    () =>
      source.locks.flatMap((lock) =>
        lock.votingPower === 0n ? [lock.tokenId] : [],
      ),
    [source.locks],
  )

  const lastVotedRead = useReadContracts({
    contracts: tokenIds.map((tokenId) => ({
      ...voter,
      functionName: "lastVoted" as const,
      args: [tokenId] as const,
    })),
    query: { ...QUERY_PROFILES.SHORT_CACHE, enabled: tokenIds.length > 0 },
  })
  // A lock deposited into a managed NFT reads 0 power but is not expired.
  const managedRead = useReadContracts({
    contracts: powerless.map((tokenId) => ({
      address: escrow.address,
      abi: ESCROW_EXTRA_ABI,
      chainId,
      functionName: "idToManaged" as const,
      args: [tokenId] as const,
    })),
    query: { ...QUERY_PROFILES.LONG_CACHE, enabled: powerless.length > 0 },
  })

  const locks = useMemo(() => {
    const managed = new Map(
      powerless.map((tokenId, index) => {
        const value = managedRead.data?.[index]?.result
        return [tokenId, typeof value === "bigint" ? value : 0n] as const
      }),
    )
    return source.locks
      .map((lock, index) => {
        const lastVoted = lastVotedRead.data?.[index]?.result
        return toVoteLock(
          {
            tokenId: lock.tokenId,
            votingPower: lock.votingPower,
            end: lock.end,
            isPermanent: lock.isPermanent,
            managedBy: managed.get(lock.tokenId) ?? 0n,
            lastVoted: typeof lastVoted === "bigint" ? lastVoted : undefined,
          },
          epochStart,
          now,
          epochNext,
        )
      })
      .sort((a, b) => {
        const rank = (lock: VoteLock): number =>
          lock.state === "votable" ? 0 : lock.state === "voted" ? 1 : 2
        if (rank(a) !== rank(b)) return rank(a) - rank(b)
        if (a.votingPower !== b.votingPower)
          return a.votingPower > b.votingPower ? -1 : 1
        return a.tokenId < b.tokenId ? -1 : 1
      })
  }, [
    epochNext,
    epochStart,
    lastVotedRead.data,
    managedRead.data,
    now,
    powerless,
    source.locks,
  ])

  return {
    locks,
    isLoading: source.isLoading || lastVotedRead.isLoading,
    hasError: source.error !== null,
    window: votingWindow(epochStart, epochNext, now),
  }
}

function asAddress(value: unknown): Address | undefined {
  if (typeof value !== "string" || !isAddress(value, { strict: false }))
    return undefined
  const address = getAddress(value)
  return address === zeroAddress ? undefined : address
}

/**
 * Standing votes of the given locks on this branch's voter. A new `vote()`
 * replaces them, so the optimizer must not treat them as competition.
 */
export function useOwnVotes(
  type: VoteType,
  tokenIds: readonly bigint[],
): { ownWeights: Map<string, bigint>; isLoading: boolean } {
  const { chainId } = useNetwork()
  const voter = voterConfig(chainId, type)

  const usedRead = useReadContracts({
    contracts: tokenIds.map((tokenId) => ({
      ...voter,
      functionName: "usedWeights" as const,
      args: [tokenId] as const,
    })),
    query: { ...QUERY_PROFILES.SHORT_CACHE, enabled: tokenIds.length > 0 },
  })
  const voting = useMemo(
    () =>
      tokenIds.filter((_, index) => {
        const used = usedRead.data?.[index]?.result
        return typeof used === "bigint" && used > 0n
      }),
    [tokenIds, usedRead.data],
  )

  // The list getters revert past the end; scan up to the 30-target cap.
  const listRead = useReadContracts({
    contracts: voting.flatMap((tokenId) =>
      Array.from({ length: VOTE_LIST_SCAN }, (_, index) => ({
        ...voter,
        functionName: voter.listFunction,
        args: [tokenId, BigInt(index)] as const,
      })),
    ),
    query: { ...QUERY_PROFILES.SHORT_CACHE, enabled: voting.length > 0 },
  })
  const pairs = useMemo(
    () =>
      voting.flatMap((tokenId, lockIndex) =>
        Array.from({ length: VOTE_LIST_SCAN }, (_, index) =>
          asAddress(
            listRead.data?.[lockIndex * VOTE_LIST_SCAN + index]?.result,
          ),
        ).flatMap((target) => (target ? [{ tokenId, target }] : [])),
      ),
    [listRead.data, voting],
  )

  const votesRead = useReadContracts({
    contracts: pairs.map((pair) => ({
      ...voter,
      functionName: "votes" as const,
      args: [pair.tokenId, pair.target] as const,
    })),
    query: { ...QUERY_PROFILES.SHORT_CACHE, enabled: pairs.length > 0 },
  })

  const ownWeights = useMemo(() => {
    const map = new Map<string, bigint>()
    pairs.forEach((pair, index) => {
      const weight = votesRead.data?.[index]?.result
      if (typeof weight !== "bigint" || weight === 0n) return
      const key = pair.target.toLowerCase()
      map.set(key, (map.get(key) ?? 0n) + weight)
    })
    return map
  }, [pairs, votesRead.data])

  return {
    ownWeights,
    isLoading: usedRead.isLoading || listRead.isLoading || votesRead.isLoading,
  }
}
