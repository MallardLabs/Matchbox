import { cn } from "@repo/ui/cn"
import { type ReactElement, useState } from "react"

/** App logo, or its initial on a neutral tile when missing or broken. */
export default function AppLogo({
  name,
  logoUrl,
  size = "md",
}: {
  name: string
  logoUrl: string | null
  size?: "sm" | "md" | "lg"
}): ReactElement {
  const [failed, setFailed] = useState(false)
  const box =
    size === "lg"
      ? "size-12 rounded-[10px] text-[18px]"
      : size === "md"
        ? "size-8 rounded-lg text-[13px]"
        : "size-6 rounded-md text-[11px]"
  if (logoUrl === null || failed) {
    return (
      <span
        aria-hidden="true"
        className={cn(
          "flex shrink-0 items-center justify-center bg-inset-2 font-650 text-secondary",
          box,
        )}
      >
        {name.trim().charAt(0).toUpperCase() || "?"}
      </span>
    )
  }
  return (
    <img
      src={logoUrl}
      alt=""
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={cn("shrink-0 bg-inset object-cover", box)}
    />
  )
}
