import type { SigningStepStatus } from "@repo/ui/signing-steps"

export type SigningStep = {
  id: string
  label: string
  status: SigningStepStatus
  error: string | null
}

export type SigningEvent = "signing" | "done" | "failed"

export function startSigning(
  steps: Array<{ id: string; label: string }>,
): SigningStep[] {
  return steps.map((step, index) => ({
    ...step,
    status: index === 0 ? "active" : "pending",
    error: null,
  }))
}

/** Applies a `useSequentialWrites` step event. */
export function applySigningEvent(
  steps: SigningStep[],
  id: string,
  event: SigningEvent,
  error?: string,
): SigningStep[] {
  return steps.map((step) => {
    if (step.id !== id) return step
    if (event === "signing") return { ...step, status: "active", error: null }
    if (event === "done") return { ...step, status: "done", error: null }
    return { ...step, status: "failed", error: error ?? "Transaction failed." }
  })
}

/** Retrying resumes at the failed step; everything after it waits again. */
export function retryFrom(steps: SigningStep[], id: string): SigningStep[] {
  const index = steps.findIndex((step) => step.id === id)
  if (index < 0) return steps
  return steps.map((step, i) => {
    if (i < index) return step
    if (i === index) return { ...step, status: "active", error: null }
    return step.status === "done" ? step : { ...step, status: "pending" }
  })
}

export type SigningPhase = "idle" | "signing" | "failed" | "done"

export function signingPhase(steps: SigningStep[]): SigningPhase {
  if (steps.length === 0) return "idle"
  if (steps.every((step) => step.status === "done")) return "done"
  if (steps.some((step) => step.status === "active")) return "signing"
  if (steps.some((step) => step.status === "failed")) return "failed"
  return "signing"
}
