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

export type MultiLockExecutionResult = {
  totalLocks: number
  successCount: number
  errorCount: number
  skippedCount: number
  hasErrors: boolean
}

type UseMultiLockVotingReturn = {
  voteAll: (
    tokenIds: bigint[],
    gaugeAddresses: Address[],
    weights: bigint[],
  ) => Promise<MultiLockExecutionResult>
  resetAll: (tokenIds: bigint[]) => Promise<MultiLockExecutionResult>
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
  const lockStatesRef = useRef<LockTxState[]>([])

  const buildExecutionResult = useCallback((states: LockTxState[]) => {
    const successCount = states.filter((s) => s.status === "success").length
    const errorCount = states.filter((s) => s.status === "error").length
    const skippedCount = states.filter((s) => s.status === "skipped").length

    return {
      totalLocks: states.length,
      successCount,
      errorCount,
      skippedCount,
      hasErrors: errorCount > 0,
    }
  }, [])

  const updateLockState = useCallback(
    (index: number, update: Partial<LockTxState>) => {
      setLockStates((prev) => {
        const next = [...prev]
        const existing = next[index]
        if (existing) {
          next[index] = { ...existing, ...update }
        }
        lockStatesRef.current = next
        return next
      })
    },
    [],
  )

  const executeSequential = useCallback(
    async (
      tokenIds: bigint[],
      executeFn: (tokenId: bigint) => Promise<Hex>,
    ): Promise<MultiLockExecutionResult> => {
      abortRef.current = false
      const initial: LockTxState[] = tokenIds.map((tokenId) => ({
        tokenId,
        status: "pending" as const,
      }))
      lockStatesRef.current = initial
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
            const receipt = await publicClient.waitForTransactionReceipt({
              hash,
            })
            if (receipt.status === "reverted") {
              updateLockState(i, {
                status: "error",
                hash,
                error: new Error("Transaction reverted on-chain"),
              })
              continue
            }
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

      return buildExecutionResult(lockStatesRef.current)
    },
    [buildExecutionResult, publicClient, updateLockState],
  )

  const voteAll = useCallback(
    async (
      tokenIds: bigint[],
      gaugeAddresses: Address[],
      weights: bigint[],
    ): Promise<MultiLockExecutionResult> => {
      const { address, abi } = contracts.boostVoter
      if (!address) return buildExecutionResult([])

      return executeSequential(tokenIds, async (tokenId) => {
        return writeContractAsync({
          address,
          abi,
          functionName: "vote",
          args: [tokenId, gaugeAddresses, weights],
        })
      })
    },
    [
      buildExecutionResult,
      contracts.boostVoter,
      executeSequential,
      writeContractAsync,
    ],
  )

  const resetAll = useCallback(
    async (tokenIds: bigint[]): Promise<MultiLockExecutionResult> => {
      const { address, abi } = contracts.boostVoter
      if (!address) return buildExecutionResult([])

      return executeSequential(tokenIds, async (tokenId) => {
        return writeContractAsync({
          address,
          abi,
          functionName: "reset",
          args: [tokenId],
        })
      })
    },
    [
      buildExecutionResult,
      contracts.boostVoter,
      executeSequential,
      writeContractAsync,
    ],
  )

  const abort = useCallback(() => {
    abortRef.current = true
  }, [])

  const clear = useCallback(() => {
    setStatus("idle")
    setLockStates([])
    lockStatesRef.current = []
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
