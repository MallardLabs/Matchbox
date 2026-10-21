import { getContractConfig } from "@/lib/contracts"
import { useNetwork } from "@/lib/network"
import { type RewardClaim, readRewardClaims } from "@/lib/rewardClaims"
import { describeWriteError } from "@/lib/writeErrors"
import { BOOST_VOTER_ABI, type SupportedChainId } from "@repo/shared/contracts"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useCallback, useRef, useState } from "react"
import type { Abi, Address, Hash } from "viem"
import { useAccount, usePublicClient, useWriteContract } from "wagmi"
import {
  type ClaimStep,
  retryFrom,
  runPhase,
  startRun,
  updateStep,
} from "./claimRun"
import type { ClaimSource } from "./claimSources"
import { VEBTC_CLAIMABLE_KEY } from "./useClaimSources"
import {
  POOLS_VOTER_CLAIM_ABI,
  VALIDATORS_VOTER_CLAIM_ABI,
  veBtcVoters,
} from "./veBtcClaimable"

type ClaimCall = {
  address: Address
  abi: Abi
  functionName: string
  args: readonly [Address[], Address[][], bigint]
}

/** The voter call that claims one source: one signature, one lock. */
export function claimCall(
  source: ClaimSource,
  chainId: SupportedChainId,
): ClaimCall {
  const args = [
    source.rewardContracts,
    source.rewardTokens,
    source.tokenId,
  ] as const
  const voters = veBtcVoters(chainId)
  switch (source.kind) {
    case "boost-bribes":
      return {
        address: getContractConfig(chainId).boostVoter.address,
        abi: BOOST_VOTER_ABI,
        functionName: "claimBribes",
        args,
      }
    case "pool-rewards":
      return {
        address: voters.pools,
        abi: POOLS_VOTER_CLAIM_ABI,
        functionName: "claimFeesAndBribes",
        args,
      }
    case "validator-bribes":
      return {
        address: voters.validators,
        abi: VALIDATORS_VOTER_CLAIM_ABI,
        functionName: "claimBribes",
        args,
      }
  }
}

export type ClaimRun = {
  sources: ClaimSource[]
  steps: ClaimStep[]
}

// Same storage the claim receipt watcher (`useRewardClaims`) reads, so a
// claim submitted here is still tracked after a refresh.
function storageKey(chainId: number, address: Address): string {
  return `matchbox-reward-claims:${chainId}:${address.toLowerCase()}`
}

function rememberClaim(key: string, record: RewardClaim): void {
  try {
    const rows = readRewardClaims(localStorage.getItem(key))
    localStorage.setItem(key, JSON.stringify([...rows, record]))
    window.dispatchEvent(new Event("reward-claims-changed"))
  } catch {
    // The run still tracks the receipt for this page view.
  }
}

/**
 * Signs each selected source in order — one wallet signature per source,
 * not atomic. A failure stops the run at that step; `retry` resumes from it
 * and continues with the rest.
 */
export function useClaimRun() {
  const { address } = useAccount()
  const { chainId } = useNetwork()
  const client = usePublicClient({ chainId })
  const queryClient = useQueryClient()
  const { writeContractAsync } = useWriteContract()
  const [run, setRun] = useState<ClaimRun | null>(null)
  const busy = useRef(false)

  const submit = useCallback(
    (source: ClaimSource): Promise<Hash> =>
      writeContractAsync({ ...claimCall(source, chainId), chainId }),
    [chainId, writeContractAsync],
  )

  const execute = useCallback(
    async (sources: ClaimSource[], fromKey: string) => {
      if (busy.current || !address) return
      busy.current = true
      const key = storageKey(chainId, address)
      const start = sources.findIndex((source) => source.key === fromKey)
      try {
        for (const source of sources.slice(Math.max(0, start))) {
          const patch = (next: Partial<Omit<ClaimStep, "key">>): void =>
            setRun((current) =>
              current
                ? {
                    ...current,
                    steps: updateStep(current.steps, source.key, next),
                  }
                : current,
            )
          patch({ state: "wallet", error: undefined })
          let hash: Hash
          try {
            hash = await submit(source)
          } catch (error) {
            const failure = describeWriteError(error)
            patch({
              state: failure.kind === "rejected" ? "rejected" : "failed",
              error: failure.message,
            })
            return
          }
          rememberClaim(key, {
            hash,
            tokenId: source.tokenId.toString(),
            submittedAt: Date.now(),
            status: "pending",
          })
          patch({ state: "confirming", hash })
          try {
            const receipt = client
              ? await client.waitForTransactionReceipt({ hash })
              : null
            if (receipt?.status === "reverted") {
              patch({ state: "reverted" })
              return
            }
            patch({ state: "done" })
          } catch (error) {
            patch({ state: "failed", error: describeWriteError(error).message })
            return
          } finally {
            void queryClient.invalidateQueries({
              queryKey: ["claimable-earned"],
            })
            void queryClient.invalidateQueries({
              queryKey: [VEBTC_CLAIMABLE_KEY],
            })
          }
        }
      } finally {
        busy.current = false
      }
    },
    [address, chainId, client, queryClient, submit],
  )

  const start = useCallback(
    (sources: ClaimSource[]) => {
      const first = sources[0]
      if (busy.current || !first) return
      setRun({ sources, steps: startRun(sources.map((source) => source.key)) })
      void execute(sources, first.key)
    },
    [execute],
  )

  const retry = useCallback(
    (key: string) => {
      if (busy.current || !run) return
      setRun({ ...run, steps: retryFrom(run.steps, key) })
      void execute(run.sources, key)
    },
    [execute, run],
  )

  const close = useCallback(() => {
    if (busy.current) return
    setRun(null)
  }, [])

  return {
    run,
    phase: run ? runPhase(run.steps) : null,
    start,
    retry,
    close,
  }
}

/**
 * Simulates each source's claim call (eth_estimateGas as the lock owner) and
 * prices the total in BTC. A failed simulation marks that source; it never
 * blocks the claim.
 */
export function useClaimEstimate(
  owner: Address | undefined,
  sources: ClaimSource[],
) {
  const { chainId } = useNetwork()
  const client = usePublicClient({ chainId })
  const keys = sources.map((source) => source.key).join(",")

  return useQuery({
    queryKey: ["claim-estimate", chainId, owner, keys],
    enabled: !!client && !!owner && sources.length > 0,
    staleTime: 60_000,
    retry: false,
    queryFn: async () => {
      if (!client || !owner) return { gasWei: null, failed: [] }
      const results = await Promise.all(
        sources.map(async (source) => {
          try {
            return await client.estimateContractGas({
              ...claimCall(source, chainId),
              account: owner,
            })
          } catch {
            return null
          }
        }),
      )
      const failed = sources
        .filter((_, index) => results[index] === null)
        .map((source) => source.key)
      const gas = results.reduce<bigint>(
        (sum, value) => sum + (value ?? 0n),
        0n,
      )
      if (gas === 0n) return { gasWei: null, failed }
      const price = await client.getGasPrice().catch(() => null)
      return { gasWei: price === null ? null : gas * price, failed }
    },
  })
}
