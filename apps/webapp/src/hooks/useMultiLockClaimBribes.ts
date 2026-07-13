import { getContractConfig } from "@/config/contracts"
import { useNetwork } from "@/contexts/NetworkContext"
import { type AtomicBatchSupport, getAtomicBatchSupport } from "@/utils/eip5792"
import { encodeSafeBatchCall } from "@/utils/safeBatch"
import { useCallback, useEffect, useState } from "react"
import type { Address, Hex } from "viem"
import { sendCalls, waitForCallsStatus } from "viem/actions"
import {
  useAccount,
  usePublicClient,
  useWalletClient,
  useWriteContract,
} from "wagmi"
import type { MultiLockExecutionMode } from "./useMultiLockVoting"
import { useSafeBatchExport } from "./useSafeBatchExport"

type LockTxStatus = "pending" | "signing" | "confirming" | "success" | "error"

type LockTxState = {
  tokenId: bigint
  status: LockTxStatus
  hash?: Hex
  error?: Error
}

type ClaimLockBribes = {
  bribeAddress: Address
  tokens: Address[]
}

export type ClaimLockRequest = {
  tokenId: bigint
  bribes: ClaimLockBribes[]
}

type MultiLockClaimStatus = "idle" | "claiming" | "done"

type UseMultiLockClaimBribesReturn = {
  claimAll: (claims: ClaimLockRequest[]) => void
  exportClaimBatch: (claims: ClaimLockRequest[]) => Promise<void>
  copyClaimBatchJson: (claims: ClaimLockRequest[]) => Promise<void>
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
  canExportSafeBatch: boolean
  canCopyBatchJson: boolean
  copiedBatchJson: boolean
  safeBatchError: Error | undefined
  clear: () => void
}

export function useMultiLockClaimBribes(): UseMultiLockClaimBribesReturn {
  const { chainId } = useNetwork()
  const { address: accountAddress } = useAccount()
  const contracts = getContractConfig(chainId)
  const publicClient = usePublicClient({ chainId })
  const { data: walletClient } = useWalletClient({ chainId })
  const { writeContractAsync } = useWriteContract()
  const safeBatch = useSafeBatchExport("claim-bribes")

  const [status, setStatus] = useState<MultiLockClaimStatus>("idle")
  const [executionMode, setExecutionMode] =
    useState<MultiLockExecutionMode>("sequential")
  const [batchSupport, setBatchSupport] = useState<AtomicBatchSupport | null>(
    null,
  )
  const [lockStates, setLockStates] = useState<LockTxState[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)

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

  useEffect(() => {
    if (!safeBatch.pending) return

    setExecutionMode("safe-export")
    setStatus(safeBatch.status === "executed" ? "done" : "claiming")
    setLockStates(
      safeBatch.pending.items.map((item) => ({
        tokenId: BigInt(item.id),
        status:
          safeBatch.status === "executed"
            ? ("success" as const)
            : ("confirming" as const),
        ...(safeBatch.executedHash ? { hash: safeBatch.executedHash } : {}),
      })),
    )
  }, [safeBatch.executedHash, safeBatch.pending, safeBatch.status])

  const executeSequential = useCallback(
    async (claims: ClaimLockRequest[]) => {
      const { address, abi } = contracts.boostVoter
      const validClaims = claims.filter((claim) => claim.bribes.length > 0)

      if (!address || validClaims.length === 0) {
        setStatus("idle")
        setLockStates([])
        setCurrentIndex(0)
        return
      }

      setExecutionMode("sequential")
      const initialState: LockTxState[] = validClaims.map((claim) => ({
        tokenId: claim.tokenId,
        status: "pending",
      }))

      setLockStates(initialState)
      setCurrentIndex(0)
      setStatus("claiming")

      for (let index = 0; index < validClaims.length; index++) {
        const claim = validClaims[index]
        if (!claim) {
          continue
        }

        setCurrentIndex(index)
        updateLockState(index, { status: "signing" })

        try {
          const hash = await writeContractAsync({
            address,
            abi,
            functionName: "claimBribes",
            args: [
              claim.bribes.map((bribe) => bribe.bribeAddress),
              claim.bribes.map((bribe) => bribe.tokens),
              claim.tokenId,
            ],
          })

          updateLockState(index, {
            status: "confirming",
            hash,
          })

          if (publicClient) {
            const receipt = await publicClient.waitForTransactionReceipt({
              hash,
            })
            if (receipt.status === "reverted") {
              updateLockState(index, {
                status: "error",
                hash,
                error: new Error("Transaction reverted on-chain"),
              })
              continue
            }
          }

          updateLockState(index, {
            status: "success",
            hash,
          })
        } catch (error) {
          updateLockState(index, {
            status: "error",
            error: error instanceof Error ? error : new Error(String(error)),
          })
        }
      }

      setStatus("done")
    },
    [contracts.boostVoter, publicClient, updateLockState, writeContractAsync],
  )

  const executeBatched = useCallback(
    async (claims: ClaimLockRequest[]) => {
      const { address, abi } = contracts.boostVoter
      const validClaims = claims.filter((claim) => claim.bribes.length > 0)

      if (
        !address ||
        validClaims.length === 0 ||
        !walletClient ||
        !accountAddress
      ) {
        setStatus("idle")
        setExecutionMode("sequential")
        setLockStates([])
        setCurrentIndex(0)
        return
      }

      setExecutionMode("batched")
      const initialState: LockTxState[] = validClaims.map((claim) => ({
        tokenId: claim.tokenId,
        status: "signing",
      }))

      setLockStates(initialState)
      setCurrentIndex(0)
      setStatus("claiming")

      try {
        const { id } = await sendCalls(walletClient, {
          account: accountAddress,
          calls: validClaims.map((claim) => ({
            to: address,
            abi,
            functionName: "claimBribes" as const,
            args: [
              claim.bribes.map((bribe) => bribe.bribeAddress),
              claim.bribes.map((bribe) => bribe.tokens),
              claim.tokenId,
            ],
          })),
          forceAtomic: true,
        })

        setLockStates(
          initialState.map((state) => ({
            ...state,
            status: "confirming",
          })),
        )

        await waitForCallsStatus(walletClient, {
          id,
          throwOnFailure: true,
          timeout: 120_000,
        })

        setLockStates(
          initialState.map((state) => ({
            ...state,
            status: "success",
          })),
        )
      } catch (error) {
        const batchError =
          error instanceof Error ? error : new Error(String(error))

        setLockStates(
          initialState.map((state) => ({
            ...state,
            status: "error",
            error: batchError,
          })),
        )
      }

      setStatus("done")
    },
    [accountAddress, contracts.boostVoter, walletClient],
  )

  const claimAll = useCallback(
    (claims: ClaimLockRequest[]) => {
      void (async () => {
        const batchSupport = await getAtomicBatchSupport({
          walletClient,
          account: accountAddress,
          chainId,
        })
        setBatchSupport(batchSupport)

        if (batchSupport.supportsAtomicBatching) {
          await executeBatched(claims)
          return
        }

        await executeSequential(claims)
      })()
    },
    [accountAddress, chainId, executeBatched, executeSequential, walletClient],
  )

  const exportClaimBatch = useCallback(
    async (claims: ClaimLockRequest[]) => {
      const { address, abi } = contracts.boostVoter
      const validClaims = claims.filter((claim) => claim.bribes.length > 0)
      if (!address || validClaims.length === 0) return

      const calls = validClaims.map((claim) =>
        encodeSafeBatchCall({
          to: address,
          abi,
          functionName: "claimBribes",
          args: [
            claim.bribes.map((bribe) => bribe.bribeAddress),
            claim.bribes.map((bribe) => bribe.tokens),
            claim.tokenId,
          ],
        }),
      )
      const pending = await safeBatch.exportBatch({
        name: `Matchbox claim ${validClaims.length} locks`,
        description:
          "Atomic Matchbox rewards claim generated for Safe Transaction Builder.",
        calls,
        items: validClaims.map((claim) => ({
          id: claim.tokenId.toString(),
          label: `Claim rewards for veMEZO #${claim.tokenId.toString()}`,
        })),
      })
      if (!pending) return

      setExecutionMode("safe-export")
      setStatus("claiming")
      setLockStates(
        pending.items.map((item) => ({
          tokenId: BigInt(item.id),
          status: "confirming",
        })),
      )
    },
    [contracts.boostVoter, safeBatch.exportBatch],
  )

  const copyClaimBatchJson = useCallback(
    async (claims: ClaimLockRequest[]) => {
      const { address, abi } = contracts.boostVoter
      const validClaims = claims.filter((claim) => claim.bribes.length > 0)
      if (!address) return
      await safeBatch.copyBatchJson({
        name: `Matchbox claim ${validClaims.length} locks`,
        description:
          "Matchbox rewards claim transaction data. Execute only from the NFT-owning account.",
        calls: validClaims.map((claim) =>
          encodeSafeBatchCall({
            to: address,
            abi,
            functionName: "claimBribes",
            args: [
              claim.bribes.map((bribe) => bribe.bribeAddress),
              claim.bribes.map((bribe) => bribe.tokens),
              claim.tokenId,
            ],
          }),
        ),
      })
    },
    [contracts.boostVoter, safeBatch.copyBatchJson],
  )

  const clear = useCallback(() => {
    setStatus("idle")
    setExecutionMode("sequential")
    setBatchSupport(null)
    setLockStates([])
    setCurrentIndex(0)
    safeBatch.clear()
  }, [safeBatch.clear])

  const successCount = lockStates.filter(
    (state) => state.status === "success",
  ).length
  const errorCount = lockStates.filter(
    (state) => state.status === "error",
  ).length

  return {
    claimAll,
    exportClaimBatch,
    copyClaimBatchJson,
    lockStates,
    currentIndex,
    totalLocks: lockStates.length,
    successCount,
    errorCount,
    isInProgress: status === "claiming",
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

export default useMultiLockClaimBribes
