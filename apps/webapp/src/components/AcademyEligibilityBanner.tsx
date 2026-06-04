import { useAcademyLeaderboard } from "@/hooks/useAcademyLeaderboard"
import { useAcademySemester } from "@/hooks/useAcademySemester"
import { LinkExternal02 } from "@mezo-org/mezo-clay"
import Link from "next/link"
import { useEffect, useState } from "react"
import { useAccount } from "wagmi"

const BLOG_URL = "https://mezo.org/blog/mezo-academy/"
const DISMISS_KEY = "mezo-academy-eligibility-banner-dismissed-v1"
// The inaugural distribution is Season 0; eligibility is pinned to it so the
// "first distribution" wording stays accurate once later seasons exist.
const INAUGURAL_SEMESTER_ID = "0"

// App-wide banner nudging every connected wallet to check its Mezo Academy
// standing on /academy. Wallets that qualified for the inaugural (Season 0)
// distribution get an extra eligibility line — eligibility = membership in that
// season's server-culled leaderboard, which already excludes wallets below the
// reward cutoff. Dismissible and remembered.
export default function AcademyEligibilityBanner(): JSX.Element | null {
  const { address, isConnected } = useAccount()
  // Mount the leaderboard-fetching inner only when connected, so disconnected
  // visitors don't trigger the heavy leaderboard query app-wide.
  if (!isConnected || !address) return null
  return <AcademyBannerInner address={address} />
}

function AcademyBannerInner({
  address,
}: {
  address: string
}): JSX.Element | null {
  // Pin eligibility to Season 0's window specifically, independent of the
  // currently-active semester.
  const { data: season0 } = useAcademySemester(INAUGURAL_SEMESTER_ID)
  const window0 = season0
    ? { fromTs: season0.fromTs, toTs: season0.toTs }
    : undefined
  const { data: leaderboardData } = useAcademyLeaderboard(window0)
  // Hidden until hydration confirms it hasn't been dismissed (avoids SSR flash).
  const [dismissed, setDismissed] = useState(true)

  useEffect(() => {
    if (typeof window === "undefined") return
    setDismissed(window.localStorage.getItem(DISMISS_KEY) === "1")
  }, [])

  if (dismissed) return null

  const dismiss = () => {
    setDismissed(true)
    try {
      window.localStorage.setItem(DISMISS_KEY, "1")
    } catch {
      // Ignore quota/private-mode failures.
    }
  }

  // Only trust leaderboard data that actually corresponds to Season 0's window.
  const eligible =
    !!season0 &&
    !!leaderboardData &&
    leaderboardData.meta.fromTs === season0.fromTs &&
    leaderboardData.meta.toTs === season0.toTs &&
    leaderboardData.rows.some(
      (r) => r.actor.toLowerCase() === address.toLowerCase(),
    )

  const heading = eligible
    ? "You’re in the Mezo Academy Class of 2026"
    : "Track your Mezo Academy standing"
  const subtext = eligible
    ? "You qualified for the inaugural veMEZO distribution — see where you rank."
    : "See where you rank among veMEZO lockers and veBTC voters this season."

  return (
    <div className="mx-auto w-full max-w-7xl px-3 pt-4 sm:px-4 md:px-6 lg:px-8">
      <div className="relative flex flex-col gap-4 rounded-xl border border-brand/30 bg-brand/5 px-5 py-4 sm:flex-row sm:items-center">
        <span aria-hidden="true" className="text-2xl sm:text-3xl">
          🎓
        </span>
        <div className="min-w-0 flex-1 pr-6 sm:pr-0">
          <p className="font-semibold text-[var(--content-primary)]">
            {heading}
          </p>
          <p className="mt-0.5 text-sm text-[var(--content-secondary)]">
            {subtext}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-4">
          <Link
            href="/academy"
            className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white no-underline transition-opacity hover:opacity-90"
          >
            Check your standing
          </Link>
          <a
            href={BLOG_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-sm font-medium text-brand no-underline transition-colors hover:underline"
          >
            Learn more
            <LinkExternal02 size={14} />
          </a>
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss"
          className="absolute right-2 top-2 rounded-md p-1 text-[var(--content-tertiary)] transition-colors hover:bg-[var(--surface-secondary)] hover:text-[var(--content-primary)] sm:static"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 14 14"
            fill="none"
            aria-hidden="true"
          >
            <title>Dismiss</title>
            <path
              d="M3 3l8 8M11 3l-8 8"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>
    </div>
  )
}
