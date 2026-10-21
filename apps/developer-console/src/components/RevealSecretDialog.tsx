import type { EnvironmentKind } from "@repo/platform-contracts/network"
import * as Button from "@repo/ui/button"
import * as Checkbox from "@repo/ui/checkbox"
import * as Dialog from "@repo/ui/dialog"
import { useCopy } from "@repo/ui/use-copy"
import { CircleCheck, Copy, EyeOff, FileCode } from "lucide-react"
import { type ReactElement, type ReactNode, useId, useState } from "react"
import { EnvPill } from "./ui/Pill"

export type SecretFact = { term: string; value: ReactNode }

type RevealSecretDialogProps = {
  /** The secret; null keeps the dialog closed. */
  secret: string | null
  /** "Key created", "Secret created". */
  title: string
  /** Label over the value: "Secret key", "Client secret". */
  label: string
  /** Environment chip next to the title. */
  environmentKind?: EnvironmentKind | undefined
  /** Primary copy button text ("Copy key"). */
  copyLabel?: string | undefined
  /** Variable name for "Copy as .env" (e.g. MATCHBOX_API_KEY). */
  envVar?: string | undefined
  /** Name / Type / Expires rows under the value. */
  facts?: SecretFact[] | undefined
  onDone: () => void
}

/**
 * Shows a credential exactly once (C05b). The dialog cannot be dismissed
 * (Escape, overlay) until the user confirms they stored the value.
 */
export default function RevealSecretDialog({
  secret,
  title,
  label,
  environmentKind,
  copyLabel = "Copy",
  envVar,
  facts = [],
  onDone,
}: RevealSecretDialogProps): ReactElement {
  const [stored, setStored] = useState(false)
  const checkboxId = useId()
  const valueId = useId()
  const value = secret ?? ""
  const copyValue = useCopy(value)
  const copyEnv = useCopy(envVar === undefined ? value : `${envVar}=${value}`)
  const copied =
    copyValue.state === "copied" || copyEnv.state === "copied"
      ? "Copied"
      : copyValue.state === "failed" || copyEnv.state === "failed"
        ? "Copy failed"
        : ""

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
        className="p-6"
      >
        <Dialog.Header className="flex-row items-center gap-2.5 pr-0">
          <CircleCheck
            aria-hidden="true"
            size={18}
            strokeWidth={1.75}
            className="shrink-0 text-pos"
          />
          <Dialog.Title>{title}</Dialog.Title>
          {environmentKind === undefined ? null : (
            <EnvPill kind={environmentKind} full />
          )}
        </Dialog.Header>
        <Dialog.Description className="flex h-9 items-center gap-2.5 rounded-r-md border-l-2 border-accent bg-accent-soft px-3 text-body-sm font-600 text-accent-ink">
          <EyeOff aria-hidden="true" size={15} strokeWidth={1.75} />
          Shown once
          <span className="flex-1" />
          <span className="text-label font-400 text-secondary">
            Not recoverable
          </span>
        </Dialog.Description>
        <Dialog.Body className="gap-2">
          <p id={valueId} className="text-label font-600 text-ink-2">
            {label}
          </p>
          <code
            aria-labelledby={valueId}
            className="block break-all rounded-lg border border-line bg-inset p-3.5 font-mono text-body-sm leading-5 text-ink"
          >
            {value}
          </code>
          <div className="flex flex-wrap items-center gap-2">
            <Button.Root onClick={() => void copyValue.copy()}>
              <Copy aria-hidden="true" size={14} strokeWidth={1.75} />
              {copyLabel}
            </Button.Root>
            {envVar === undefined ? null : (
              <Button.Root
                variant="secondary"
                onClick={() => void copyEnv.copy()}
              >
                <FileCode aria-hidden="true" size={14} strokeWidth={1.75} />
                Copy as .env
              </Button.Root>
            )}
            <span className="flex-1" />
            <span
              aria-live="polite"
              className={
                copied === "Copied"
                  ? "text-label text-pos"
                  : "text-label text-neg"
              }
            >
              {copied}
            </span>
          </div>
        </Dialog.Body>
        {facts.length === 0 ? null : (
          <dl className="m-0 flex flex-col">
            {facts.map((fact) => (
              <div
                key={fact.term}
                className="flex items-center gap-3 border-b border-line py-2.5 last:border-b-0"
              >
                <dt className="text-body-sm text-secondary">{fact.term}</dt>
                <span className="flex-1" />
                <dd className="m-0 text-body-sm text-ink">{fact.value}</dd>
              </div>
            ))}
          </dl>
        )}
        <Dialog.Footer className="flex-row items-center gap-2.5 border-t border-line pt-[18px] sm:justify-start">
          <Checkbox.Root
            id={checkboxId}
            checked={stored}
            onCheckedChange={(checked) => setStored(checked === true)}
          />
          <label htmlFor={checkboxId} className="text-body-sm text-ink">
            Stored securely
          </label>
          <span className="flex-1" />
          <Button.Root variant="secondary" disabled={!stored} onClick={finish}>
            Done
          </Button.Root>
        </Dialog.Footer>
      </Dialog.Content>
    </Dialog.Root>
  )
}
