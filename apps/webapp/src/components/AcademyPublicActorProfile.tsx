import { ClickableAddress } from "@/components/ClickableAddress"
import { TerminalLoader } from "@/components/InitialLoader"
import { getExplorerTransactionUrl } from "@/config/explorer"
import { useNetwork } from "@/contexts/NetworkContext"
import type { ActorProfile, LockDelta } from "@/lib/academy/actorProfile"
import { defaultAcademyParams } from "@/lib/academy/constants"
import {
  type AcademyParams,
  type LeaderboardRow,
  pointsWeightsAt,
} from "@/lib/academy/simulate"
import type { MezoActivityItem } from "@/types/mezoActivity"
import type { Address, Hash } from "viem"

type Props = {
  actor: Address
  profile: ActorProfile | null
  row: LeaderboardRow | null
  isLoading: boolean
  fromTs: number
  toTs: number
  onClose: () => void
}

function fmtPoints(wad: bigint): string {
  const value = Number(wad / 10n ** 12n) / 1e6
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 })
}

function fmtWadCompact(wad: bigint): string {
  const value = Number(wad / 10n ** 12n) / 1e6
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(2)}K`
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 })
}

function fmtDate(ts: number): string {
  if (!ts) return "—"
  return new Date(ts * 1000).toISOString().slice(0, 10)
}

function fmtDateTime(ts: number): string {
  if (!ts) return "—"
  return `${new Date(ts * 1000).toISOString().replace("T", " ").slice(0, 16)}Z`
}

function fmtAddrShort(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

function actionLabel(t: string): string {
  switch (t) {
    case "lockCreated":
      return "Lock created"
    case "lockAmountIncreased":
      return "Amount increased"
    case "lockExtended":
      return "Lock extended"
    case "lockPermanent":
      return "Made permanent"
    case "lockPermanentUnlocked":
      return "Permanent unlocked"
    case "lockMerged":
      return "Merged"
    case "lockWithdrawn":
      return "Withdrawn"
    case "boostVote":
      return "Boost vote"
    case "boostAbstain":
      return "Abstain"
    default:
      return t
  }
}

function actionColor(t: string): string {
  if (t === "boostVote") return "text-[#F7931A]"
  if (t === "boostAbstain") return "text-[var(--content-tertiary)]"
  if (t === "lockExtended" || t === "lockMerged") {
    return "text-[var(--positive)]"
  }
  return "text-[var(--content-primary)]"
}

export default function AcademyPublicActorProfile({
  actor,
  profile,
  row,
  isLoading,
  fromTs,
  toTs,
  onClose,
}: Props) {
  const { chainId } = useNetwork()
  const txUrl = (hash: Hash | undefined): string | null =>
    hash ? getExplorerTransactionUrl(chainId, hash) : null

  const params = defaultAcademyParams()

  return (
    <div className="fixed inset-0 z-[80] flex justify-end bg-black/70 backdrop-blur-sm">
      <button
        type="button"
        aria-label="Close actor profile"
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default bg-transparent"
      />
      <div className="relative z-[1] flex h-full w-full max-w-[760px] flex-col border-l border-[var(--border)] bg-[var(--surface-primary)] shadow-[0_0_60px_rgba(0,0,0,0.6)]">
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--border)] px-5 py-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-[var(--content-secondary)]">
              <span>Actor profile</span>
              <span className="rounded bg-[var(--surface-tertiary)] px-1.5 py-0.5 font-mono">
                {fmtDate(fromTs)} → {fmtDate(toTs)}
              </span>
            </div>
            <div className="mt-1">
              <ClickableAddress
                address={actor}
                label={fmtAddrShort(actor)}
                className="text-sm"
              />
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-[var(--border)] px-3 py-1 text-xs uppercase tracking-wider text-[var(--content-secondary)] hover:text-[#F7931A]"
          >
            Close
          </button>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {isLoading ? (
            <div className="flex h-64 items-center justify-center">
              <TerminalLoader text="fetching activity logs..." />
            </div>
          ) : !profile ? (
            <div className="rounded border border-[var(--border)] bg-[var(--surface-tertiary)] px-3 py-3 text-center text-[11px] text-[var(--content-secondary)]">
              Failed to load profile.
            </div>
          ) : (
            <>
              {/* Counts */}
              <section className="grid grid-cols-2 gap-2 md:grid-cols-4">
                <Stat label="New locks" value={String(profile.newLockCount)} />
                <Stat
                  label="Extensions"
                  value={String(profile.extensionCount)}
                />
                <Stat
                  label="Boost actions"
                  value={String(profile.boostActionCount)}
                />
                <Stat
                  label="Active epochs"
                  value={`${profile.activeEpochs} / ${profile.totalEpochs}`}
                  tone={
                    profile.boostActionCount > 0 && profile.activeEpochs === 0
                      ? "warn"
                      : "default"
                  }
                />
                {row ? (
                  <>
                    <Stat label="Points" value={fmtPoints(row.pointsWad)} />
                    <Stat
                      label="Lock pts"
                      value={fmtPoints(row.lockPointsWad)}
                    />
                    <Stat
                      label="Ext pts"
                      value={fmtPoints(row.extensionPointsWad)}
                    />
                    <Stat
                      label="Vote pts"
                      value={fmtPoints(row.votePointsWad)}
                    />
                    {row.participationBonusWad > 0n ? (
                      <Stat
                        label="Bonus pts ★"
                        value={fmtPoints(row.participationBonusWad)}
                        tone="warn"
                      />
                    ) : null}
                    <Stat
                      label="ve-power"
                      value={fmtWadCompact(row.vePowerWad)}
                    />
                    <Stat
                      label="Full participation"
                      value={row.fullyParticipated ? "★ yes" : "no"}
                    />
                  </>
                ) : (
                  <div className="col-span-2 rounded border border-[var(--border)] bg-[var(--surface-tertiary)] px-2.5 py-2 text-[11px] text-[var(--content-secondary)] md:col-span-4">
                    Not on the leaderboard — this actor earned 0 points in the
                    selected window. The breakdown below explains why.
                  </div>
                )}
              </section>

              {/* Diagnostics */}
              {profile.diagnostics.length > 0 ? (
                <section>
                  <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-[var(--content-primary)]">
                    Why these numbers
                  </h3>
                  <ul className="space-y-1 rounded border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-[11px] leading-snug text-amber-200">
                    {profile.diagnostics.map((d) => (
                      <li key={d}>• {d}</li>
                    ))}
                  </ul>
                </section>
              ) : null}

              {/* Per-epoch breakdown */}
              <section>
                <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-[var(--content-primary)]">
                  Epoch participation
                </h3>
                {profile.epochs.length === 0 ? (
                  <Empty>No epochs in this range.</Empty>
                ) : (
                  <div className="overflow-hidden rounded border border-[var(--border)]">
                    <table className="w-full text-xs">
                      <thead className="bg-[var(--surface-tertiary)] text-[10px] uppercase tracking-wider text-[var(--content-secondary)]">
                        <tr>
                          <th className="px-2 py-1.5 text-left">#</th>
                          <th className="px-2 py-1.5 text-left">Epoch start</th>
                          <th className="px-2 py-1.5 text-right">
                            Active weight
                          </th>
                          <th className="px-2 py-1.5 text-right">Votes</th>
                          <th className="px-2 py-1.5 text-right">New</th>
                          <th className="px-2 py-1.5 text-right">Ext</th>
                          <th className="px-2 py-1.5 text-right">
                            Boosts (in-ep)
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {profile.epochs.map((slice, i) => {
                          const active = slice.activeWeightWad > 0n
                          const mismatch =
                            slice.boostActionsAtEpoch > 0 && !active
                          return (
                            <tr
                              key={slice.epochStart}
                              className={`border-t border-[var(--border)] ${mismatch ? "bg-amber-500/5" : ""}`}
                              title={
                                mismatch
                                  ? "Boosted this epoch but no active weight at epoch end — boost was abstained or cleared before the epoch closed."
                                  : undefined
                              }
                            >
                              <td className="px-2 py-1 text-left font-mono text-[10px] text-[var(--content-tertiary)]">
                                {i + 1}
                              </td>
                              <td className="px-2 py-1 font-mono text-[11px] text-[var(--content-secondary)]">
                                {fmtDate(slice.epochStart)}
                              </td>
                              <td className="px-2 py-1 text-right font-mono">
                                {active ? (
                                  <span className="text-[var(--content-primary)]">
                                    {fmtWadCompact(slice.activeWeightWad)}
                                  </span>
                                ) : (
                                  <span className="text-[var(--content-tertiary)]">
                                    —
                                  </span>
                                )}
                              </td>
                              <td className="px-2 py-1 text-right font-mono text-[11px] text-[var(--content-secondary)]">
                                {slice.activeVotes.length}
                              </td>
                              <td className="px-2 py-1 text-right font-mono text-[11px] text-[var(--content-secondary)]">
                                {slice.newLocksAtEpoch || ""}
                              </td>
                              <td className="px-2 py-1 text-right font-mono text-[11px] text-[var(--content-secondary)]">
                                {slice.extensionsAtEpoch || ""}
                              </td>
                              <td className="px-2 py-1 text-right font-mono text-[11px] text-[var(--content-secondary)]">
                                {slice.boostActionsAtEpoch || ""}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              {/* Lock events in range */}
              <section>
                <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-[var(--content-primary)]">
                  Lock / extension events in range (
                  {profile.inRangeLocks.length})
                </h3>
                {profile.inRangeLocks.length === 0 ? (
                  <Empty>No lock or extension events in this range.</Empty>
                ) : (
                  <EventTable
                    events={profile.inRangeLocks}
                    txUrl={txUrl}
                    lockDeltas={profile.lockDeltaByEventId}
                    params={params}
                  />
                )}
              </section>

              {/* Boost events in range */}
              <section>
                <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-[var(--content-primary)]">
                  Boost actions in range ({profile.inRangeBoosts.length})
                </h3>
                {profile.inRangeBoosts.length === 0 ? (
                  <Empty>No boost or abstain events in this range.</Empty>
                ) : (
                  <EventTable events={profile.inRangeBoosts} txUrl={txUrl} />
                )}
              </section>

              {/* Pre-range sticky votes */}
              {profile.preRangeBoosts.length > 0 ? (
                <section>
                  <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-[var(--content-primary)]">
                    Pre-range votes ({profile.preRangeBoosts.length})
                  </h3>
                  <p className="mb-1 text-[11px] text-[var(--content-tertiary)]">
                    Votes placed before the window. Any still-active when the
                    window opens earn sticky points every epoch they remain
                    active.
                  </p>
                  <EventTable
                    events={profile.preRangeBoosts.slice(-20)}
                    txUrl={txUrl}
                  />
                  {profile.preRangeBoosts.length > 20 ? (
                    <p className="mt-1 text-[10px] text-[var(--content-tertiary)]">
                      showing latest 20 of {profile.preRangeBoosts.length}
                    </p>
                  ) : null}
                </section>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function Stat({
  label,
  value,
  tone = "default",
}: {
  label: string
  value: string
  tone?: "default" | "warn"
}) {
  const border =
    tone === "warn"
      ? "border-amber-500/40 bg-amber-500/5"
      : "border-[var(--border)] bg-[var(--surface-tertiary)]"
  return (
    <div className={`rounded border ${border} px-2.5 py-2`}>
      <div className="text-[10px] uppercase tracking-wider text-[var(--content-secondary)]">
        {label}
      </div>
      <div
        className={`font-mono text-sm ${tone === "warn" ? "text-amber-300" : "text-[var(--content-primary)]"}`}
      >
        {value}
      </div>
    </div>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded border border-[var(--border)] bg-[var(--surface-tertiary)] px-3 py-3 text-center text-[11px] text-[var(--content-secondary)]">
      {children}
    </div>
  )
}

function EventTable({
  events,
  txUrl,
  lockDeltas,
  params,
}: {
  events: MezoActivityItem[]
  txUrl: (hash: Hash | undefined) => string | null
  lockDeltas?: Map<string, LockDelta>
  params?: AcademyParams
}) {
  const showDelta = !!lockDeltas
  return (
    <div className="overflow-hidden rounded border border-[var(--border)]">
      <table className="w-full text-xs">
        <thead className="bg-[var(--surface-tertiary)] text-[10px] uppercase tracking-wider text-[var(--content-secondary)]">
          <tr>
            <th className="px-2 py-1.5 text-left">When</th>
            <th className="px-2 py-1.5 text-left">Action</th>
            <th className="px-2 py-1.5 text-right">Amount / weight</th>
            {showDelta ? (
              <>
                <th
                  className="px-2 py-1.5 text-right"
                  title={
                    "ΔvePower credited for this event. Two pieces, summed:\n" +
                    "  • amount-added: amount × postDuration / 4y\n" +
                    "  • duration-extended: prevAmount × (postDuration − prevDuration) / 4y"
                  }
                >
                  Δ ve
                </th>
                <th
                  className="px-2 py-1.5 text-right"
                  title="Points contributed using the new-lock and extension weights active at the event time."
                >
                  Δ pts
                </th>
              </>
            ) : null}
            <th className="px-2 py-1.5 text-left">Token / gauge</th>
            <th className="px-2 py-1.5 text-right">Tx</th>
          </tr>
        </thead>
        <tbody>
          {events.map((ev) => {
            const url = txUrl(ev.txHash)
            const delta = lockDeltas?.get(ev.id)
            return (
              <tr
                key={ev.id}
                className={`group border-t border-[var(--border)] hover:bg-[var(--surface-tertiary)] ${
                  delta?.flagged ? "bg-amber-500/5" : ""
                }`}
                title={
                  delta?.flagged
                    ? "Δ is approximated — no prior lock state for this token in the fetched events."
                    : undefined
                }
              >
                <td
                  className="px-2 py-1 font-mono text-[11px] text-[var(--content-secondary)]"
                  title={fmtDateTime(ev.timestamp)}
                >
                  {fmtDate(ev.timestamp)}
                </td>
                <td
                  className={`px-2 py-1 text-[11px] ${actionColor(ev.actionType)}`}
                >
                  {actionLabel(ev.actionType)}
                </td>
                <td className="px-2 py-1 text-right font-mono text-[11px] text-[var(--content-primary)]">
                  {renderAmount(ev)}
                </td>
                {showDelta ? (
                  <>
                    <td
                      className="px-2 py-1 text-right font-mono text-[11px] text-[var(--content-primary)]"
                      title={delta ? deltaVeMathTooltip(ev, delta) : undefined}
                    >
                      {delta ? renderDeltaVe(delta) : "—"}
                    </td>
                    <td className="px-2 py-1 text-right font-mono text-[11px] text-[var(--content-secondary)]">
                      {delta && params
                        ? renderDeltaPts(delta, params, ev.timestamp)
                        : "—"}
                    </td>
                  </>
                ) : null}
                <td className="px-2 py-1 text-left font-mono text-[10px] text-[var(--content-secondary)]">
                  {renderTokenGauge(ev)}
                </td>
                <td className="px-2 py-1 text-right font-mono text-[10px]">
                  {url ? (
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[var(--content-secondary)] hover:text-[#F7931A]"
                    >
                      {ev.txHash?.slice(0, 6)}…
                    </a>
                  ) : (
                    <span className="text-[var(--content-tertiary)]">—</span>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function renderDeltaVe(delta: LockDelta): React.ReactNode {
  if (delta.deltaVeWad === 0n) {
    return <span className="text-[var(--content-tertiary)]">0</span>
  }
  return (
    <span>
      {fmtWadCompact(delta.deltaVeWad)}
      {delta.flagged ? (
        <span
          className="ml-1 text-[var(--content-tertiary)]"
          title="Approximated"
        >
          ~
        </span>
      ) : null}
    </span>
  )
}

const MAXTIME_SEC = BigInt(4 * 365 * 86_400)

function deltaVeMathTooltip(
  ev: MezoActivityItem,
  delta: LockDelta,
): string | undefined {
  if (delta.deltaVeWad === 0n) {
    if (
      ev.actionType === "lockPermanent" &&
      ev.prevDuration !== undefined &&
      ev.prevDuration >= MAXTIME_SEC
    ) {
      return "Lock was already at the 4-year cap before this event — flipping to permanent doesn't change the current ve-power, so Δve = 0."
    }
    return undefined
  }
  const fmtVe = (wad: bigint) => fmtWadCompact(wad)
  const fmtAmt = (wad: bigint) => fmtWadCompact(wad)
  const fmtYears = (sec: bigint) =>
    `${(Number(sec) / (365 * 86_400)).toFixed(3)}y`

  if (delta.amountAddedVeWad > 0n && delta.durationExtendedVeWad === 0n) {
    const postDur =
      ev.postIsPermanent && ev.postDuration === undefined
        ? MAXTIME_SEC
        : (ev.postDuration ?? MAXTIME_SEC)
    const cappedDur = postDur > MAXTIME_SEC ? MAXTIME_SEC : postDur
    const amount = ev.amount ?? 0n
    return `Amount-added piece:\n  ${fmtAmt(amount)} MEZO × ${fmtYears(cappedDur)} / 4.000y\n  = ${fmtVe(delta.amountAddedVeWad)} veMEZO`
  }

  if (
    delta.durationExtendedVeWad > 0n &&
    delta.amountAddedVeWad === 0n &&
    delta.extensionPrevAmountWad !== null &&
    delta.extensionPrevDurationSec !== null &&
    delta.extensionPostDurationSec !== null
  ) {
    const prevAmt = delta.extensionPrevAmountWad
    const prevDur = delta.extensionPrevDurationSec
    const postDur = delta.extensionPostDurationSec
    const deltaDur = postDur > prevDur ? postDur - prevDur : 0n
    const label =
      ev.actionType === "lockPermanent"
        ? "Made permanent — credits the remaining decay only:"
        : "Duration-extended piece:"
    return `${label}\n  ${fmtAmt(prevAmt)} MEZO × (${fmtYears(postDur)} − ${fmtYears(prevDur)}) / 4.000y\n  = ${fmtAmt(prevAmt)} MEZO × ${fmtYears(deltaDur)} / 4.000y\n  = ${fmtVe(delta.durationExtendedVeWad)} veMEZO`
  }

  if (ev.actionType === "lockMerged") {
    return `Merge — credits the duration extension only (source MEZO was already locked, so no amount-added piece). Δve sums (source amount × Δduration) and (destination amount × Δduration if the source's end pushes the destination further out).\nTotal = ${fmtVe(delta.deltaVeWad)} veMEZO`
  }

  const parts: string[] = []
  if (delta.amountAddedVeWad > 0n) {
    parts.push(`  amount-added: ${fmtVe(delta.amountAddedVeWad)} veMEZO`)
  }
  if (delta.durationExtendedVeWad > 0n) {
    parts.push(
      `  duration-extended: ${fmtVe(delta.durationExtendedVeWad)} veMEZO`,
    )
  }
  return `Δve breakdown:\n${parts.join("\n")}\nTotal = ${fmtVe(delta.deltaVeWad)} veMEZO`
}

function renderDeltaPts(
  delta: LockDelta,
  params: AcademyParams,
  timestamp: number,
): string {
  if (delta.deltaVeWad === 0n) return "0"
  const weights = pointsWeightsAt(params, timestamp)
  const newScaled = Math.round(weights.weightNew * 1_000_000)
  const extScaled = Math.round(weights.weightExt * 1_000_000)
  const pointsWad =
    (delta.amountAddedVeWad * BigInt(newScaled)) / 1_000_000n +
    (delta.durationExtendedVeWad * BigInt(extScaled)) / 1_000_000n
  return fmtPoints(pointsWad)
}

function fmtDuration(
  seconds: bigint | undefined,
  isPermanent?: boolean,
): string {
  if (isPermanent) return "perm"
  if (seconds === undefined || seconds <= 0n) return "—"
  const days = Number(seconds) / 86_400
  if (days >= 365) return `${(days / 365).toFixed(2)}y`
  if (days >= 30) return `${(days / 30).toFixed(1)}mo`
  return `${days.toFixed(0)}d`
}

function vePowerAt(
  amountWad: bigint,
  durationSec: bigint | undefined,
  isPermanent: boolean | undefined,
): bigint {
  if (amountWad <= 0n) return 0n
  const dur = isPermanent ? MAXTIME_SEC : (durationSec ?? 0n)
  const capped = dur > MAXTIME_SEC ? MAXTIME_SEC : dur
  if (capped <= 0n) return 0n
  return (amountWad * capped) / MAXTIME_SEC
}

function HoverSwap({
  front,
  back,
  title,
}: {
  front: string
  back: string
  title?: string
}) {
  return (
    <span
      className="relative inline-block h-4 overflow-hidden align-middle"
      title={title}
    >
      <span className="block transition-transform duration-150 ease-out group-hover:-translate-y-4">
        <span className="block h-4 leading-4">{front}</span>
        <span className="block h-4 leading-4 text-[var(--content-secondary)]">
          {back}
        </span>
      </span>
    </span>
  )
}

function renderAmount(ev: MezoActivityItem): React.ReactNode {
  if (ev.actionType === "boostVote" || ev.actionType === "boostAbstain") {
    if (ev.weight === undefined) return "—"
    return fmtWadCompact(ev.weight)
  }
  const showDurationJump =
    ev.actionType === "lockExtended" ||
    ev.actionType === "lockPermanent" ||
    ev.actionType === "lockMerged"
  if (showDurationJump && ev.prevDuration !== undefined) {
    const before = fmtDuration(ev.prevDuration, ev.prevIsPermanent)
    const after = fmtDuration(ev.postDuration, ev.postIsPermanent)
    const durationLabel = `${before} → ${after}`
    const veAmount = ev.prevAmount ?? 0n
    if (veAmount > 0n && ev.postDuration !== undefined) {
      const preVe = vePowerAt(veAmount, ev.prevDuration, ev.prevIsPermanent)
      const postVe = vePowerAt(veAmount, ev.postDuration, ev.postIsPermanent)
      const veLabel = `${fmtWadCompact(preVe)} → ${fmtWadCompact(postVe)}`
      return (
        <HoverSwap
          front={durationLabel}
          back={veLabel}
          title={`Duration: ${durationLabel}\nve-power on ${fmtWadCompact(veAmount)} MEZO: ${veLabel}`}
        />
      )
    }
    return durationLabel
  }
  if (
    ev.actionType === "lockCreated" ||
    ev.actionType === "lockAmountIncreased" ||
    ev.actionType === "lockPermanent"
  ) {
    const amt = ev.amount ?? 0n
    return fmtWadCompact(amt)
  }
  if (ev.actionType === "lockExtended") {
    if (ev.duration === undefined) return "—"
    const days = Number(ev.duration) / 86_400
    if (days >= 365) return `${(days / 365).toFixed(2)}y`
    if (days >= 30) return `${(days / 30).toFixed(1)}mo`
    return `${days.toFixed(0)}d`
  }
  if (ev.actionType === "lockMerged") {
    if (ev.mergeSourceTokenId !== undefined) {
      return `from #${ev.mergeSourceTokenId.toString()}`
    }
    return "—"
  }
  return "—"
}

function renderTokenGauge(ev: MezoActivityItem): React.ReactNode {
  const parts: string[] = []
  if (ev.tokenId !== undefined) parts.push(`#${ev.tokenId.toString()}`)
  if (ev.gaugeAddress) {
    parts.push(`→ ${shortAddr(ev.gaugeAddress)}`)
  }
  return parts.length > 0 ? parts.join(" ") : "—"
}

function shortAddr(addr: Address): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}
