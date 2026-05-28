import type { useAcademyActivity } from "@/hooks/useAcademyActivity"
import type { EpochSummary } from "@/hooks/useAcademySim"
import { WEEK, enumerateEpochs, snapToThursdayUTC } from "@/lib/academy/epoch"
import type { LeaderboardRow } from "@/lib/academy/simulate"

export function tsToDateInput(ts: number): string {
  if (!ts) return ""
  return new Date(ts * 1000).toISOString().slice(0, 10)
}

export function dateInputToTs(value: string, dir: "down" | "up"): number {
  if (!value) return 0
  const ms = Date.parse(`${value}T00:00:00Z`)
  if (Number.isNaN(ms)) return 0
  return snapToThursdayUTC(Math.floor(ms / 1000), dir)
}

export function fmtDate(ts: number): string {
  if (!ts) return "—"
  return new Date(ts * 1000).toISOString().slice(0, 10)
}

export function fmtPct(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "—"
  return `${n.toLocaleString(undefined, { maximumFractionDigits: 1 })}%`
}

export function presetRange(weeks: number): { fromTs: number; toTs: number } {
  const now = Math.floor(Date.now() / 1000)
  const toTs = snapToThursdayUTC(now, "down")
  const fromTs = toTs - weeks * WEEK
  return { fromTs, toTs }
}

export function epochCountFor(fromTs: number, toTs: number): number {
  return enumerateEpochs(fromTs, toTs).length
}

export function Stat({
  label,
  value,
  tone = "default",
  hint,
}: {
  label: string
  value: string
  tone?: "default" | "warn" | "positive"
  hint?: string
}) {
  const palette = (() => {
    if (tone === "warn") return "border-amber-500/40 bg-amber-500/5"
    if (tone === "positive") return "border-[#F7931A]/30 bg-[#F7931A]/5"
    return "border-[var(--border)] bg-[var(--surface-tertiary)]"
  })()
  const valueColor = (() => {
    if (tone === "warn") return "text-amber-300"
    if (tone === "positive") return "text-[#F7931A]"
    return "text-[var(--content-primary)]"
  })()
  return (
    <div className={`rounded border ${palette} px-2.5 py-2`} title={hint}>
      <div className="text-[10px] uppercase tracking-wider text-[var(--content-secondary)]">
        {label}
      </div>
      <div className={`font-mono text-sm ${valueColor}`}>{value}</div>
    </div>
  )
}

export function DataStatus({
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

export function EpochChart({
  rows,
  peak,
}: { rows: EpochSummary[]; peak: number }) {
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

// Log-scale buckets keep the chart readable when rewards span many orders
// of magnitude (whales vs. small holders). The first bucket holds culled
// actors so the cull/redistribute behaviour is visible at a glance.
const REWARD_BUCKETS: ReadonlyArray<{
  label: string
  min: number // inclusive lower bound in MEZO; -Infinity means "exactly 0"
  max: number // exclusive upper bound; Infinity means "no upper bound"
}> = [
  { label: "0", min: Number.NEGATIVE_INFINITY, max: 0 },
  { label: "< 1", min: 0, max: 1 },
  { label: "1 – 10", min: 1, max: 10 },
  { label: "10 – 100", min: 10, max: 100 },
  { label: "100 – 1K", min: 100, max: 1_000 },
  { label: "1K – 10K", min: 1_000, max: 10_000 },
  { label: "10K – 100K", min: 10_000, max: 100_000 },
  { label: "100K – 1M", min: 100_000, max: 1_000_000 },
  { label: "1M +", min: 1_000_000, max: Number.POSITIVE_INFINITY },
]

function rewardWadToMezo(wad: bigint): number {
  return Number(wad / 10n ** 12n) / 1e6
}

function bucketIndex(mezo: number): number {
  // 0 → first bucket (culled / no reward).
  if (mezo <= 0) return 0
  for (let i = 1; i < REWARD_BUCKETS.length; i += 1) {
    const bucket = REWARD_BUCKETS[i]
    if (!bucket) break
    if (mezo >= bucket.min && mezo < bucket.max) return i
  }
  return REWARD_BUCKETS.length - 1
}

export function RewardHistogram({ rows }: { rows: LeaderboardRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="rounded border border-[var(--border)] bg-[var(--surface-tertiary)] px-3 py-4 text-center text-xs text-[var(--content-secondary)]">
        No rows to bucket.
      </div>
    )
  }

  // Single pass: per-bucket count + MEZO total (for tooltip context).
  const counts: number[] = REWARD_BUCKETS.map(() => 0)
  const mezoTotals: number[] = REWARD_BUCKETS.map(() => 0)
  for (const row of rows) {
    const mezo = rewardWadToMezo(row.rewardMezoWad)
    const idx = bucketIndex(mezo)
    const c = counts[idx]
    const m = mezoTotals[idx]
    if (c !== undefined) counts[idx] = c + 1
    if (m !== undefined) mezoTotals[idx] = m + mezo
  }

  const peak = Math.max(1, ...counts)
  const total = rows.length

  return (
    <div className="rounded border border-[var(--border)] bg-[var(--surface-tertiary)] p-3">
      <div className="flex items-end gap-1.5 overflow-x-auto pb-2">
        {REWARD_BUCKETS.map((bucket, i) => {
          const count = counts[i] ?? 0
          const mezoSum = mezoTotals[i] ?? 0
          const heightPct = count > 0 ? Math.max(2, (count / peak) * 100) : 2
          const pctOfTotal = total > 0 ? (count / total) * 100 : 0
          const isCulled = i === 0
          return (
            <div
              key={bucket.label}
              className="flex w-16 flex-col items-center gap-1"
              title={`${bucket.label} MEZO · ${count} actor${
                count === 1 ? "" : "s"
              } (${pctOfTotal.toFixed(1)}%) · Σ ${mezoSum.toLocaleString(
                undefined,
                { maximumFractionDigits: 2 },
              )} MEZO`}
            >
              <div className="font-mono text-[10px] text-[var(--content-tertiary)]">
                {count}
              </div>
              <div
                className={`w-full rounded-t ${
                  isCulled
                    ? "bg-[var(--content-tertiary)]/40"
                    : "bg-gradient-to-t from-[#F7931A] to-[#FFD89A]"
                }`}
                style={{ height: `${heightPct * 1.2}px` }}
              />
              <div className="text-center font-mono text-[10px] text-[var(--content-secondary)]">
                {bucket.label}
              </div>
            </div>
          )
        })}
      </div>
      <div className="mt-1 flex flex-wrap gap-3 text-[11px] text-[var(--content-secondary)]">
        <Legend swatch="#F7931A" label="Actors per reward bucket" />
        <span>
          Log-scaled bins · {total.toLocaleString()} actor
          {total === 1 ? "" : "s"} total · hover a bin for the MEZO sum
        </span>
      </div>
    </div>
  )
}
