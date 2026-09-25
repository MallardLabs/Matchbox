import type { ReactElement } from "react"

export type RewardsSummaryItem = {
  label: string
  value: string
  qualifier?: string
}

/** Pen "Qualifier strip": hairline-bounded row of four label / value / qualifier cells. */
export default function RewardsSummary({
  items,
}: {
  items: RewardsSummaryItem[]
}): ReactElement {
  return (
    <dl className="grid grid-cols-2 gap-y-4 border-y border-line py-3.5 lg:grid-cols-4">
      {items.map((item) => (
        <div
          key={item.label}
          className="flex min-w-0 flex-col gap-[3px] px-4 lg:border-l lg:border-line lg:first:border-l-0"
        >
          <dt className="text-[11px] text-muted">{item.label}</dt>
          <dd className="truncate text-[18px] font-600 tabular-nums text-ink">
            {item.value}
          </dd>
          {item.qualifier ? (
            <dd className="truncate font-mono text-[11px] text-secondary">
              {item.qualifier}
            </dd>
          ) : null}
        </div>
      ))}
    </dl>
  )
}
