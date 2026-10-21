import { useViewer } from "@/lib/viewer"
import * as Checkbox from "@repo/ui/checkbox"
import * as Textarea from "@repo/ui/textarea"
import { type ReactElement, useId, useState } from "react"
import { describeStuartError, submitSupportReport } from "../client"
import type { SupportReportPreviewBlock } from "../contract"
import { largePrimary, largeSecondary } from "../parts"
import useStuartStatus from "../useStuartStatus"

const DISMISSED = "dismissed"
const MIN_PROBLEM = 10

/**
 * Frame 37: the preview is the report. Nothing leaves the browser until the
 * user presses Submit, and the payload is exactly the items shown and kept.
 */
export function SupportReport({
  block,
  status,
  onStatus,
}: {
  block: SupportReportPreviewBlock
  /** Sent reference, "dismissed", or undefined while still a draft. */
  status: string | undefined
  onStatus: (value: string) => void
}): ReactElement {
  const { viewer } = useViewer()
  const runtime = useStuartStatus()
  const offline = runtime?.supportReports === false
  const { draft } = block
  const [problem, setProblem] = useState(draft.problemStatement)
  const [editing, setEditing] = useState(false)
  const [removed, setRemoved] = useState<ReadonlySet<string>>(new Set())
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set())
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const problemId = useId()
  const sent = status !== undefined && status !== DISMISSED
  const dismissed = status === DISMISSED
  const locked = sent || dismissed || sending
  const tooShort = problem.trim().length < MIN_PROBLEM

  function toggle(
    set: (
      update: (current: ReadonlySet<string>) => ReadonlySet<string>,
    ) => void,
    id: string,
    on: boolean,
  ): void {
    set((current) => {
      const next = new Set(current)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })
  }

  async function submit(): Promise<void> {
    if (locked || tooShort) return
    setSending(true)
    setError(null)
    try {
      const result = await submitSupportReport({
        version: 1,
        draft,
        problemStatement: problem.trim(),
        includedItemIds: draft.included
          .filter((item) => !item.removable || !removed.has(item.itemId))
          .map((item) => item.itemId),
        ...(viewer.address && viewer.mode === "connected"
          ? { wallet: { address: viewer.address, mode: "connected" as const } }
          : {}),
        contact: { method: "thread_only" },
      })
      onStatus(result.ref)
    } catch (failure) {
      setError(describeStuartError(failure))
    } finally {
      setSending(false)
    }
  }

  return (
    <section aria-label="Support report" className="flex flex-col gap-3">
      <p
        className={
          sent ? "m-0 text-body-sm text-pos" : "m-0 text-body-sm text-warn"
        }
        aria-live="polite"
      >
        {sent
          ? `Sent · ${status}`
          : dismissed
            ? "Not sent. Draft discarded."
            : "Nothing has been sent. Preview is the report."}
      </p>
      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between gap-3">
          <label htmlFor={problemId} className="text-caption text-muted">
            Problem statement
          </label>
          {locked ? null : (
            <button
              type="button"
              onClick={() => setEditing((value) => !value)}
              className="text-label text-secondary hover:text-ink"
            >
              {editing ? "Done" : "Edit"}
            </button>
          )}
        </div>
        {editing && !locked ? (
          <Textarea.Root
            id={problemId}
            value={problem}
            maxLength={2_000}
            aria-invalid={tooShort || undefined}
            onChange={(event) => setProblem(event.target.value)}
          />
        ) : (
          <p id={problemId} className="m-0 text-body text-ink">
            {problem}
          </p>
        )}
      </div>
      <fieldset className="m-0 flex min-w-0 flex-col gap-1.5 rounded-lg border-0 bg-inset p-3">
        <legend className="float-left mb-1 p-0 text-label font-600 text-ink">
          Included
        </legend>
        {draft.included.map((item) => {
          const id = `${block.id}-${item.itemId}`
          const included = !item.removable || !removed.has(item.itemId)
          const expanded = open.has(item.itemId)
          return (
            <div key={item.itemId} className="clear-left flex flex-col gap-1">
              <div className="flex items-center gap-2 text-label text-secondary">
                {item.removable ? (
                  <Checkbox.Root
                    id={id}
                    checked={included}
                    disabled={locked}
                    onCheckedChange={(checked) =>
                      toggle(setRemoved, item.itemId, checked !== true)
                    }
                  />
                ) : (
                  <span aria-hidden="true" className="w-4 text-center">
                    ·
                  </span>
                )}
                <label
                  htmlFor={item.removable ? id : undefined}
                  className={
                    included
                      ? "min-w-0 flex-1 truncate"
                      : "min-w-0 flex-1 truncate text-muted line-through"
                  }
                >
                  {item.label}
                </label>
                {item.value && item.value !== item.label ? (
                  <button
                    type="button"
                    aria-expanded={expanded}
                    onClick={() => toggle(setOpen, item.itemId, !expanded)}
                    className="shrink-0 text-caption text-muted hover:text-ink"
                  >
                    {expanded ? "Hide" : "View"}
                  </button>
                ) : null}
              </div>
              {expanded ? (
                <p className="m-0 whitespace-pre-wrap break-words pl-6 font-mono text-caption text-secondary">
                  {item.value}
                </p>
              ) : null}
            </div>
          )
        })}
      </fieldset>
      <div className="flex flex-col gap-1.5 rounded-lg border border-line p-3">
        <p className="m-0 text-label font-600 text-ink">
          Excluded unless you add it
        </p>
        <p className="m-0 text-label text-secondary">
          Earlier Query history, watched wallets, and this device’s RPC URL.
        </p>
      </div>
      {offline && !locked ? (
        <p className="m-0 text-label text-warn">
          Support reports are unavailable right now.
        </p>
      ) : null}
      {error ? (
        <p className="m-0 text-label text-neg" role="alert">
          {error}
        </p>
      ) : null}
      {locked && !sending ? null : (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={largePrimary}
            onClick={() => void submit()}
            disabled={sending || tooShort || offline}
            aria-busy={sending || undefined}
          >
            {sending ? "Sending…" : "Submit report"}
          </button>
          <button
            type="button"
            className={largeSecondary}
            onClick={() => onStatus(DISMISSED)}
            disabled={sending}
          >
            Don’t send
          </button>
        </div>
      )}
    </section>
  )
}
