import { cn } from "@repo/ui/cn"
import { Lock } from "lucide-react"
import type { ReactElement } from "react"

/** "🔒 Google": the action asks for Google re-confirmation. */
export default function LockHint({
  className,
  label = "Google",
}: {
  className?: string | undefined
  label?: string
}): ReactElement {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap text-caption font-500 text-muted",
        className,
      )}
    >
      <Lock aria-hidden="true" size={11} strokeWidth={1.75} />
      {label}
    </span>
  )
}
