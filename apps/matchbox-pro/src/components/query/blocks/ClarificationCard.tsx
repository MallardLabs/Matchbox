import { ArrowRightIcon } from "@/components/ui/Icons"
import type { QueryBlock } from "@/lib/query/contracts"

type ClarificationBlock = Extract<QueryBlock, { type: "clarification_card" }>

export function ClarificationCard({
  block,
  onQuery,
}: {
  block: ClarificationBlock
  onQuery: (query: string) => void
}): JSX.Element {
  return (
    <section
      aria-labelledby="clarification-title"
      className="border-t border-line pt-5"
    >
      <h2
        className="text-balance text-lg font-medium text-ink"
        id="clarification-title"
      >
        {block.prompt}
      </h2>
      <div className="mt-4 overflow-hidden rounded-lg border border-line bg-panel">
        {block.options.map((option) => (
          <button
            className="group flex min-h-20 w-full items-center gap-4 border-b border-line p-4 text-left last:border-b-0 hover:bg-raised disabled:cursor-not-allowed"
            key={option.id}
            onClick={() => onQuery(option.query)}
            type="button"
          >
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium text-ink">
                {option.label}
              </span>
              <span className="mt-1 block text-pretty text-xs leading-5 text-muted">
                {option.description}
              </span>
            </span>
            {option.availability === "unavailable" && (
              <span className="shrink-0 rounded border border-warning/30 bg-warning/10 px-2 py-1 text-xs text-warning">
                Unavailable
              </span>
            )}
            <ArrowRightIcon className="size-4 shrink-0 text-muted group-hover:text-accent" />
          </button>
        ))}
      </div>
    </section>
  )
}
