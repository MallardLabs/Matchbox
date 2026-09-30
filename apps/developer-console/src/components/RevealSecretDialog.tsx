import * as Button from "@repo/ui/button"
import * as Checkbox from "@repo/ui/checkbox"
import * as CopyField from "@repo/ui/copy-field"
import * as Dialog from "@repo/ui/dialog"
import { type ReactElement, useId, useState } from "react"

type RevealSecretDialogProps = {
  /** The secret; null keeps the dialog closed. */
  secret: string | null
  title: string
  /** Accessible name of the value, e.g. "API key". */
  label: string
  /** Word used in the confirmation: "I've stored this key". */
  noun: "key" | "secret"
  onDone: () => void
}

/**
 * Shows a credential exactly once. The dialog cannot be dismissed (Escape,
 * overlay, close button) until the user confirms they stored the value.
 */
export default function RevealSecretDialog({
  secret,
  title,
  label,
  noun,
  onDone,
}: RevealSecretDialogProps): ReactElement {
  const [stored, setStored] = useState(false)
  const checkboxId = useId()

  function finish(): void {
    setStored(false)
    onDone()
  }

  function block(event: Event): void {
    if (!stored) event.preventDefault()
  }

  return (
    <Dialog.Root
      open={secret !== null}
      onOpenChange={(open) => {
        if (!open && stored) finish()
      }}
    >
      <Dialog.Content
        size="md"
        hideClose
        onEscapeKeyDown={block}
        onPointerDownOutside={block}
        onInteractOutside={block}
      >
        <Dialog.Header>
          <Dialog.Title>{title}</Dialog.Title>
          <Dialog.Description>Shown once</Dialog.Description>
        </Dialog.Header>
        <Dialog.Body>
          <CopyField.Root value={secret ?? ""} label={label} showText />
          <p className="flex items-center gap-2.5">
            <Checkbox.Root
              id={checkboxId}
              checked={stored}
              onCheckedChange={(checked) => setStored(checked === true)}
            />
            <label htmlFor={checkboxId} className="text-[13px] text-ink">
              I've stored this {noun}
            </label>
          </p>
        </Dialog.Body>
        <Dialog.Footer>
          <Button.Root disabled={!stored} onClick={finish}>
            Done
          </Button.Root>
        </Dialog.Footer>
      </Dialog.Content>
    </Dialog.Root>
  )
}
