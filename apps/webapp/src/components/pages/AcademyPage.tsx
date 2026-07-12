import AcademyActorProfile from "@/components/AcademyActorProfile"
import AcademyBlacklist from "@/components/AcademyBlacklist"
import AcademyKnobs from "@/components/AcademyKnobs"
import AcademyLeaderboard from "@/components/AcademyLeaderboard"

import {
  DataStatus,
  EpochChart,
  RewardHistogram,
  Stat,
  dateInputToTs,
  fmtDate,
  fmtPct,
  presetRange,
  tsToDateInput,
} from "@/components/AcademyShared"
import { SpringIn } from "@/components/SpringIn"
import {
  defaultParams,
  defaultRange,
  useAcademySim,
} from "@/hooks/useAcademySim"
import type { SimResult } from "@/lib/academy/simulate"
import { useState } from "react"
import type { Address } from "viem"

const RANGE_PRESETS: Array<{ label: string; weeks: number }> = [
  { label: "4 weeks", weeks: 4 },
  { label: "8 weeks", weeks: 8 },
  { label: "12 weeks", weeks: 12 },
  { label: "26 weeks", weeks: 26 },
]

export default function AcademyPage() {
  const sim = useAcademySim({ enabled: true })
  const {
    fromTs,
    toTs,
    setFromTs,
    setToTs,
    params,
    setParams,
    epochs,
    activity,
    sim: simResult,
    epochSummaries,
    peakEpochTotal,
    selectedActor,
    setSelectedActor,
    actorProfile,
    actorRow,
  } = sim

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-8 md:py-12">
      {/* Page header */}
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight text-[var(--content-primary)]">
              Mezo Academy
            </h1>
            <span className="rounded bg-[#F7931A]/15 px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-[#F7931A]">
              Sim
            </span>
          </div>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-[var(--content-secondary)]">
            Model what veMEZO lockers and veBTC voters would earn from the
            Academy reward budget over a chosen window. Pick a date range, tune
            the scoring weights, and explore the leaderboard.
          </p>
        </div>
      </header>

      <RangeBar
        fromTs={fromTs}
        toTs={toTs}
        epochsCount={epochs.length}
        participants={simResult?.totals.participants ?? 0}
        onSetFrom={setFromTs}
        onSetTo={setToTs}
        onPreset={(weeks) => {
          const r = presetRange(weeks)
          setFromTs(r.fromTs)
          setToTs(r.toTs)
        }}
      />

      {activity.isLoading ? (
        <LoadingCard epochs={epochs.length} progress={activity.progress} />
      ) : activity.isError ? (
        <ErrorCard error={activity.error as Error | null} />
      ) : (
        // Spring-in once the fetch resolves. Keyed on the data identity so
        // a new range / network swap re-triggers the slide; staying on the
        // same dataset (param tweaks) doesn't re-animate.
        <SpringIn key={String(activity.dataUpdatedAt ?? 0)} variant="card">
          <ProView
            simResult={simResult}
            params={params}
            fromTs={fromTs}
            toTs={toTs}
            setParams={setParams}
            setFromTs={setFromTs}
            setToTs={setToTs}
            activity={activity}
            epochSummaries={epochSummaries}
            peakEpochTotal={peakEpochTotal}
            onSelectActor={setSelectedActor}
          />
        </SpringIn>
      )}

      {actorProfile && selectedActor ? (
        <AcademyActorProfile
          profile={actorProfile}
          row={actorRow}
          fromTs={fromTs}
          toTs={toTs}
          params={params}
          onClose={() => setSelectedActor(null)}
        />
      ) : null}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Range bar
// ─────────────────────────────────────────────────────────────────────────────

function RangeBar({
  fromTs,
  toTs,
  epochsCount,
  participants,
  onSetFrom,
  onSetTo,
  onPreset,
}: {
  fromTs: number
  toTs: number
  epochsCount: number
  participants: number
  onSetFrom: (ts: number) => void
  onSetTo: (ts: number) => void
  onPreset: (weeks: number) => void
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded border border-[var(--border)] bg-[var(--surface-tertiary)] px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1 text-[11px] uppercase tracking-wider text-[var(--content-secondary)]">
          From
          <input
            type="date"
            value={tsToDateInput(fromTs)}
            onChange={(e) => {
              const ts = dateInputToTs(e.target.value, "down")
              if (ts) onSetFrom(ts)
            }}
            className="rounded border border-[var(--border)] bg-[var(--surface-secondary)] px-2 py-1 text-xs text-[var(--content-primary)] outline-none focus:border-[#F7931A]"
          />
        </label>
        <label className="flex items-center gap-1 text-[11px] uppercase tracking-wider text-[var(--content-secondary)]">
          To
          <input
            type="date"
            value={tsToDateInput(toTs)}
            onChange={(e) => {
              const ts = dateInputToTs(e.target.value, "down")
              if (ts) onSetTo(ts)
            }}
            className="rounded border border-[var(--border)] bg-[var(--surface-secondary)] px-2 py-1 text-xs text-[var(--content-primary)] outline-none focus:border-[#F7931A]"
          />
        </label>
        <div className="flex items-center gap-1">
          {RANGE_PRESETS.map((p) => {
            const isSelected =
              Math.round((toTs - fromTs) / (7 * 24 * 60 * 60)) === p.weeks
            return (
              <button
                key={p.weeks}
                type="button"
                onClick={() => onPreset(p.weeks)}
                className={`rounded border px-2 py-1 font-mono text-[10px] uppercase tracking-wider transition-colors ${
                  isSelected
                    ? "border-[#F7931A] bg-[#F7931A]/15 text-[#F7931A]"
                    : "border-[var(--border)] text-[var(--content-secondary)] hover:border-[#F7931A] hover:text-[#F7931A]"
                }`}
              >
                {p.label}
              </button>
            )
          })}
        </div>
      </div>
      <span className="text-[11px] text-[var(--content-secondary)]">
        {fmtDate(fromTs)} → {fmtDate(toTs)} · {epochsCount} epoch
        {epochsCount === 1 ? "" : "s"} · {participants} actors
      </span>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Pro mode — full controls
// ─────────────────────────────────────────────────────────────────────────────

function ProView({
  simResult,
  params,
  fromTs,
  toTs,
  setParams,
  setFromTs,
  setToTs,
  activity,
  epochSummaries,
  peakEpochTotal,
  onSelectActor,
}: {
  simResult: SimResult | null
  params: ReturnType<typeof useAcademySim>["params"]
  fromTs: number
  toTs: number
  setParams: ReturnType<typeof useAcademySim>["setParams"]
  setFromTs: ReturnType<typeof useAcademySim>["setFromTs"]
  setToTs: ReturnType<typeof useAcademySim>["setToTs"]
  activity: ReturnType<typeof useAcademySim>["activity"]
  epochSummaries: ReturnType<typeof useAcademySim>["epochSummaries"]
  peakEpochTotal: ReturnType<typeof useAcademySim>["peakEpochTotal"]
  onSelectActor: (actor: Address) => void
}) {
  return (
    <div className="flex flex-col gap-4 md:flex-row">
      <aside className="flex w-full flex-none flex-col gap-3 md:w-[320px]">
        <AcademyKnobs
          params={params}
          rangeFromTs={fromTs}
          rangeToTs={toTs}
          onChange={setParams}
          onReset={() => {
            setParams(defaultParams())
            const def = defaultRange()
            setFromTs(def.fromTs)
            setToTs(def.toTs)
          }}
        />
        <AcademyBlacklist
          droppedCount={simResult?.totals.droppedBlacklistEvents ?? 0}
        />
      </aside>

      <main className="flex-1 space-y-4">
        <DataStatus activity={activity} />

        {simResult ? (
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--content-primary)]">
              Totals
            </h3>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
              <Stat
                label="Participants"
                value={String(simResult.totals.participants)}
              />
              <Stat
                label="Median APR"
                value={fmtPct(simResult.totals.medianApr)}
              />
              <Stat
                label="Boost actions"
                value={simResult.totals.boostCount.toLocaleString()}
              />
              <Stat
                label="New / Ext locks"
                value={`${simResult.totals.newLockCount} / ${simResult.totals.extensionCount}`}
              />
              <Stat
                label="Full participation ★"
                value={String(simResult.totals.fullParticipationCount)}
              />
              <Stat
                label="Lock events in range"
                value={(activity.data?.lockEvents.length ?? 0).toLocaleString()}
              />
              <Stat
                label="Vote events (history)"
                value={(activity.data?.voteEvents.length ?? 0).toLocaleString()}
              />
              <Stat
                label="Epochs in range"
                value={String(simResult.totals.totalEpochs)}
              />
              {simResult.totals.culledBelowFloorCount > 0 ? (
                <Stat
                  label="Culled / redistributed"
                  value={`${simResult.totals.culledBelowFloorCount} actor${
                    simResult.totals.culledBelowFloorCount === 1 ? "" : "s"
                  }`}
                />
              ) : null}
            </div>
          </section>
        ) : null}

        <ChartsSection
          epochSummaries={epochSummaries}
          peakEpochTotal={peakEpochTotal}
          simResult={simResult}
        />

        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--content-primary)]">
            Leaderboard
          </h3>
          {simResult ? (
            <AcademyLeaderboard
              rows={simResult.rows}
              budgetMezoWad={params.budgetMezoWad}
              onSelectActor={onSelectActor}
            />
          ) : null}
        </section>
      </main>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Charts section — tabbed switcher between the per-epoch activity chart and
// the reward-distribution histogram. Tab state is local to this component
// because nothing else on the page needs to know which chart is showing.
// ─────────────────────────────────────────────────────────────────────────────

type ChartTab = "activity" | "rewardDistribution"

function ChartsSection({
  epochSummaries,
  peakEpochTotal,
  simResult,
}: {
  epochSummaries: ReturnType<typeof useAcademySim>["epochSummaries"]
  peakEpochTotal: ReturnType<typeof useAcademySim>["peakEpochTotal"]
  simResult: SimResult | null
}) {
  const [tab, setTab] = useState<ChartTab>("activity")

  return (
    <section>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--content-primary)]">
          {tab === "activity" ? "Activity per epoch" : "Reward distribution"}
        </h3>
        <div className="flex gap-1 rounded border border-[var(--border)] bg-[var(--surface-tertiary)] p-0.5 text-[10px] font-semibold uppercase tracking-wider">
          <ChartTabButton
            active={tab === "activity"}
            onClick={() => setTab("activity")}
          >
            Activity
          </ChartTabButton>
          <ChartTabButton
            active={tab === "rewardDistribution"}
            onClick={() => setTab("rewardDistribution")}
          >
            Reward dist.
          </ChartTabButton>
        </div>
      </div>
      {tab === "activity" ? (
        epochSummaries.length === 0 ? (
          <div className="rounded border border-[var(--border)] bg-[var(--surface-tertiary)] px-3 py-4 text-center text-xs text-[var(--content-secondary)]">
            No epochs in this range.
          </div>
        ) : (
          <EpochChart
            rows={epochSummaries}
            peak={Math.max(peakEpochTotal, 1)}
          />
        )
      ) : simResult && simResult.rows.length > 0 ? (
        <RewardHistogram rows={simResult.rows} />
      ) : (
        <div className="rounded border border-[var(--border)] bg-[var(--surface-tertiary)] px-3 py-4 text-center text-xs text-[var(--content-secondary)]">
          No actors to bucket yet.
        </div>
      )}
    </section>
  )
}

function ChartTabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded px-2 py-0.5 transition-colors ${
        active
          ? "bg-[#F7931A]/15 text-[#F7931A]"
          : "text-[var(--content-secondary)] hover:text-[var(--content-primary)]"
      }`}
    >
      {children}
    </button>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Loading / error states
// ─────────────────────────────────────────────────────────────────────────────

function LoadingCard({
  epochs,
  progress,
}: {
  epochs: number
  progress: ReturnType<typeof useAcademySim>["activity"]["progress"]
}) {
  const phaseLabel = (() => {
    if (progress.phase === "locks") return "Fetching lock-track events…"
    if (progress.phase === "votes") return "Fetching vote-track events…"
    if (progress.phase === "done") return "Indexing complete · finalising…"
    return `Fetching events across ${epochs} epoch${epochs === 1 ? "" : "s"}…`
  })()

  const totalEvents = progress.lockEventsFetched + progress.voteEventsFetched
  // Both phases now have known denominators: totalLockChunks is exact;
  // expectedVoteChunks starts as the 3-year max bound and tightens once the
  // pre-flight oldest-event query resolves. The vote loop can still exit
  // early on consecutive empties — phase flips to "done" and we snap to 100%.
  const totalChunks = progress.totalLockChunks + progress.expectedVoteChunks
  const chunksDone = progress.lockChunksDone + progress.voteChunksDone
  const isLocksPhase = progress.phase === "locks"
  const isVotesPhase = progress.phase === "votes"
  const fillPct =
    progress.phase === "done"
      ? 100
      : totalChunks > 0
        ? Math.min(100, (chunksDone / totalChunks) * 100)
        : 0

  return (
    <div className="rounded border border-[var(--border)] bg-[var(--surface-tertiary)] px-4 py-5">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <div className="text-sm text-[var(--content-secondary)]">
          {phaseLabel}
        </div>
        <div className="font-mono text-xs text-[var(--content-primary)]">
          <span className="text-[#F7931A]">{totalEvents.toLocaleString()}</span>{" "}
          event{totalEvents === 1 ? "" : "s"}
        </div>
      </div>

      {/* Track */}
      <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-[var(--surface-primary)] ring-1 ring-inset ring-[var(--border)]">
        {/* Fill: deterministic % during the lock phase, full-width with
            indeterminate shine during the vote phase. */}
        <div
          className="relative h-full rounded-full bg-[#F7931A] transition-[width] duration-300 ease-out"
          style={{ width: `${fillPct}%` }}
        >
          {(isLocksPhase || isVotesPhase) && (
            <div className="academy-fetch-shine absolute inset-0 rounded-full" />
          )}
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-[var(--content-tertiary)]">
        <span>
          Locks:{" "}
          <span className="font-mono text-[var(--content-secondary)]">
            {progress.lockEventsFetched.toLocaleString()}
          </span>{" "}
          ({progress.lockChunksDone}/{progress.totalLockChunks || "?"} chunks)
        </span>
        <span>
          Votes:{" "}
          <span className="font-mono text-[var(--content-secondary)]">
            {progress.voteEventsFetched.toLocaleString()}
          </span>{" "}
          ({progress.voteChunksDone}/{progress.expectedVoteChunks || "?"} chunks
          {progress.expectedVoteChunks > 0 ? " est." : ""})
        </span>
      </div>
    </div>
  )
}

function ErrorCard({ error }: { error: Error | null }) {
  return (
    <div className="rounded border border-red-500/40 bg-red-500/10 px-3 py-3 text-sm text-red-400">
      Failed to load activity: {error?.message ?? "unknown error"}
    </div>
  )
}
