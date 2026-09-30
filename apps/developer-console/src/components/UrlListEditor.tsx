import type { EnvironmentKind } from "@repo/platform-contracts/network"
import {
  type UrlValidationResult,
  maxOriginsPerEnvironment,
  maxRedirectUrisPerEnvironment,
  urlRejectionMessages,
  validateOrigin,
  validateRedirectUri,
} from "@repo/platform-contracts/redirects"
import * as Button from "@repo/ui/button"
import * as Field from "@repo/ui/field"
import * as Fieldset from "@repo/ui/fieldset"
import * as Input from "@repo/ui/input"
import { Plus, X } from "lucide-react"
import { type FormEvent, type ReactElement, useState } from "react"
import { errorMessage } from "../lib/api-client"
import { isStepUpCancelled } from "../lib/step-up"

export type UrlListMode = "redirect-uri" | "origin"

const modeCopy = {
  "redirect-uri": {
    legend: "Redirect URIs",
    input: "New redirect URI",
    placeholder: {
      test: "http://localhost:3000/callback",
      live: "https://app.example.com/callback",
    },
    max: maxRedirectUrisPerEnvironment,
  },
  origin: {
    legend: "Allowed origins",
    input: "New origin",
    placeholder: {
      test: "http://localhost:3000",
      live: "https://app.example.com",
    },
    max: maxOriginsPerEnvironment,
  },
} as const

export function validateUrlEntry(
  mode: UrlListMode,
  value: string,
  kind: EnvironmentKind,
): UrlValidationResult {
  return mode === "origin"
    ? validateOrigin(value, kind)
    : validateRedirectUri(value, kind)
}

/** Validation message for a candidate, or null when it can be added. */
export function urlEntryError(
  mode: UrlListMode,
  value: string,
  kind: EnvironmentKind,
  existing: readonly string[],
): { message: string; suggestion: string | null } | null {
  const result = validateUrlEntry(mode, value, kind)
  if (!result.ok) {
    return {
      message: urlRejectionMessages[result.reason],
      suggestion: result.suggestion,
    }
  }
  if (existing.includes(result.value)) {
    return { message: "Already added", suggestion: null }
  }
  return null
}

type UrlListEditorProps = {
  mode: UrlListMode
  kind: EnvironmentKind
  values: readonly string[]
  onSave: (values: string[]) => Promise<unknown>
  disabled?: boolean
}

/** Add/remove list with instant client-side validation from the contracts. */
export default function UrlListEditor({
  mode,
  kind,
  values,
  onSave,
  disabled = false,
}: UrlListEditorProps): ReactElement {
  const copy = modeCopy[mode]
  const [draft, setDraft] = useState<string[] | null>(null)
  const [candidate, setCandidate] = useState("")
  const [touched, setTouched] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const list = draft ?? [...values]
  const dirty = draft !== null
  const trimmed = candidate.trim()
  const problem =
    trimmed === "" ? null : urlEntryError(mode, trimmed, kind, list)
  const full = list.length >= copy.max

  function add(event: FormEvent): void {
    event.preventDefault()
    setTouched(true)
    if (trimmed === "" || problem !== null || full) return
    setDraft([...list, trimmed])
    setCandidate("")
    setTouched(false)
  }

  function remove(value: string): void {
    setDraft(list.filter((item) => item !== value))
  }

  async function save(): Promise<void> {
    if (draft === null) return
    setSaving(true)
    setSaveError(null)
    try {
      await onSave(draft)
      setDraft(null)
    } catch (error) {
      if (!isStepUpCancelled(error)) setSaveError(errorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  const showProblem = problem !== null && (touched || trimmed.length > 7)

  return (
    <Fieldset.Root disabled={disabled || saving}>
      <Fieldset.Legend>{copy.legend}</Fieldset.Legend>
      {list.length === 0 ? (
        <p className="text-[12px] text-secondary">None</p>
      ) : (
        <ol className="m-0 flex list-none flex-col p-0">
          {list.map((value) => (
            <li
              key={value}
              className="flex min-w-0 items-center gap-2 border-t border-line py-1.5 last:border-b"
            >
              <code className="min-w-0 flex-1 truncate font-mono text-[12px] text-ink">
                {value}
              </code>
              <Button.Root
                variant="ghost"
                size="icon-sm"
                aria-label={`Remove ${value}`}
                onClick={() => remove(value)}
              >
                <X aria-hidden="true" size={14} strokeWidth={1.75} />
              </Button.Root>
            </li>
          ))}
        </ol>
      )}
      <form onSubmit={add} className="flex flex-col gap-1.5" noValidate>
        <Fieldset.Fields>
          <Field.Root invalid={showProblem}>
            <Field.Label>{copy.input}</Field.Label>
            <span className="flex gap-2">
              <Field.Control>
                <Input.Root
                  mono
                  inputMode="url"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder={copy.placeholder[kind]}
                  value={candidate}
                  disabled={full}
                  onChange={(event) => setCandidate(event.target.value)}
                  onBlur={() => setTouched(trimmed !== "")}
                />
              </Field.Control>
              <Button.Root
                type="submit"
                variant="secondary"
                disabled={full || trimmed === ""}
              >
                <Plus aria-hidden="true" size={13} strokeWidth={2} />
                Add
              </Button.Root>
            </span>
            <Field.Error>
              {showProblem && problem !== null ? (
                <>
                  {problem.message}
                  {problem.suggestion === null ? null : (
                    <>
                      {" "}
                      <button
                        type="button"
                        className="font-mono text-accent-ink underline underline-offset-2"
                        onClick={() => {
                          setCandidate(problem.suggestion ?? "")
                        }}
                      >
                        {problem.suggestion}
                      </button>
                    </>
                  )}
                </>
              ) : null}
            </Field.Error>
            {full ? (
              <Field.Description>{`${copy.max} max`}</Field.Description>
            ) : null}
          </Field.Root>
        </Fieldset.Fields>
      </form>
      {dirty ? (
        <p className="flex flex-wrap items-center justify-end gap-2">
          {saveError === null ? null : (
            <span
              role="alert"
              className="mr-auto text-[12px] font-500 text-neg"
            >
              {saveError}
            </span>
          )}
          <Button.Root
            variant="ghost"
            onClick={() => {
              setDraft(null)
              setSaveError(null)
            }}
          >
            Reset
          </Button.Root>
          <Button.Root loading={saving} onClick={() => void save()}>
            Save
          </Button.Root>
        </p>
      ) : null}
    </Fieldset.Root>
  )
}
