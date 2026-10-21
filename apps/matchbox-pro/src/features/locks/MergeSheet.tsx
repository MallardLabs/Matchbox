import * as Button from "@repo/ui/button"
import { cn } from "@repo/ui/cn"
import * as Toast from "@repo/ui/toast"
import { type ReactElement, useState } from "react"
import LockSheet, { ErrorNote, SheetFooter, WarningNote } from "./LockSheet"
import { LOCK_ESCROW_ABI, withEscrowErrors } from "./escrowWrites"
import {
  type LockView,
  formatLockAmount,
  lockStatus,
  mergePlan,
  mergedLock,
} from "./lockModel"
import { useLockWrite } from "./useLockWrite"

/**
 * Pen 15 / 15b: pick the other lock, review source + keep = result, sign.
 * Replaces the canvas drag with an explicit, keyboard-reachable choice.
 */
export default function MergeSheet({
  lock,
  locks,
  nowSeconds,
  onClose,
  onDone,
}: {
  lock: LockView
  locks: LockView[]
  nowSeconds: bigint
  onClose: () => void
  onDone: () => void
}): ReactElement {
  const { toast } = Toast.useToast()
  const { send, pending, contracts, writeContractAsync } = useLockWrite()
  const options = locks
    .filter((other) => other.kind === lock.kind && other.key !== lock.key)
    .map((other) => ({ other, plan: mergePlan(lock, other) }))
  const [choice, setChoice] = useState<string | undefined>(
    () => options.find((option) => option.plan.ok)?.other.key,
  )
  const [failure, setFailure] = useState<string | null>(null)
  const selected = options.find((option) => option.other.key === choice)
  const plan = selected?.plan.ok ? selected.plan : null
  const escrow = lock.kind === "veMEZO" ? contracts.veMEZO : contracts.veBTC

  async function submit(): Promise<void> {
    if (!plan || pending) return
    setFailure(null)
    const error = await send(
      "merge",
      withEscrowErrors(() =>
        writeContractAsync({
          address: escrow.address,
          abi: LOCK_ESCROW_ABI,
          functionName: "merge",
          args: [plan.source.tokenId, plan.target.tokenId],
        }),
      ),
    )
    if (error) {
      setFailure(error)
      return
    }
    toast({
      title: "Locks merged",
      description: `#${plan.source.id} into #${plan.target.id}`,
    })
    onDone()
    onClose()
  }

  return (
    <LockSheet
      title="Merge locks"
      description={
        plan
          ? `#${plan.source.id} into #${plan.target.id}`
          : `${lock.kind} #${lock.id}`
      }
      onClose={onClose}
    >
      <form
        className="flex flex-col gap-3.5 pt-1"
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
      >
        {options.length === 0 ? (
          <p className="m-0 text-body text-secondary">
            No other {lock.kind} locks
          </p>
        ) : (
          <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
            <legend className="mb-2 p-0 text-caption font-500 text-muted">
              Merge with
            </legend>
            <ol className="m-0 flex list-none flex-col gap-1 p-0">
              {options.map(({ other, plan: option }) => (
                <li key={other.key}>
                  <label
                    className={cn(
                      "flex min-h-10 cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-body-sm transition-colors has-[:disabled]:cursor-not-allowed has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent-ink",
                      other.key === choice
                        ? "bg-accent-soft text-ink"
                        : "bg-inset text-ink-2 hover:bg-inset-2",
                      !option.ok && "text-muted",
                    )}
                  >
                    <input
                      type="radio"
                      name="merge-with"
                      value={other.key}
                      checked={other.key === choice}
                      disabled={!option.ok}
                      onChange={() => setChoice(other.key)}
                      className="size-3.5 shrink-0 accent-accent"
                    />
                    <span className="font-650 tabular-nums">#{other.id}</span>
                    <span className="tabular-nums">
                      {formatLockAmount(other.kind, other.amount)}
                    </span>
                    <span className="ml-auto truncate text-label text-secondary">
                      {option.ok
                        ? lockStatus(other, nowSeconds)
                        : option.reason}
                    </span>
                  </label>
                </li>
              ))}
            </ol>
          </fieldset>
        )}

        {plan ? (
          <>
            <MergeSummary
              source={plan.source}
              target={plan.target}
              nowSeconds={nowSeconds}
            />
            <WarningNote>
              #{plan.source.id} is burned into #{plan.target.id}. Voting power
              combines. The longer lock wins. This cannot be undone.
            </WarningNote>
          </>
        ) : null}
        <ErrorNote message={failure} />
        <SheetFooter onCancel={onClose}>
          <Button.Root
            type="submit"
            variant="danger"
            size="lg"
            className="h-9"
            loading={pending}
            disabled={!plan}
          >
            {pending ? "Merging…" : "Merge locks"}
          </Button.Root>
        </SheetFooter>
      </form>
    </LockSheet>
  )
}

function MergeSummary({
  source,
  target,
  nowSeconds,
}: {
  source: LockView
  target: LockView
  nowSeconds: bigint
}): ReactElement {
  const result = { ...target, ...mergedLock(source, target) }
  const rows = [
    { label: "Source", lock: source, tone: "text-secondary" },
    { label: "Keep", lock: target, tone: "text-ink" },
  ]
  return (
    <table className="w-full border-collapse rounded-lg bg-inset text-left text-body-sm tabular-nums">
      <caption className="sr-only">Merge result</caption>
      <tbody>
        {rows.map((row, index) => (
          <tr key={row.label} className={row.tone}>
            <th
              scope="row"
              className={cn(
                "w-0 whitespace-nowrap py-1 pl-3 pr-3 font-500",
                index === 0 ? "pt-3" : "pt-0",
              )}
            >
              {index === 1 ? (
                <span aria-hidden="true" className="block pb-1 text-muted">
                  +
                </span>
              ) : null}
              {row.label}
            </th>
            <Cells
              lock={row.lock}
              nowSeconds={nowSeconds}
              first={index === 0}
            />
          </tr>
        ))}
        <tr className="text-ink">
          <th
            scope="row"
            className="w-0 whitespace-nowrap border-t border-line py-3 pl-3 pr-3 font-700"
          >
            Result
          </th>
          <Cells lock={result} nowSeconds={nowSeconds} first={false} strong />
        </tr>
      </tbody>
    </table>
  )
}

function Cells({
  lock,
  nowSeconds,
  first,
  strong = false,
}: {
  lock: LockView
  nowSeconds: bigint
  first: boolean
  strong?: boolean
}): ReactElement {
  const cell = cn(
    "align-bottom py-1 pr-3",
    first && "pt-3",
    strong && "border-t border-line py-3 font-700",
  )
  return (
    <>
      <td className={cn(cell, "w-0 whitespace-nowrap")}>#{lock.id}</td>
      <td className={cn(cell, "w-0 whitespace-nowrap")}>
        {formatLockAmount(lock.kind, lock.amount)}
      </td>
      <td className={cn(cell, "lowercase")}>{lockStatus(lock, nowSeconds)}</td>
    </>
  )
}
