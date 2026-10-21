import type { UsageBucket } from "@repo/platform-contracts/console"
import { niceCeiling } from "@repo/ui/bar-chart"
import { cn } from "@repo/ui/cn"
import type { ReactElement } from "react"
import { formatCompact, formatInteger } from "../../lib/format"
import {
  type ErrorSplit,
  type ErrorStack,
  type UsageGroup,
  errorStacks,
} from "../../lib/usage-chart"

type Segment = { key: keyof ErrorSplit; label: string; className: string }

/** Bottom to top: 429, 4xx (excl. 429), 5xx. */
const segments: Segment[] = [
  { key: "rateLimited", label: "429", className: "bg-muted" },
  { key: "clientErrors", label: "4xx", className: "bg-accent/70" },
  { key: "serverErrors", label: "5xx", className: "bg-neg" },
]

export function ErrorsLegend(): ReactElement {
  return (
    <ul className="m-0 flex list-none items-center gap-3 p-0 text-label text-secondary">
      {[...segments].reverse().map((segment) => (
        <li key={segment.key} className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className={cn("size-2.5 rounded-[2px]", segment.className)}
          />
          {segment.label}
        </li>
      ))}
    </ul>
  )
}

/**
 * Errors on their own axis (design note 7): 4xx, 5xx and 429 stacked per
 * bar, never on top of requests. Mirrors `@repo/ui/bar-chart` anatomy.
 */
export default function ErrorsBarChart({
  groups,
  bucket,
  title,
  height = 64,
}: {
  groups: readonly UsageGroup[]
  bucket: UsageBucket
  title: string
  height?: number
}): ReactElement {
  const stacks = errorStacks(groups, bucket)
  const max = niceCeiling(Math.max(0, ...stacks.map((stack) => stack.total)))
  const gap = stacks.length > 8 ? "gap-1 sm:gap-1.5" : "gap-2 sm:gap-4"
  return (
    <div className="flex flex-col">
      <figure aria-hidden="true" className="m-0 flex flex-col">
        <div className="flex items-end gap-1" style={{ height }}>
          <div
            className="flex w-[34px] shrink-0 flex-col items-end justify-between font-mono text-[9px] text-muted"
            style={{ marginTop: -5, marginBottom: -5, height: height + 10 }}
          >
            <span>{formatCompact(max)}</span>
            <span>0</span>
          </div>
          <div className={cn("flex h-full min-w-0 flex-1 items-end", gap)}>
            {stacks.map((stack) => (
              <StackColumn
                key={stack.key}
                stack={stack}
                max={max}
                height={height}
              />
            ))}
          </div>
        </div>
        <div className="h-px w-full bg-line" />
        <div className="flex gap-1 pt-2">
          <span className="w-[34px] shrink-0" />
          <div className={cn("flex min-w-0 flex-1", gap)}>
            {stacks.map((stack) => (
              <span
                key={stack.key}
                className={cn(
                  "flex-1 truncate text-center font-mono text-micro",
                  stack.current ? "font-500 text-accent-ink" : "text-muted",
                )}
              >
                {stack.label}
              </span>
            ))}
          </div>
        </div>
      </figure>
      <table className="sr-only">
        <caption>{title}</caption>
        <thead>
          <tr>
            <th scope="col">Period</th>
            <th scope="col">4xx excl. 429</th>
            <th scope="col">5xx</th>
            <th scope="col">429</th>
            <th scope="col">Errors</th>
          </tr>
        </thead>
        <tbody>
          {stacks.map((stack) => (
            <tr key={stack.key}>
              <th scope="row">{stack.label}</th>
              <td>
                {stack.split === null
                  ? "Unavailable"
                  : formatInteger(stack.split.clientErrors)}
              </td>
              <td>
                {stack.split === null
                  ? "Unavailable"
                  : formatInteger(stack.split.serverErrors)}
              </td>
              <td>
                {stack.split === null
                  ? "Unavailable"
                  : formatInteger(stack.split.rateLimited)}
              </td>
              <td>{formatInteger(stack.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function StackColumn({
  stack,
  max,
  height,
}: {
  stack: ErrorStack
  max: number
  height: number
}): ReactElement {
  const usable = height - 16
  const scale = (value: number): number => (value / max) * usable
  const parts =
    stack.split === null
      ? [{ key: "total", className: "bg-muted", value: stack.total }]
      : segments.map((segment) => ({
          key: segment.key,
          className: segment.className,
          value: stack.split?.[segment.key] ?? 0,
        }))
  const visible = parts.filter((part) => part.value > 0)
  return (
    <div className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1">
      <span
        className={cn(
          "whitespace-nowrap text-[9px] font-600 tabular-nums",
          stack.current ? "text-accent-ink" : "text-muted",
        )}
      >
        {formatCompact(stack.total)}
      </span>
      <span className="flex w-full max-w-[36px] flex-col-reverse overflow-hidden rounded-t">
        {visible.length === 0 ? (
          <span className="block h-px w-full bg-line" />
        ) : (
          visible.map((part) => (
            <span
              key={part.key}
              className={cn("block w-full", part.className)}
              style={{ height: Math.max(2, scale(part.value)) }}
            />
          ))
        )}
      </span>
    </div>
  )
}
