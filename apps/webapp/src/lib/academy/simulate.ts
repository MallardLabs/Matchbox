import { enumerateEpochs, epochStartFor } from "@/lib/academy/epoch"
import { isSnfActor } from "@/lib/academy/snfActors"
import { MEZO_BOOST_POKE_CRON_ADDRESS } from "@/lib/mezoActivity/constants"
import type { MezoActivityItem } from "@/types/mezoActivity"
import { type Address, getAddress, isAddressEqual } from "viem"

// ──────────────────────────────────────────────────────────────────────────
// Academy reward model — single source of truth
// ──────────────────────────────────────────────────────────────────────────
//
// Two reward tracks (gauge owners are intentionally NOT a track — only the
// people doing the locking / extending / voting earn points):
//
//   1. Lock track  (LOCK_CREATED + LOCK_AMOUNT_INCREASED + LOCK_PERMANENT
//                   + LOCK_EXTENDED)
//        one-shot points at the action's timestamp, in the range:
//          new lock                → weightNew × vePower(amount, duration)
//          amount increase         → weightNew × vePower(addedAmount, duration)
//          made permanent          → weightNew × vePower(amount, MAXTIME)
//          extended duration       → weightExt × ΔvePower
//
//   2. Vote track  (BOOST_VOTE + BOOST_ABSTAIN), computed via
//        EPOCH-SNAPSHOT REPLAY:
//          • Sort every Voted / Abstained event from subgraph genesis through
//            the simulator's `toTs`.
//          • Walk forward, maintaining a per-(actor, voterContract, tokenId,
//            gauge) running weight. Voted sets it; Abstained zeros it.
//          • At the START of every epoch in the simulator range, snapshot the
//            current state. For each (actor, gauge) where weight > 0, award
//                points = weight × weightBoost
//          • Sticky votes earn points every epoch they remain active. A user
//            who votes once at t=−6mo and never changes earns 8 weeks of vote
//            points in an 8-week range. A user who abstains mid-range stops
//            earning from the next epoch onward.
//
// Notes:
//
//   ve-power = `amount × min(duration, 4 years) / 4 years`. A 4-year lock of
//   100 MEZO produces 100 ve-power; a 1-year lock produces 25. Permanent locks
//   are treated as the 4-year cap.
//
//   The boost MULTIPLIER (2× / 3× / 4.2×) is a property of the gauge, not the
//   voter. A voter's points are based on THEIR own weight contributed, not on
//   the gauge's aggregate multiplier. This is fair: two voters on the same
//   gauge with different weights earn proportionally different points.
//
//   Full-participation bonus: if an actor had at least one active vote in
//   EVERY epoch of the range, their lock+extension points are multiplied by
//   (participationMultiplier − 1) and added as a bonus.
//
//   The CRON address `0xf8176Df5…` (Tigris maintainer) is hard-filtered out
//   client-side as defense-in-depth. The subgraph already re-attributes
//   poke-driven `Voted` events to the original lock owner via the
//   LockPosition entity; this filter only matters if a vote slips through
//   with a maintainer actor for some reason.
//
//   Reward distribution: proportional to total points.
//        reward(a) = budgetMezo × (a.points / Σ all.points)
//
//   APR annualises from epoch returns. The mezoUsd factor cancels in the
//   ratio; it's a leftover knob for parity with real-world inputs.
//
// ──────────────────────────────────────────────────────────────────────────

const MAXTIME = BigInt(4 * 365 * 86_400)
const WAD = 10n ** 18n

export type AcademyParams = {
  budgetMezoWad: bigint
  weightNew: number
  weightExt: number
  weightBoost: number
  participationMultiplier: number
  boostCapPerEpoch: number
  mezoUsd: number
}

export type LeaderboardRow = {
  actor: Address
  pointsWad: bigint
  lockPointsWad: bigint
  extensionPointsWad: bigint
  votePointsWad: bigint
  rewardMezoWad: bigint
  apr: number
  vePowerWad: bigint
  newLockCount: number
  extensionCount: number
  boostCount: number
  activeEpochs: number
  fullyParticipated: boolean
  flagged: boolean
}

export type SimTotals = {
  pointsWad: bigint
  participants: number
  boostCount: number
  newLockCount: number
  extensionCount: number
  avgApr: number
  totalEpochs: number
  fullParticipationCount: number
  droppedCronEvents: number
  voteSnapshots: number
  activeVoteAggregateWad: bigint
}

export type SimResult = {
  rows: LeaderboardRow[]
  totals: SimTotals
}

export type SimInput = {
  lockEvents: MezoActivityItem[]
  voteEvents: MezoActivityItem[]
}

function vePowerWad(amount: bigint, duration: bigint): bigint {
  if (duration <= 0n || amount <= 0n) return 0n
  const cappedDuration = duration > MAXTIME ? MAXTIME : duration
  return (amount * cappedDuration) / MAXTIME
}

function scaleWad(value: bigint, factor: number): bigint {
  if (!Number.isFinite(factor) || factor <= 0) return 0n
  const scaled = Math.round(factor * 1_000_000)
  return (value * BigInt(scaled)) / 1_000_000n
}

function isCronActor(addr: Address | undefined): boolean {
  if (!addr) return false
  try {
    return isAddressEqual(getAddress(addr), MEZO_BOOST_POKE_CRON_ADDRESS)
  } catch {
    return false
  }
}

type ActorAccumulator = {
  actor: Address
  lockPointsWad: bigint
  extensionPointsWad: bigint
  votePointsWad: bigint
  vePowerWad: bigint
  newLockCount: number
  extensionCount: number
  boostCount: number
  flagged: boolean
  participatedEpochs: Set<number>
  lastLockByToken: Map<string, { amount: bigint; duration: bigint }>
}

function emptyActor(actor: Address): ActorAccumulator {
  return {
    actor,
    lockPointsWad: 0n,
    extensionPointsWad: 0n,
    votePointsWad: 0n,
    vePowerWad: 0n,
    newLockCount: 0,
    extensionCount: 0,
    boostCount: 0,
    flagged: false,
    participatedEpochs: new Set(),
    lastLockByToken: new Map(),
  }
}

type VoteKey = string // `${contract.toLowerCase()}|${tokenId}|${gauge.toLowerCase()}`

type ActiveVote = {
  owner: Address
  weight: bigint
}

function voteKey(item: MezoActivityItem): VoteKey | null {
  if (item.tokenId === undefined) return null
  const target = item.gaugeAddress
  if (!target) return null
  // Use the activity event's contract field for separation (PoolsVoter,
  // BoostVoter, etc. all use distinct addresses). Falls back to the actor
  // if contract isn't surfaced (should never happen with current schema).
  const contract = item.contract ?? "unknown"
  return `${contract}|${item.tokenId.toString()}|${target.toLowerCase()}`
}

export function simulate(
  input: SimInput,
  params: AcademyParams,
  fromTs: number,
  toTs: number,
): SimResult {
  const epochs = enumerateEpochs(fromTs, toTs)
  const totalEpochs = epochs.length

  const accs = new Map<string, ActorAccumulator>()
  const get = (actor: Address) => {
    const key = actor.toLowerCase()
    let acc = accs.get(key)
    if (!acc) {
      acc = emptyActor(actor)
      accs.set(key, acc)
    }
    return acc
  }

  let droppedCronEvents = 0

  // ───────────────────────────────
  // Lock / extension events (one-shot, IN RANGE)
  // ───────────────────────────────
  const sortedLocks = [...input.lockEvents].sort(
    (a, b) => a.timestamp - b.timestamp,
  )
  for (const ev of sortedLocks) {
    if (!ev.actorAddress) continue
    if (isCronActor(ev.actorAddress)) {
      droppedCronEvents += 1
      continue
    }
    if (ev.timestamp < fromTs || ev.timestamp > toTs) continue
    const acc = get(ev.actorAddress)
    const actionType = ev.actionType

    if (
      actionType === "lockCreated" ||
      actionType === "lockAmountIncreased" ||
      actionType === "lockPermanent"
    ) {
      if (isSnfActor(ev.actorAddress)) continue
      const ve = vePowerWad(ev.amount ?? 0n, ev.duration ?? 0n)
      const pts = scaleWad(ve, params.weightNew)
      acc.lockPointsWad += pts
      acc.vePowerWad += ve
      acc.newLockCount += 1
      if (ev.tokenId !== undefined) {
        acc.lastLockByToken.set(ev.tokenId.toString(), {
          amount: ev.amount ?? 0n,
          duration: ev.duration ?? 0n,
        })
      }
    } else if (actionType === "lockExtended") {
      const tokenKey = ev.tokenId?.toString()
      const prev = tokenKey ? acc.lastLockByToken.get(tokenKey) : undefined
      const newAmount = ev.amount ?? prev?.amount ?? 0n
      const newDuration = ev.duration ?? 0n
      let deltaWad: bigint
      if (prev) {
        const prevPower = vePowerWad(prev.amount, prev.duration)
        const newPower = vePowerWad(newAmount, newDuration)
        deltaWad = newPower > prevPower ? newPower - prevPower : 0n
      } else {
        deltaWad = vePowerWad(newAmount, newDuration) / 4n
        acc.flagged = true
      }
      const pts = scaleWad(deltaWad, params.weightExt)
      acc.extensionPointsWad += pts
      acc.vePowerWad += deltaWad
      acc.extensionCount += 1
      if (tokenKey) {
        acc.lastLockByToken.set(tokenKey, {
          amount: newAmount,
          duration: newDuration,
        })
      }
    }
  }

  // ───────────────────────────────
  // Vote events (EPOCH-SNAPSHOT REPLAY)
  // ───────────────────────────────
  const sortedVotes = [...input.voteEvents].sort(
    (a, b) => a.timestamp - b.timestamp,
  )

  // Build per-epoch snapshots by walking forward through every Voted/Abstained
  // event ever, taking a snapshot each time we cross an epoch boundary in the
  // simulator range.
  const activeVotes = new Map<VoteKey, ActiveVote>()
  // Index into epochs[]; we snapshot when we reach each epoch start.
  let nextEpochIdx = 0
  // For each epoch we'll store the per-actor active vote weight totals (so we
  // can credit each owner once per epoch even if they have many active votes).
  // We accumulate directly into the actor's votePoints during the snapshot.

  const snapshotEpoch = (epochStart: number) => {
    if (activeVotes.size === 0) return
    for (const vote of activeVotes.values()) {
      if (vote.weight <= 0n) continue
      const acc = get(vote.owner)
      acc.votePointsWad += scaleWad(vote.weight, params.weightBoost)
      acc.participatedEpochs.add(epochStart)
    }
  }

  for (const ev of sortedVotes) {
    if (isCronActor(ev.actorAddress)) {
      droppedCronEvents += 1
      continue
    }
    // PoolsVoter votes (matchboxGaugeBoost) allocate emissions to Mezo Earn
    // pool/vault gauges — they do not boost a specific BTC lock and should
    // not count toward the Academy boost track.
    if (ev.boostContext === "matchboxGaugeBoost") continue
    // Snapshot any epoch boundaries we've passed (or just crossed).
    while (
      nextEpochIdx < epochs.length &&
      (epochs[nextEpochIdx] as number) <= ev.timestamp
    ) {
      snapshotEpoch(epochs[nextEpochIdx] as number)
      nextEpochIdx += 1
    }

    const key = voteKey(ev)
    if (!key || !ev.actorAddress) continue
    const actor = ev.actorAddress

    if (ev.actionType === "boostVote") {
      const w = ev.weight ?? 0n
      if (w > 0n) {
        activeVotes.set(key, { owner: actor, weight: w })
      } else {
        activeVotes.delete(key)
      }
      // Track boost-event count and gauge participation for the actor
      // (independent of epoch snapshot — useful for the leaderboard).
      const acc = get(actor)
      acc.boostCount += 1
    } else if (ev.actionType === "boostAbstain") {
      activeVotes.delete(key)
    }
  }
  // Snapshot any remaining epochs after the last event.
  while (nextEpochIdx < epochs.length) {
    snapshotEpoch(epochs[nextEpochIdx] as number)
    nextEpochIdx += 1
  }

  const allActors = [...accs.values()]

  // Full-participation bonus on lock + extension points only.
  for (const acc of allActors) {
    if (
      totalEpochs > 0 &&
      acc.participatedEpochs.size >= totalEpochs &&
      params.participationMultiplier > 1
    ) {
      const eligible = acc.lockPointsWad + acc.extensionPointsWad
      const bonus = scaleWad(eligible, params.participationMultiplier - 1)
      acc.lockPointsWad += bonus
    }
  }

  let totalPoints = 0n
  let activeVoteAggregateWad = 0n
  for (const acc of allActors) {
    totalPoints +=
      acc.lockPointsWad + acc.extensionPointsWad + acc.votePointsWad
  }
  for (const vote of activeVotes.values()) {
    if (vote.weight > 0n) activeVoteAggregateWad += vote.weight
  }

  const rows: LeaderboardRow[] = allActors
    .map((acc) => {
      const pointsWad =
        acc.lockPointsWad + acc.extensionPointsWad + acc.votePointsWad
      return { acc, pointsWad }
    })
    .filter((entry) => entry.pointsWad > 0n)
    .map(({ acc, pointsWad }) => {
      const rewardMezoWad =
        totalPoints > 0n ? (params.budgetMezoWad * pointsWad) / totalPoints : 0n

      const fullyParticipated =
        totalEpochs > 0 && acc.participatedEpochs.size >= totalEpochs

      const apr = computeAprPct({
        rewardMezoWad,
        vePowerWad: acc.vePowerWad,
        mezoUsd: params.mezoUsd,
        totalEpochs,
      })

      return {
        actor: acc.actor,
        pointsWad,
        lockPointsWad: acc.lockPointsWad,
        extensionPointsWad: acc.extensionPointsWad,
        votePointsWad: acc.votePointsWad,
        rewardMezoWad,
        apr,
        vePowerWad: acc.vePowerWad,
        newLockCount: acc.newLockCount,
        extensionCount: acc.extensionCount,
        boostCount: acc.boostCount,
        activeEpochs: acc.participatedEpochs.size,
        fullyParticipated,
        flagged: acc.flagged,
      }
    })
    .sort((a, b) => (b.pointsWad > a.pointsWad ? 1 : -1))

  const aprValues = rows.filter((r) => Number.isFinite(r.apr) && r.apr > 0)
  const avgApr =
    aprValues.length > 0
      ? aprValues.reduce((s, r) => s + r.apr, 0) / aprValues.length
      : 0

  const totals: SimTotals = {
    pointsWad: totalPoints,
    participants: rows.length,
    boostCount: rows.reduce((s, r) => s + r.boostCount, 0),
    newLockCount: rows.reduce((s, r) => s + r.newLockCount, 0),
    extensionCount: rows.reduce((s, r) => s + r.extensionCount, 0),
    avgApr,
    totalEpochs,
    fullParticipationCount: rows.filter((r) => r.fullyParticipated).length,
    droppedCronEvents,
    voteSnapshots: epochs.length,
    activeVoteAggregateWad,
  }

  return { rows, totals }
}

export function computeAprPct(args: {
  rewardMezoWad: bigint
  vePowerWad: bigint
  mezoUsd: number
  totalEpochs: number
}): number {
  const { rewardMezoWad, vePowerWad, mezoUsd, totalEpochs } = args
  if (vePowerWad <= 0n || mezoUsd <= 0 || totalEpochs <= 0) return 0
  const rewardMezo = Number(rewardMezoWad) / 1e18
  const vePower = Number(vePowerWad) / 1e18
  if (vePower <= 0) return 0
  const annualisationFactor = 52 / totalEpochs
  const rewardUsd = rewardMezo * mezoUsd
  const stakeUsd = vePower * mezoUsd
  if (stakeUsd <= 0) return 0
  return (rewardUsd / stakeUsd) * annualisationFactor * 100
}

export { WAD, epochStartFor }
