import type { LeaderboardRow } from "@/lib/academy/simulate"
import { useMemo, useState } from "react"

type SortKey =
  | "points"
  | "reward"
  | "apr"
  | "newLocks"
  | "extensions"
  | "boosts"
  | "vePower"

type Props = {
  rows: LeaderboardRow[]
  budgetMezoWad: bigint
}

function fmtMezo(wad: bigint): string {
  const whole = Number(wad / 10n ** 18n)
  const frac = Number((wad % 10n ** 18n) / 10n ** 14n) / 10_000
  const value = whole + frac
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 })
}

function fmtPoints(wad: bigint): string {
  const value = Number(wad / 10n ** 12n) / 1e6
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 })
}

function fmtVePower(wad: bigint): string {
  const value = Number(wad / 10n ** 12n) / 1e6
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(2)}K`
  return value.toLocaleString(undefined, { maximumFractionDigits: 1 })
}

function fmtAddr(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

function pointsShare(row: LeaderboardRow, total: bigint): number {
  if (total <= 0n) return 0
  return Number((row.pointsWad * 10_000n) / total) / 100
}

function csvEscape(value: string | number | boolean): string {
  const raw = String(value)
  return `"${raw.replaceAll('"', '""')}"`
}

function downloadCsv(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

export default function AcademyLeaderboard({ rows, budgetMezoWad }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("points")
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc")
  const [limit, setLimit] = useState(50)

  const total = useMemo(
    () => rows.reduce((acc, r) => acc + r.pointsWad, 0n),
    [rows],
  )

  const sorted = useMemo(() => {
    const cmpBigint = (a: bigint, b: bigint) => (a === b ? 0 : a > b ? 1 : -1)
    const cmpNumber = (a: number, b: number) => a - b
    const arr = [...rows].sort((a, b) => {
      let diff = 0
      switch (sortKey) {
        case "points":
          diff = cmpBigint(a.pointsWad, b.pointsWad)
          break
        case "reward":
          diff = cmpBigint(a.rewardMezoWad, b.rewardMezoWad)
          break
        case "apr":
          diff = cmpNumber(a.apr, b.apr)
          break
        case "vePower":
          diff = cmpBigint(a.vePowerWad, b.vePowerWad)
          break
        case "newLocks":
          diff = cmpNumber(a.newLockCount, b.newLockCount)
          break
        case "extensions":
          diff = cmpNumber(a.extensionCount, b.extensionCount)
          break
        case "boosts":
          diff = cmpNumber(a.boostCount, b.boostCount)
          break
      }
      return sortDir === "desc" ? -diff : diff
    })
    return arr
  }, [rows, sortKey, sortDir])

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"))
    } else {
      setSortKey(key)
      setSortDir("desc")
    }
  }

  const exportCsv = () => {
    const header = [
      "rank",
      "actor",
      "pointsWad",
      "pointsShare%",
      "lockPointsWad",
      "extensionPointsWad",
      "votePointsWad",
      "rewardMezo",
      "aprPct",
      "vePowerWad",
      "newLocks",
      "extensions",
      "boosts",
      "activeEpochs",
      "fullyParticipated",
      "flagged",
    ]
    const body = sorted.map((row, i) => [
      i + 1,
      row.actor,
      row.pointsWad.toString(),
      pointsShare(row, total).toFixed(4),
      row.lockPointsWad.toString(),
      row.extensionPointsWad.toString(),
      row.votePointsWad.toString(),
      fmtMezo(row.rewardMezoWad),
      row.apr.toFixed(2),
      row.vePowerWad.toString(),
      row.newLockCount,
      row.extensionCount,
      row.boostCount,
      row.activeEpochs,
      row.fullyParticipated,
      row.flagged,
    ])
    const csv = [
      header.map(csvEscape).join(","),
      ...body.map((r) => r.map(csvEscape).join(",")),
    ].join("\n")
    downloadCsv(`mezo-academy-${Date.now()}.csv`, csv)
  }

  if (rows.length === 0) {
    return (
      <div className="rounded border border-[var(--border)] bg-[var(--surface-tertiary)] px-3 py-6 text-center text-xs text-[var(--content-secondary)]">
        No qualifying activity in this range.
      </div>
    )
  }

  const SortHeader = ({
    k,
    children,
  }: { k: SortKey; children: React.ReactNode }) => {
    const active = sortKey === k
    return (
      <button
        type="button"
        onClick={() => toggleSort(k)}
        className={`flex items-center gap-1 ${active ? "text-[#F7931A]" : "text-[var(--content-secondary)] hover:text-[var(--content-primary)]"}`}
      >
        <span>{children}</span>
        {active ? <span>{sortDir === "desc" ? "▾" : "▴"}</span> : null}
      </button>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-[var(--content-secondary)]">
        <span>
          {rows.length.toLocaleString()} actor{rows.length === 1 ? "" : "s"} · Σ
          budget {fmtMezo(budgetMezoWad)} MEZO
        </span>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1">
            Show
            <select
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
              className="rounded border border-[var(--border)] bg-[var(--surface-tertiary)] px-1.5 py-0.5 font-mono text-[11px] text-[var(--content-primary)]"
            >
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={250}>250</option>
              <option value={1000}>1000</option>
            </select>
          </label>
          <button
            type="button"
            onClick={exportCsv}
            className="rounded border border-[var(--border)] px-2 py-0.5 font-mono text-[11px] uppercase tracking-wider text-[var(--content-secondary)] hover:text-[#F7931A]"
          >
            Export CSV
          </button>
        </div>
      </div>
      <div className="overflow-hidden rounded border border-[var(--border)]">
        <div className="max-h-[480px] overflow-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-[var(--surface-tertiary)] text-[11px] uppercase tracking-wider">
              <tr>
                <th className="px-2 py-1.5 text-left">#</th>
                <th className="px-2 py-1.5 text-left">Actor</th>
                <th className="px-2 py-1.5 text-right">
                  <SortHeader k="points">Points</SortHeader>
                </th>
                <th className="px-2 py-1.5 text-right text-[var(--content-secondary)]">
                  Share
                </th>
                <th className="px-2 py-1.5 text-right">
                  <SortHeader k="reward">Reward</SortHeader>
                </th>
                <th className="px-2 py-1.5 text-right">
                  <SortHeader k="apr">APR</SortHeader>
                </th>
                <th className="px-2 py-1.5 text-right">
                  <SortHeader k="vePower">ve-power</SortHeader>
                </th>
                <th className="px-2 py-1.5 text-right">
                  <SortHeader k="newLocks">New</SortHeader>
                </th>
                <th className="px-2 py-1.5 text-right">
                  <SortHeader k="extensions">Ext</SortHeader>
                </th>
                <th className="px-2 py-1.5 text-right">
                  <SortHeader k="boosts">Boost</SortHeader>
                </th>
                <th
                  className="px-2 py-1.5 text-right text-[var(--content-secondary)]"
                  title="Number of epochs in the range where this actor had at least one active vote"
                >
                  Active ep.
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.slice(0, limit).map((row, i) => (
                <tr
                  key={row.actor}
                  className="border-t border-[var(--border)] hover:bg-[var(--surface-tertiary)]"
                >
                  <td className="px-2 py-1 text-left text-[11px] text-[var(--content-tertiary)]">
                    {i + 1}
                  </td>
                  <td className="px-2 py-1 font-mono text-[11px] text-[var(--content-primary)]">
                    {fmtAddr(row.actor)}
                    {row.fullyParticipated ? (
                      <span
                        className="ml-1 rounded bg-[#F7931A]/15 px-1 text-[8px] font-bold uppercase text-[#F7931A]"
                        title="Voted in every epoch of the range"
                      >
                        ★
                      </span>
                    ) : null}
                    {row.flagged ? (
                      <span
                        className="ml-1 text-[11px] text-[var(--content-secondary)]"
                        title="Approximated — missing weight or prior-lock data"
                      >
                        ~
                      </span>
                    ) : null}
                  </td>
                  <td className="px-2 py-1 text-right font-mono text-[var(--content-primary)]">
                    {fmtPoints(row.pointsWad)}
                  </td>
                  <td className="px-2 py-1 text-right font-mono text-[11px] text-[var(--content-secondary)]">
                    {pointsShare(row, total).toFixed(2)}%
                  </td>
                  <td className="px-2 py-1 text-right font-mono text-[var(--content-primary)]">
                    {fmtMezo(row.rewardMezoWad)}
                  </td>
                  <td className="px-2 py-1 text-right font-mono text-[var(--content-primary)]">
                    {row.apr > 0
                      ? `${row.apr.toLocaleString(undefined, { maximumFractionDigits: 1 })}%`
                      : "—"}
                  </td>
                  <td className="px-2 py-1 text-right font-mono text-[11px] text-[var(--content-secondary)]">
                    {fmtVePower(row.vePowerWad)}
                  </td>
                  <td className="px-2 py-1 text-right font-mono text-[11px] text-[var(--content-secondary)]">
                    {row.newLockCount}
                  </td>
                  <td className="px-2 py-1 text-right font-mono text-[11px] text-[var(--content-secondary)]">
                    {row.extensionCount}
                  </td>
                  <td className="px-2 py-1 text-right font-mono text-[11px] text-[var(--content-secondary)]">
                    {row.boostCount}
                  </td>
                  <td className="px-2 py-1 text-right font-mono text-[11px] text-[var(--content-secondary)]">
                    {row.activeEpochs}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {sorted.length > limit ? (
          <div className="border-t border-[var(--border)] bg-[var(--surface-tertiary)] px-2 py-1 text-center text-[11px] text-[var(--content-secondary)]">
            showing top {limit.toLocaleString()} of{" "}
            {sorted.length.toLocaleString()}
          </div>
        ) : null}
      </div>
    </div>
  )
}
