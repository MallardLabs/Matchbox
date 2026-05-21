import { WEEK, enumerateEpochs, epochStartFor } from "@/lib/academy/epoch"
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
//          • At the END of every epoch in the simulator range, snapshot the
//            current state — i.e. after all Voted/Abstained events inside that
//            epoch have been applied. For each (actor, gauge) where weight > 0
//            at that moment, award
//                points = weight × weightBoost
//          • This means a vote placed mid-epoch earns points for that epoch
//            (so long as it's still active at epoch end). A user who boosts
//            then abstains within the same epoch earns 0 for that epoch —
//            they had no active position when the epoch closed.
//          • Sticky votes earn points every epoch they remain active. A user
//            who votes once at t=−6mo and never changes earns 8 weeks of vote
//            points in an 8-week range.
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
  aprBasisWad: bigint
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
  droppedBlacklistEvents: number
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
  blacklist?: ReadonlySet<Address>
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

function isBlacklisted(
  addr: Address | undefined,
  blacklist: ReadonlySet<Address> | undefined,
): boolean {
  if (!addr || !blacklist || blacklist.size === 0) return false
  try {
    return blacklist.has(getAddress(addr))
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
  voteWeightEpochSumWad: bigint
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
    voteWeightEpochSumWad: 0n,
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

function compareActivityOrder(
  a: MezoActivityItem,
  b: MezoActivityItem,
): number {
  if (a.timestamp !== b.timestamp) return a.timestamp - b.timestamp
  if (a.blockNumber !== b.blockNumber)
    return a.blockNumber > b.blockNumber ? 1 : -1
  const aIdx = a.logIndex ?? -1
  const bIdx = b.logIndex ?? -1
  return aIdx - bIdx
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
  let droppedBlacklistEvents = 0
  const blacklist = input.blacklist

  // ───────────────────────────────
  // Lock / extension events (one-shot, IN RANGE)
  // ───────────────────────────────
  const sortedLocks = [...input.lockEvents].sort(compareActivityOrder)
  for (const ev of sortedLocks) {
    if (!ev.actorAddress) continue
    if (isCronActor(ev.actorAddress)) {
      droppedCronEvents += 1
      continue
    }
    if (isBlacklisted(ev.actorAddress, blacklist)) {
      droppedBlacklistEvents += 1
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
  const sortedVotes = [...input.voteEvents].sort(compareActivityOrder)

  // Build per-epoch snapshots by walking forward through every Voted/Abstained
  // event ever, taking a snapshot each time we cross an epoch boundary in the
  // simulator range.
  const activeVotes = new Map<VoteKey, ActiveVote>()
  // Index into epochs[]; we snapshot when we cross each epoch's END boundary,
  // so the snapshot reflects the actor's state after every event inside that
  // epoch has been applied.
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
      acc.voteWeightEpochSumWad += vote.weight
      acc.participatedEpochs.add(epochStart)
    }
  }

  for (const ev of sortedVotes) {
    if (isCronActor(ev.actorAddress)) {
      droppedCronEvents += 1
      continue
    }
    if (isBlacklisted(ev.actorAddress, blacklist)) {
      droppedBlacklistEvents += 1
      continue
    }
    // Only count votes that actually boost a BTC lock — i.e. BoostVoter
    // events on veBTC pair gauges (mezoVeBtcPairBoost). PoolsVoter votes
    // (matchboxGaugeBoost) allocate emissions to Mezo Earn pool/vault gauges
    // and ThirdPartyVoter / ValidatorsVoter votes (unknown) target gauges
    // that don't carry a boostable veBTC. None of them belong on the
    // Academy boost track.
    if (ev.boostContext !== "mezoVeBtcPairBoost") continue
    // Snapshot any epoch we've already moved PAST — i.e. epochs whose END
    // (epochStart + WEEK) is at or before this event's timestamp. All events
    // inside those epochs have been applied to `activeVotes` already.
    while (
      nextEpochIdx < epochs.length &&
      (epochs[nextEpochIdx] as number) + WEEK <= ev.timestamp
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
      // Only count boost ACTIONS that fall inside the simulator range. The
      // sortedVotes list spans genesis → toTs so we can replay sticky-vote
      // state, but the "boost actions" stat the user reads in the totals box
      // is meant to describe activity in the selected range.
      if (ev.timestamp >= fromTs && ev.timestamp <= toTs) {
        const acc = get(actor)
        acc.boostCount += 1
      }
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

      const avgActiveVoteWeightWad =
        totalEpochs > 0 ? acc.voteWeightEpochSumWad / BigInt(totalEpochs) : 0n
      const aprBasisWad =
        acc.vePowerWad > 0n ? acc.vePowerWad : avgActiveVoteWeightWad

      const apr = computeAprPct({
        rewardMezoWad,
        vePowerWad: aprBasisWad,
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
        aprBasisWad,
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

  // Count totals across ALL actors that had in-range activity, not just rows
  // that earned points. An actor who voted mid-range (after the epoch start
  // snapshot) earns no boost points and gets filtered out of `rows`, but their
  // boost ACTION still happened and the user expects to see it reflected.
  let totalBoostCount = 0
  let totalNewLockCount = 0
  let totalExtensionCount = 0
  for (const acc of allActors) {
    totalBoostCount += acc.boostCount
    totalNewLockCount += acc.newLockCount
    totalExtensionCount += acc.extensionCount
  }

  const totals: SimTotals = {
    pointsWad: totalPoints,
    participants: rows.length,
    boostCount: totalBoostCount,
    newLockCount: totalNewLockCount,
    extensionCount: totalExtensionCount,
    avgApr,
    totalEpochs,
    fullParticipationCount: rows.filter((r) => r.fullyParticipated).length,
    droppedCronEvents,
    droppedBlacklistEvents,
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
