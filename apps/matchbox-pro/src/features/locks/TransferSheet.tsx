import { useViewer } from "@/lib/viewer"
import * as Button from "@repo/ui/button"
import * as Field from "@repo/ui/field"
import * as Input from "@repo/ui/input"
import * as Toast from "@repo/ui/toast"
import { type ReactElement, useState } from "react"
import { getAddress } from "viem"
import LockSheet, { ErrorNote, SheetFooter, WarningNote } from "./LockSheet"
import { LOCK_ESCROW_ABI, withEscrowErrors } from "./escrowWrites"
import { type LockView, formatLockAmount, recipientError } from "./lockModel"
import { useLockWrite } from "./useLockWrite"

/** Pen 14 / J10: send the lock NFT to another address. Irreversible. */
export default function TransferSheet({
  lock,
  onClose,
  onDone,
}: {
  lock: LockView
  onClose: () => void
  onDone: () => void
}): ReactElement {
  const { viewer } = useViewer()
  const { toast } = Toast.useToast()
  const { send, pending, contracts, writeContractAsync } = useLockWrite()
  const [recipient, setRecipient] = useState("")
  const [touched, setTouched] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const owner = viewer.mode === "connected" ? viewer.address : undefined
  const problem = recipientError(recipient, owner)
  const shownProblem = touched || recipient !== "" ? problem : null
  const escrow = lock.kind === "veMEZO" ? contracts.veMEZO : contracts.veBTC

  async function submit(): Promise<void> {
    setTouched(true)
    if (problem !== null || !owner || pending) return
    setFailure(null)
    const to = getAddress(recipient.trim())
    const error = await send(
      "transfer",
      withEscrowErrors(() =>
        writeContractAsync({
          address: escrow.address,
          abi: LOCK_ESCROW_ABI,
          functionName: "transferFrom",
          args: [owner, to, lock.tokenId],
        }),
      ),
    )
    if (error) {
      setFailure(error)
      return
    }
    toast({
      title: "Lock transferred",
      description: `${lock.kind} #${lock.id} → ${to.slice(0, 6)}…${to.slice(-4)}`,
    })
    onDone()
    onClose()
  }

  return (
    <LockSheet
      title="Transfer lock"
      description={`${lock.kind} #${lock.id} · ${formatLockAmount(lock.kind, lock.amount)}`}
      onClose={onClose}
    >
      <form
        noValidate
        className="flex flex-col gap-3.5 pt-1"
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
      >
        <Field.Root invalid={shownProblem !== null}>
          <Field.Label className="text-caption font-500 text-muted">
            To address
          </Field.Label>
          <Field.Control>
            <Input.Root
              size="lg"
              name="recipient"
              placeholder="0x"
              autoComplete="off"
              spellCheck={false}
              value={recipient}
              onChange={(event) => setRecipient(event.target.value)}
              onBlur={() => setTouched(true)}
              className="h-9 font-mono text-body-sm"
            />
          </Field.Control>
          <Field.Error>{shownProblem}</Field.Error>
        </Field.Root>
        <WarningNote>
          This sends the lock NFT. The recipient gets the {lock.kind}
          {lock.kind === "veBTC" ? " and any attached boost" : ""}. This cannot
          be undone.
        </WarningNote>
        <ErrorNote message={failure} />
        <SheetFooter onCancel={onClose}>
          <Button.Root
            type="submit"
            variant="danger"
            size="lg"
            className="h-9"
            loading={pending}
            disabled={problem !== null || !owner}
          >
            {pending ? "Transferring…" : "Transfer lock"}
          </Button.Root>
        </SheetFooter>
      </form>
    </LockSheet>
  )
}
