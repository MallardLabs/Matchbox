import { getContractConfig } from "@/config/contracts"
import { useNetwork } from "@/contexts/NetworkContext"
import { getAtomicBatchSupport } from "@/utils/eip5792"
import { type SafeBatchCall, encodeSafeBatchCall } from "@/utils/safeBatch"
import { useCallback, useState } from "react"
import type { Address, Hex } from "viem"
import { sendCalls, waitForCallsStatus } from "viem/actions"
import {
  useAccount,
  usePublicClient,
  useSendTransaction,
  useWalletClient,
} from "wagmi"
import { useSafeBatchExport } from "./useSafeBatchExport"

export type ValidatorLockTxState = {
  tokenId: bigint
  status: "pending" | "signing" | "confirming" | "success" | "error"
  hash?: Hex
  error?: Error
}

type ExecutionResult = {
  successCount: number
  errorCount: number
}

export default function useMultiValidatorVoting() {
  const { chainId } = useNetwork()
  const { address: account } = useAccount()
  const { data: walletClient } = useWalletClient({ chainId })
  const { sendTransactionAsync } = useSendTransaction()
  const publicClient = usePublicClient({ chainId })
  const voter = getContractConfig(chainId).validatorsVoter
  const safeBatch = useSafeBatchExport("validator-vote")
  const [lockStates, setLockStates] = useState<ValidatorLockTxState[]>([])
  const [isInProgress, setIsInProgress] = useState(false)
  const [executionMode, setExecutionMode] = useState<
    "sequential" | "batched" | "safe-export"
  >("sequential")

  const execute = useCallback(
    async (
      tokenIds: bigint[],
      calls: SafeBatchCall[],
    ): Promise<ExecutionResult> => {
      if (!account || !walletClient || tokenIds.length !== calls.length) {
        return { successCount: 0, errorCount: tokenIds.length }
      }
      setIsInProgress(true)
      setLockStates(tokenIds.map((tokenId) => ({ tokenId, status: "pending" })))
      const support = await getAtomicBatchSupport({
        walletClient,
        account,
        chainId,
      })

      if (support.supportsAtomicBatching) {
        setExecutionMode("batched")
        setLockStates(
          tokenIds.map((tokenId) => ({ tokenId, status: "signing" })),
        )
        try {
          const { id } = await sendCalls(walletClient, {
            account,
            calls,
            forceAtomic: true,
          })
          setLockStates(
            tokenIds.map((tokenId) => ({ tokenId, status: "confirming" })),
          )
          await waitForCallsStatus(walletClient, {
            id,
            throwOnFailure: true,
            timeout: 120_000,
          })
          setLockStates(
            tokenIds.map((tokenId) => ({ tokenId, status: "success" })),
          )
          setIsInProgress(false)
          return { successCount: tokenIds.length, errorCount: 0 }
        } catch (caught) {
          const error =
            caught instanceof Error ? caught : new Error(String(caught))
          setLockStates(
            tokenIds.map((tokenId) => ({ tokenId, status: "error", error })),
          )
          setIsInProgress(false)
          return { successCount: 0, errorCount: tokenIds.length }
        }
      }

      setExecutionMode("sequential")
      let successCount = 0
      for (let index = 0; index < calls.length; index += 1) {
        const call = calls[index]
        const tokenId = tokenIds[index]
        if (!call || tokenId === undefined) continue
        setLockStates((current) =>
          current.map((state, stateIndex) =>
            stateIndex === index ? { ...state, status: "signing" } : state,
          ),
        )
        try {
          const hash = await sendTransactionAsync({
            account,
            to: call.to,
            data: call.data,
            value: call.value,
          })
          setLockStates((current) =>
            current.map((state, stateIndex) =>
              stateIndex === index
                ? { ...state, status: "confirming", hash }
                : state,
            ),
          )
          const receipt = await publicClient?.waitForTransactionReceipt({
            hash,
          })
          if (receipt?.status === "reverted")
            throw new Error("Transaction reverted")
          successCount += 1
          setLockStates((current) =>
            current.map((state, stateIndex) =>
              stateIndex === index
                ? { ...state, status: "success", hash }
                : state,
            ),
          )
        } catch (caught) {
          const error =
            caught instanceof Error ? caught : new Error(String(caught))
          setLockStates((current) =>
            current.map((state, stateIndex) =>
              stateIndex === index
                ? { ...state, status: "error", error }
                : state,
            ),
          )
        }
      }
      setIsInProgress(false)
      return { successCount, errorCount: tokenIds.length - successCount }
    },
    [account, chainId, publicClient, sendTransactionAsync, walletClient],
  )

  const voteAll = useCallback(
    (tokenIds: bigint[], gauges: Address[], weights: bigint[]) =>
      execute(
        tokenIds,
        tokenIds.map((tokenId) =>
          encodeSafeBatchCall({
            to: voter.address,
            abi: voter.abi,
            functionName: "vote",
            args: [tokenId, gauges, weights],
          }),
        ),
      ),
    [execute, voter.abi, voter.address],
  )

  const executeSimple = useCallback(
    (functionName: "reset" | "poke", tokenIds: bigint[]) =>
      execute(
        tokenIds,
        tokenIds.map((tokenId) =>
          encodeSafeBatchCall({
            to: voter.address,
            abi: voter.abi,
            functionName,
            args: [tokenId],
          }),
        ),
      ),
    [execute, voter.abi, voter.address],
  )

  const exportVoteBatch = useCallback(
    async (tokenIds: bigint[], gauges: Address[], weights: bigint[]) => {
      const calls = tokenIds.map((tokenId) =>
        encodeSafeBatchCall({
          to: voter.address,
          abi: voter.abi,
          functionName: "vote",
          args: [tokenId, gauges, weights],
        }),
      )
      const pending = await safeBatch.exportBatch({
        name: `Matchbox validator vote ${tokenIds.length} locks`,
        description: "veBTC validator-gauge vote generated by Matchbox.",
        calls,
        items: tokenIds.map((tokenId) => ({
          id: tokenId.toString(),
          label: `Vote with veBTC #${tokenId.toString()}`,
        })),
      })
      if (pending) setExecutionMode("safe-export")
    },
    [safeBatch.exportBatch, voter.abi, voter.address],
  )

  const copyVoteBatchJson = useCallback(
    (tokenIds: bigint[], gauges: Address[], weights: bigint[]) =>
      safeBatch.copyBatchJson({
        name: `Matchbox validator vote ${tokenIds.length} locks`,
        description: "veBTC validator-gauge vote generated by Matchbox.",
        calls: tokenIds.map((tokenId) =>
          encodeSafeBatchCall({
            to: voter.address,
            abi: voter.abi,
            functionName: "vote",
            args: [tokenId, gauges, weights],
          }),
        ),
      }),
    [safeBatch.copyBatchJson, voter.abi, voter.address],
  )

  return {
    voteAll,
    resetAll: (tokenIds: bigint[]) => executeSimple("reset", tokenIds),
    pokeAll: (tokenIds: bigint[]) => executeSimple("poke", tokenIds),
    exportVoteBatch,
    copyVoteBatchJson,
    lockStates,
    isInProgress,
    executionMode,
    canExportSafeBatch: safeBatch.canExportSafeBatch,
    canCopyBatchJson: safeBatch.canCopyBatchJson,
    copiedBatchJson: safeBatch.copiedBatchJson,
    error: safeBatch.error,
    clear: () => {
      setLockStates([])
      safeBatch.clear()
    },
  }
}
