import AcademyDiscordCard from "@/components/AcademyDiscordCard"
import AcademyPublicActorProfile from "@/components/AcademyPublicActorProfile"
import AcademyPublicLeaderboard from "@/components/AcademyPublicLeaderboard"
import { InitialLoader } from "@/components/InitialLoader"
import { SpringIn } from "@/components/SpringIn"
import { useAcademyActorProfile } from "@/hooks/useAcademyActorProfile"
import { useAcademyLeaderboard } from "@/hooks/useAcademyLeaderboard"
import { useAcademySemesters } from "@/hooks/useAcademySemesters"
import { LinkExternal02 } from "@mezo-org/mezo-clay"
import { useEffect, useMemo, useState } from "react"
import type { Address } from "viem"
import { useAccount } from "wagmi"

// Default to the inaugural season; users can switch to later ones.
const DEFAULT_SEMESTER_ID = "0"
const SEASON_CHOICE_KEY = "mezo-academy-season-choice-v1"

// Default to Season 0, but remember the user's last choice across visits.
function readSeasonChoice(): string {
  if (typeof window === "undefined") return DEFAULT_SEMESTER_ID
  try {
    return window.localStorage.getItem(SEASON_CHOICE_KEY) ?? DEFAULT_SEMESTER_ID
  } catch {
    return DEFAULT_SEMESTER_ID
  }
}

export default function AcademyPublicPage() {
  const { address: walletAddress, isConnected } = useAccount()
  const { data: semesters, isLoading: seasonsLoading } = useAcademySemesters()
  const seasons = semesters ?? []

  const [selectedSemesterId, setSelectedSemesterId] = useState(readSeasonChoice)
  const selectSeason = (id: string) => {
    setSelectedSemesterId(id)
    try {
      window.localStorage.setItem(SEASON_CHOICE_KEY, id)
    } catch {
      // Ignore quota/private-mode failures.
    }
  }
  // Resolve the active season, falling back to Season 0 then the earliest defined.
  const selectedSeason =
    seasons.find((s) => s.semesterId === selectedSemesterId) ??
    seasons.find((s) => s.semesterId === DEFAULT_SEMESTER_ID) ??
    seasons[0] ??
    null
  // Window semantics for the leaderboard hook:
  //  - a selected season  → pin that window.
  //  - list still loading  → null (wait, don't flash the wrong window).
  //  - list settled empty  → undefined (fall back to the rolling window) so the
  //    page still loads if the semesters endpoint is unavailable, rather than
  //    waiting forever and showing "Failed to load".
  const selectedWindow = selectedSeason
    ? { fromTs: selectedSeason.fromTs, toTs: selectedSeason.toTs }
    : seasonsLoading
      ? null
      : undefined

  const {
    data: leaderboardData,
    isLoading: leaderboardLoading,
    isError: leaderboardError,
    error,
  } = useAcademyLeaderboard(selectedWindow)
  const [selectedActor, setSelectedActor] = useState<Address | null>(null)

  // Fetch selected actor profile details (same window as the leaderboard).
  const { data: actorProfileData, isLoading: actorProfileLoading } =
    useAcademyActorProfile(selectedActor, selectedWindow)

  const userStats = useMemo(() => {
    if (!walletAddress || !leaderboardData) return null
    const lower = walletAddress.toLowerCase()
    const index = leaderboardData.rows.findIndex(
      (r) => r.actor.toLowerCase() === lower,
    )
    if (index === -1) {
      return {
        rank: "Unranked",
        row: {
          actor: walletAddress as Address,
          pointsWad: 0n,
          newLockCount: 0,
          extensionCount: 0,
          boostCount: 0,
          activeEpochs: 0,
          fullyParticipated: false,
        },
        share: 0,
      }
    }
    const row = leaderboardData.rows[index]
    if (!row) return null
    const total = leaderboardData.rows.reduce((acc, r) => acc + r.pointsWad, 0n)
    const share =
      total > 0n ? Number((row.pointsWad * 10_000n) / total) / 100 : 0
    return {
      rank: `#${index + 1}`,
      row,
      share,
    }
  }, [walletAddress, leaderboardData])

  const timeAgoStr = useMemo(() => {
    if (!leaderboardData?.meta.generatedAt) return ""
    const generatedAt = leaderboardData.meta.generatedAt
    const diff = Math.floor(Date.now() / 1000) - generatedAt
    if (diff < 0) return "Just now" // timezone/skew safety
    if (diff < 60) return "Just now"
    const mins = Math.floor(diff / 60)
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs}h ago`
    return `${Math.floor(hrs / 24)}d ago`
  }, [leaderboardData?.meta.generatedAt])

  useEffect(() => {
    if (!selectedActor) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelectedActor(null)
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [selectedActor])

  // selectedWindow === null means we're still resolving the season list; show the
  // loader rather than briefly falling through to the error state below.
  if (leaderboardLoading || selectedWindow === null) {
    return <InitialLoader />
  }

  if (leaderboardError || !leaderboardData) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-12 md:py-24">
        <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-6 text-center text-sm text-red-400">
          <p className="font-semibold">Failed to load public leaderboard</p>
          <p className="mt-1 text-xs opacity-80">
            {error instanceof Error ? error.message : "Unknown error"}
          </p>
        </div>
      </div>
    )
  }

  const { rows, totals, meta } = leaderboardData
  const dateRangeStr = `${new Date(meta.fromTs * 1000).toISOString().slice(0, 10)} → ${new Date(meta.toTs * 1000).toISOString().slice(0, 10)}`

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 py-8 md:py-16">
      {/* Page Header */}
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight text-[var(--content-primary)] sm:text-4xl md:text-5xl bg-gradient-to-r from-[var(--content-primary)] to-[var(--content-secondary)] bg-clip-text text-transparent">
          Mezo Academy
        </h1>
        <p className="mt-1 max-w-3xl text-base leading-relaxed text-[var(--content-secondary)] sm:text-lg">
          Points leaderboard for protocol participation. Track veMEZO lockers
          and veBTC voters active on the network.
        </p>
        <a
          href="https://mezo.org/blog/mezo-academy/"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex w-fit items-center gap-1 text-sm font-medium text-brand no-underline transition-colors hover:underline"
        >
          Learn about Mezo Academy
          <LinkExternal02 size={14} />
        </a>
      </header>

      {/* Season switcher */}
      {seasons.length > 1 && (
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold uppercase tracking-wider text-[var(--content-tertiary)]">
            Season
          </span>
          <div className="inline-flex rounded-lg border border-[var(--border)] bg-[var(--surface)] p-0.5">
            {seasons.map((s) => {
              const active = s.semesterId === selectedSeason?.semesterId
              return (
                <button
                  key={s.semesterId}
                  type="button"
                  onClick={() => selectSeason(s.semesterId)}
                  aria-pressed={active}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                    active
                      ? "bg-brand text-white"
                      : "text-[var(--content-secondary)] hover:text-[var(--content-primary)]"
                  }`}
                >
                  {s.label}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Metadata Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[var(--border)] bg-[var(--surface-tertiary)] px-5 py-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-[var(--content-secondary)]">
          <div className="flex items-center gap-1.5">
            <span className="text-[var(--content-tertiary)] uppercase text-xs tracking-wider font-semibold">
              Window:
            </span>
            <span className="font-mono font-medium text-[var(--content-primary)]">
              {dateRangeStr}{" "}
              {selectedSeason
                ? `(${selectedSeason.label}${selectedSeason.isCurrent ? "" : " · ended"})`
                : "(Last 8 weeks)"}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[var(--content-tertiary)] uppercase text-xs tracking-wider font-semibold">
              Epochs:
            </span>
            <span className="font-mono font-medium text-[var(--content-primary)]">
              {totals.totalEpochs}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[var(--content-tertiary)] uppercase text-xs tracking-wider font-semibold">
              Actors:
            </span>
            <span className="font-mono font-medium text-[var(--content-primary)]">
              {totals.participants}
            </span>
          </div>
        </div>
        {timeAgoStr && (
          <div className="flex items-center gap-1.5 text-xs text-[var(--content-tertiary)] font-medium">
            <span className="h-1.5 w-1.5 rounded-full bg-[#22C55E]" />
            <span>Updated {timeAgoStr}</span>
          </div>
        )}
      </div>

      {/* User Stats Card */}
      {isConnected && walletAddress && userStats && (
        <SpringIn variant="card">
          <div className="rounded-xl border border-brand/30 bg-brand/5 p-5 shadow-sm">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-brand mb-3">
              Your Academy Stats ({walletAddress.slice(0, 6)}…
              {walletAddress.slice(-4)})
            </h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-primary)] px-3.5 py-2.5">
                <div className="text-[10px] uppercase tracking-wider text-[var(--content-secondary)]">
                  Leaderboard Rank
                </div>
                <div className="mt-1 font-mono text-lg font-bold text-[var(--content-primary)]">
                  {userStats.rank}
                </div>
              </div>
              <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-primary)] px-3.5 py-2.5">
                <div className="text-[10px] uppercase tracking-wider text-[var(--content-secondary)]">
                  Points
                </div>
                <div className="mt-1 font-mono text-lg font-bold text-[var(--content-primary)]">
                  {Number(userStats.row.pointsWad / 10n ** 12n) / 1e6 > 0
                    ? (
                        Number(userStats.row.pointsWad / 10n ** 12n) / 1e6
                      ).toLocaleString(undefined, { maximumFractionDigits: 2 })
                    : "0.00"}
                </div>
              </div>
              <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-primary)] px-3.5 py-2.5">
                <div className="text-[10px] uppercase tracking-wider text-[var(--content-secondary)]">
                  Share
                </div>
                <div className="mt-1 font-mono text-lg font-bold text-[var(--content-primary)]">
                  {userStats.share.toFixed(2)}%
                </div>
              </div>
              <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-primary)] px-3.5 py-2.5">
                <div className="text-[10px] uppercase tracking-wider text-[var(--content-secondary)]">
                  Participation
                </div>
                <div className="mt-1 font-mono text-lg font-bold text-[var(--content-primary)]">
                  {userStats.row.fullyParticipated ? (
                    <span
                      className="text-[#F7931A]"
                      title="Fully participated: voted in every epoch"
                    >
                      ★ Full (2x bonus)
                    </span>
                  ) : (
                    <span>
                      {userStats.row.activeEpochs} / {totals.totalEpochs} epochs
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </SpringIn>
      )}

      {/* Discord link status */}
      {isConnected && walletAddress && (
        <SpringIn variant="card">
          <AcademyDiscordCard walletAddress={walletAddress} />
        </SpringIn>
      )}

      {/* Leaderboard Table Section */}
      <SpringIn variant="card">
        <section className="space-y-4">
          <AcademyPublicLeaderboard
            rows={rows}
            onSelectActor={setSelectedActor}
            walletAddress={walletAddress ?? null}
          />
        </section>
      </SpringIn>

      {/* Actor Profile Drawer */}
      {selectedActor && (
        <AcademyPublicActorProfile
          actor={selectedActor}
          profile={actorProfileData?.profile ?? null}
          row={actorProfileData?.row ?? null}
          isLoading={actorProfileLoading}
          fromTs={meta.fromTs}
          toTs={meta.toTs}
          onClose={() => setSelectedActor(null)}
        />
      )}
    </div>
  )
}
