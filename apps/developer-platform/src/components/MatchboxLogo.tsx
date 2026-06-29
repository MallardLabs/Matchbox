import { cn } from "@/utils/cn"
import Link from "next/link"

type MatchboxLogoProps = {
  href?: string
  suffix?: "ID" | "Developer Platform"
  inverse?: boolean
}

export function MatchboxLogo({
  href = "/",
  suffix,
  inverse = false,
}: MatchboxLogoProps): JSX.Element {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex items-center gap-3 no-underline",
        inverse ? "text-white" : "text-ink dark:text-stone-100",
      )}
      aria-label={suffix ? `Matchbox ${suffix}` : "Matchbox"}
    >
      <img
        src="/matchbox.png"
        alt=""
        width={120}
        height={32}
        className="h-8 w-auto dark:invert"
      />
      {suffix ? (
        <span
          className={cn(
            "text-xl font-semibold leading-none sm:text-2xl",
            inverse ? "text-white" : "text-ink dark:text-stone-100",
          )}
        >
          {suffix}
        </span>
      ) : null}
    </Link>
  )
}
