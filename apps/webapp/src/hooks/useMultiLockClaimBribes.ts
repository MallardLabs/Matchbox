import { getContractConfig } from "@/config/contracts"
import { useNetwork } from "@/contexts/NetworkContext"
import { useCallback, useState } from "react"
import type { Address, Hex } from "viem"
import { usePublicClient, useWriteContract } from "wagmi"

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

export function useMultiLockClaimBribes(): UseMultiLockClaimBribesReturn {
  const { chainId } = useNetwork()
  const contracts = getContractConfig(chainId)
  const publicClient = usePublicClient({ chainId })
  const { writeContractAsync } = useWriteContract()

  const [status, setStatus] = useState<MultiLockClaimStatus>("idle")
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

  const claimAll = useCallback(
    (claims: ClaimLockRequest[]) => {
      void executeSequential(claims)
    },
    [executeSequential],
  )

  const clear = useCallback(() => {
    setStatus("idle")
    setLockStates([])
    setCurrentIndex(0)
  }, [])

  const successCount = lockStates.filter(
    (state) => state.status === "success",
  ).length
  const errorCount = lockStates.filter(
    (state) => state.status === "error",
  ).length

  return {
    claimAll,
    lockStates,
    currentIndex,
    totalLocks: lockStates.length,
    successCount,
    errorCount,
    isInProgress: status === "claiming",
    isDone: status === "done",
    hasErrors: errorCount > 0,
    clear,
  }
}

export default useMultiLockClaimBribes
