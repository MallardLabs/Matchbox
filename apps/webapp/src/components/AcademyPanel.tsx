import AcademyKnobs from "@/components/AcademyKnobs"
import AcademyLeaderboard from "@/components/AcademyLeaderboard"
import { useAcademy } from "@/contexts/AcademyContext"
import { useAcademyActivity } from "@/hooks/useAcademyActivity"
import { WEEK, enumerateEpochs, snapToThursdayUTC } from "@/lib/academy/epoch"
import { type AcademyParams, simulate } from "@/lib/academy/simulate"
import { useEffect, useMemo, useState } from "react"
import { parseUnits } from "viem"

const STORAGE_KEY = "mezo-academy-sim-v1"

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
    boostCapPerEpoch: 1,
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
        boostCapPerEpoch: parsed.params?.boostCapPerEpoch ?? 1,
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

function fmtPct(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "—"
  return `${n.toLocaleString(undefined, { maximumFractionDigits: 1 })}%`
}

export default function AcademyPanel() {
  const { enabled, toggle } = useAcademy()
  const [hydrated, setHydrated] = useState(false)
  const [fromTs, setFromTs] = useState<number>(defaultRange().fromTs)
  const [toTs, setToTs] = useState<number>(defaultRange().toTs)
  const [params, setParams] = useState<AcademyParams>(defaultParams())

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
        boostCapPerEpoch: params.boostCapPerEpoch,
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
    if (!activity.data) return null
    return simulate(activity.data.events, params, fromTs, toTs)
  }, [activity.data, params, fromTs, toTs])

  if (!enabled) return null

  return (
    <div className="fixed inset-y-0 right-0 z-[70] flex w-[560px] max-w-[100vw] flex-col border-l border-[var(--border)] bg-[var(--surface-primary)] shadow-[0_0_40px_rgba(0,0,0,0.4)]">
      <div className="flex items-center justify-between gap-2 border-b border-[var(--border)] px-4 py-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold tracking-tight text-[var(--content-primary)]">
              Mezo Academy Simulator
            </span>
            <span className="rounded bg-[#F7931A]/15 px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider text-[#F7931A]">
              Sim
            </span>
          </div>
          <p className="mt-0.5 text-[10px] leading-snug text-[var(--content-secondary)]">
            {epochs.length} epoch{epochs.length === 1 ? "" : "s"} ·{" "}
            {sim?.totals.participants ?? 0} actors · press{" "}
            <kbd className="rounded bg-[var(--surface-tertiary)] px-1 font-mono text-[10px]">
              Shift+P
            </kbd>{" "}
            to close
          </p>
        </div>
        <button
          type="button"
          onClick={toggle}
          className="rounded bg-[#F7931A] px-2 py-1 text-[10px] font-semibold text-white hover:bg-[#E8820C]"
        >
          Close
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3">
        <section className="mb-4">
          <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--content-secondary)]">
            Range (Thursdays UTC)
          </h3>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wider text-[var(--content-secondary)]">
                From
              </span>
              <input
                type="date"
                value={tsToDateInput(fromTs)}
                onChange={(e) => {
                  const ts = dateInputToTs(e.target.value, "down")
                  if (ts) setFromTs(ts)
                }}
                className="rounded border border-[var(--border)] bg-[var(--surface-tertiary)] px-2 py-1 text-sm text-[var(--content-primary)] outline-none focus:border-[#F7931A]"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wider text-[var(--content-secondary)]">
                To
              </span>
              <input
                type="date"
                value={tsToDateInput(toTs)}
                onChange={(e) => {
                  const ts = dateInputToTs(e.target.value, "down")
                  if (ts) setToTs(ts)
                }}
                className="rounded border border-[var(--border)] bg-[var(--surface-tertiary)] px-2 py-1 text-sm text-[var(--content-primary)] outline-none focus:border-[#F7931A]"
              />
            </label>
          </div>
        </section>

        <section className="mb-4">
          <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--content-secondary)]">
            Knobs
          </h3>
          <AcademyKnobs params={params} onChange={setParams} />
        </section>

        <section className="mb-4">
          <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--content-secondary)]">
            Totals
          </h3>
          {activity.isLoading ? (
            <div className="rounded border border-[var(--border)] bg-[var(--surface-tertiary)] px-3 py-4 text-center text-xs text-[var(--content-secondary)]">
              Loading activity…
            </div>
          ) : activity.isError ? (
            <div className="rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-400">
              Failed to load activity:{" "}
              {(activity.error as Error)?.message ?? "unknown error"}
            </div>
          ) : sim ? (
            <div className="grid grid-cols-2 gap-2">
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
                label="Full participation"
                value={`${sim.totals.fullParticipationCount}`}
              />
              <Stat
                label="Pages fetched"
                value={`${activity.data?.pagesFetched ?? 0}${activity.data?.truncated ? " (truncated)" : ""}`}
              />
            </div>
          ) : null}
        </section>

        <section>
          <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--content-secondary)]">
            Leaderboard
          </h3>
          {sim ? <AcademyLeaderboard rows={sim.rows} /> : null}
        </section>
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-[var(--border)] bg-[var(--surface-tertiary)] px-2 py-1.5">
      <div className="text-[9px] uppercase tracking-wider text-[var(--content-secondary)]">
        {label}
      </div>
      <div className="font-mono text-sm text-[var(--content-primary)]">
        {value}
      </div>
    </div>
  )
}
