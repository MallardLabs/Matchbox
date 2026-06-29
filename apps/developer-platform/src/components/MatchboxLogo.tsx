import Link from "next/link"

type MatchboxLogoProps = {
  href?: string
  suffix?: "ID" | "Developers"
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
      className={`inline-flex items-center gap-2 no-underline ${inverse ? "text-white" : "text-ink"}`}
      aria-label={suffix ? `Matchbox ${suffix}` : "Matchbox"}
    >
      <span
        aria-hidden="true"
        className="flex size-8 items-center justify-center rounded-md bg-brand font-mono text-sm font-bold text-ink"
      >
        M
      </span>
      <span className="text-xl font-semibold">matchbox</span>
      {suffix ? (
        <span className={inverse ? "text-white/60" : "text-stone-500"}>
          {suffix}
        </span>
      ) : null}
    </Link>
  )
}
