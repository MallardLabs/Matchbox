import { ClickableAddress } from "@/components/ClickableAddress"
import type { LeaderboardRow } from "@/lib/academy/simulate"
import { useMemo, useState } from "react"
import type { Address } from "viem"

type SortKey = "points" | "newLocks" | "extensions" | "boosts"

type Props = {
  rows: LeaderboardRow[]
  onSelectActor?: (actor: Address) => void
  walletAddress?: Address | null
}

function fmtPoints(wad: bigint): string {
  const value = Number(wad / 10n ** 12n) / 1e6
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 })
}

function fmtAddr(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

function pointsShare(row: LeaderboardRow, total: bigint): number {
  if (total <= 0n) return 0
  return Number((row.pointsWad * 10_000n) / total) / 100
}

export default function AcademyPublicLeaderboard({
  rows,
  onSelectActor,
  walletAddress,
}: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("points")
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc")
  const [limit, setLimit] = useState(50)
  const [search, setSearch] = useState("")

  const userRowAndRank = useMemo(() => {
    if (!walletAddress) return null
    const lower = walletAddress.toLowerCase()
    const idx = rows.findIndex((r) => r.actor.toLowerCase() === lower)
    if (idx === -1) {
      return {
        row: {
          actor: walletAddress,
          pointsWad: 0n,
          newLockCount: 0,
          extensionCount: 0,
          boostCount: 0,
          activeEpochs: 0,
          fullyParticipated: false,
        } as LeaderboardRow,
        rank: "—",
        isUnranked: true,
      }
    }
    const matchedRow = rows[idx]
    if (!matchedRow) return null
    return {
      row: matchedRow,
      rank: String(idx + 1),
      isUnranked: false,
    }
  }, [walletAddress, rows])

  const total = useMemo(
    () => rows.reduce((acc, r) => acc + r.pointsWad, 0n),
    [rows],
  )

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((r) => r.actor.toLowerCase().includes(q))
  }, [rows, search])

  const sorted = useMemo(() => {
    const cmpBigint = (a: bigint, b: bigint) => (a === b ? 0 : a > b ? 1 : -1)
    const cmpNumber = (a: number, b: number) => a - b
    const arr = [...filteredRows].sort((a, b) => {
      let diff = 0
      switch (sortKey) {
        case "points":
          diff = cmpBigint(a.pointsWad, b.pointsWad)
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
  }, [filteredRows, sortKey, sortDir])

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"))
    } else {
      setSortKey(key)
      setSortDir("desc")
    }
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-tertiary)] px-4 py-8 text-center text-sm text-[var(--content-secondary)] shadow-sm">
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
        className={`flex items-center gap-1 font-semibold transition-colors ${
          active
            ? "text-[#F7931A]"
            : "text-[var(--content-secondary)] hover:text-[var(--content-primary)]"
        }`}
      >
        <span>{children}</span>
        {active ? (
          <span className="text-xs">{sortDir === "desc" ? "▾" : "▴"}</span>
        ) : null}
      </button>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Controls Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-[var(--content-secondary)]">
        <div className="text-sm font-medium">
          {search.trim() ? (
            <span>
              Showing{" "}
              <strong className="text-[var(--content-primary)]">
                {filteredRows.length.toLocaleString()}
              </strong>{" "}
              of {rows.length.toLocaleString()} participants (filtered)
            </span>
          ) : (
            <span>
              <strong className="text-[var(--content-primary)]">
                {rows.length.toLocaleString()}
              </strong>{" "}
              qualifying participants
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search address 0x…"
              spellCheck={false}
              autoComplete="off"
              className="w-64 rounded-lg border border-[var(--border)] bg-[var(--surface-tertiary)] px-3 py-1.5 font-mono text-xs text-[var(--content-primary)] placeholder:text-[var(--content-tertiary)] focus:border-[#F7931A] focus:outline-none transition-colors"
            />
            {search ? (
              <button
                type="button"
                onClick={() => setSearch("")}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-sm text-[var(--content-tertiary)] hover:text-[#F7931A] transition-colors"
              >
                ×
              </button>
            ) : null}
          </div>
          <label className="flex items-center gap-1.5">
            <span>Show</span>
            <select
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
              className="rounded-lg border border-[var(--border)] bg-[var(--surface-tertiary)] px-2 py-1.5 font-mono text-xs text-[var(--content-primary)] focus:border-[#F7931A] focus:outline-none cursor-pointer"
            >
              {/* Explicit option colors so the native dropdown is legible on
                  Windows (otherwise white-on-white in dark mode). */}
              <option
                value={50}
                className="bg-[var(--surface)] text-[var(--content-primary)]"
              >
                50
              </option>
              <option
                value={100}
                className="bg-[var(--surface)] text-[var(--content-primary)]"
              >
                100
              </option>
              <option
                value={250}
                className="bg-[var(--surface)] text-[var(--content-primary)]"
              >
                250
              </option>
              <option
                value={1000}
                className="bg-[var(--surface)] text-[var(--content-primary)]"
              >
                1000
              </option>
            </select>
          </label>
        </div>
      </div>

      {/* Leaderboard Table Container */}
      <div className="overflow-hidden rounded-xl border border-[var(--border)] shadow-sm bg-[var(--surface-secondary)]">
        <div className="max-h-[640px] overflow-auto">
          <table className="w-full border-collapse text-left">
            <thead className="sticky top-0 z-10 bg-[var(--surface-tertiary)] border-b border-[var(--border)] text-xs uppercase tracking-wider text-[var(--content-secondary)]">
              <tr>
                <th className="px-4 py-3 text-left font-semibold w-12">#</th>
                <th className="px-4 py-3 text-left font-semibold">Actor</th>
                <th className="px-4 py-3 text-right">
                  <SortHeader k="points">Points</SortHeader>
                </th>
                <th className="px-4 py-3 text-right font-semibold">Share</th>
                <th className="px-4 py-3 text-right">
                  <SortHeader k="newLocks">New locks</SortHeader>
                </th>
                <th className="px-4 py-3 text-right">
                  <SortHeader k="extensions">Extensions</SortHeader>
                </th>
                <th className="px-4 py-3 text-right">
                  <SortHeader k="boosts">Boosts</SortHeader>
                </th>
                <th
                  className="px-4 py-3 text-right font-semibold"
                  title="Epochs active in-range"
                >
                  Active epochs
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)] text-sm">
              {userRowAndRank && (
                <>
                  <tr
                    className="cursor-pointer bg-brand/10 hover:bg-brand/15 border-l-4 border-brand transition-colors font-semibold"
                    onClick={() => onSelectActor?.(userRowAndRank.row.actor)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        onSelectActor?.(userRowAndRank.row.actor)
                      }
                    }}
                    tabIndex={0}
                  >
                    <td className="px-4 py-3 text-left font-mono text-xs text-brand font-bold">
                      {userRowAndRank.isUnranked
                        ? "—"
                        : `#${userRowAndRank.rank}`}
                    </td>
                    <td
                      className="px-4 py-3"
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(event) => event.stopPropagation()}
                    >
                      <div className="flex items-center gap-1.5">
                        <ClickableAddress
                          address={userRowAndRank.row.actor}
                          label={`${fmtAddr(userRowAndRank.row.actor)} (You)`}
                          className="font-semibold text-brand hover:underline transition-colors text-sm"
                          onLabelClick={onSelectActor}
                          labelTitle="View your profile"
                        />
                        {userRowAndRank.row.fullyParticipated ? (
                          <span
                            className="rounded bg-[#F7931A]/20 px-1.5 py-0.5 text-[9px] font-bold text-[#F7931A]"
                            title="Fully participated: voted in every epoch"
                          >
                            ★
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-brand">
                      {fmtPoints(userRowAndRank.row.pointsWad)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs text-brand">
                      {pointsShare(userRowAndRank.row, total).toFixed(2)}%
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs text-brand">
                      {userRowAndRank.row.newLockCount || "—"}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs text-brand">
                      {userRowAndRank.row.extensionCount || "—"}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs text-brand">
                      {userRowAndRank.row.boostCount || "—"}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs text-brand">
                      {userRowAndRank.row.activeEpochs}
                    </td>
                  </tr>
                  {/* Visual separator row */}
                  <tr className="bg-[var(--surface-tertiary)] h-1.5 pointer-events-none">
                    <td
                      colSpan={8}
                      className="p-0 border-y border-[var(--border)]"
                    />
                  </tr>
                </>
              )}
              {sorted.length === 0 && search.trim() ? (
                <tr>
                  <td
                    colSpan={8}
                    className="px-4 py-8 text-center text-[var(--content-tertiary)] bg-[var(--surface-primary)]"
                  >
                    No actors match{" "}
                    <span className="font-mono text-[var(--content-secondary)] font-semibold">
                      {search}
                    </span>
                    .
                  </td>
                </tr>
              ) : null}
              {sorted.slice(0, limit).map((row, i) => {
                const isMe =
                  walletAddress &&
                  row.actor.toLowerCase() === walletAddress.toLowerCase()
                return (
                  // biome-ignore lint/a11y/useKeyWithClickEvents: click row to select actor
                  <tr
                    key={row.actor}
                    className={`hover:bg-[var(--surface-tertiary)] transition-colors cursor-pointer ${
                      isMe
                        ? "bg-brand/5 border-l-2 border-brand font-semibold"
                        : "bg-[var(--surface-primary)]"
                    }`}
                    onClick={() => onSelectActor?.(row.actor)}
                  >
                    <td className="px-4 py-3 text-left font-mono text-xs text-[var(--content-tertiary)]">
                      {i + 1}
                    </td>
                    {/* biome-ignore lint/a11y/useKeyWithClickEvents: stop propagation of address clicks */}
                    <td
                      className="px-4 py-3"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex items-center gap-1.5">
                        <ClickableAddress
                          address={row.actor}
                          label={fmtAddr(row.actor)}
                          className="font-semibold text-[var(--content-primary)] hover:text-[#F7931A] transition-colors"
                          onLabelClick={onSelectActor}
                          labelTitle="View actor profile"
                        />
                        {row.fullyParticipated ? (
                          <span
                            className="rounded bg-[#F7931A]/15 px-1.5 py-0.5 text-[9px] font-bold text-[#F7931A]"
                            title="Fully participated: voted in every epoch"
                          >
                            ★
                          </span>
                        ) : null}
                        {row.flagged ? (
                          <span
                            className="text-xs text-[var(--content-secondary)]"
                            title="Approximated — missing weight or prior-lock data"
                          >
                            ~
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-semibold text-[var(--content-primary)]">
                      {fmtPoints(row.pointsWad)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs text-[var(--content-secondary)]">
                      {pointsShare(row, total).toFixed(2)}%
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs text-[var(--content-secondary)]">
                      {row.newLockCount || "—"}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs text-[var(--content-secondary)]">
                      {row.extensionCount || "—"}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs text-[var(--content-secondary)]">
                      {row.boostCount || "—"}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs text-[var(--content-secondary)]">
                      {row.activeEpochs}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {sorted.length > limit ? (
          <div className="border-t border-[var(--border)] bg-[var(--surface-tertiary)] px-4 py-2.5 text-center text-xs text-[var(--content-secondary)] font-medium">
            Showing top {limit.toLocaleString()} of{" "}
            {sorted.length.toLocaleString()} participants
          </div>
        ) : null}
      </div>
    </div>
  )
}
