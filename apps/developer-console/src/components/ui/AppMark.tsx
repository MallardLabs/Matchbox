import type { App } from "@repo/platform-contracts/console"
import { cn } from "@repo/ui/cn"
import { type ReactElement, useState } from "react"

export type AppMarkTone = "ink" | "accent" | "neutral" | "muted"

/** "Stackbridge Rewards" → "SR"; "Gaugeboard" → "GA". */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  const first = words[0] ?? "?"
  const second = words[1]
  const letters =
    second === undefined ? first.slice(0, 2) : `${first[0]}${second[0]}`
  return letters.toUpperCase()
}

/** Retired → muted, live approved → ink, review pending → accent. */
export function appMarkTone(app: App): AppMarkTone {
  if (app.status === "retired") return "muted"
  const live = app.environments.find((env) => env.kind === "live")
  if (live?.reviewState === "approved") return "ink"
  if (
    app.environments.some(
      (env) =>
        env.reviewState === "submitted" ||
        env.reviewState === "changes-requested",
    )
  ) {
    return "accent"
  }
  return "neutral"
}

const toneClass: Record<AppMarkTone, string> = {
  ink: "bg-ink text-surface",
  accent: "bg-accent-soft text-accent-ink",
  neutral: "bg-inset text-ink-2",
  muted: "bg-inset text-muted",
}

const sizeClass = {
  sm: "size-7 rounded-md text-caption",
  md: "size-8 rounded-lg text-label",
  lg: "size-12 rounded-[10px] text-title-sm",
} as const

/** App or org monogram; the logo image when it loads. */
export default function AppMark({
  name,
  logoUrl = null,
  tone = "neutral",
  size = "md",
  className,
}: {
  name: string
  logoUrl?: string | null
  tone?: AppMarkTone
  size?: keyof typeof sizeClass
  className?: string | undefined
}): ReactElement {
  const [failed, setFailed] = useState(false)
  if (logoUrl !== null && !failed) {
    return (
      <img
        src={logoUrl}
        alt=""
        onError={() => setFailed(true)}
        className={cn(
          "shrink-0 border border-line object-cover",
          sizeClass[size],
          className,
        )}
      />
    )
  }
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex shrink-0 items-center justify-center font-700",
        sizeClass[size],
        toneClass[tone],
        className,
      )}
    >
      {initials(name)}
    </span>
  )
}
