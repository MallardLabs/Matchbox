import type { useClaimable } from "@/hooks/useClaimable"
import { getContractConfig } from "@/lib/contracts"
import { useNetwork } from "@/lib/network"
import {
  type RewardClaim,
  readRewardClaims,
  reconcileRewardClaims,
  rewardClaimError,
} from "@/lib/rewardClaims"
import {
  useIsMutating,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"
import { useEffect, useRef, useState } from "react"
import { TransactionReceiptNotFoundError } from "viem"
import { useAccount, usePublicClient, useWriteContract } from "wagmi"

export function useRewardClaims() {
  const { address, chainId: walletChain } = useAccount()
  const { chainId } = useNetwork()
  const client = usePublicClient({ chainId })
  const queries = useQueryClient()
  const { writeContractAsync } = useWriteContract()
  const key = `matchbox-reward-claims:${chainId}:${address?.toLowerCase() ?? "none"}`
  const [saved, setSaved] = useState<{ key: string; rows: RewardClaim[] }>({
    key: "",
    rows: [],
  })
  const signing =
    useIsMutating({ mutationKey: ["reward-claim-submit", key] }) > 0
  const [error, setError] = useState<string | null>(null)
  const locked = useRef(false)
  const rows = saved.key === key ? saved.rows : []
  const pending = rows.filter((row) => row.status === "pending")
  const walletWrite = useMutation({
    mutationKey: ["reward-claim-submit", key],
    mutationFn: async (
      claim: ReturnType<typeof useClaimable>["claims"][number],
    ) => {
      if (!address) throw new Error("Wallet disconnected")
      return writeContractAsync({
        ...getContractConfig(chainId).boostVoter,
        account: address,
        functionName: "claimBribes",
        args: [claim.bribes, claim.tokens, claim.tokenId],
      })
    },
  })

  useEffect(() => {
    function refresh() {
      try {
        setSaved({ key, rows: readRewardClaims(localStorage.getItem(key)) })
      } catch {
        setSaved({ key, rows: [] })
      }
    }
    refresh()
    window.addEventListener("storage", refresh)
    window.addEventListener("reward-claims-changed", refresh)
    setError(null)
    return () => {
      window.removeEventListener("storage", refresh)
      window.removeEventListener("reward-claims-changed", refresh)
    }
  }, [key])

  const receipts = useQuery({
    queryKey: [
      "reward-claim-receipts",
      key,
      pending.map((row) => row.hash).join(","),
    ],
    enabled: !!client && pending.length > 0,
    refetchInterval: 4000,
    queryFn: async () =>
      Promise.all(
        pending.map(async (row) => {
          if (!client) throw new Error("Network unavailable")
          try {
            const receipt = await client.getTransactionReceipt({
              hash: row.hash,
            })
            return {
              hash: row.hash,
              status:
                receipt.status === "success"
                  ? ("confirmed" as const)
                  : ("reverted" as const),
            }
          } catch (error) {
            if (error instanceof TransactionReceiptNotFoundError)
              return { hash: row.hash, status: "pending" as const }
            throw error
          }
        }),
      ),
  })

  useEffect(() => {
    const updates = receipts.data?.filter((row) => row.status !== "pending")
    if (!updates?.length) return
    setSaved((previous) => {
      if (previous.key !== key) return previous
      const next = reconcileRewardClaims(previous.rows, updates)
      try {
        localStorage.setItem(key, JSON.stringify(next))
      } catch {
        /* Session state remains available. */
      }
      return { key, rows: next }
    })
    void queries.invalidateQueries({ queryKey: ["claimable-earned"] })
  }, [key, queries, receipts.data])

  async function submit(
    claim: ReturnType<typeof useClaimable>["claims"][number],
  ) {
    if (
      locked.current ||
      queries.isMutating({ mutationKey: ["reward-claim-submit", key] }) > 0 ||
      pending.length ||
      !address ||
      walletChain !== chainId ||
      saved.key !== key
    )
      return
    locked.current = true
    setError(null)
    try {
      // Verify that recovery storage is writable before asking the wallet to sign.
      localStorage.setItem(key, JSON.stringify(rows))
      const hash = await walletWrite.mutateAsync(claim)
      const record: RewardClaim = {
        hash,
        tokenId: claim.tokenId.toString(),
        submittedAt: Date.now(),
        status: "pending",
      }
      const next = [...rows, record]
      setSaved({ key, rows: next })
      try {
        localStorage.setItem(key, JSON.stringify(next))
        window.dispatchEvent(new Event("reward-claims-changed"))
      } catch {
        setError(
          `Claim submitted (${hash}), but browser storage failed. Keep this page open until confirmation.`,
        )
      }
    } catch (error) {
      setError(rewardClaimError(error))
    } finally {
      locked.current = false
    }
  }

  return {
    rows,
    submit,
    signing,
    error,
    pending: pending.length > 0,
    receiptError: receipts.error,
    wrongNetwork: walletChain !== chainId,
    ready: saved.key === key,
    explorer: client?.chain?.blockExplorers?.default.url,
  }
}
