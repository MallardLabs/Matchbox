import { useAcademyLeaderboard } from "@/hooks/useAcademyLeaderboard"
import { useAcademySemester } from "@/hooks/useAcademySemester"
import { LinkExternal02 } from "@mezo-org/mezo-clay"
import { useEffect, useState } from "react"
import { useAccount } from "wagmi"

const BLOG_URL = "https://mezo.org/blog/mezo-academy/"
const DISMISS_KEY = "mezo-academy-eligibility-banner-dismissed-v1"
// The inaugural distribution is Season 0; the banner is pinned to it so the
// "first distribution" wording stays accurate once later seasons exist.
const INAUGURAL_SEMESTER_ID = "0"

// App-wide banner shown to a connected wallet that qualifies for the Mezo Academy
// inaugural distribution (Season 0). Eligibility = membership in that season's
// server-culled leaderboard, which already excludes wallets below the reward
// cutoff — mirroring the blog's note that sub-threshold participants weren't
// contemplated. Dismissible and remembered.
export default function AcademyEligibilityBanner(): JSX.Element | null {
  const { address, isConnected } = useAccount()
  // Mount the leaderboard-fetching inner only when connected, so disconnected
  // visitors don't trigger the heavy leaderboard query app-wide.
  if (!isConnected || !address) return null
  return <EligibilityBannerInner address={address} />
}

function EligibilityBannerInner({
  address,
}: {
  address: string
}): JSX.Element | null {
  // Pin to Season 0's window specifically, independent of the active semester.
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

  // Only trust leaderboard data that actually corresponds to Season 0's window.
  const eligible =
    !!season0 &&
    !!leaderboardData &&
    leaderboardData.meta.fromTs === season0.fromTs &&
    leaderboardData.meta.toTs === season0.toTs &&
    leaderboardData.rows.some(
      (r) => r.actor.toLowerCase() === address.toLowerCase(),
    )

  if (dismissed || !eligible) return null

  const dismiss = () => {
    setDismissed(true)
    try {
      window.localStorage.setItem(DISMISS_KEY, "1")
    } catch {
      // Ignore quota/private-mode failures.
    }
  }

  return (
    <div className="mx-auto w-full max-w-7xl px-3 pt-4 sm:px-4 md:px-6 lg:px-8">
      <div className="flex items-center gap-3 rounded-xl border border-brand/30 bg-brand/5 px-4 py-2.5">
        <span aria-hidden="true" className="text-lg">
          🎓
        </span>
        <p className="min-w-0 flex-1 text-sm text-[var(--content-primary)]">
          You’re eligible for Mezo Academy’s first veMEZO distribution.{" "}
          <span className="text-[var(--content-secondary)]">
            Welcome to the Class of 2026.
          </span>
        </p>
        <a
          href={BLOG_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-brand no-underline transition-colors hover:underline"
        >
          Learn more
          <LinkExternal02 size={14} />
        </a>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss"
          className="shrink-0 rounded-md p-1 text-[var(--content-tertiary)] transition-colors hover:bg-[var(--surface-secondary)] hover:text-[var(--content-primary)]"
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
