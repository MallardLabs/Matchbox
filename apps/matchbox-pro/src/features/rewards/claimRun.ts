import type { SigningStepStatus } from "@repo/ui/signing-steps"

// Progress of one "Claim all" run: one step per selected source, signed and
// confirmed in order. A failed step stops the run; Retry resumes from it.
export type ClaimStepState =
  | "queued"
  | "wallet"
  | "confirming"
  | "done"
  | "rejected"
  | "reverted"
  | "failed"

export type ClaimStep = {
  key: string
  state: ClaimStepState
  hash?: string | undefined
  error?: string | undefined
}

export type ClaimRunPhase = "running" | "complete" | "partial" | "failed"

const FAILED: ReadonlySet<ClaimStepState> = new Set([
  "rejected",
  "reverted",
  "failed",
])

export function isFailedStep(state: ClaimStepState): boolean {
  return FAILED.has(state)
}

export function startRun(keys: string[]): ClaimStep[] {
  return keys.map((key) => ({ key, state: "queued" }))
}

export function updateStep(
  steps: ClaimStep[],
  key: string,
  patch: Partial<Omit<ClaimStep, "key">>,
): ClaimStep[] {
  return steps.map((step) => (step.key === key ? { ...step, ...patch } : step))
}

/** Resets the failed step and every queued step after it for a retry. */
export function retryFrom(steps: ClaimStep[], key: string): ClaimStep[] {
  const index = steps.findIndex((step) => step.key === key)
  if (index < 0) return steps
  return steps.map((step, i) =>
    i >= index && step.state !== "done"
      ? { key: step.key, state: "queued" }
      : step,
  )
}

export function runPhase(steps: ClaimStep[]): ClaimRunPhase {
  if (steps.some((step) => isFailedStep(step.state))) {
    return steps.some((step) => step.state === "done") ? "partial" : "failed"
  }
  if (steps.length > 0 && steps.every((step) => step.state === "done")) {
    return "complete"
  }
  return "running"
}

export function signingStatus(state: ClaimStepState): SigningStepStatus {
  if (state === "done") return "done"
  if (state === "wallet" || state === "confirming") return "active"
  if (isFailedStep(state)) return "failed"
  return "pending"
}

export function stepDetail(step: ClaimStep): string | undefined {
  switch (step.state) {
    case "wallet":
      return "Waiting for wallet"
    case "confirming":
      return "Confirming"
    case "rejected":
      return "Rejected in wallet"
    case "reverted":
      return "Reverted · nothing claimed"
    case "failed":
      return step.error ?? "Not submitted"
    default:
      return undefined
  }
}
