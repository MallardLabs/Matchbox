import { useSequentialWrites } from "@/hooks/useWrites"
import { useNetwork } from "@/lib/network"
import * as Button from "@repo/ui/button"
import * as SigningSteps from "@repo/ui/signing-steps"
import * as Toast from "@repo/ui/toast"
import { type ReactElement, useState } from "react"
import LockSheet, { SheetFooter, WarningNote } from "./LockSheet"
import { LOCK_ESCROW_ABI, withEscrowErrors } from "./escrowWrites"
import { type LockView, RESET_LABEL, formatLockAmount } from "./lockModel"
import {
  type SigningStep,
  applySigningEvent,
  retryFrom,
  signingPhase,
  startSigning,
} from "./signing"
import { useResetPlan, voterContract } from "./useResetPlan"

/**
 * Pen 21: return an expired lock's principal to this wallet. A lock with
 * live votes is reset on each voter first; a voter that took this lock's
 * vote this epoch refuses until the next one.
 */
export default function WithdrawSheet({
  lock,
  onClose,
  onDone,
}: {
  lock: LockView
  onClose: () => void
  onDone: () => void
}): ReactElement {
  const { toast } = Toast.useToast()
  const { chainId } = useNetwork()
  const writes = useSequentialWrites()
  const plan = useResetPlan(lock)
  const [steps, setSteps] = useState<SigningStep[]>([])
  const amount = formatLockAmount(lock.kind, lock.amount)
  const escrow =
    lock.kind === "veMEZO" ? writes.contracts.veMEZO : writes.contracts.veBTC
  const resets = plan.status === "ready" ? plan.resets : []
  const blocked = plan.status === "ready" && plan.blockedBy.length > 0
  const phase = signingPhase(steps)

  function submit(): void {
    if (plan.status !== "ready" || blocked || writes.busy) return
    const run = [
      ...resets.map((voter) => ({
        id: `reset-${voter}`,
        label: RESET_LABEL[voter],
        write: () =>
          writes.writeContractAsync({
            ...voterContract(voter, chainId),
            functionName: "reset",
            args: [lock.tokenId],
          }),
      })),
      {
        id: "withdraw",
        label: `Withdraw ${amount}`,
        write: withEscrowErrors(() =>
          writes.writeContractAsync({
            address: escrow.address,
            abi: LOCK_ESCROW_ABI,
            functionName: "withdraw",
            args: [lock.tokenId],
          }),
        ),
      },
    ]
    setSteps(startSigning(run))
    void writes.run(
      run.map(({ id, write }) => ({ id, write })),
      (id, status, error) => {
        setSteps((current) => applySigningEvent(current, id, status, error))
        if (status === "done" && id === "withdraw") {
          toast({
            title: "Withdrawn",
            description: `${amount} · ${lock.kind} #${lock.id}`,
          })
          onDone()
        }
      },
    )
  }

  return (
    <LockSheet
      title="Withdraw expired"
      description={`${lock.kind} #${lock.id} · ${amount}`}
      onClose={onClose}
    >
      <form
        className="flex flex-col gap-3.5 pt-1"
        onSubmit={(event) => {
          event.preventDefault()
          submit()
        }}
      >
        <dl className="m-0 flex items-baseline justify-between gap-4 rounded-lg bg-inset px-3 py-2.5 text-body">
          <dt className="text-secondary">Returns</dt>
          <dd className="m-0 font-600 tabular-nums text-ink">{amount}</dd>
        </dl>

        {steps.length > 0 ? (
          <SigningSteps.Root className="py-2">
            {steps.map((step) => (
              <SigningSteps.Step
                key={step.id}
                status={step.status}
                label={step.label}
                detail={
                  step.status === "active"
                    ? "Waiting for wallet"
                    : step.status === "failed"
                      ? step.error
                      : undefined
                }
                action={
                  step.status === "failed" && !writes.busy ? (
                    <button
                      type="button"
                      className="font-650 text-neg underline-offset-2 hover:underline"
                      onClick={() => {
                        setSteps((current) => retryFrom(current, step.id))
                        void writes.retry(step.id)
                      }}
                    >
                      Retry
                    </button>
                  ) : undefined
                }
              />
            ))}
          </SigningSteps.Root>
        ) : blocked ? (
          <WarningNote>
            Voted this epoch. Withdraw unlocks when the next epoch starts.
          </WarningNote>
        ) : resets.length > 0 ? (
          <WarningNote>
            {resets.map((voter) => RESET_LABEL[voter]).join(", ")} first:{" "}
            {resets.length + 1} signatures.
          </WarningNote>
        ) : null}

        {phase === "done" ? (
          <div className="flex justify-end">
            <Button.Root size="lg" className="h-9" onClick={onClose}>
              Done
            </Button.Root>
          </div>
        ) : (
          <SheetFooter onCancel={onClose}>
            <Button.Root
              type="submit"
              variant="danger"
              size="lg"
              className="h-9"
              loading={writes.busy || plan.status === "loading"}
              disabled={blocked || steps.length > 0}
            >
              {plan.status === "loading"
                ? "Checking votes"
                : resets.length > 0
                  ? "Reset and withdraw"
                  : "Withdraw"}
            </Button.Root>
          </SheetFooter>
        )}
      </form>
    </LockSheet>
  )
}
