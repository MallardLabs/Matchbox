import { cn } from "@repo/ui/cn"
import * as Skeleton from "@repo/ui/skeleton"
import type { ReactElement, ReactNode } from "react"

export type StatTone = "default" | "accent" | "neg" | "muted"

export type StatItem = {
  key: string
  label: ReactNode
  value: ReactNode
  sub?: ReactNode
  tone?: StatTone
  loading?: boolean
}

const toneClass: Record<StatTone, string> = {
  default: "text-ink",
  accent: "text-accent-ink",
  neg: "text-neg",
  muted: "text-muted",
}

/**
 * Ruled row of figures divided by hairlines (status strip, usage totals,
 * grant counts). Wraps to two columns below md.
 */
export default function StatStrip({
  items,
  size = "md",
  className,
  "aria-label": ariaLabel,
}: {
  items: StatItem[]
  /** sm: 14px values (status strip). md: 22px figures. */
  size?: "sm" | "md"
  className?: string | undefined
  "aria-label"?: string
}): ReactElement {
  return (
    <dl
      aria-label={ariaLabel}
      className={cn(
        "m-0 grid grid-cols-2 gap-x-5 gap-y-4 border-y border-line py-3.5 md:flex md:gap-0",
        className,
      )}
    >
      {items.map((item) => (
        <div
          key={item.key}
          className="flex min-w-0 flex-1 flex-col gap-[5px] md:border-l md:border-line md:px-5 md:first:border-l-0 md:first:pl-0"
        >
          <dt className="truncate text-caption text-muted">{item.label}</dt>
          <dd
            className={cn(
              "m-0 min-w-0 truncate font-600 tabular-nums",
              size === "md" ? "text-metric" : "text-body",
              toneClass[item.tone ?? "default"],
            )}
          >
            {item.loading === true ? (
              <Skeleton.Root
                className={size === "md" ? "my-1 h-5 w-20" : "my-0.5 h-4 w-24"}
              />
            ) : (
              item.value
            )}
          </dd>
          {item.sub === undefined ? null : (
            <dd className="m-0 min-w-0 truncate text-label text-secondary">
              {item.loading === true ? null : item.sub}
            </dd>
          )}
        </div>
      ))}
    </dl>
  )
}
