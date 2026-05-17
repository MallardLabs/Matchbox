import AcademyBlacklist from "@/components/AcademyBlacklist"
import AcademyKnobs from "@/components/AcademyKnobs"
import AcademyLeaderboard from "@/components/AcademyLeaderboard"
import { useAcademy } from "@/contexts/AcademyContext"
import { useAcademyActivity } from "@/hooks/useAcademyActivity"
import { useBlacklist } from "@/hooks/useBlacklist"
import {
  WEEK,
  enumerateEpochs,
  epochStartFor,
  snapToThursdayUTC,
} from "@/lib/academy/epoch"
import { type AcademyParams, simulate } from "@/lib/academy/simulate"
import type { MezoActivityItem } from "@/types/mezoActivity"
import { useEffect, useMemo, useState } from "react"
import { parseUnits } from "viem"

const STORAGE_KEY = "mezo-academy-sim-v2"

type StoredState = {
  fromTs: number
  toTs: number
  params: Omit<AcademyParams, "budgetMezoWad"> & { budgetMezo: number }
}

const DEFAULT_BUDGET_MEZO = 4_000_000

function defaultRange(): { fromTs: number; toTs: number } {
  const now = Math.floor(Date.now() / 1000)
  const toTs = snapToThursdayUTC(now, "down")
  const fromTs = toTs - 8 * WEEK
  return { fromTs, toTs }
}

function defaultParams(): AcademyParams {
  return {
    budgetMezoWad: parseUnits(String(DEFAULT_BUDGET_MEZO), 18),
    weightNew: 2,
    weightExt: 1,
    weightBoost: 1,
    participationMultiplier: 2,
    mezoUsd: 0.05,
  }
}

function loadStored(): {
  fromTs: number
  toTs: number
  params: AcademyParams
} {
  if (typeof window === "undefined") {
    return { ...defaultRange(), params: defaultParams() }
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...defaultRange(), params: defaultParams() }
    const parsed = JSON.parse(raw) as StoredState
    return {
      fromTs: parsed.fromTs ?? defaultRange().fromTs,
      toTs: parsed.toTs ?? defaultRange().toTs,
      params: {
        budgetMezoWad: parseUnits(
          String(parsed.params?.budgetMezo ?? DEFAULT_BUDGET_MEZO),
          18,
        ),
        weightNew: parsed.params?.weightNew ?? 2,
        weightExt: parsed.params?.weightExt ?? 1,
        weightBoost: parsed.params?.weightBoost ?? 1,
        participationMultiplier: parsed.params?.participationMultiplier ?? 2,
        mezoUsd: parsed.params?.mezoUsd ?? 0.05,
      },
    }
  } catch {
    return { ...defaultRange(), params: defaultParams() }
  }
}

function tsToDateInput(ts: number): string {
  if (!ts) return ""
  return new Date(ts * 1000).toISOString().slice(0, 10)
}

function dateInputToTs(value: string, dir: "down" | "up"): number {
  if (!value) return 0
  const ms = Date.parse(`${value}T00:00:00Z`)
  if (Number.isNaN(ms)) return 0
  return snapToThursdayUTC(Math.floor(ms / 1000), dir)
}

function fmtDate(ts: number): string {
  if (!ts) return "—"
  return new Date(ts * 1000).toISOString().slice(0, 10)
}

function fmtPct(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "—"
  return `${n.toLocaleString(undefined, { maximumFractionDigits: 1 })}%`
}

type EpochSummary = {
  epoch: number
  startTs: number
  newLocks: number
  extensions: number
  boostVotes: number
  total: number
}

function buildEpochSummaries(
  events: MezoActivityItem[],
  fromTs: number,
  toTs: number,
): EpochSummary[] {
  const epochs = enumerateEpochs(fromTs, toTs)
  const byEpoch = new Map<number, EpochSummary>()
  for (let i = 0; i < epochs.length; i += 1) {
    const startTs = epochs[i] as number
    byEpoch.set(startTs, {
      epoch: i,
      startTs,
      newLocks: 0,
      extensions: 0,
      boostVotes: 0,
      total: 0,
    })
  }
  for (const ev of events) {
    const epochStart = epochStartFor(ev.timestamp)
    const summary = byEpoch.get(epochStart)
    if (!summary) continue
    if (ev.actionType === "lockCreated") summary.newLocks += 1
    else if (ev.actionType === "lockExtended") summary.extensions += 1
    else if (ev.actionType === "boostVote") summary.boostVotes += 1
    summary.total += 1
  }
  return [...byEpoch.values()].sort((a, b) => a.startTs - b.startTs)
}

export default function AcademyPanel() {
  const { enabled, toggle } = useAcademy()
  const [hydrated, setHydrated] = useState(false)
  const [fromTs, setFromTs] = useState<number>(defaultRange().fromTs)
  const [toTs, setToTs] = useState<number>(defaultRange().toTs)
  const [params, setParams] = useState<AcademyParams>(defaultParams())
  const blacklist = useBlacklist()

  useEffect(() => {
    const stored = loadStored()
    setFromTs(stored.fromTs)
    setToTs(stored.toTs)
    setParams(stored.params)
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (!hydrated || typeof window === "undefined") return
    const budgetMezo = Number(params.budgetMezoWad / 10n ** 12n) / 1e6
    const toStore: StoredState = {
      fromTs,
      toTs,
      params: {
        budgetMezo,
        weightNew: params.weightNew,
        weightExt: params.weightExt,
        weightBoost: params.weightBoost,
        participationMultiplier: params.participationMultiplier,
        mezoUsd: params.mezoUsd,
      },
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(toStore))
  }, [hydrated, fromTs, toTs, params])

  const epochs = useMemo(() => enumerateEpochs(fromTs, toTs), [fromTs, toTs])

  const activity = useAcademyActivity({
    fromTimestamp: fromTs,
    toTimestamp: toTs,
    enabled,
  })

  const sim = useMemo(() => {
    if (!activity.data || !blacklist.hydrated) return null
    return simulate(
      {
        lockEvents: activity.data.lockEvents,
        voteEvents: activity.data.voteEvents,
        blacklist: blacklist.merged,
      },
      params,
      fromTs,
      toTs,
    )
  }, [
    activity.data,
    blacklist.hydrated,
    blacklist.merged,
    params,
    fromTs,
    toTs,
  ])

  const epochSummaries = useMemo(() => {
    if (!activity.data) return []
    const combined = [
      ...activity.data.lockEvents,
      ...activity.data.voteEvents.filter(
        (ev) => ev.timestamp >= fromTs && ev.timestamp <= toTs,
      ),
    ]
    return buildEpochSummaries(combined, fromTs, toTs)
  }, [activity.data, fromTs, toTs])

  const peakEpochTotal = useMemo(
    () => epochSummaries.reduce((m, e) => Math.max(m, e.total), 0),
    [epochSummaries],
  )

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
                {sim?.totals.participants ?? 0} actors · press{" "}
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
              droppedCount={sim?.totals.droppedBlacklistEvents ?? 0}
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
              ) : sim ? (
                <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                  <Stat
                    label="Participants"
                    value={String(sim.totals.participants)}
                  />
                  <Stat label="Avg APR" value={fmtPct(sim.totals.avgApr)} />
                  <Stat
                    label="Boost actions"
                    value={sim.totals.boostCount.toLocaleString()}
                  />
                  <Stat
                    label="New / Ext locks"
                    value={`${sim.totals.newLockCount} / ${sim.totals.extensionCount}`}
                  />
                  <Stat
                    label="Full participation ★"
                    value={String(sim.totals.fullParticipationCount)}
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
                    value={String(sim.totals.totalEpochs)}
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
              {sim ? (
                <AcademyLeaderboard
                  rows={sim.rows}
                  budgetMezoWad={params.budgetMezoWad}
                />
              ) : null}
            </section>
          </main>
        </div>
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-[var(--border)] bg-[var(--surface-tertiary)] px-2.5 py-2">
      <div className="text-[10px] uppercase tracking-wider text-[var(--content-secondary)]">
        {label}
      </div>
      <div className="font-mono text-sm text-[var(--content-primary)]">
        {value}
      </div>
    </div>
  )
}

function DataStatus({
  activity,
}: {
  activity: ReturnType<typeof useAcademyActivity>
}) {
  if (activity.isLoading) return null
  if (activity.isError) return null
  const data = activity.data
  if (!data) return null
  const truncated = data.truncatedLockChunks + data.truncatedVoteChunks > 0
  const oldestStr = data.voteOldestTimestamp
    ? new Date(data.voteOldestTimestamp * 1000).toISOString().slice(0, 10)
    : "—"
  return (
    <div
      className={`flex flex-wrap items-center gap-3 rounded border px-3 py-2 text-xs ${
        truncated
          ? "border-amber-500/40 bg-amber-500/5 text-amber-300"
          : "border-[var(--border)] bg-[var(--surface-tertiary)] text-[var(--content-secondary)]"
      }`}
    >
      <span>
        Fetched{" "}
        <strong className="text-[var(--content-primary)]">
          {data.lockEvents.length.toLocaleString()}
        </strong>{" "}
        lock events
      </span>
      <span>
        ·{" "}
        <strong className="text-[var(--content-primary)]">
          {data.voteEvents.length.toLocaleString()}
        </strong>{" "}
        vote events (history back to {oldestStr})
      </span>
      <span>
        · {data.pagesFetched} subgraph quer
        {data.pagesFetched === 1 ? "y" : "ies"}
      </span>
      {truncated ? (
        <span className="font-semibold">
          ⚠ {data.truncatedLockChunks + data.truncatedVoteChunks} chunk
          {data.truncatedLockChunks + data.truncatedVoteChunks === 1 ? "" : "s"}{" "}
          hit page cap — narrow the range or raise maxPagesPerChunk
        </span>
      ) : (
        <span className="text-[var(--content-tertiary)]">
          all chunks complete
        </span>
      )}
    </div>
  )
}

function EpochChart({ rows, peak }: { rows: EpochSummary[]; peak: number }) {
  return (
    <div className="rounded border border-[var(--border)] bg-[var(--surface-tertiary)] p-3">
      <div className="flex items-end gap-1.5 overflow-x-auto pb-2">
        {rows.map((row) => {
          const heightPct = Math.max(2, (row.total / peak) * 100)
          return (
            <div
              key={row.startTs}
              className="flex w-10 flex-col items-center gap-1"
              title={`epoch ${row.epoch + 1} · ${fmtDate(row.startTs)} · ${row.total} events (new ${row.newLocks} · ext ${row.extensions} · boost ${row.boostVotes})`}
            >
              <div
                className="w-full rounded-t bg-gradient-to-t from-[#F7931A] to-[#FFD89A]"
                style={{ height: `${heightPct * 1.2}px` }}
              />
              <div className="font-mono text-[10px] text-[var(--content-secondary)]">
                {row.epoch + 1}
              </div>
              <div className="font-mono text-[10px] text-[var(--content-tertiary)]">
                {row.total}
              </div>
            </div>
          )
        })}
      </div>
      <div className="mt-1 flex flex-wrap gap-3 text-[11px] text-[var(--content-secondary)]">
        <Legend swatch="#F7931A" label="Events per epoch" />
        <span>
          Hover a bar for the new-lock / extension / boost split per epoch
        </span>
      </div>
    </div>
  )
}

function Legend({ swatch, label }: { swatch: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <span
        className="inline-block h-2 w-3 rounded-sm"
        style={{ background: swatch }}
      />
      {label}
    </span>
  )
}
