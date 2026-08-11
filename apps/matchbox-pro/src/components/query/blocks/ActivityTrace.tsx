import { CheckIcon } from "@/components/ui/Icons"
import type { QueryBlock } from "@/lib/query/contracts"

type ActivityTraceBlock = Extract<QueryBlock, { type: "activity_trace" }>

export function ActivityTrace({ block }: { block: ActivityTraceBlock }) {
  return (
    <details className="border-t border-line pt-4">
      <summary className="min-h-10 cursor-pointer select-none text-sm text-secondary marker:text-muted hover:text-ink">
        How Stuart checked this
      </summary>
      <ol className="mt-2 space-y-3 pb-1">
        {block.items.map((item) => (
          <li className="flex items-start gap-3" key={item.label}>
            <span className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-positive-soft text-positive">
              <CheckIcon className="size-3" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm text-ink">{item.label}</span>
              <span className="block text-xs text-muted">{item.detail}</span>
            </span>
          </li>
        ))}
      </ol>
      <p className="mt-3 text-pretty text-xs text-muted">
        Operational trace only. Matchbox never exposes private chain-of-thought.
      </p>
    </details>
  )
}
