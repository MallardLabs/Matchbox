import AcademyDiscordCard from "@/components/AcademyDiscordCard"
import AcademyPublicActorProfile from "@/components/AcademyPublicActorProfile"
import AcademyPublicLeaderboard from "@/components/AcademyPublicLeaderboard"
import AcademyShareCard from "@/components/AcademyShareCard"
import { InitialLoader } from "@/components/InitialLoader"
import { SpringIn } from "@/components/SpringIn"
import { useNetwork } from "@/contexts/NetworkContext"
import { useAcademyActorProfile } from "@/hooks/useAcademyActorProfile"
import { useAcademyLeaderboard } from "@/hooks/useAcademyLeaderboard"
import { useAcademySemesters } from "@/hooks/useAcademySemesters"
import { WEEK, snapToThursdayUTC } from "@/lib/academy/epoch"
import { LinkExternal02 } from "@mezo-org/mezo-clay"
import { useEffect, useMemo, useState } from "react"
import type { Address } from "viem"
import { useAccount } from "wagmi"

// The leaderboard is presented as a single "Class of 2026" cohort spanning the
// union of every defined window — there is intentionally no per-season choice.
const CLASS_LABEL = "Class of 2026"

export default function AcademyPublicPage() {
  const { address: walletAddress, isConnected } = useAccount()
  const { isMainnet } = useNetwork()
  const { data: semesters, isLoading: seasonsLoading } = useAcademySemesters()
  const seasons = semesters ?? []

  // For the "no standings yet" notice and season selection. The leaderboard
  // itself can include the current open epoch once the season has started.
  const nowTs = Math.floor(Date.now() / 1000)
  const currentEpoch = snapToThursdayUTC(nowTs, "down")

  // Use the current live season's window only — the leaderboard shows one active
  // window at a time, not a union across all seasons. Fall back to the most
  // recently started season if none is marked current.
  const classSeason = (() => {
    if (seasons.length === 0) return null
    const current = seasons.find((s) => s.isCurrent)
    if (current) return current
    // No season contains "now". Prefer the next upcoming season (the page then
    // shows its "not started yet" state) over silently rendering an already-ended
    // season as if it were live — an ended window reports full points and N/N
    // epochs, which reads as a stale/regressed leaderboard. Only when every
    // season has ended do we fall back to the most recent one (final standings
    // for the concluded cohort). Seasons are ordered by fromTs ascending.
    const upcoming = seasons.filter((s) => s.fromTs > currentEpoch)
    return upcoming[0] ?? seasons.at(-1) ?? null
  })()
  const classWindow = classSeason
    ? { fromTs: classSeason.fromTs, toTs: classSeason.toTs }
    : null
  // Window semantics for the leaderboard hook:
  //  - a resolved window  → pin it.
  //  - list still loading  → null (wait, don't flash the wrong window).
  //  - list settled empty  → undefined (fall back to the rolling window) so the
  //    page still loads if the semesters endpoint is unavailable, rather than
  //    waiting forever and showing "Failed to load".
  const selectedWindow = classWindow ?? (seasonsLoading ? null : undefined)

  const {
    data: leaderboardData,
    isLoading: leaderboardLoading,
    isError: leaderboardError,
    error,
  } = useAcademyLeaderboard(selectedWindow)
  const [selectedActor, setSelectedActor] = useState<Address | null>(null)
  const [shareOpen, setShareOpen] = useState(false)

  // URL of the shareable standings card for the connected wallet. Mirrors the
  // leaderboard hook's window + qualifiedOnly so the card's rank/share match
  // what "Your stats" shows.
  const shareCardUrl = useMemo(() => {
    if (!walletAddress) return null
    const params = new URLSearchParams({
      // Cache-key version — bump in lockstep with the og route when the card
      // rendering changes, to bypass stale CDN entries.
      v: "2",
      actor: walletAddress,
      network: isMainnet ? "mainnet" : "testnet",
      qualifiedOnly: classSeason?.requireFloor === false ? "0" : "1",
    })
    if (classWindow) {
      params.set("from", String(classWindow.fromTs))
      params.set("to", String(classWindow.toTs))
    }
    return `/api/og/academy?${params.toString()}`
  }, [walletAddress, isMainnet, classSeason, classWindow])

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

  useEffect(() => {
    if (!selectedActor) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelectedActor(null)
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [selectedActor])

  const seasonNotStarted = !!classWindow && nowTs < classWindow.fromTs
  const firstEpochCloseStr = classWindow
    ? new Date((classWindow.fromTs + WEEK) * 1000).toISOString().slice(0, 10)
    : ""

  // Connected wallet's link card — shown both alongside stats and in the
  // not-started state so linking is always reachable.
  const discordCard = isConnected && walletAddress && (
    <AcademyDiscordCard walletAddress={walletAddress} />
  )

  let body: JSX.Element
  if (seasonNotStarted) {
    body = (
      <>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-tertiary)] px-5 py-12 text-center shadow-sm">
          <p className="font-semibold text-[var(--content-primary)]">
            No standings yet for the {CLASS_LABEL}
          </p>
          <p className="mx-auto mt-1 max-w-md text-sm text-[var(--content-secondary)]">
            The {CLASS_LABEL} is underway, but no epoch has completed. Only
            completed epochs count toward points and vote weight, so standings
            appear after the first epoch closes on {firstEpochCloseStr}.
          </p>
        </div>
        {discordCard && <SpringIn variant="card">{discordCard}</SpringIn>}
      </>
    )
  } else if (leaderboardLoading || selectedWindow === null) {
    body = (
      <div className="py-16">
        <InitialLoader />
      </div>
    )
  } else if (leaderboardError || !leaderboardData) {
    body = (
      <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-6 text-center text-sm text-red-400">
        <p className="font-semibold">Failed to load public leaderboard</p>
        <p className="mt-1 text-xs opacity-80">
          {error instanceof Error ? error.message : "Unknown error"}
        </p>
      </div>
    )
  } else {
    const { rows, totals, meta } = leaderboardData
    const displayFromTs = classWindow ? classWindow.fromTs : meta.fromTs
    const displayToTs = classWindow ? classWindow.toTs : meta.toTs
    const dateRangeStr = `${new Date(displayFromTs * 1000).toISOString().slice(0, 10)} → ${new Date(displayToTs * 1000).toISOString().slice(0, 10)}`
    // Total epochs in the semester window (fixed), vs completed epochs from sim.
    const semesterEpochs = classWindow
      ? Math.round((classWindow.toTs - classWindow.fromTs) / WEEK)
      : totals.totalEpochs
    body = (
      <>
        {/* Metadata row — flat, no card */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-[var(--border)] pb-3 text-xs text-[var(--content-muted)]">
          <span className="font-mono">{dateRangeStr}</span>
          <span aria-hidden>·</span>
          <span>
            {totals.totalEpochs}/{semesterEpochs}{" "}
            {semesterEpochs === 1 ? "epoch" : "epochs"}
          </span>
          <span aria-hidden>·</span>
          <span>{totals.participants.toLocaleString()} actors</span>
        </div>

        {/* Your stats + Discord — flat strip, no nested cards */}
        {isConnected && walletAddress && (
          <SpringIn variant="card">
            <div className="border-b border-[var(--border)] pb-5">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-widest text-[var(--content-muted)]">
                  Your stats · {walletAddress.slice(0, 6)}…
                  {walletAddress.slice(-4)}
                </span>
                <div className="flex items-center gap-2">
                  {userStats && shareCardUrl && (
                    <button
                      type="button"
                      onClick={() => setShareOpen(true)}
                      className="rounded-lg border border-[var(--border)] bg-[var(--surface-tertiary)] px-3 py-1.5 text-xs font-semibold text-[var(--content-primary)] transition-colors hover:border-brand"
                    >
                      Share
                    </button>
                  )}
                  <AcademyDiscordCard walletAddress={walletAddress} compact />
                </div>
              </div>
              {userStats ? (
                <div className="flex flex-wrap items-end gap-x-8 gap-y-4">
                  <div>
                    <div className="text-[10px] uppercase tracking-widest text-[var(--content-muted)]">
                      Rank
                    </div>
                    <div className="mt-0.5 font-mono text-2xl font-bold text-[var(--content-primary)]">
                      {userStats.rank}
                    </div>
                  </div>
                  <div className="h-10 w-px bg-[var(--border)]" aria-hidden />
                  <div>
                    <div className="text-[10px] uppercase tracking-widest text-[var(--content-muted)]">
                      Points
                    </div>
                    <div className="mt-0.5 font-mono text-2xl font-bold text-[var(--content-primary)]">
                      {Number(userStats.row.pointsWad / 10n ** 12n) / 1e6 > 0
                        ? (
                            Number(userStats.row.pointsWad / 10n ** 12n) / 1e6
                          ).toLocaleString(undefined, {
                            maximumFractionDigits: 2,
                          })
                        : "0"}
                    </div>
                  </div>
                  <div className="h-10 w-px bg-[var(--border)]" aria-hidden />
                  <div>
                    <div className="text-[10px] uppercase tracking-widest text-[var(--content-muted)]">
                      Share
                    </div>
                    <div className="mt-0.5 font-mono text-2xl font-bold text-[var(--content-primary)]">
                      {userStats.share.toFixed(2)}%
                    </div>
                  </div>
                  <div className="h-10 w-px bg-[var(--border)]" aria-hidden />
                  <div>
                    <div className="text-[10px] uppercase tracking-widest text-[var(--content-muted)]">
                      Participation
                    </div>
                    <div className="mt-0.5 font-mono text-2xl font-bold text-[var(--content-primary)]">
                      {userStats.row.fullyParticipated &&
                      totals.totalEpochs >= semesterEpochs ? (
                        <span
                          className="text-brand"
                          title="Voted in every epoch"
                        >
                          ★ Full
                        </span>
                      ) : (
                        <span>
                          {userStats.row.activeEpochs}
                          <span className="text-base font-normal text-[var(--content-muted)]">
                            /{semesterEpochs}
                          </span>
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-[var(--content-muted)]">
                  Your wallet has no recorded activity in this window yet.
                </p>
              )}
            </div>
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
      </>
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 pb-12 pt-4">
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

      {/* Single cohort indicator — intentionally one tab, no season choice. */}
      <div className="inline-flex w-fit rounded-lg border border-[var(--border)] bg-[var(--surface)] p-0.5">
        <span className="rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white">
          {CLASS_LABEL}
        </span>
      </div>

      {body}

      {shareOpen && shareCardUrl && (
        <AcademyShareCard
          cardUrl={shareCardUrl}
          onClose={() => setShareOpen(false)}
        />
      )}
    </div>
  )
}
