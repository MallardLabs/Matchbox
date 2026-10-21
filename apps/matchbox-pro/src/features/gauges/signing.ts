import type { Hex } from "viem"

export type IncentiveStepId = "approve" | "deposit"

export type IncentiveStep = {
  id: IncentiveStepId
  label: string
  status: "pending" | "active" | "done" | "failed"
  /** While active: waiting on the wallet, or signed and waiting on a block. */
  phase: "wallet" | "confirming"
  hash: Hex | undefined
  error: string | undefined
}

export type IncentiveStepEvent =
  | { type: "signing"; id: IncentiveStepId }
  | { type: "submitted"; id: IncentiveStepId; hash: Hex }
  | { type: "done"; id: IncentiveStepId }
  | { type: "failed"; id: IncentiveStepId; error: string }
  | { type: "retry"; id: IncentiveStepId }

function step(
  id: IncentiveStepId,
  label: string,
  status: IncentiveStep["status"],
): IncentiveStep {
  return {
    id,
    label,
    status,
    phase: "wallet",
    hash: undefined,
    error: undefined,
  }
}

/** Approve only when the current allowance can't cover the deposit. */
export function needsApproval(
  allowance: bigint | undefined,
  amount: bigint,
): boolean {
  return allowance === undefined || allowance < amount
}

export function planIncentiveSteps(input: {
  symbol: string
  amountLabel: string
  approve: boolean
}): IncentiveStep[] {
  const deposit = `Add ${input.amountLabel} ${input.symbol}`
  return input.approve
    ? [
        step("approve", `Approve ${input.symbol}`, "active"),
        step("deposit", deposit, "pending"),
      ]
    : [step("deposit", deposit, "active")]
}

export function applyStepEvent(
  steps: IncentiveStep[],
  event: IncentiveStepEvent,
): IncentiveStep[] {
  return steps.map((item) => {
    if (item.id !== event.id) return item
    switch (event.type) {
      case "signing":
      case "retry":
        return {
          ...item,
          status: "active",
          phase: "wallet",
          hash: undefined,
          error: undefined,
        }
      case "submitted":
        return {
          ...item,
          status: "active",
          phase: "confirming",
          hash: event.hash,
        }
      case "done":
        return { ...item, status: "done", error: undefined }
      case "failed":
        return { ...item, status: "failed", error: event.error }
    }
  })
}

export function isComplete(steps: IncentiveStep[]): boolean {
  return steps.length > 0 && steps.every((item) => item.status === "done")
}

export function failedStep(steps: IncentiveStep[]): IncentiveStep | undefined {
  return steps.find((item) => item.status === "failed")
}
