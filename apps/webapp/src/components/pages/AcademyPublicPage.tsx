import AcademyPublicActorProfile from "@/components/AcademyPublicActorProfile"
import AcademyPublicLeaderboard from "@/components/AcademyPublicLeaderboard"
import { InitialLoader } from "@/components/InitialLoader"
import { SpringIn } from "@/components/SpringIn"
import { useAcademyActorProfile } from "@/hooks/useAcademyActorProfile"
import { useAcademyLeaderboard } from "@/hooks/useAcademyLeaderboard"
import { useEffect, useMemo, useState } from "react"
import type { Address } from "viem"

export default function AcademyPublicPage() {
  const {
    data: leaderboardData,
    isLoading: leaderboardLoading,
    isError: leaderboardError,
    error,
  } = useAcademyLeaderboard()
  const [selectedActor, setSelectedActor] = useState<Address | null>(null)

  // Fetch selected actor profile details
  const { data: actorProfileData, isLoading: actorProfileLoading } =
    useAcademyActorProfile(selectedActor)

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

  if (leaderboardLoading) {
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
      </header>

      {/* Metadata Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[var(--border)] bg-[var(--surface-tertiary)] px-5 py-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-[var(--content-secondary)]">
          <div className="flex items-center gap-1.5">
            <span className="text-[var(--content-tertiary)] uppercase text-xs tracking-wider font-semibold">
              Window:
            </span>
            <span className="font-mono font-medium text-[var(--content-primary)]">
              {dateRangeStr} (Last 8 weeks)
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

      {/* Leaderboard Table Section */}
      <SpringIn variant="card">
        <section className="space-y-4">
          <AcademyPublicLeaderboard
            rows={rows}
            onSelectActor={setSelectedActor}
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
