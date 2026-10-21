import { type WriteStep, useSequentialWrites } from "@/hooks/useWrites"
import { ERC20_ABI } from "@repo/shared/contracts"
import { useCallback, useState } from "react"
import type { Address } from "viem"
import {
  type IncentiveStep,
  type IncentiveStepEvent,
  applyStepEvent,
  planIncentiveSteps,
} from "./signing"

export type AddIncentivesInput = {
  gauge: Address
  token: Address
  symbol: string
  amount: bigint
  amountLabel: string
  approve: boolean
}

/**
 * Approve (only when the allowance is short) then `addBribes`, one wallet
 * prompt each. Hashes are captured as each prompt returns so success and
 * revert states can link to the explorer.
 */
export function useAddIncentives() {
  const writes = useSequentialWrites()
  const [steps, setSteps] = useState<IncentiveStep[]>([])

  const dispatch = useCallback((event: IncentiveStepEvent) => {
    setSteps((previous) => applyStepEvent(previous, event))
  }, [])

  const { run, writeContractAsync, contracts } = writes

  const start = useCallback(
    async (input: AddIncentivesInput) => {
      setSteps(planIncentiveSteps(input))
      const plan: WriteStep[] = []
      if (input.approve) {
        plan.push({
          id: "approve",
          write: async () => {
            const hash = await writeContractAsync({
              address: input.token,
              abi: ERC20_ABI,
              chainId: contracts.boostVoter.chainId,
              functionName: "approve",
              args: [contracts.boostVoter.address, input.amount],
            })
            dispatch({ type: "submitted", id: "approve", hash })
            return hash
          },
        })
      }
      plan.push({
        id: "deposit",
        write: async () => {
          const hash = await writeContractAsync({
            ...contracts.boostVoter,
            functionName: "addBribes",
            args: [input.gauge, [input.token], [input.amount]],
          })
          dispatch({ type: "submitted", id: "deposit", hash })
          return hash
        },
      })
      await run(plan, (id, status, error) => {
        if (id !== "approve" && id !== "deposit") return
        if (status === "signing") dispatch({ type: "signing", id })
        else if (status === "done") dispatch({ type: "done", id })
        else
          dispatch({
            type: "failed",
            id,
            error: error ?? "Transaction failed.",
          })
      })
    },
    [contracts, dispatch, run, writeContractAsync],
  )

  const { retry: retryWrite } = writes
  const retry = useCallback(
    (id: IncentiveStep["id"]) => {
      dispatch({ type: "retry", id })
      void retryWrite(id)
    },
    [dispatch, retryWrite],
  )

  const reset = useCallback(() => setSteps([]), [])

  return { steps, start, retry, reset, busy: writes.busy }
}
