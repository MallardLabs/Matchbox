import { type HTMLAttributes, type ReactElement, forwardRef } from "react"
import { cn } from "./cn"

const ROOT_NAME = "Logo"

/** `-light` assets are dark ink for light surfaces; `-dark` are light ink. */
export const logoUrls = {
  wordmarkLight: new URL(
    "../assets/matchbox-wordmark-light.png",
    import.meta.url,
  ).href,
  wordmarkDark: new URL("../assets/matchbox-wordmark-dark.png", import.meta.url)
    .href,
  iconLight: new URL("../assets/matchbox-icon-light.png", import.meta.url).href,
  iconDark: new URL("../assets/matchbox-icon-dark.png", import.meta.url).href,
} as const

export type LogoVariant = "wordmark" | "icon"

export type LogoProps = Omit<HTMLAttributes<HTMLSpanElement>, "children"> & {
  variant?: LogoVariant
  /** Accessible name; pass "" when a parent link already names it. */
  alt?: string
}

/** Theme-aware Matchbox mark; swaps assets with the `.dark` class, no JS. */
export const Root = forwardRef<HTMLSpanElement, LogoProps>(function Logo(
  { variant = "wordmark", alt = "Matchbox", className, ...props },
  ref,
): ReactElement {
  const light =
    variant === "wordmark" ? logoUrls.wordmarkLight : logoUrls.iconLight
  const dark =
    variant === "wordmark" ? logoUrls.wordmarkDark : logoUrls.iconDark
  const height = variant === "wordmark" ? "h-[25px]" : "h-5"
  return (
    <span
      ref={ref}
      className={cn("inline-flex shrink-0 items-center", height, className)}
      {...props}
    >
      <img src={light} alt={alt} className="h-full w-auto dark:hidden" />
      <img src={dark} alt={alt} className="hidden h-full w-auto dark:block" />
    </span>
  )
})
Root.displayName = ROOT_NAME
