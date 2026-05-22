import AcademyActorProfile from "@/components/AcademyActorProfile"
import AcademyBlacklist from "@/components/AcademyBlacklist"
import AcademyKnobs from "@/components/AcademyKnobs"
import AcademyLeaderboard from "@/components/AcademyLeaderboard"
import {
  DataStatus,
  EpochChart,
  Stat,
  dateInputToTs,
  fmtDate,
  fmtPct,
  tsToDateInput,
} from "@/components/AcademyShared"
import { useAcademy } from "@/contexts/AcademyContext"
import {
  defaultParams,
  defaultRange,
  useAcademySim,
} from "@/hooks/useAcademySim"

export default function AcademyPanel() {
  const { enabled, toggle } = useAcademy()
  const sim = useAcademySim({ enabled })
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

  if (!enabled) return null

  return (
    <div className="fixed inset-0 z-[70] flex justify-end bg-black/60 backdrop-blur-sm">
      <div className="flex h-full w-full max-w-[1280px] flex-col border-l border-[var(--border)] bg-[var(--surface-primary)] shadow-[0_0_60px_rgba(0,0,0,0.5)]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] px-5 py-3">
          <div className="flex items-center gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-base font-semibold tracking-tight text-[var(--content-primary)]">
                  Mezo Academy Simulator
                </span>
                <span className="rounded bg-[#F7931A]/15 px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-[#F7931A]">
                  Sim
                </span>
              </div>
              <p className="mt-0.5 text-xs leading-snug text-[var(--content-secondary)]">
                {fmtDate(fromTs)} → {fmtDate(toTs)} · {epochs.length} epoch
                {epochs.length === 1 ? "" : "s"} ·{" "}
                {simResult?.totals.participants ?? 0} actors · press{" "}
                <kbd className="rounded bg-[var(--surface-tertiary)] px-1 font-mono text-[11px]">
                  Shift+P
                </kbd>{" "}
                to close
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1 text-[11px] uppercase tracking-wider text-[var(--content-secondary)]">
              From
              <input
                type="date"
                value={tsToDateInput(fromTs)}
                onChange={(e) => {
                  const ts = dateInputToTs(e.target.value, "down")
                  if (ts) setFromTs(ts)
                }}
                className="rounded border border-[var(--border)] bg-[var(--surface-tertiary)] px-2 py-1 text-xs text-[var(--content-primary)] outline-none focus:border-[#F7931A]"
              />
            </label>
            <label className="flex items-center gap-1 text-[11px] uppercase tracking-wider text-[var(--content-secondary)]">
              To
              <input
                type="date"
                value={tsToDateInput(toTs)}
                onChange={(e) => {
                  const ts = dateInputToTs(e.target.value, "down")
                  if (ts) setToTs(ts)
                }}
                className="rounded border border-[var(--border)] bg-[var(--surface-tertiary)] px-2 py-1 text-xs text-[var(--content-primary)] outline-none focus:border-[#F7931A]"
              />
            </label>
            <a
              href="/academy"
              className="rounded border border-[var(--border)] px-2 py-1 font-mono text-[11px] uppercase tracking-wider text-[var(--content-secondary)] hover:text-[#F7931A]"
              title="Open the full Academy page"
            >
              Full page
            </a>
            <button
              type="button"
              onClick={toggle}
              className="rounded bg-[#F7931A] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#E8820C]"
            >
              Close
            </button>
          </div>
        </div>

        <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-5 py-4 md:flex-row">
          <aside className="flex w-full flex-none flex-col gap-3 md:w-[320px]">
            <AcademyKnobs
              params={params}
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

            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--content-primary)]">
                Totals
              </h3>
              {activity.isLoading ? (
                <div className="rounded border border-[var(--border)] bg-[var(--surface-tertiary)] px-3 py-6 text-center text-xs text-[var(--content-secondary)]">
                  Fetching events across {epochs.length} epoch
                  {epochs.length === 1 ? "" : "s"}…
                </div>
              ) : activity.isError ? (
                <div className="rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-400">
                  Failed to load activity:{" "}
                  {(activity.error as Error)?.message ?? "unknown error"}
                </div>
              ) : simResult ? (
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
                    value={(
                      activity.data?.lockEvents.length ?? 0
                    ).toLocaleString()}
                  />
                  <Stat
                    label="Vote events (history)"
                    value={(
                      activity.data?.voteEvents.length ?? 0
                    ).toLocaleString()}
                  />
                  <Stat
                    label="Epochs in range"
                    value={String(simResult.totals.totalEpochs)}
                  />
                </div>
              ) : null}
            </section>

            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--content-primary)]">
                Activity per epoch
              </h3>
              {epochSummaries.length === 0 ? (
                <div className="rounded border border-[var(--border)] bg-[var(--surface-tertiary)] px-3 py-4 text-center text-xs text-[var(--content-secondary)]">
                  No epochs in this range.
                </div>
              ) : (
                <EpochChart
                  rows={epochSummaries}
                  peak={Math.max(peakEpochTotal, 1)}
                />
              )}
            </section>

            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--content-primary)]">
                Leaderboard
              </h3>
              {simResult ? (
                <AcademyLeaderboard
                  rows={simResult.rows}
                  budgetMezoWad={params.budgetMezoWad}
                  onSelectActor={setSelectedActor}
                />
              ) : null}
            </section>
          </main>
        </div>
      </div>
      {actorProfile && selectedActor ? (
        <AcademyActorProfile
          profile={actorProfile}
          row={actorRow}
          fromTs={fromTs}
          toTs={toTs}
          weightExt={params.weightExt}
          onClose={() => setSelectedActor(null)}
        />
      ) : null}
    </div>
  )
}
