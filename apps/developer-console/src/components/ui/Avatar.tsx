import { cn } from "@repo/ui/cn"
import { type ReactElement, useState } from "react"
import { initials } from "./AppMark"

/**
 * Round account avatar: the Google profile picture when there is one, else
 * initials. Falls back to initials if the image fails to load. Decorative;
 * the name is always shown or announced next to it.
 */
export default function Avatar({
  name,
  src,
  className,
}: {
  name: string
  src: string | null
  className?: string
}): ReactElement {
  const [failed, setFailed] = useState(false)
  const base = cn(
    "flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-inset text-caption font-700 text-ink-2",
    className,
  )
  if (src !== null && !failed) {
    return (
      <span aria-hidden="true" className={base}>
        <img
          src={src}
          alt=""
          referrerPolicy="no-referrer"
          loading="lazy"
          className="size-full object-cover"
          onError={() => setFailed(true)}
        />
      </span>
    )
  }
  return (
    <span aria-hidden="true" className={base}>
      {initials(name)}
    </span>
  )
}
