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
  presetRange,
  tsToDateInput,
} from "@/components/AcademyShared"
import { ClickableAddress } from "@/components/ClickableAddress"
import {
  defaultParams,
  defaultRange,
  useAcademySim,
} from "@/hooks/useAcademySim"
import type { LeaderboardRow, SimResult } from "@/lib/academy/simulate"
import { useMemo, useState } from "react"
import type { Address } from "viem"

type Mode = "easy" | "pro"

function fmtMezoCompact(wad: bigint): string {
  if (wad <= 0n) return "0"
  const value = Number(wad / 10n ** 12n) / 1e6
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(2)}K`
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 })
}

function fmtAddrShort(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

const RANGE_PRESETS: Array<{ label: string; weeks: number }> = [
  { label: "4 weeks", weeks: 4 },
  { label: "8 weeks", weeks: 8 },
  { label: "12 weeks", weeks: 12 },
  { label: "26 weeks", weeks: 26 },
]

export default function AcademyPage() {
  const [mode, setMode] = useState<Mode>("easy")
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
            Academy reward budget over a chosen window. Pick a date range,
            choose easy or pro mode, and explore the leaderboard.
          </p>
        </div>
        <ModeToggle mode={mode} onChange={setMode} />
      </header>

      {/* Range bar — shown in both modes */}
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
        <LoadingCard epochs={epochs.length} />
      ) : activity.isError ? (
        <ErrorCard error={activity.error as Error | null} />
      ) : mode === "easy" ? (
        <EasyView
          simResult={simResult}
          fromTs={fromTs}
          toTs={toTs}
          budgetMezoWad={params.budgetMezoWad}
          onSelectActor={setSelectedActor}
        />
      ) : (
        <ProView
          simResult={simResult}
          params={params}
          setParams={setParams}
          setFromTs={setFromTs}
          setToTs={setToTs}
          activity={activity}
          epochSummaries={epochSummaries}
          peakEpochTotal={peakEpochTotal}
          onSelectActor={setSelectedActor}
        />
      )}

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

// ─────────────────────────────────────────────────────────────────────────────
// Mode toggle
// ─────────────────────────────────────────────────────────────────────────────

function ModeToggle({
  mode,
  onChange,
}: { mode: Mode; onChange: (m: Mode) => void }) {
  return (
    <div className="inline-flex rounded-full border border-[var(--border)] bg-[var(--surface-tertiary)] p-0.5">
      {(
        [
          { key: "easy", label: "Easy", hint: "Plain-English summary" },
          { key: "pro", label: "Pro", hint: "Full controls and breakdown" },
        ] as const
      ).map((m) => {
        const active = mode === m.key
        return (
          <button
            key={m.key}
            type="button"
            onClick={() => onChange(m.key)}
            title={m.hint}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
              active
                ? "bg-[#F7931A] text-white"
                : "text-[var(--content-secondary)] hover:text-[var(--content-primary)]"
            }`}
          >
            {m.label}
          </button>
        )
      })}
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
          {RANGE_PRESETS.map((p) => (
            <button
              key={p.weeks}
              type="button"
              onClick={() => onPreset(p.weeks)}
              className="rounded border border-[var(--border)] px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-[var(--content-secondary)] hover:border-[#F7931A] hover:text-[#F7931A]"
            >
              {p.label}
            </button>
          ))}
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
// Easy mode — executive view
// ─────────────────────────────────────────────────────────────────────────────

function EasyView({
  simResult,
  fromTs,
  toTs,
  budgetMezoWad,
  onSelectActor,
}: {
  simResult: SimResult | null
  fromTs: number
  toTs: number
  budgetMezoWad: bigint
  onSelectActor: (actor: Address) => void
}) {
  if (!simResult) return null

  const top = useMemo(() => simResult.rows.slice(0, 10), [simResult.rows])
  const top1Share = simResult.rows.length
    ? pointsSharePct(simResult.rows[0] as LeaderboardRow, simResult.rows)
    : 0
  const top10Share = useMemo(() => {
    if (simResult.rows.length === 0) return 0
    const total = simResult.rows.reduce((acc, r) => acc + r.pointsWad, 0n)
    if (total <= 0n) return 0
    const top10 = top.reduce((acc, r) => acc + r.pointsWad, 0n)
    return Number((top10 * 10_000n) / total) / 100
  }, [simResult.rows, top])

  return (
    <div className="flex flex-col gap-6">
      {/* Headline KPIs */}
      <section>
        <h2 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--content-secondary)]">
          Headline
        </h2>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <Stat
            label="Participants earning"
            value={simResult.totals.participants.toLocaleString()}
            hint="Distinct addresses that earned at least 1 point in the window."
          />
          <Stat
            label="Reward budget"
            value={`${fmtMezoCompact(budgetMezoWad)} MEZO`}
            hint="Total MEZO modeled as the Academy emission for this window."
          />
          <Stat
            label="Avg APR"
            value={fmtPct(simResult.totals.avgApr)}
            hint="Annualised return on ve-power across all earning participants."
            tone="positive"
          />
          <Stat
            label="Full participation ★"
            value={String(simResult.totals.fullParticipationCount)}
            hint="Voters with at least one active vote in every epoch of the window."
          />
          <Stat
            label="New locks"
            value={simResult.totals.newLockCount.toLocaleString()}
          />
          <Stat
            label="Extensions"
            value={simResult.totals.extensionCount.toLocaleString()}
          />
          <Stat
            label="Boost actions"
            value={simResult.totals.boostCount.toLocaleString()}
          />
          <Stat
            label="Epochs in window"
            value={String(simResult.totals.totalEpochs)}
          />
        </div>
      </section>

      {/* Narrative summary */}
      <section className="rounded border border-[var(--border)] bg-[var(--surface-tertiary)] px-4 py-3 text-sm leading-relaxed text-[var(--content-primary)]">
        <h2 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--content-secondary)]">
          What this means
        </h2>
        <p>
          Across <strong>{fmtDate(fromTs)}</strong> →{" "}
          <strong>{fmtDate(toTs)}</strong>, the Academy budget of{" "}
          <strong>{fmtMezoCompact(budgetMezoWad)} MEZO</strong> would distribute
          to <strong>{simResult.totals.participants}</strong> earning
          participants, with an average APR of{" "}
          <strong>{fmtPct(simResult.totals.avgApr)}</strong>. The top earner
          would receive <strong>{top1Share.toFixed(1)}%</strong> of the budget
          and the top ten would receive{" "}
          <strong>{top10Share.toFixed(1)}%</strong>. There were{" "}
          <strong>{simResult.totals.newLockCount.toLocaleString()}</strong> new
          locks,{" "}
          <strong>{simResult.totals.extensionCount.toLocaleString()}</strong>{" "}
          extensions, and{" "}
          <strong>{simResult.totals.boostCount.toLocaleString()}</strong> raw
          boost-vote events recorded.
        </p>
      </section>

      {/* Top-10 leaderboard, simplified */}
      <section>
        <h2 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--content-secondary)]">
          Top 10 contributors
        </h2>
        {top.length === 0 ? (
          <div className="rounded border border-[var(--border)] bg-[var(--surface-tertiary)] px-3 py-6 text-center text-xs text-[var(--content-secondary)]">
            No qualifying activity in this range.
          </div>
        ) : (
          <div className="overflow-hidden rounded border border-[var(--border)]">
            <table className="w-full text-sm">
              <thead className="bg-[var(--surface-tertiary)] text-[10px] uppercase tracking-wider text-[var(--content-secondary)]">
                <tr>
                  <th className="px-3 py-2 text-left">#</th>
                  <th className="px-3 py-2 text-left">Wallet</th>
                  <th className="px-3 py-2 text-right">Share</th>
                  <th className="px-3 py-2 text-right">Reward (MEZO)</th>
                  <th className="px-3 py-2 text-right">APR</th>
                  <th className="px-3 py-2 text-right">What they did</th>
                </tr>
              </thead>
              <tbody>
                {top.map((row, i) => (
                  <tr
                    key={row.actor}
                    className="border-t border-[var(--border)] hover:bg-[var(--surface-tertiary)]"
                  >
                    <td className="px-3 py-2 text-left text-[var(--content-tertiary)]">
                      {i + 1}
                    </td>
                    <td className="px-3 py-2">
                      <ClickableAddress
                        address={row.actor}
                        label={fmtAddrShort(row.actor)}
                        className="text-xs"
                        onLabelClick={onSelectActor}
                        labelTitle="Open the detailed actor profile"
                      />
                      {row.fullyParticipated ? (
                        <span
                          className="ml-1.5 rounded bg-[#F7931A]/15 px-1 text-[9px] font-bold uppercase text-[#F7931A]"
                          title="Voted in every epoch of the range"
                        >
                          ★ full
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-[var(--content-primary)]">
                      {pointsSharePct(row, simResult.rows).toFixed(2)}%
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-[var(--content-primary)]">
                      {fmtMezoCompact(row.rewardMezoWad)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-[#F7931A]">
                      {row.apr > 0
                        ? `${row.apr.toLocaleString(undefined, { maximumFractionDigits: 1 })}%`
                        : "—"}
                    </td>
                    <td className="px-3 py-2 text-right text-xs text-[var(--content-secondary)]">
                      {describeActivity(row)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-2 text-[11px] text-[var(--content-tertiary)]">
          Click any wallet to see their per-epoch breakdown. Switch to{" "}
          <span className="font-semibold text-[var(--content-secondary)]">
            Pro
          </span>{" "}
          for the full leaderboard, tunable scoring weights, and the per-epoch
          chart.
        </p>
      </section>
    </div>
  )
}

function pointsSharePct(row: LeaderboardRow, rows: LeaderboardRow[]): number {
  const total = rows.reduce((acc, r) => acc + r.pointsWad, 0n)
  if (total <= 0n) return 0
  return Number((row.pointsWad * 10_000n) / total) / 100
}

function describeActivity(row: LeaderboardRow): string {
  const parts: string[] = []
  if (row.newLockCount > 0)
    parts.push(
      `${row.newLockCount} new lock${row.newLockCount === 1 ? "" : "s"}`,
    )
  if (row.extensionCount > 0)
    parts.push(
      `${row.extensionCount} extension${row.extensionCount === 1 ? "" : "s"}`,
    )
  if (row.activeEpochs > 0)
    parts.push(
      `active in ${row.activeEpochs} epoch${row.activeEpochs === 1 ? "" : "s"}`,
    )
  if (parts.length === 0) return "—"
  return parts.join(" · ")
}

// ─────────────────────────────────────────────────────────────────────────────
// Pro mode — full controls
// ─────────────────────────────────────────────────────────────────────────────

function ProView({
  simResult,
  params,
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
              <Stat label="Avg APR" value={fmtPct(simResult.totals.avgApr)} />
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
            </div>
          </section>
        ) : null}

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
              onSelectActor={onSelectActor}
            />
          ) : null}
        </section>
      </main>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Loading / error states
// ─────────────────────────────────────────────────────────────────────────────

function LoadingCard({ epochs }: { epochs: number }) {
  return (
    <div className="rounded border border-[var(--border)] bg-[var(--surface-tertiary)] px-3 py-12 text-center text-sm text-[var(--content-secondary)]">
      Fetching events across {epochs} epoch{epochs === 1 ? "" : "s"}…
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
