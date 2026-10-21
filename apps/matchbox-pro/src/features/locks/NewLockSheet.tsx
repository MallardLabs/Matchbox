import { useSequentialWrites } from "@/hooks/useWrites"
import { formatFixedPoint } from "@/lib/money"
import { QUERY_PROFILES } from "@/lib/queryProfiles"
import { useViewer } from "@/lib/viewer"
import { ERC20_ABI } from "@repo/shared/contracts"
import * as Button from "@repo/ui/button"
import { cn } from "@repo/ui/cn"
import * as Field from "@repo/ui/field"
import * as Input from "@repo/ui/input"
import * as SigningSteps from "@repo/ui/signing-steps"
import * as Toast from "@repo/ui/toast"
import { type ReactElement, useState } from "react"
import { type Hex, isAddressEqual, parseEventLogs, zeroAddress } from "viem"
import { usePublicClient, useReadContracts } from "wagmi"
import LockSheet, { SheetFooter } from "./LockSheet"
import { LOCK_ESCROW_ABI, withEscrowErrors } from "./escrowWrites"
import {
  VE_MEZO_MAX_LOCK,
  WEEK_SECONDS,
  formatLockAmount,
  formatVotingPower,
  initialVotingPower,
  parseTokenInput,
} from "./lockModel"
import {
  type SigningStep,
  applySigningEvent,
  retryFrom,
  signingPhase,
  startSigning,
} from "./signing"

const DURATIONS = [
  { id: "1y", label: "1 year", seconds: 52n * WEEK_SECONDS },
  { id: "2y", label: "2 years", seconds: 104n * WEEK_SECONDS },
  { id: "4y", label: "4 years", seconds: VE_MEZO_MAX_LOCK },
] as const
type DurationId = (typeof DURATIONS)[number]["id"]

/** Pen 20: MEZO amount, duration chips and Auto max-lock, then signing. */
export default function NewLockSheet({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: () => void
}): ReactElement {
  const { viewer } = useViewer()
  const writes = useSequentialWrites()
  const { contracts } = writes
  const publicClient = usePublicClient({ chainId: contracts.veMEZO.chainId })
  const { toast } = Toast.useToast()
  const [amountInput, setAmountInput] = useState("")
  const [duration, setDuration] = useState<DurationId>("4y")
  const [autoMaxLock, setAutoMaxLock] = useState(false)
  const [touched, setTouched] = useState(false)
  const [steps, setSteps] = useState<SigningStep[]>([])
  const owner = viewer.mode === "connected" ? viewer.address : undefined

  const reads = useReadContracts({
    contracts: owner
      ? [
          {
            ...contracts.mezoToken,
            abi: ERC20_ABI,
            functionName: "balanceOf" as const,
            args: [owner] as const,
          },
          {
            ...contracts.mezoToken,
            abi: ERC20_ABI,
            functionName: "allowance" as const,
            args: [owner, contracts.veMEZO.address] as const,
          },
        ]
      : [],
    query: { ...QUERY_PROFILES.SHORT_CACHE, enabled: Boolean(owner) },
  })
  const balance =
    typeof reads.data?.[0]?.result === "bigint" ? reads.data[0].result : null
  const allowance =
    typeof reads.data?.[1]?.result === "bigint" ? reads.data[1].result : null

  const amount = parseTokenInput(amountInput, 18)
  const seconds =
    DURATIONS.find((item) => item.id === duration)?.seconds ?? VE_MEZO_MAX_LOCK
  const nowSeconds = BigInt(Math.floor(Date.now() / 1000))
  const error =
    amountInput.trim() === ""
      ? touched
        ? "Enter an amount"
        : null
      : amount === null
        ? "Enter a valid amount"
        : balance !== null && amount > balance
          ? "More than this wallet holds"
          : null
  const canSubmit =
    owner !== undefined && amount !== null && error === null && !writes.busy

  function submit(): void {
    setTouched(true)
    if (!canSubmit || amount === null) return
    const needsApproval = allowance === null || allowance < amount
    let lockHash: Hex | undefined
    const plan = [
      ...(needsApproval
        ? [
            {
              id: "approve",
              label: "Approve MEZO",
              write: () =>
                writes.writeContractAsync({
                  ...contracts.mezoToken,
                  abi: ERC20_ABI,
                  functionName: "approve",
                  args: [contracts.veMEZO.address, amount],
                }),
            },
          ]
        : []),
      {
        id: "create",
        label: "Create veMEZO lock",
        write: withEscrowErrors(async () => {
          lockHash = await writes.writeContractAsync({
            address: contracts.veMEZO.address,
            abi: LOCK_ESCROW_ABI,
            functionName: "createLock",
            args: [amount, autoMaxLock ? VE_MEZO_MAX_LOCK : seconds],
          })
          return lockHash
        }),
      },
      ...(autoMaxLock
        ? [
            {
              id: "auto-max-lock",
              label: "Auto max-lock",
              write: withEscrowErrors(async () => {
                if (!publicClient || !lockHash || !owner) {
                  throw new Error("The new lock id isn't known yet.")
                }
                const receipt = await publicClient.getTransactionReceipt({
                  hash: lockHash,
                })
                const minted = parseEventLogs({
                  abi: LOCK_ESCROW_ABI,
                  eventName: "Transfer",
                  logs: receipt.logs,
                }).find(
                  (log) =>
                    isAddressEqual(log.address, contracts.veMEZO.address) &&
                    isAddressEqual(log.args.from, zeroAddress) &&
                    isAddressEqual(log.args.to, owner),
                )
                if (!minted) throw new Error("The new lock id isn't known yet.")
                return writes.writeContractAsync({
                  address: contracts.veMEZO.address,
                  abi: LOCK_ESCROW_ABI,
                  functionName: "lockPermanent",
                  args: [minted.args.tokenId],
                })
              }),
            },
          ]
        : []),
    ]
    setSteps(startSigning(plan))
    void writes.run(
      plan.map(({ id, write }) => ({ id, write })),
      (id, status, message) => {
        setSteps((current) => applySigningEvent(current, id, status, message))
        if (status === "done" && id === "create") {
          onCreated()
          toast({
            title: "Lock created",
            description: formatLockAmount("veMEZO", amount),
          })
        }
      },
    )
  }

  const phase = signingPhase(steps)
  const votingPower =
    amount === null
      ? null
      : initialVotingPower(amount, seconds, autoMaxLock, nowSeconds)

  return (
    <LockSheet title="New lock" description="veMEZO" onClose={onClose}>
      {steps.length > 0 ? (
        <div className="flex min-h-[200px] flex-col justify-center gap-6 py-2">
          <SigningSteps.Root>
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
          {phase === "done" ? (
            <div className="flex justify-end">
              <Button.Root size="lg" className="h-9" onClick={onClose}>
                Done
              </Button.Root>
            </div>
          ) : null}
        </div>
      ) : (
        <form
          noValidate
          className="flex flex-col gap-3 pt-1"
          onSubmit={(event) => {
            event.preventDefault()
            submit()
          }}
        >
          <Field.Root invalid={error !== null}>
            <span className="flex items-baseline justify-between gap-3">
              <Field.Label className="text-caption font-500 text-muted">
                Lock amount
              </Field.Label>
              {balance !== null ? (
                <button
                  type="button"
                  className="text-caption font-500 tabular-nums text-secondary underline-offset-2 hover:text-ink hover:underline"
                  onClick={() => setAmountInput(formatFixedPoint(balance, 18))}
                >
                  Balance {formatLockAmount("veMEZO", balance)}
                </button>
              ) : null}
            </span>
            <Input.Group size="lg" className="h-11 bg-inset">
              <Field.Control>
                <Input.Root
                  name="amount"
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="0.00"
                  value={amountInput}
                  onChange={(event) => setAmountInput(event.target.value)}
                  onBlur={() => setTouched(true)}
                  className="text-title-sm font-500"
                />
              </Field.Control>
              <Input.Adornment className="text-title-sm font-500 text-ink">
                MEZO
              </Input.Adornment>
            </Input.Group>
            <Field.Error>{error}</Field.Error>
          </Field.Root>

          <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
            <legend className="mb-2 p-0 text-caption font-500 text-muted">
              Duration
            </legend>
            <ol className="m-0 flex list-none flex-wrap gap-1.5 p-0">
              {DURATIONS.map((option) => {
                const selected = autoMaxLock
                  ? option.id === "4y"
                  : option.id === duration
                return (
                  <li key={option.id}>
                    <label
                      className={cn(
                        "flex h-7 cursor-pointer items-center rounded-full px-2.5 text-label font-500 transition-colors has-[:disabled]:cursor-not-allowed has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent-ink",
                        selected
                          ? "bg-accent-soft text-accent-ink"
                          : "bg-inset text-secondary hover:text-ink",
                      )}
                    >
                      <input
                        type="radio"
                        name="duration"
                        value={option.id}
                        checked={selected}
                        disabled={autoMaxLock && option.id !== "4y"}
                        onChange={() => setDuration(option.id)}
                        className="sr-only"
                      />
                      {option.label}
                    </label>
                  </li>
                )
              })}
              <li>
                <label
                  className={cn(
                    "flex h-7 cursor-pointer items-center rounded-full px-2.5 text-label font-500 transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent-ink",
                    autoMaxLock
                      ? "bg-accent-soft text-accent-ink"
                      : "bg-inset text-secondary hover:text-ink",
                  )}
                >
                  <input
                    type="checkbox"
                    name="auto-max-lock"
                    checked={autoMaxLock}
                    onChange={(event) => setAutoMaxLock(event.target.checked)}
                    className="sr-only"
                  />
                  Auto max-lock
                </label>
              </li>
            </ol>
          </fieldset>

          <p className="m-0 text-body-sm tabular-nums text-ink">
            <span className="text-secondary">Voting power</span>
            <span className="ml-1.5 font-500">
              {votingPower === null
                ? "—"
                : formatVotingPower("veMEZO", votingPower)}
            </span>
          </p>

          <SheetFooter onCancel={onClose}>
            <Button.Root
              type="submit"
              size="lg"
              className="h-9"
              disabled={!canSubmit}
            >
              Lock MEZO
            </Button.Root>
          </SheetFooter>
        </form>
      )}
    </LockSheet>
  )
}
