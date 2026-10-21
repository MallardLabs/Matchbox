import { cn } from "@repo/ui/cn"
import { Check } from "lucide-react"
import type { ReactElement, ReactNode } from "react"

export type AuthStepState = "done" | "active" | "upcoming"

/** Numbered auth steps: done (check), active (dark), upcoming (dimmed). */
export function AuthSteps({
  label,
  children,
}: {
  label: string
  children: ReactNode
}): ReactElement {
  return (
    <ol
      aria-label={label}
      className="m-0 flex list-none flex-col border-t border-line p-0"
    >
      {children}
    </ol>
  )
}

const stateText: Record<AuthStepState, string> = {
  done: " (done)",
  active: "",
  upcoming: " (next)",
}

export function AuthStep({
  index,
  title,
  state,
  children,
}: {
  index: number
  title: string
  state: AuthStepState
  children?: ReactNode
}): ReactElement {
  return (
    <li
      aria-current={state === "active" ? "step" : undefined}
      className="flex flex-col gap-3 border-b border-line py-5"
    >
      <p className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className={cn(
            "flex size-6 shrink-0 items-center justify-center rounded-full text-caption font-700",
            state === "done" && "bg-pos-soft text-pos",
            state === "active" && "bg-ink text-surface",
            state === "upcoming" && "bg-inset text-muted",
          )}
        >
          {state === "done" ? <Check size={13} strokeWidth={2.25} /> : index}
        </span>
        <span
          className={cn(
            "text-nav font-600",
            state === "upcoming" ? "text-secondary" : "text-ink",
          )}
        >
          {title}
          <span className="sr-only">{stateText[state]}</span>
        </span>
      </p>
      {children === undefined ? null : (
        <div className={cn("pl-9", state === "upcoming" && "opacity-60")}>
          {children}
        </div>
      )}
    </li>
  )
}
