import { getContractConfig } from "@/config/contracts"
import { useNetwork } from "@/contexts/NetworkContext"
import { useCallback, useRef, useState } from "react"
import type { Address, Hex } from "viem"
import { usePublicClient, useWriteContract } from "wagmi"

export type LockTxStatus =
  | "pending"
  | "signing"
  | "confirming"
  | "success"
  | "error"
  | "skipped"

export type LockTxState = {
  tokenId: bigint
  status: LockTxStatus
  hash?: Hex
  error?: Error
}

type MultiLockVoteStatus = "idle" | "voting" | "done"

type UseMultiLockVotingReturn = {
  voteAll: (
    tokenIds: bigint[],
    gaugeAddresses: Address[],
    weights: bigint[],
  ) => void
  resetAll: (tokenIds: bigint[]) => void
  abort: () => void
  lockStates: LockTxState[]
  currentIndex: number
  totalLocks: number
  successCount: number
  errorCount: number
  isInProgress: boolean
  isDone: boolean
  hasErrors: boolean
  clear: () => void
}

export function useMultiLockVoting(): UseMultiLockVotingReturn {
  const { chainId } = useNetwork()
  const contracts = getContractConfig(chainId)
  const publicClient = usePublicClient({ chainId })
  const { writeContractAsync } = useWriteContract()

  const [status, setStatus] = useState<MultiLockVoteStatus>("idle")
  const [lockStates, setLockStates] = useState<LockTxState[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const abortRef = useRef(false)

  const updateLockState = useCallback(
    (index: number, update: Partial<LockTxState>) => {
      setLockStates((prev) => {
        const next = [...prev]
        const existing = next[index]
        if (existing) {
          next[index] = { ...existing, ...update }
        }
        return next
      })
    },
    [],
  )

  const executeSequential = useCallback(
    async (
      tokenIds: bigint[],
      executeFn: (tokenId: bigint) => Promise<Hex>,
    ) => {
      abortRef.current = false
      const initial: LockTxState[] = tokenIds.map((tokenId) => ({
        tokenId,
        status: "pending" as const,
      }))
      setLockStates(initial)
      setCurrentIndex(0)
      setStatus("voting")

      for (let i = 0; i < tokenIds.length; i++) {
        if (abortRef.current) {
          // Mark remaining as skipped
          for (let j = i; j < tokenIds.length; j++) {
            updateLockState(j, { status: "skipped" })
          }
          break
        }

        setCurrentIndex(i)
        updateLockState(i, { status: "signing" })

        const tokenId = tokenIds[i]
        if (tokenId === undefined) continue

        try {
          const hash = await executeFn(tokenId)
          updateLockState(i, { status: "confirming", hash })

          if (publicClient) {
            await publicClient.waitForTransactionReceipt({ hash })
          }
          updateLockState(i, { status: "success", hash })
        } catch (err) {
          updateLockState(i, {
            status: "error",
            error: err instanceof Error ? err : new Error(String(err)),
          })
          // Continue to next lock
        }
      }

      setStatus("done")
    },
    [publicClient, updateLockState],
  )

  const voteAll = useCallback(
    (tokenIds: bigint[], gaugeAddresses: Address[], weights: bigint[]) => {
      const { address, abi } = contracts.boostVoter
      if (!address) return

      executeSequential(tokenIds, async (tokenId) => {
        return writeContractAsync({
          address,
          abi,
          functionName: "vote",
          args: [tokenId, gaugeAddresses, weights],
        })
      })
    },
    [contracts.boostVoter, executeSequential, writeContractAsync],
  )

  const resetAll = useCallback(
    (tokenIds: bigint[]) => {
      const { address, abi } = contracts.boostVoter
      if (!address) return

      executeSequential(tokenIds, async (tokenId) => {
        return writeContractAsync({
          address,
          abi,
          functionName: "reset",
          args: [tokenId],
        })
      })
    },
    [contracts.boostVoter, executeSequential, writeContractAsync],
  )

  const abort = useCallback(() => {
    abortRef.current = true
  }, [])

  const clear = useCallback(() => {
    setStatus("idle")
    setLockStates([])
    setCurrentIndex(0)
    abortRef.current = false
  }, [])

  const successCount = lockStates.filter((s) => s.status === "success").length
  const errorCount = lockStates.filter((s) => s.status === "error").length

  return {
    voteAll,
    resetAll,
    abort,
    lockStates,
    currentIndex,
    totalLocks: lockStates.length,
    successCount,
    errorCount,
    isInProgress: status === "voting",
    isDone: status === "done",
    hasErrors: errorCount > 0,
    clear,
  }
}

export default useMultiLockVoting
