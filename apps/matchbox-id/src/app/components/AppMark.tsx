import { cn } from "@repo/ui/cn"
import { type ReactElement, useState } from "react"
import { appInitials, appMarkTone } from "../lib/marks"

const sizes = {
  sm: "size-7 rounded-[7px] text-micro",
  md: "size-8 rounded-lg text-caption",
  lg: "size-12 rounded-[10px] text-lead",
} as const

const tones = {
  ink: "bg-ink text-canvas",
  accent: "bg-accent-soft text-accent-ink",
  neutral: "bg-inset-2 text-ink-2",
} as const

/** App logo, or its initials on a tile when missing or broken. */
export default function AppMark({
  name,
  logoUrl,
  size = "md",
  className,
}: {
  name: string
  logoUrl: string | null
  size?: keyof typeof sizes
  className?: string
}): ReactElement {
  const [failed, setFailed] = useState(false)
  if (logoUrl === null || failed) {
    return (
      <span
        aria-hidden="true"
        className={cn(
          "flex shrink-0 items-center justify-center font-700",
          sizes[size],
          tones[appMarkTone(name)],
          className,
        )}
      >
        {appInitials(name)}
      </span>
    )
  }
  return (
    <img
      src={logoUrl}
      alt=""
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={cn("shrink-0 bg-inset object-cover", sizes[size], className)}
    />
  )
}
