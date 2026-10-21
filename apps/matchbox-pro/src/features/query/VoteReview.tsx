import * as Checkbox from "@repo/ui/checkbox"
import { cn } from "@repo/ui/cn"
import { type ReactElement, useEffect, useRef, useState } from "react"
import { useStuart } from "./StuartProvider"
import type { Ballot } from "./contract"
import {
  formatBps,
  formatTokenNumber,
  formatUsd,
  microToUsd6,
  percentTextToBps,
} from "./format"
import { editsFromDraft, sharedAllocation } from "./voteEdits"

/**
 * Ballots in the review drawer. Every selected lock signs the same bps
 * vector, one independent signature each; edits are re-priced at sign time.
 */
export default function VoteReview({
  id,
  ballots,
  editable,
}: {
  id: string
  ballots: readonly Ballot[]
  editable: boolean
}): ReactElement {
  const { review } = useStuart()
  const edits = review.state?.edits ?? null
  const busy = review.state?.phase !== "review"
  const shared = sharedAllocation(ballots, edits)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [selected, setSelected] = useState<ReadonlySet<string>>(
    () =>
      new Set(
        edits
          ? edits.filter((edit) => edit.selected).map((edit) => edit.ballotKey)
          : ballots
              .filter((ballot) => ballot.selected)
              .map((ballot) => ballot.ballotKey),
      ),
  )

  function startEditing(): void {
    setDraft(
      Object.fromEntries(
        shared.map((row) => [
          row.targetId,
          formatBps(row.bps ?? 0).replace("%", ""),
        ]),
      ),
    )
    setEditing(true)
  }

  const autoEdit = useRef(review.state?.editRequested === true && editable)
  useEffect(() => {
    if (!autoEdit.current) return
    autoEdit.current = false
    startEditing()
  })

  const parsed = shared.map((row) => ({
    ...row,
    bps: percentTextToBps(draft[row.targetId] ?? "0"),
  }))
  const total = parsed.reduce((sum, row) => sum + (row.bps ?? 0), 0)
  const valid =
    parsed.every((row) => row.bps !== null) &&
    total === 10_000 &&
    selected.size > 0

  function apply(): void {
    if (!valid) return
    review.setEdits(
      editsFromDraft(
        ballots,
        selected,
        parsed.map((row) => ({ targetId: row.targetId, bps: row.bps ?? 0 })),
      ),
    )
    setEditing(false)
  }

  return (
    <div className="flex flex-col gap-3">
      <fieldset className="m-0 flex flex-col gap-1.5 border-0 p-0">
        <legend className="mb-1 p-0 text-caption text-muted">Locks</legend>
        {ballots.map((ballot) => {
          const inputId = `${id}-${ballot.ballotKey}`
          return (
            <div
              key={ballot.ballotKey}
              className="flex items-center gap-2 text-body-sm"
            >
              {editing ? (
                <Checkbox.Root
                  id={inputId}
                  checked={selected.has(ballot.ballotKey)}
                  onCheckedChange={(checked) =>
                    setSelected((current) => {
                      const next = new Set(current)
                      if (checked === true) next.add(ballot.ballotKey)
                      else next.delete(ballot.ballotKey)
                      return next
                    })
                  }
                />
              ) : null}
              <label
                htmlFor={editing ? inputId : undefined}
                className={cn(
                  "flex flex-1 items-baseline justify-between gap-3",
                  !editing &&
                    !selected.has(ballot.ballotKey) &&
                    "text-muted line-through",
                )}
              >
                <span className="text-ink">
                  {ballot.governanceAsset} #{ballot.tokenId}
                </span>
                <span className="font-mono text-label text-secondary">
                  {formatTokenNumber({
                    raw: ballot.votingPower,
                    decimals: 18,
                    symbol: ballot.governanceAsset,
                  })}
                </span>
              </label>
            </div>
          )
        })}
      </fieldset>

      <div className="flex flex-col">
        <div className="flex items-baseline justify-between pb-1">
          <p className="m-0 text-caption text-muted">Allocation</p>
          {editable && !busy ? (
            editing ? (
              <span className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  className="text-label text-secondary hover:text-ink"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={apply}
                  disabled={!valid}
                  className="text-label font-600 text-ink hover:underline disabled:text-muted disabled:no-underline"
                >
                  Apply
                </button>
              </span>
            ) : (
              <button
                type="button"
                onClick={startEditing}
                className="text-label text-secondary hover:text-ink"
              >
                Edit allocation
              </button>
            )
          ) : null}
        </div>
        <ul className="m-0 list-none p-0">
          {(editing ? parsed : shared).map((row) => (
            <li
              key={row.targetId}
              className="flex items-center gap-3 border-b border-line py-2 text-body-sm tabular-nums"
            >
              <span className="min-w-0 flex-1 truncate text-ink">
                {row.name}
              </span>
              {editing ? (
                <label className="flex items-center gap-1 text-secondary">
                  <span className="sr-only">{row.name} percent</span>
                  <input
                    inputMode="decimal"
                    value={draft[row.targetId] ?? ""}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        [row.targetId]: event.target.value,
                      }))
                    }
                    aria-invalid={row.bps === null || undefined}
                    className="h-7 w-16 rounded-md border border-line bg-surface px-2 text-right text-body-sm text-ink outline-none focus-visible:border-accent aria-[invalid=true]:border-neg"
                  />
                  %
                </label>
              ) : (
                <>
                  <span className="text-secondary">
                    {formatBps(row.bps ?? 0)}
                  </span>
                  <span className="w-20 text-right font-600 text-pos">
                    {row.projectedMicro === null
                      ? "—"
                      : formatUsd(microToUsd6(row.projectedMicro))}
                  </span>
                </>
              )}
            </li>
          ))}
        </ul>
        {editing ? (
          <p
            className={cn(
              "m-0 pt-1.5 text-label tabular-nums",
              total === 10_000 ? "text-secondary" : "text-neg",
            )}
            aria-live="polite"
          >
            Total {formatBps(total)}
          </p>
        ) : edits ? (
          <p className="m-0 pt-1.5 text-label text-warn">
            Edited · re-priced before signing
          </p>
        ) : null}
      </div>
    </div>
  )
}
