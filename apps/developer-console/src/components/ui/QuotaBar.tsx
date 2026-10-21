import { cn } from "@repo/ui/cn"
import * as Meter from "@repo/ui/meter"
import type { ReactElement } from "react"

/** Share of a quota at which the bar turns orange. */
export const quotaWarnAt = 0.8

/** Quota track: ink fill, orange from 80 %. */
export default function QuotaBar({
  fraction,
  label,
  className,
}: {
  fraction: number
  label: string
  className?: string | undefined
}): ReactElement {
  const warn = fraction >= quotaWarnAt
  return (
    <Meter.Root
      fraction={fraction}
      label={label}
      tone={warn ? "accent" : "muted"}
      className={cn(
        "rounded-[3px] bg-inset [&>span]:rounded-[3px]",
        !warn && "[&>span]:bg-ink-2",
        className,
      )}
    />
  )
}
