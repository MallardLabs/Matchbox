import { getContractConfig } from "@/config/contracts"
import { useNetwork } from "@/contexts/NetworkContext"
import { useCallback, useRef, useState } from "react"
import type { Hex } from "viem"
import { usePublicClient, useWriteContract } from "wagmi"
import type { LockTxStatus } from "./useMultiLockVoting"

export type UnpairBoostRequest = {
  veMEZOTokenId: bigint
  affectedVeBTCTokenIds: bigint[]
}

export type UnpairTxState = {
  id: string
  kind: "reset" | "poke"
  tokenId: bigint
  status: LockTxStatus
  hash?: Hex
  error?: Error
}

type UnpairExecutionResult = {
  totalTransactions: number
  successCount: number
  errorCount: number
  skippedCount: number
  hasErrors: boolean
}

type MultiLockUnpairStatus = "idle" | "unpairing" | "done"

type UseMultiLockUnpairingReturn = {
  unpairAll: (requests: UnpairBoostRequest[]) => Promise<UnpairExecutionResult>
  abort: () => void
  txStates: UnpairTxState[]
  currentIndex: number
  totalTransactions: number
  successCount: number
  errorCount: number
  isInProgress: boolean
  isDone: boolean
  hasErrors: boolean
  clear: () => void
}

function uniqueTokenIds(tokenIds: bigint[]): bigint[] {
  const seen = new Set<string>()
  const unique: bigint[] = []

  for (const tokenId of tokenIds) {
    const key = tokenId.toString()
    if (seen.has(key)) continue

    seen.add(key)
    unique.push(tokenId)
  }

  return unique
}

export function useMultiLockUnpairing(): UseMultiLockUnpairingReturn {
  const { chainId } = useNetwork()
  const contracts = getContractConfig(chainId)
  const publicClient = usePublicClient({ chainId })
  const { writeContractAsync } = useWriteContract()

  const [status, setStatus] = useState<MultiLockUnpairStatus>("idle")
  const [txStates, setTxStates] = useState<UnpairTxState[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const abortRef = useRef(false)
  const txStatesRef = useRef<UnpairTxState[]>([])

  const buildExecutionResult = useCallback((states: UnpairTxState[]) => {
    const successCount = states.filter((s) => s.status === "success").length
    const errorCount = states.filter((s) => s.status === "error").length
    const skippedCount = states.filter((s) => s.status === "skipped").length

    return {
      totalTransactions: states.length,
      successCount,
      errorCount,
      skippedCount,
      hasErrors: errorCount > 0,
    }
  }, [])

  const updateTxState = useCallback(
    (index: number, update: Partial<UnpairTxState>) => {
      const next = [...txStatesRef.current]
      const existing = next[index]
      if (existing) {
        next[index] = { ...existing, ...update }
      }
      txStatesRef.current = next
      setTxStates(next)
    },
    [],
  )

  const waitForHash = useCallback(
    async (hash: Hex, stateIndex: number) => {
      if (!publicClient) return

      const receipt = await publicClient.waitForTransactionReceipt({ hash })
      if (receipt.status === "reverted") {
        updateTxState(stateIndex, {
          status: "error",
          hash,
          error: new Error("Transaction reverted on-chain"),
        })
        throw new Error("Transaction reverted on-chain")
      }
    },
    [publicClient, updateTxState],
  )

  const unpairAll = useCallback(
    async (requests: UnpairBoostRequest[]): Promise<UnpairExecutionResult> => {
      const { address, abi } = contracts.boostVoter
      if (!address || requests.length === 0) return buildExecutionResult([])

      abortRef.current = false
      const resetStates: UnpairTxState[] = requests.map((request) => ({
        id: `reset-${request.veMEZOTokenId.toString()}`,
        kind: "reset",
        tokenId: request.veMEZOTokenId,
        status: "pending",
      }))
      const allAffectedVeBTCTokenIds = uniqueTokenIds(
        requests.flatMap((request) => request.affectedVeBTCTokenIds),
      )
      const pokeStates: UnpairTxState[] = allAffectedVeBTCTokenIds.map(
        (tokenId) => ({
          id: `poke-${tokenId.toString()}`,
          kind: "poke",
          tokenId,
          status: "pending",
        }),
      )
      const initialStates = [...resetStates, ...pokeStates]
      txStatesRef.current = initialStates
      setTxStates(initialStates)
      setCurrentIndex(0)
      setStatus("unpairing")

      const veBTCTokensToPoke: bigint[] = []

      for (let i = 0; i < requests.length; i++) {
        if (abortRef.current) {
          for (let j = i; j < requests.length; j++) {
            updateTxState(j, { status: "skipped" })
          }
          break
        }

        const request = requests[i]
        if (!request) continue

        setCurrentIndex(i)
        updateTxState(i, { status: "signing" })

        try {
          const hash = await writeContractAsync({
            address,
            abi,
            functionName: "reset",
            args: [request.veMEZOTokenId],
          })
          updateTxState(i, { status: "confirming", hash })
          await waitForHash(hash, i)
          updateTxState(i, { status: "success", hash })
          veBTCTokensToPoke.push(...request.affectedVeBTCTokenIds)
        } catch (err) {
          updateTxState(i, {
            status: "error",
            error: err instanceof Error ? err : new Error(String(err)),
          })
        }
      }

      const uniqueSuccessfulVeBTCTokens = new Set(
        uniqueTokenIds(veBTCTokensToPoke).map((tokenId) => tokenId.toString()),
      )

      for (let i = 0; i < pokeStates.length; i++) {
        const stateIndex = resetStates.length + i
        const pokeState = pokeStates[i]
        if (!pokeState) continue

        if (
          abortRef.current ||
          !uniqueSuccessfulVeBTCTokens.has(pokeState.tokenId.toString())
        ) {
          updateTxState(stateIndex, { status: "skipped" })
          continue
        }

        setCurrentIndex(stateIndex)
        updateTxState(stateIndex, { status: "signing" })

        try {
          const hash = await writeContractAsync({
            address,
            abi,
            functionName: "pokeBoost",
            args: [pokeState.tokenId],
          })
          updateTxState(stateIndex, { status: "confirming", hash })
          await waitForHash(hash, stateIndex)
          updateTxState(stateIndex, { status: "success", hash })
        } catch (err) {
          updateTxState(stateIndex, {
            status: "error",
            error: err instanceof Error ? err : new Error(String(err)),
          })
        }
      }

      setStatus("done")

      return buildExecutionResult(txStatesRef.current)
    },
    [
      buildExecutionResult,
      contracts.boostVoter,
      updateTxState,
      waitForHash,
      writeContractAsync,
    ],
  )

  const abort = useCallback(() => {
    abortRef.current = true
  }, [])

  const clear = useCallback(() => {
    setStatus("idle")
    setTxStates([])
    txStatesRef.current = []
    setCurrentIndex(0)
    abortRef.current = false
  }, [])

  const successCount = txStates.filter((s) => s.status === "success").length
  const errorCount = txStates.filter((s) => s.status === "error").length

  return {
    unpairAll,
    abort,
    txStates,
    currentIndex,
    totalTransactions: txStates.length,
    successCount,
    errorCount,
    isInProgress: status === "unpairing",
    isDone: status === "done",
    hasErrors: errorCount > 0,
    clear,
  }
}

export default useMultiLockUnpairing
