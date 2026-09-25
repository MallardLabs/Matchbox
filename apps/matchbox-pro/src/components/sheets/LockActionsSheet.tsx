import Button from "@/components/ui/Button"
import Sheet from "@/components/ui/Sheet"
import { useSequentialWrites } from "@/hooks/useWrites"
import { cn } from "@/lib/cn"
import { ESCROW_WRITE_ABI } from "@/lib/escrowAbi"
import {
  type OverviewLock,
  formatLockAmount,
  lockStatusLabel,
  mergedLock,
} from "@/lib/overview"
import { TriangleAlert } from "lucide-react"
import { type ReactElement, type ReactNode, useState } from "react"
import { getAddress, isAddress } from "viem"
import { useAccount } from "wagmi"

export type LockAction =
  | { type: "transfer"; lock: OverviewLock }
  | { type: "withdraw"; lock: OverviewLock }
  /** `into` is preset when a card was dropped on another. */
  | { type: "merge"; lock: OverviewLock; into?: OverviewLock | undefined }

type LockActionsSheetProps = {
  action: LockAction
  mergeTargets: OverviewLock[]
  nowSeconds: number
  onOpenChange: (open: boolean) => void
  onDone: (message: string) => void
}

/** Pen 14 Transfer, 15b Merge confirm and 21 Withdraw expired sheets. */
export default function LockActionsSheet({
  action,
  mergeTargets,
  nowSeconds,
  onOpenChange,
  onDone,
}: LockActionsSheetProps): ReactElement {
  const writes = useSequentialWrites()
  const { address } = useAccount()
  const { lock } = action
  const escrow =
    lock.kind === "veMEZO" ? writes.contracts.veMEZO : writes.contracts.veBTC
  const [recipient, setRecipient] = useState("")
  const [mergeIntoId, setMergeIntoId] = useState(
    action.type === "merge"
      ? (action.into?.id ?? mergeTargets[0]?.id)
      : undefined,
  )
  const [error, setError] = useState<string | null>(null)
  const into =
    action.type === "merge"
      ? (action.into ??
        mergeTargets.find((target) => target.id === mergeIntoId))
      : undefined

  async function run(write: () => Promise<`0x${string}`>, success: string) {
    setError(null)
    let failure: string | null = null
    await writes.run([{ id: action.type, write }], (_, status, message) => {
      if (status === "failed") failure = message ?? "Transaction failed"
    })
    if (failure) {
      setError(failure)
      return
    }
    onDone(success)
    onOpenChange(false)
  }

  function submit() {
    if (action.type === "transfer") {
      if (!address || !isAddress(recipient)) return
      void run(
        () =>
          writes.writeContractAsync({
            address: escrow.address,
            abi: ESCROW_WRITE_ABI,
            functionName: "transferFrom",
            args: [address, getAddress(recipient), BigInt(lock.id)],
          }),
        `Transferred ${lock.kind} #${lock.id}`,
      )
    } else if (action.type === "withdraw") {
      void run(
        () =>
          writes.writeContractAsync({
            address: escrow.address,
            abi: ESCROW_WRITE_ABI,
            functionName: "withdraw",
            args: [BigInt(lock.id)],
          }),
        `Withdrew ${lock.kind} #${lock.id}`,
      )
    } else if (into) {
      void run(
        () =>
          writes.writeContractAsync({
            address: escrow.address,
            abi: ESCROW_WRITE_ABI,
            functionName: "merge",
            args: [BigInt(lock.id), BigInt(into.id)],
          }),
        `Merged #${lock.id} into #${into.id}`,
      )
    }
  }

  const subtitle = `${lock.kind} #${lock.id}  ·  ${formatLockAmount(lock)}`
  const canSubmit =
    !writes.busy &&
    (action.type === "transfer"
      ? Boolean(address) && isAddress(recipient)
      : action.type === "merge"
        ? Boolean(into)
        : true)

  return (
    <Sheet
      open
      onOpenChange={onOpenChange}
      title={
        action.type === "transfer"
          ? "Transfer lock"
          : action.type === "merge"
            ? "Merge locks"
            : "Withdraw expired"
      }
      description={
        action.type === "merge"
          ? into
            ? `#${lock.id} into #${into.id}`
            : `${lock.kind} #${lock.id}`
          : subtitle
      }
      size="narrow"
    >
      <form
        className="flex flex-col gap-3.5"
        onSubmit={(event) => {
          event.preventDefault()
          submit()
        }}
      >
        {action.type === "transfer" ? (
          <>
            <label className="flex flex-col gap-3.5 text-[11px] font-500 text-muted">
              To address
              <input
                name="recipient"
                value={recipient}
                onChange={(event) => setRecipient(event.target.value.trim())}
                placeholder="0x"
                autoComplete="off"
                spellCheck={false}
                aria-invalid={recipient !== "" && !isAddress(recipient)}
                className="h-10 rounded-lg bg-inset px-3 text-[13px] font-500 text-ink placeholder:text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
              />
            </label>
            <Warning>Irreversible</Warning>
          </>
        ) : action.type === "merge" ? (
          <>
            {!action.into && mergeTargets.length > 1 ? (
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-2 text-[11px] font-500 text-muted">
                  Merge into
                </legend>
                <div className="flex flex-wrap gap-1.5">
                  {mergeTargets.map((target) => (
                    <label
                      key={target.id}
                      className={cn(
                        "flex h-7 cursor-pointer items-center rounded-full px-2.5 text-[12px] font-650 tabular-nums has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent/40",
                        target.id === mergeIntoId
                          ? "bg-accent-soft text-accent-ink"
                          : "bg-inset text-secondary hover:text-ink",
                      )}
                    >
                      <input
                        type="radio"
                        name="mergeInto"
                        value={target.id}
                        checked={target.id === mergeIntoId}
                        onChange={() => setMergeIntoId(target.id)}
                        className="sr-only"
                      />
                      #{target.id}
                    </label>
                  ))}
                </div>
              </fieldset>
            ) : null}
            {into ? (
              <>
                <MergeSummary
                  source={lock}
                  keep={into}
                  nowSeconds={nowSeconds}
                />
                <Warning>Burns #{lock.id} · irreversible</Warning>
              </>
            ) : (
              <p className="text-[14px] text-secondary">
                No other active locks
              </p>
            )}
          </>
        ) : (
          <dl className="flex items-baseline justify-between gap-4 rounded-lg bg-inset px-3 py-2.5 text-[14px]">
            <dt className="text-secondary">Returns</dt>
            <dd className="font-650 tabular-nums text-ink">
              {formatLockAmount(lock)}
            </dd>
          </dl>
        )}

        {error ? (
          <p role="alert" className="text-pretty text-[13px] text-neg">
            {error}
          </p>
        ) : null}

        <div className="flex justify-end gap-2">
          <Button
            variant="ghost"
            size="lg"
            className="h-9 bg-inset px-3.5 font-650"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="danger"
            size="lg"
            className="h-9"
            disabled={!canSubmit}
          >
            {writes.busy
              ? "Confirm in wallet…"
              : action.type === "transfer"
                ? "Transfer lock"
                : action.type === "merge"
                  ? "Merge locks"
                  : "Withdraw"}
          </Button>
        </div>
      </form>
    </Sheet>
  )
}

function Warning({ children }: { children: ReactNode }): ReactElement {
  return (
    <p className="flex items-center gap-2 rounded-lg bg-accent-soft px-3 py-2.5 text-[13px] font-550 text-accent-ink">
      <TriangleAlert size={14} strokeWidth={1.75} aria-hidden="true" />
      {children}
    </p>
  )
}

function MergeSummary({
  source,
  keep,
  nowSeconds,
}: {
  source: OverviewLock
  keep: OverviewLock
  nowSeconds: number
}): ReactElement {
  const rows = [
    { label: "Source", lock: source, tone: "pb-2 font-400 text-secondary" },
    { label: "Keep", lock: keep, tone: "pb-2 font-650 text-ink" },
    {
      label: "Result",
      lock: mergedLock(source, keep),
      tone: "border-t border-line pt-2 text-[14px] font-700 text-ink",
    },
  ]
  return (
    <div className="rounded-[10px] bg-inset p-3">
      <table className="w-full border-collapse text-left text-[13px] tabular-nums">
        <caption className="sr-only">Merge result</caption>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label}>
              <th
                scope="row"
                className={cn(
                  "w-0 whitespace-nowrap pr-3 align-bottom",
                  row.tone,
                )}
              >
                {row.label === "Keep" ? (
                  <span
                    aria-hidden="true"
                    className="block pb-2 text-[16px] font-700 leading-none text-muted"
                  >
                    +
                  </span>
                ) : null}
                {row.label}
              </th>
              <td
                className={cn(
                  "w-0 whitespace-nowrap pr-3 align-bottom",
                  row.tone,
                )}
              >
                #{row.lock.id}
              </td>
              <td
                className={cn(
                  "w-0 whitespace-nowrap pr-3 align-bottom",
                  row.tone,
                )}
              >
                {formatLockAmount(row.lock)}
              </td>
              <td className={cn("align-bottom lowercase", row.tone)}>
                {lockStatusLabel(row.lock, nowSeconds)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
