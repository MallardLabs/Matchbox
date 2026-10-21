import { cn } from "@repo/ui/cn"
import type { ReactElement } from "react"
import { identiconGradient } from "../lib/marks"

/** Decorative wallet mark: a gradient derived from the address. */
export default function Identicon({
  address,
  size = 14,
  className,
}: {
  address: string
  size?: 14 | 16 | 18
  className?: string
}): ReactElement {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-block shrink-0 rounded-full",
        size === 18 ? "size-[18px]" : size === 16 ? "size-4" : "size-3.5",
        className,
      )}
      style={{ backgroundImage: identiconGradient(address) }}
    />
  )
}
