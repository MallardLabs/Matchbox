import { cn } from "@repo/ui/cn"
import type { ReactElement, ReactNode } from "react"

/** Section title, optional count, actions pushed right. */
export default function SectionHead({
  id,
  title,
  count,
  children,
  as: Heading = "h2",
  className,
}: {
  id?: string
  title: ReactNode
  count?: ReactNode
  /** Right-aligned actions or meta. */
  children?: ReactNode
  as?: "h2" | "h3"
  className?: string | undefined
}): ReactElement {
  return (
    <div className={cn("flex min-h-7 items-center gap-2.5", className)}>
      <Heading id={id} className="text-body font-600 text-ink">
        {title}
      </Heading>
      {count === undefined ? null : (
        <span className="font-mono text-label text-muted">{count}</span>
      )}
      <span className="flex-1" />
      {children}
    </div>
  )
}
