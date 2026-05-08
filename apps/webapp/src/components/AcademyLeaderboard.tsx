import type { LeaderboardRow } from "@/lib/academy/simulate"

type Props = {
  rows: LeaderboardRow[]
}

function fmtMezo(wad: bigint): string {
  const whole = Number(wad / 10n ** 18n)
  const frac = Number((wad % 10n ** 18n) / 10n ** 14n) / 10_000
  const value = whole + frac
  return value.toLocaleString(undefined, {
    maximumFractionDigits: 2,
  })
}

function fmtPoints(wad: bigint): string {
  const value = Number(wad / 10n ** 12n) / 1e6
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 })
}

function fmtAddr(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

export default function AcademyLeaderboard({ rows }: Props) {
  if (rows.length === 0) {
    return (
      <div className="rounded border border-[var(--border)] bg-[var(--surface-tertiary)] px-3 py-6 text-center text-xs text-[var(--content-secondary)]">
        No qualifying activity in this range.
      </div>
    )
  }
  return (
    <div className="overflow-hidden rounded border border-[var(--border)]">
      <table className="w-full text-[11px]">
        <thead className="bg-[var(--surface-tertiary)] text-[10px] uppercase tracking-wider text-[var(--content-secondary)]">
          <tr>
            <th className="px-2 py-1.5 text-left">Actor</th>
            <th className="px-2 py-1.5 text-right">Pts</th>
            <th className="px-2 py-1.5 text-right">Reward</th>
            <th className="px-2 py-1.5 text-right">APR</th>
            <th className="px-2 py-1.5 text-right">N/E/B</th>
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 200).map((row) => (
            <tr
              key={row.actor}
              className="border-t border-[var(--border)] hover:bg-[var(--surface-tertiary)]"
            >
              <td className="px-2 py-1 font-mono text-[10px] text-[var(--content-primary)]">
                {fmtAddr(row.actor)}
                {row.fullyParticipated ? (
                  <span
                    className="ml-1 rounded bg-[#F7931A]/15 px-1 text-[8px] font-bold uppercase text-[#F7931A]"
                    title="Boosted in every epoch"
                  >
                    ★
                  </span>
                ) : null}
                {row.flagged ? (
                  <span
                    className="ml-1 text-[10px] text-[var(--content-secondary)]"
                    title="Approximated — missing weight or prior-lock data"
                  >
                    ~
                  </span>
                ) : null}
              </td>
              <td className="px-2 py-1 text-right font-mono text-[var(--content-primary)]">
                {fmtPoints(row.pointsWad)}
              </td>
              <td className="px-2 py-1 text-right font-mono text-[var(--content-primary)]">
                {fmtMezo(row.rewardMezoWad)}
              </td>
              <td className="px-2 py-1 text-right font-mono text-[var(--content-primary)]">
                {row.apr > 0
                  ? `${row.apr.toLocaleString(undefined, { maximumFractionDigits: 1 })}%`
                  : "—"}
              </td>
              <td className="px-2 py-1 text-right font-mono text-[10px] text-[var(--content-secondary)]">
                {row.newLockCount}/{row.extensionCount}/{row.boostCount}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > 200 ? (
        <div className="border-t border-[var(--border)] bg-[var(--surface-tertiary)] px-2 py-1 text-center text-[10px] text-[var(--content-secondary)]">
          showing top 200 of {rows.length}
        </div>
      ) : null}
    </div>
  )
}
