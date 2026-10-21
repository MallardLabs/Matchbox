import { cn } from "@repo/ui/cn"
import type { ReactElement } from "react"

export type TotalItem = {
  label: string
  value: string
  qualifier: string
}

/** Lifetime realized · Claimed · Pending / projected · Unpriced tokens. */
export default function TotalsStrip({
  items,
}: {
  items: TotalItem[]
}): ReactElement {
  return (
    <dl className="m-0 grid grid-cols-2 gap-y-4 border-y border-line py-3.5 xl:grid-cols-4 xl:gap-y-0">
      {items.map((item, index) => (
        <div
          key={item.label}
          className={cn(
            "flex min-w-0 flex-col gap-[3px] px-4",
            index % 2 === 1 && "border-l border-line",
            index === 2 && "xl:border-l",
          )}
        >
          <dt className="text-caption text-muted">{item.label}</dt>
          <dd className="m-0 truncate text-title-sm font-600 text-ink tabular-nums">
            {item.value}
          </dd>
          <dd className="m-0 truncate text-caption text-secondary">
            {item.qualifier}
          </dd>
        </div>
      ))}
    </dl>
  )
}
