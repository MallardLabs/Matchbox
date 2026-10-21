import { getContractConfig } from "@/lib/contracts"
import supportsAtomicBatch from "@/lib/eip5792"
import { ERC20_APPROVE_ABI } from "@/lib/escrowAbi"
import { useNetwork } from "@/lib/network"
import { describeWriteError } from "@/lib/writeErrors"
import { useCallback, useRef, useState } from "react"
import type { Address, Hex } from "viem"
import { sendCalls, waitForCallsStatus } from "viem/actions"
import {
  useAccount,
  usePublicClient,
  useWalletClient,
  useWriteContract,
} from "wagmi"

export type WriteStep = {
  id: string
  write: () => Promise<Hex>
  call?: { to: Address; data: Hex }
}

// Wallets can sit on a bundle; viem's 60s default gives up while the bundle
// may still land.
const BUNDLE_TIMEOUT_MS = 180_000

export type WriteStepHandler = (
  id: string,
  status: "signing" | "done" | "failed",
  error?: string,
) => void

export function useSequentialWrites() {
  const { chainId } = useNetwork()
  const { address } = useAccount()
  const publicClient = usePublicClient({ chainId })
  const { data: walletClient } = useWalletClient({ chainId })
  const { writeContractAsync } = useWriteContract()
  const [busy, setBusy] = useState(false)
  const [batched, setBatched] = useState(false)
  const sessionRef = useRef<{
    steps: WriteStep[]
    onStep: WriteStepHandler
  } | null>(null)

  const runSequential = useCallback(
    async (fromIndex: number) => {
      const session = sessionRef.current
      if (!session) return
      const { steps, onStep } = session
      for (let index = fromIndex; index < steps.length; index += 1) {
        const step = steps[index]
        if (!step) continue
        onStep(step.id, "signing")
        try {
          const hash = await step.write()
          if (publicClient) {
            const receipt = await publicClient.waitForTransactionReceipt({
              hash,
            })
            if (receipt.status === "reverted") {
              onStep(
                step.id,
                "failed",
                "Transaction reverted on-chain. Nothing was changed.",
              )
              return
            }
          }
          onStep(step.id, "done")
        } catch (error) {
          onStep(step.id, "failed", describeWriteError(error).message)
          return
        }
      }
    },
    [publicClient],
  )

  const run = useCallback(
    async (steps: WriteStep[], onStep: WriteStepHandler) => {
      sessionRef.current = { steps, onStep }
      setBusy(true)
      setBatched(false)
      try {
        const canBatch =
          walletClient &&
          address &&
          steps.length > 1 &&
          steps.every((step) => step.call) &&
          (await supportsAtomicBatch(walletClient, address, chainId))

        if (canBatch) {
          setBatched(true)
          for (const step of steps) onStep(step.id, "signing")
          let bundleId: string | undefined
          try {
            const sent = await sendCalls(walletClient, {
              account: address,
              calls: steps.flatMap((step) =>
                step.call ? [{ to: step.call.to, data: step.call.data }] : [],
              ),
              forceAtomic: true,
            })
            bundleId = sent.id
          } catch (error) {
            const failure = describeWriteError(error)
            // Only an unsupported bundle may fall back to one-by-one signing;
            // a rejection must not re-prompt the user step by step.
            if (failure.kind !== "unsupported") {
              for (const step of steps) {
                onStep(step.id, "failed", failure.message)
              }
              return
            }
            setBatched(false)
          }

          if (bundleId) {
            try {
              const result = await waitForCallsStatus(walletClient, {
                id: bundleId,
                timeout: BUNDLE_TIMEOUT_MS,
              })
              const reverted =
                result.status !== "success" ||
                (result.receipts ?? []).some(
                  (receipt) => receipt.status !== "success",
                )
              for (const step of steps) {
                if (reverted) {
                  onStep(
                    step.id,
                    "failed",
                    "The bundle reverted on-chain. Nothing was changed.",
                  )
                } else {
                  onStep(step.id, "done")
                }
              }
            } catch (error) {
              const failure = describeWriteError(error)
              for (const step of steps) {
                onStep(step.id, "failed", failure.message)
              }
            }
            return
          }
        }

        await runSequential(0)
      } finally {
        setBusy(false)
      }
    },
    [address, chainId, runSequential, walletClient],
  )

  const retry = useCallback(
    async (id: string) => {
      const session = sessionRef.current
      if (!session || busy) return
      const index = session.steps.findIndex((step) => step.id === id)
      if (index < 0) return
      setBusy(true)
      try {
        await runSequential(index)
      } finally {
        setBusy(false)
      }
    },
    [busy, runSequential],
  )

  return {
    run,
    retry,
    writeContractAsync,
    busy,
    batched,
    contracts: getContractConfig(chainId),
  }
}

export function useApproveAndAddIncentives() {
  const writes = useSequentialWrites()
  const { address } = useAccount()

  const submit = useCallback(
    async (
      input: {
        token: Address
        amount: bigint
        gauge: Address
      },
      onStep: WriteStepHandler,
    ) => {
      const { contracts, writeContractAsync } = writes
      if (!address) return
      await writes.run(
        [
          {
            id: "approve",
            write: () =>
              writeContractAsync({
                address: input.token,
                abi: ERC20_APPROVE_ABI,
                functionName: "approve",
                args: [contracts.boostVoter.address, input.amount],
              }),
          },
          {
            id: "deposit",
            write: () =>
              writeContractAsync({
                ...contracts.boostVoter,
                functionName: "addBribes",
                args: [input.gauge, [input.token], [input.amount]],
              }),
          },
        ],
        onStep,
      )
    },
    [address, writes],
  )

  return { submit, retry: writes.retry, busy: writes.busy }
}
