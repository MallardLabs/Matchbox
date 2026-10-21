import { cn } from "@repo/ui/cn"
import * as Skeleton from "@repo/ui/skeleton"
import type { ReactElement } from "react"
import {
  type ActivityEvent,
  type Names,
  eventAmount,
  eventLine,
  eventTitle,
  formatWhen,
} from "./activityModel"

type EventTableProps = {
  events: ActivityEvent[]
  loading: boolean
  names: Names
  stale: boolean
  selectedId: string | null
  onSelect: (event: ActivityEvent) => void
}

const SKELETON_ROWS = ["a", "b", "c", "d", "e", "f", "g", "h"]
const headClass = "pb-2 pr-3 text-caption font-400 text-muted"

function StatusText({
  event,
  stale,
  className,
}: {
  event: ActivityEvent
  stale: boolean
  className?: string
}): ReactElement {
  const label = stale ? "Stale" : event.status === "signed" ? "Signed" : "Final"
  return (
    <span
      className={cn(
        "font-600",
        stale
          ? "text-warn"
          : event.status === "signed"
            ? "text-secondary"
            : "text-pos",
        className,
      )}
    >
      {label}
    </span>
  )
}

/**
 * When · Event · Amount · Status. Below xl the amount folds away; below md
 * each row stacks date and status over the title (M05).
 */
export default function EventTable({
  events,
  loading,
  names,
  stale,
  selectedId,
  onSelect,
}: EventTableProps): ReactElement {
  return (
    <table
      aria-label="Events"
      aria-busy={loading || undefined}
      className="w-full table-auto border-collapse text-left"
    >
      <thead className="max-xl:sr-only">
        <tr>
          <th scope="col" className={cn(headClass, "w-[102px] pl-2")}>
            When
          </th>
          <th scope="col" className={headClass}>
            Event
          </th>
          <th scope="col" className={cn(headClass, "w-[112px] text-right")}>
            Amount
          </th>
          <th scope="col" className={cn(headClass, "w-[72px] pl-3 pr-2")}>
            Status
          </th>
        </tr>
      </thead>
      <tbody>
        {loading
          ? SKELETON_ROWS.map((key) => (
              <tr key={key}>
                <td className="hidden h-9 pl-2 pr-3 md:table-cell">
                  <Skeleton.Root className="h-2.5 w-[72px] rounded-sm" />
                </td>
                <td className="h-12 pr-3 md:h-9">
                  <Skeleton.Root className="h-2.5 w-full max-w-[280px] rounded-sm" />
                </td>
                <td className="hidden pr-3 xl:table-cell">
                  <Skeleton.Root className="ml-auto h-2.5 w-16 rounded-sm" />
                </td>
                <td className="hidden pl-3 pr-2 md:table-cell">
                  <Skeleton.Root className="h-2.5 w-12 rounded-sm" />
                </td>
              </tr>
            ))
          : events.map((event) => {
              const selected = event.id === selectedId
              const amount = eventAmount(event)
              return (
                <tr
                  key={event.id}
                  className={cn(
                    "relative cursor-pointer border-b border-line text-label transition-colors hover:bg-raised",
                    selected &&
                      "bg-accent-soft outline outline-1 -outline-offset-1 outline-accent hover:bg-accent-soft xl:rounded-md",
                  )}
                >
                  <td className="hidden whitespace-nowrap py-2.5 pl-2 pr-3 text-secondary tabular-nums md:table-cell">
                    {formatWhen(event.timestamp)}
                  </td>
                  <td className="w-full max-w-0 py-2.5 pr-0 md:pr-3">
                    <span className="flex items-center justify-between gap-3 pb-0.5 text-caption md:hidden">
                      <span className="text-muted tabular-nums">
                        {formatWhen(event.timestamp, true)}
                      </span>
                      <StatusText event={event} stale={stale} />
                    </span>
                    <button
                      type="button"
                      aria-pressed={selected}
                      onClick={() => onSelect(event)}
                      className="block w-full truncate text-left after:absolute after:inset-0 after:content-[''] text-body-sm text-ink focus-visible:outline-offset-[-2px] md:text-body-sm xl:text-label"
                    >
                      <span className="md:hidden">
                        {eventTitle(event, names)}
                      </span>
                      <span className="hidden md:inline">
                        {eventLine(event, names)}
                      </span>
                    </button>
                  </td>
                  <td className="hidden whitespace-nowrap py-2.5 pr-3 text-right font-mono text-ink tabular-nums xl:table-cell">
                    {amount ?? "—"}
                  </td>
                  <td className="hidden whitespace-nowrap py-2.5 pl-3 pr-2 md:table-cell">
                    <StatusText event={event} stale={stale} />
                  </td>
                </tr>
              )
            })}
      </tbody>
    </table>
  )
}
