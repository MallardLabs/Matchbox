import type { EnvironmentKind } from "@repo/platform-contracts/network"
import { cn } from "@repo/ui/cn"
import type { HTMLAttributes, ReactElement, ReactNode } from "react"
import { StatusDot } from "./Status"

/** Small inset chip (design "Pill": 22px, r4, 11/600). */
export function Pill({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { children: ReactNode }): ReactElement {
  return (
    <span
      className={cn(
        "inline-flex h-[22px] shrink-0 items-center gap-[5px] whitespace-nowrap rounded bg-inset px-2 text-caption font-600 text-secondary",
        className,
      )}
      {...props}
    >
      {children}
    </span>
  )
}

export const environmentNames: Record<EnvironmentKind, string> = {
  test: "Test · Mezo testnet",
  live: "Live · Mezo",
}

export const environmentShortNames: Record<EnvironmentKind, string> = {
  test: "Test",
  live: "Live",
}

/** Environment chip: green dot for live, grey for test. */
export function EnvPill({
  kind,
  full = false,
  className,
}: {
  kind: EnvironmentKind
  /** "Live · Mezo" instead of "Live". */
  full?: boolean
  className?: string | undefined
}): ReactElement {
  return (
    <Pill className={className}>
      <StatusDot tone={kind === "live" ? "pos" : "neutral"} />
      {full ? environmentNames[kind] : environmentShortNames[kind]}
    </Pill>
  )
}

/** Mono scope chip; outlined accent while the scope awaits review. */
export function ScopeChip({
  scope,
  pending = false,
  className,
}: {
  scope: string
  pending?: boolean
  className?: string | undefined
}): ReactElement {
  return (
    <span
      className={cn(
        "inline-flex h-[22px] shrink-0 items-center whitespace-nowrap rounded px-2 font-mono text-caption",
        pending
          ? "border border-accent bg-surface text-accent-ink"
          : "bg-inset text-ink-2",
        className,
      )}
    >
      {scope}
      {pending ? <span className="sr-only"> (pending review)</span> : null}
    </span>
  )
}
