import { getContractConfig } from "@/config/contracts"
import { useNetwork } from "@/contexts/NetworkContext"
import { type AtomicBatchSupport, getAtomicBatchSupport } from "@/utils/eip5792"
import { encodeSafeBatchCall } from "@/utils/safeBatch"
import { useCallback, useEffect, useRef, useState } from "react"
import type { Address, Hex } from "viem"
import { sendCalls, waitForCallsStatus } from "viem/actions"
import {
  useAccount,
  usePublicClient,
  useWalletClient,
  useWriteContract,
} from "wagmi"
import type { LockTxStatus, MultiLockExecutionMode } from "./useMultiLockVoting"
import { useSafeBatchExport } from "./useSafeBatchExport"

export type UnpairBoostRequest = {
  veMEZOTokenId: bigint
  affectedVeBTCTokenIds: bigint[]
}

export type UnpairTxState = {
  id: string
  kind: "reset" | "poke"
  label: string
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
  exportUnpairBatch: (requests: UnpairBoostRequest[]) => Promise<void>
  copyUnpairBatchJson: (requests: UnpairBoostRequest[]) => Promise<void>
  abort: () => void
  txStates: UnpairTxState[]
  currentIndex: number
  totalTransactions: number
  successCount: number
  errorCount: number
  isInProgress: boolean
  isDone: boolean
  hasErrors: boolean
  executionMode: MultiLockExecutionMode
  batchSupport: AtomicBatchSupport | null
  canExportSafeBatch: boolean
  canCopyBatchJson: boolean
  copiedBatchJson: boolean
  safeBatchError: Error | undefined
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
  const { address: accountAddress } = useAccount()
  const contracts = getContractConfig(chainId)
  const publicClient = usePublicClient({ chainId })
  const { data: walletClient } = useWalletClient({ chainId })
  const { writeContractAsync } = useWriteContract()
  const safeBatch = useSafeBatchExport("unpair")

  const [status, setStatus] = useState<MultiLockUnpairStatus>("idle")
  const [executionMode, setExecutionMode] =
    useState<MultiLockExecutionMode>("sequential")
  const [batchSupport, setBatchSupport] = useState<AtomicBatchSupport | null>(
    null,
  )
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

  const replaceTxStates = useCallback((next: UnpairTxState[]) => {
    txStatesRef.current = next
    setTxStates(next)
  }, [])

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

  const buildInitialStates = useCallback((requests: UnpairBoostRequest[]) => {
    const resetStates: UnpairTxState[] = requests.map((request) => ({
      id: `reset-${request.veMEZOTokenId.toString()}`,
      kind: "reset",
      label: `Reset veMEZO #${request.veMEZOTokenId.toString()}`,
      status: "pending",
    }))

    const allAffectedVeBTCTokenIds = uniqueTokenIds(
      requests.flatMap((request) => request.affectedVeBTCTokenIds),
    )

    const pokeStates: UnpairTxState[] =
      allAffectedVeBTCTokenIds.length > 0
        ? [
            {
              id: "poke-boosts",
              kind: "poke",
              label:
                allAffectedVeBTCTokenIds.length === 1
                  ? `Update veBTC #${allAffectedVeBTCTokenIds[0]?.toString()}`
                  : `Update ${allAffectedVeBTCTokenIds.length} veBTC boosts`,
              status: "pending",
            },
          ]
        : []

    return {
      initialStates: [...resetStates, ...pokeStates],
      resetCount: resetStates.length,
      allAffectedVeBTCTokenIds,
    }
  }, [])

  useEffect(() => {
    if (!safeBatch.pending) return

    const nextStates = safeBatch.pending.items.map((item) => ({
      id: item.id,
      kind: item.id === "poke-boosts" ? ("poke" as const) : ("reset" as const),
      label: item.label,
      status:
        safeBatch.status === "executed"
          ? ("success" as const)
          : ("confirming" as const),
      ...(safeBatch.executedHash ? { hash: safeBatch.executedHash } : {}),
    }))
    setExecutionMode("safe-export")
    setStatus(safeBatch.status === "executed" ? "done" : "unpairing")
    replaceTxStates(nextStates)
  }, [
    replaceTxStates,
    safeBatch.executedHash,
    safeBatch.pending,
    safeBatch.status,
  ])

  const executeBatched = useCallback(
    async (
      requests: UnpairBoostRequest[],
      address: Address,
      abi: typeof contracts.boostVoter.abi,
    ): Promise<UnpairExecutionResult> => {
      if (!walletClient || !accountAddress) {
        return buildExecutionResult([])
      }

      const { initialStates, allAffectedVeBTCTokenIds } =
        buildInitialStates(requests)
      if (initialStates.length === 0) {
        return buildExecutionResult([])
      }

      abortRef.current = false
      setExecutionMode("batched")
      replaceTxStates(
        initialStates.map((state) => ({
          ...state,
          status: "signing",
        })),
      )
      setCurrentIndex(0)
      setStatus("unpairing")

      const calls = [
        ...requests.map((request) => ({
          to: address,
          abi,
          functionName: "reset" as const,
          args: [request.veMEZOTokenId] as [bigint],
        })),
        ...(allAffectedVeBTCTokenIds.length > 0
          ? [
              {
                to: address,
                abi,
                functionName: "pokeBoosts" as const,
                args: [allAffectedVeBTCTokenIds] as [bigint[]],
              },
            ]
          : []),
      ]

      try {
        const { id } = await sendCalls(walletClient, {
          account: accountAddress,
          calls,
          forceAtomic: true,
        })

        replaceTxStates(
          initialStates.map((state) => ({
            ...state,
            status: "confirming",
          })),
        )

        await waitForCallsStatus(walletClient, {
          id,
          throwOnFailure: true,
          timeout: 120_000,
        })

        replaceTxStates(
          initialStates.map((state) => ({
            ...state,
            status: "success",
          })),
        )
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err))

        replaceTxStates(
          initialStates.map((state) => ({
            ...state,
            status: "error",
            error,
          })),
        )
      }

      setStatus("done")

      return buildExecutionResult(txStatesRef.current)
    },
    [
      accountAddress,
      buildExecutionResult,
      buildInitialStates,
      replaceTxStates,
      walletClient,
    ],
  )

  const unpairAll = useCallback(
    async (requests: UnpairBoostRequest[]): Promise<UnpairExecutionResult> => {
      const { address, abi } = contracts.boostVoter
      if (!address || requests.length === 0) return buildExecutionResult([])

      const batchSupport = await getAtomicBatchSupport({
        walletClient,
        account: accountAddress,
        chainId,
      })
      setBatchSupport(batchSupport)

      if (batchSupport.supportsAtomicBatching) {
        return executeBatched(requests, address, abi)
      }

      abortRef.current = false
      setExecutionMode("sequential")
      const { initialStates, resetCount } = buildInitialStates(requests)
      replaceTxStates(initialStates)
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

      const pokeStateIndex = resetCount
      if (pokeStateIndex < initialStates.length) {
        if (abortRef.current || uniqueSuccessfulVeBTCTokens.size === 0) {
          updateTxState(pokeStateIndex, { status: "skipped" })
        } else {
          setCurrentIndex(pokeStateIndex)
          updateTxState(pokeStateIndex, { status: "signing" })

          try {
            const hash = await writeContractAsync({
              address,
              abi,
              functionName: "pokeBoosts",
              args: [
                Array.from(uniqueSuccessfulVeBTCTokens, (tokenId) =>
                  BigInt(tokenId),
                ),
              ],
            })
            updateTxState(pokeStateIndex, { status: "confirming", hash })
            await waitForHash(hash, pokeStateIndex)
            updateTxState(pokeStateIndex, { status: "success", hash })
          } catch (err) {
            updateTxState(pokeStateIndex, {
              status: "error",
              error: err instanceof Error ? err : new Error(String(err)),
            })
          }
        }
      }

      setStatus("done")

      return buildExecutionResult(txStatesRef.current)
    },
    [
      accountAddress,
      buildExecutionResult,
      buildInitialStates,
      chainId,
      contracts.boostVoter,
      executeBatched,
      replaceTxStates,
      updateTxState,
      waitForHash,
      walletClient,
      writeContractAsync,
    ],
  )

  const exportUnpairBatch = useCallback(
    async (requests: UnpairBoostRequest[]) => {
      const { address, abi } = contracts.boostVoter
      if (!address || requests.length === 0) return

      const { initialStates, allAffectedVeBTCTokenIds } =
        buildInitialStates(requests)
      const calls = [
        ...requests.map((request) =>
          encodeSafeBatchCall({
            to: address,
            abi,
            functionName: "reset",
            args: [request.veMEZOTokenId],
          }),
        ),
        ...(allAffectedVeBTCTokenIds.length > 0
          ? [
              encodeSafeBatchCall({
                to: address,
                abi,
                functionName: "pokeBoosts",
                args: [allAffectedVeBTCTokenIds],
              }),
            ]
          : []),
      ]
      const pending = await safeBatch.exportBatch({
        name: `Matchbox unpair ${requests.length} locks`,
        description:
          "Atomic Matchbox vote reset and boost refresh generated for Safe Transaction Builder.",
        calls,
        items: initialStates.map((state) => ({
          id: state.id,
          label: state.label,
        })),
      })
      if (!pending) return

      setExecutionMode("safe-export")
      setStatus("unpairing")
      replaceTxStates(
        pending.items.map((item) => ({
          id: item.id,
          kind:
            item.id === "poke-boosts" ? ("poke" as const) : ("reset" as const),
          label: item.label,
          status: "confirming",
        })),
      )
    },
    [
      buildInitialStates,
      contracts.boostVoter,
      replaceTxStates,
      safeBatch.exportBatch,
    ],
  )

  const copyUnpairBatchJson = useCallback(
    async (requests: UnpairBoostRequest[]) => {
      const { address, abi } = contracts.boostVoter
      if (!address) return
      const { allAffectedVeBTCTokenIds } = buildInitialStates(requests)
      await safeBatch.copyBatchJson({
        name: `Matchbox unpair ${requests.length} locks`,
        description:
          "Matchbox reset and boost refresh transaction data. Execute only from the NFT-owning account.",
        calls: [
          ...requests.map((request) =>
            encodeSafeBatchCall({
              to: address,
              abi,
              functionName: "reset",
              args: [request.veMEZOTokenId],
            }),
          ),
          ...(allAffectedVeBTCTokenIds.length > 0
            ? [
                encodeSafeBatchCall({
                  to: address,
                  abi,
                  functionName: "pokeBoosts",
                  args: [allAffectedVeBTCTokenIds],
                }),
              ]
            : []),
        ],
      })
    },
    [buildInitialStates, contracts.boostVoter, safeBatch.copyBatchJson],
  )

  const abort = useCallback(() => {
    abortRef.current = true
  }, [])

  const clear = useCallback(() => {
    setStatus("idle")
    setExecutionMode("sequential")
    setBatchSupport(null)
    setTxStates([])
    txStatesRef.current = []
    setCurrentIndex(0)
    abortRef.current = false
    safeBatch.clear()
  }, [safeBatch.clear])

  const successCount = txStates.filter((s) => s.status === "success").length
  const errorCount = txStates.filter((s) => s.status === "error").length

  return {
    unpairAll,
    exportUnpairBatch,
    copyUnpairBatchJson,
    abort,
    txStates,
    currentIndex,
    totalTransactions: txStates.length,
    successCount,
    errorCount,
    isInProgress: status === "unpairing",
    isDone: status === "done",
    hasErrors: errorCount > 0,
    executionMode,
    batchSupport,
    canExportSafeBatch: safeBatch.canExportSafeBatch,
    canCopyBatchJson: safeBatch.canCopyBatchJson,
    copiedBatchJson: safeBatch.copiedBatchJson,
    safeBatchError: safeBatch.error,
    clear,
  }
}

export default useMultiLockUnpairing
