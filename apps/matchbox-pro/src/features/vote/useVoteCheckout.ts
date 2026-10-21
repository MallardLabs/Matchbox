import { useSequentialWrites } from "@/hooks/useWrites"
import {
  type CarouselState,
  createCarousel,
  isAllDone,
  markConfirmed,
  markFailed,
  retryItem,
} from "@/lib/carousel"
import { useNetwork } from "@/lib/network"
import { createSafeTransactionBuilderFile } from "@/lib/safeJson"
import { useQueryClient } from "@tanstack/react-query"
import { useCallback, useMemo, useRef, useState } from "react"
import { type Address, encodeFunctionData, getAddress } from "viem"
import { usePublicClient } from "wagmi"
import type { BallotEntry } from "./ballot"
import { VOTER_ABI, voterConfig } from "./contracts"
import type { VoteType, VoteTypeMeta } from "./model"

const REJECTED_MESSAGE = "Signature rejected in your wallet."
const REFRESH_TIMEOUT_MS = 20_000

// What the ballot projection reads: chain state (wagmi), the incentive
// topology, prices and target names. Other pages' queries are left alone.
const REFRESHED_QUERIES = new Set([
  "readContract",
  "readContracts",
  "gauge-topology",
  "btc-price",
  "mezo-price",
  "gauge-profiles",
  "validator-profiles",
])

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error("timeout")), ms)
    promise.then(
      (value) => {
        window.clearTimeout(timer)
        resolve(value)
      },
      (error: unknown) => {
        window.clearTimeout(timer)
        reject(error)
      },
    )
  })
}

export type RefreshState = "idle" | "refreshing" | "done" | "failed"

export type CheckoutLock = { tokenId: bigint; votingPower: bigint }

export type VoteCheckout = {
  open: boolean
  refresh: RefreshState
  /** Increments after every completed pre-sign refresh. */
  refreshToken: number
  blockNumber: bigint | null
  carousel: CarouselState
  started: boolean
  done: boolean
  busy: boolean
  openReview: () => void
  close: () => void
  sign: (
    locks: readonly CheckoutLock[],
    entries: readonly BallotEntry[],
  ) => void
  retry: (id: string) => void
  safeJson: (
    account: Address,
    locks: readonly CheckoutLock[],
    entries: readonly BallotEntry[],
  ) => string | null
}

function voteArgs(
  tokenId: bigint,
  entries: readonly BallotEntry[],
): readonly [bigint, Address[], bigint[]] {
  return [
    tokenId,
    entries.map((entry) => getAddress(entry.id)),
    entries.map((entry) => BigInt(entry.bps)),
  ] as const
}

function friendlyError(message: string): string {
  return message === REJECTED_MESSAGE ? "Rejected. Ballot unchanged." : message
}

/**
 * Review → refresh → sign. Opening only reviews; nothing reaches the wallet
 * until `sign` runs from an explicit press. One `vote()` per selected lock,
 * bundled when the wallet supports EIP-5792.
 */
export function useVoteCheckout(
  type: VoteType,
  meta: VoteTypeMeta,
): VoteCheckout {
  const { chainId } = useNetwork()
  const voter = voterConfig(chainId, type)
  const writes = useSequentialWrites()
  const queryClient = useQueryClient()
  const publicClient = usePublicClient({ chainId })
  const [open, setOpen] = useState(false)
  const [refresh, setRefresh] = useState<RefreshState>("idle")
  const [refreshToken, setRefreshToken] = useState(0)
  const [blockNumber, setBlockNumber] = useState<bigint | null>(null)
  const [carousel, setCarousel] = useState<CarouselState>({ items: [] })
  const session = useRef(0)

  const runRefresh = useCallback(async () => {
    const id = ++session.current
    setRefresh("refreshing")
    try {
      const [, block] = await withTimeout(
        Promise.all([
          queryClient.refetchQueries({
            type: "active",
            predicate: (query) =>
              REFRESHED_QUERIES.has(String(query.queryKey[0])),
          }),
          publicClient ? publicClient.getBlockNumber() : null,
        ]),
        REFRESH_TIMEOUT_MS,
      )
      if (id !== session.current) return
      setBlockNumber(block)
      setRefresh("done")
      setRefreshToken((value) => value + 1)
    } catch {
      if (id === session.current) setRefresh("failed")
    }
  }, [publicClient, queryClient])

  const openReview = useCallback(() => {
    setCarousel({ items: [] })
    setOpen(true)
    void runRefresh()
  }, [runRefresh])

  const close = useCallback(() => {
    session.current++
    setOpen(false)
    setRefresh("idle")
  }, [])

  const sign = useCallback(
    (locks: readonly CheckoutLock[], entries: readonly BallotEntry[]) => {
      if (locks.length === 0 || entries.length === 0 || writes.busy) return
      setCarousel(
        createCarousel(
          locks.map((lock) => ({
            id: lock.tokenId.toString(),
            label: meta.stepLabel(lock.tokenId),
          })),
        ),
      )
      void writes
        .run(
          locks.map((lock) => {
            const args = voteArgs(lock.tokenId, entries)
            return {
              id: lock.tokenId.toString(),
              call: {
                to: voter.address,
                data: encodeFunctionData({
                  abi: VOTER_ABI,
                  functionName: "vote",
                  args,
                }),
              },
              write: () =>
                writes.writeContractAsync({
                  address: voter.address,
                  abi: VOTER_ABI,
                  chainId: voter.chainId,
                  functionName: "vote",
                  args,
                }),
            }
          }),
          (id, status, error) => {
            setCarousel((previous) => {
              if (status === "done") return markConfirmed(previous, id)
              if (status === "failed")
                return markFailed(
                  previous,
                  id,
                  friendlyError(error ?? "Failed"),
                )
              return previous
            })
          },
        )
        .then(() => queryClient.invalidateQueries())
    },
    [meta, queryClient, voter.address, voter.chainId, writes],
  )

  const retry = useCallback(
    (id: string) => {
      setCarousel((previous) => retryItem(previous, id))
      void writes.retry(id).then(() => queryClient.invalidateQueries())
    },
    [queryClient, writes],
  )

  const safeJson = useCallback(
    (
      account: Address,
      locks: readonly CheckoutLock[],
      entries: readonly BallotEntry[],
    ): string | null => {
      if (locks.length < 2 || entries.length === 0) return null
      return JSON.stringify(
        createSafeTransactionBuilderFile({
          chainId: voter.chainId,
          // The Safe that will execute the batch is the connected account.
          safeAddress: account,
          name: `Matchbox vote ${locks.length} locks`,
          description: `Matchbox Pro ${meta.title}`,
          calls: locks.map((lock) => ({
            to: voter.address,
            value: 0n,
            data: encodeFunctionData({
              abi: VOTER_ABI,
              functionName: "vote",
              args: voteArgs(lock.tokenId, entries),
            }),
          })),
        }),
        null,
        2,
      )
    },
    [meta.title, voter.address, voter.chainId],
  )

  const started = carousel.items.length > 0
  const done = useMemo(() => isAllDone(carousel), [carousel])

  return {
    open,
    refresh,
    refreshToken,
    blockNumber,
    carousel,
    started,
    done,
    busy: writes.busy,
    openReview,
    close,
    sign,
    retry,
    safeJson,
  }
}
