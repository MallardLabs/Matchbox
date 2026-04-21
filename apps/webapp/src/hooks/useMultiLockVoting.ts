import { getContractConfig } from "@/config/contracts"
import { useNetwork } from "@/contexts/NetworkContext"
import {
  type AtomicBatchSupport,
  getAtomicBatchSupport,
} from "@/utils/eip5792"
import { useCallback, useRef, useState } from "react"
import type { Address, Hex } from "viem"
import { sendCalls, waitForCallsStatus } from "viem/actions"
import {
  useAccount,
  usePublicClient,
  useWalletClient,
  useWriteContract,
} from "wagmi"

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
export type MultiLockExecutionMode = "sequential" | "batched"

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
  executionMode: MultiLockExecutionMode
  batchSupport: AtomicBatchSupport | null
  clear: () => void
}

export function useMultiLockVoting(): UseMultiLockVotingReturn {
  const { chainId } = useNetwork()
  const { address: accountAddress } = useAccount()
  const contracts = getContractConfig(chainId)
  const publicClient = usePublicClient({ chainId })
  const { data: walletClient } = useWalletClient({ chainId })
  const { writeContractAsync } = useWriteContract()

  const [status, setStatus] = useState<MultiLockVoteStatus>("idle")
  const [executionMode, setExecutionMode] =
    useState<MultiLockExecutionMode>("sequential")
  const [batchSupport, setBatchSupport] = useState<AtomicBatchSupport | null>(
    null,
  )
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

  const replaceLockStates = useCallback((next: LockTxState[]) => {
    lockStatesRef.current = next
    setLockStates(next)
  }, [])

  const executeSequential = useCallback(
    async (
      tokenIds: bigint[],
      executeFn: (tokenId: bigint) => Promise<Hex>,
    ): Promise<MultiLockExecutionResult> => {
      abortRef.current = false
      setExecutionMode("sequential")
      const initial: LockTxState[] = tokenIds.map((tokenId) => ({
        tokenId,
        status: "pending" as const,
      }))
      replaceLockStates(initial)
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
    [buildExecutionResult, publicClient, replaceLockStates, updateLockState],
  )

  const executeBatched = useCallback(
    async (
      tokenIds: bigint[],
      calls: {
        to: Address
        abi: typeof contracts.boostVoter.abi
        functionName: "vote" | "reset"
        args: [bigint, Address[], bigint[]] | [bigint]
      }[],
    ): Promise<MultiLockExecutionResult> => {
      if (!walletClient || !accountAddress) {
        return buildExecutionResult([])
      }

      abortRef.current = false
      setExecutionMode("batched")
      const initial: LockTxState[] = tokenIds.map((tokenId) => ({
        tokenId,
        status: "signing",
      }))
      replaceLockStates(initial)
      setCurrentIndex(0)
      setStatus("voting")

      try {
        const { id } = await sendCalls(walletClient, {
          account: accountAddress,
          calls,
          forceAtomic: true,
        })

        replaceLockStates(
          initial.map((state) => ({
            ...state,
            status: "confirming",
          })),
        )

        await waitForCallsStatus(walletClient, {
          id,
          throwOnFailure: true,
          timeout: 120_000,
        })

        replaceLockStates(
          initial.map((state) => ({
            ...state,
            status: "success",
          })),
        )
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err))

        replaceLockStates(
          initial.map((state) => ({
            ...state,
            status: "error",
            error,
          })),
        )
      }

      setStatus("done")

      return buildExecutionResult(lockStatesRef.current)
    },
    [
      accountAddress,
      buildExecutionResult,
      replaceLockStates,
      walletClient,
    ],
  )

  const voteAll = useCallback(
    async (
      tokenIds: bigint[],
      gaugeAddresses: Address[],
      weights: bigint[],
    ): Promise<MultiLockExecutionResult> => {
      const { address, abi } = contracts.boostVoter
      if (!address) return buildExecutionResult([])

      const batchSupport = await getAtomicBatchSupport({
        walletClient,
        account: accountAddress,
        chainId,
      })
      setBatchSupport(batchSupport)

      if (batchSupport.supportsAtomicBatching) {
        return executeBatched(
          tokenIds,
          tokenIds.map((tokenId) => ({
            to: address,
            abi,
            functionName: "vote" as const,
            args: [tokenId, gaugeAddresses, weights],
          })),
        )
      }

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
      accountAddress,
      buildExecutionResult,
      chainId,
      contracts.boostVoter,
      executeBatched,
      executeSequential,
      walletClient,
      writeContractAsync,
    ],
  )

  const resetAll = useCallback(
    async (tokenIds: bigint[]): Promise<MultiLockExecutionResult> => {
      const { address, abi } = contracts.boostVoter
      if (!address) return buildExecutionResult([])

      const batchSupport = await getAtomicBatchSupport({
        walletClient,
        account: accountAddress,
        chainId,
      })
      setBatchSupport(batchSupport)

      if (batchSupport.supportsAtomicBatching) {
        return executeBatched(
          tokenIds,
          tokenIds.map((tokenId) => ({
            to: address,
            abi,
            functionName: "reset" as const,
            args: [tokenId],
          })),
        )
      }

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
      accountAddress,
      buildExecutionResult,
      chainId,
      contracts.boostVoter,
      executeBatched,
      executeSequential,
      walletClient,
      writeContractAsync,
    ],
  )

  const abort = useCallback(() => {
    abortRef.current = true
  }, [])

  const clear = useCallback(() => {
    setStatus("idle")
    setExecutionMode("sequential")
    setBatchSupport(null)
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
    executionMode,
    batchSupport,
    clear,
  }
}

export default useMultiLockVoting
