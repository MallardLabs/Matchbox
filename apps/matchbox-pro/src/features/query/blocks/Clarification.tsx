import { cn } from "@repo/ui/cn"
import { ArrowRight } from "lucide-react"
import type { ReactElement } from "react"
import type { ClarificationCardBlock as ClarificationBlock } from "../contract"

/**
 * Ambiguous asks ("best gauges") resolve here with {cardId, optionId}; the
 * server runs the chosen tool without asking the model again.
 */
export function Clarification({
  block,
  chosen,
  onChoose,
  disabled,
  promptVisible = true,
}: {
  block: ClarificationBlock
  chosen: string | null
  onChoose: (optionId: string) => void
  disabled: boolean
  /** False when the canvas title already asks the same question. */
  promptVisible?: boolean
}): ReactElement {
  const promptId = `${block.id}-prompt`
  return (
    <section aria-labelledby={promptId} className="flex flex-col gap-2.5">
      <h2
        id={promptId}
        className={cn(
          "m-0 text-body font-600 text-ink",
          !promptVisible && "sr-only",
        )}
      >
        {block.prompt}
      </h2>
      <ul className="m-0 grid list-none gap-2 p-0 md:grid-cols-2 xl:grid-cols-3">
        {block.options.map((option) => {
          const unavailable = option.availability === "unavailable"
          const selected = chosen === option.id
          return (
            <li key={option.id} className="flex">
              <button
                type="button"
                disabled={disabled || unavailable}
                aria-pressed={selected}
                onClick={() => onChoose(option.id)}
                className={cn(
                  "group flex w-full flex-col items-start gap-1 rounded-lg border p-3 text-left transition-colors disabled:cursor-not-allowed",
                  selected
                    ? "border-accent bg-accent-soft"
                    : "border-line bg-surface hover:border-line-2 hover:bg-raised",
                  unavailable && "opacity-60",
                )}
              >
                <span className="flex w-full items-center justify-between gap-2 text-body-sm font-600 text-ink">
                  {option.label}
                  {unavailable ? (
                    <span className="text-caption font-500 text-muted">
                      Unavailable
                    </span>
                  ) : (
                    <ArrowRight
                      aria-hidden="true"
                      size={14}
                      strokeWidth={1.75}
                      className="text-muted transition-colors group-hover:text-ink"
                    />
                  )}
                </span>
                <span className="text-label text-secondary">
                  {option.detail}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
