import {
  WEEK,
  enumerateEpochsForWindow,
  epochStartFor,
} from "@/lib/academy/epoch"
import {
  type LockSnapshot,
  computeLockTrackDelta,
  snapshotAfter,
} from "@/lib/academy/lockDelta"
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
//                   + LOCK_EXTENDED + LOCK_MERGED)
//        one-shot points at the action's timestamp, in the range. Every
//        event is decomposed into two pieces by computeLockTrackDelta:
//          amount-added piece      → weightNew × vePower(Δamount, postDuration)
//          duration-extended piece → weightExt × Δ(vePower) on prevAmount
//
//        Per action this comes out to:
//          new lock                → weightNew × vePower(amount, postDur)
//          amount increase         → weightNew × vePower(addedAmount, postDur)
//          extended duration       → weightExt × prevAmount × (postDur − prevDur) / MAXTIME
//          made permanent          → weightExt × prevAmount × (MAXTIME − prevDur) / MAXTIME
//                                      (NOT the full vePower(amount, MAXTIME) — a
//                                       lock already at ~4y earns ~0 from this event;
//                                       the user is only locking in the remaining decay)
//          merged                  → weightExt × extension on source + dest portions
//                                      (no amount-added piece — source MEZO was
//                                       already locked, the user is not adding capital)
//
//   2. Vote track  (BOOST_VOTE + BOOST_ABSTAIN + LOCK_TRANSFERRED), computed
//        via EPOCH-SNAPSHOT REPLAY:
//          • Sort every Voted / Abstained / Transfer event from subgraph
//            genesis through the simulator's `toTs`.
//          • Walk forward, maintaining a per-(actor, voterContract, tokenId,
//            gauge) running weight. Manual Voted sets it; Abstained zeros it.
//          • At the END of every epoch in the simulator range, snapshot the
//            current state — i.e. after all events inside that epoch have
//            been applied. For each (actor, gauge) where weight > 0 at that
//            moment, award
//                points = weight × weightBoost
//          • This means a vote placed mid-epoch earns points for that epoch
//            (so long as it's still active at epoch end). A user who boosts
//            then abstains within the same epoch earns 0 for that epoch —
//            they had no active position when the epoch closed.
//          • Sticky votes earn points every epoch they remain active. A user
//            who votes once at t=−6mo and never changes earns 8 weeks of vote
//            points in an 8-week range.
//          • boostCount on the leaderboard is the number of distinct
//            (tokenId, epoch) pairs the actor boosted in-range. One NFT
//            voting on 100 gauges still counts as 1 for that epoch — points
//            already collapse all of an NFT's gauge weights to its vePower,
//            so the count should too.
//          • POKE GATE: when the maintainer cron calls pokeBoost(s) the
//            BoostVoter re-emits Voted for every active gauge on the NFT.
//            We DETECT these by `tx.from == MEZO_BOOST_POKE_CRON_ADDRESS`
//            and treat them as no-ops: they do not re-establish a sticky
//            vote and do not bump boostCount. Only a manual Voted from the
//            NFT owner mutates activeVotes.
//          • TRANSFER DRAIN: a LockPosition transfer marks the tokenId as
//            "pending-cleared" but does not mutate activeVotes immediately.
//            The clearing happens AFTER the next epoch snapshot — so the
//            seller still earns for the epoch their transfer fell inside
//            (they were the active voter while the epoch's events were
//            applied), but from the next epoch onwards the vote is gone
//            and the new owner earns nothing on the boost track until they
//            manually re-vote themselves. Combined with the poke gate, this
//            means secondary-market buyers cannot inherit sticky-vote
//            points from the seller without an explicit on-chain action.
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
//   EVERY epoch of the range, their boost points are multiplied by
//   (participationMultiplier − 1) and added as a bonus. New-lock and
//   extension points are unaffected. The bonus is stored in its own
//   `participationBonusWad` bucket so the UI never confuses it for real
//   activity on another track.
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

const WAD = 10n ** 18n

export type PointsWeightSegment = {
  id: string
  fromTs: number
  toTs: number
  weightNew: number
  weightExt: number
  weightBoost: number
}

export type AcademyParams = {
  budgetMezoWad: bigint
  weightNew: number
  weightExt: number
  weightBoost: number
  // Time-boxed overrides are evaluated in array order. When segments overlap,
  // the last matching segment wins. Ranges are half-open: [fromTs, toTs).
  pointsSegments: PointsWeightSegment[]
  participationMultiplier: number
  mezoUsd: number
  // Reward cutoff: actors whose initial pro-rata reward is strictly below
  // this MEZO amount are culled (reward → 0, apr → 0) and the forfeited
  // pool is redistributed proportionally (by points) to actors at or above
  // the floor. Set to 0n to disable.
  rewardFloorMezoWad: bigint
}

export type LeaderboardRow = {
  actor: Address
  pointsWad: bigint
  lockPointsWad: bigint
  extensionPointsWad: bigint
  votePointsWad: bigint
  // Full-epoch participation bonus, kept in its own bucket so the display
  // can't mistake it for actual lock activity. `pointsWad` already includes
  // this — don't double-add when re-summing.
  participationBonusWad: bigint
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
  // True if the actor's initial pro-rata reward fell below `rewardFloorMezoWad`
  // and was forfeited. The actor keeps their `pointsWad` for transparency but
  // `rewardMezoWad` and `apr` are zeroed.
  culledBelowFloor: boolean
}

export type SimTotals = {
  pointsWad: bigint
  participants: number
  boostCount: number
  newLockCount: number
  extensionCount: number
  medianApr: number
  totalEpochs: number
  fullParticipationCount: number
  droppedCronEvents: number
  droppedBlacklistEvents: number
  voteSnapshots: number
  activeVoteAggregateWad: bigint
  // Reward-floor pass diagnostics.
  culledBelowFloorCount: number
  redistributedMezoWad: bigint
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

export type SimOptions = {
  includeOpenEpoch?: boolean
}

function scaleWad(value: bigint, factor: number): bigint {
  if (!Number.isFinite(factor) || factor <= 0) return 0n
  const scaled = Math.round(factor * 1_000_000)
  return (value * BigInt(scaled)) / 1_000_000n
}

export function pointsWeightsAt(
  params: AcademyParams,
  timestamp: number,
): Pick<AcademyParams, "weightNew" | "weightExt" | "weightBoost"> {
  let weights = {
    weightNew: params.weightNew,
    weightExt: params.weightExt,
    weightBoost: params.weightBoost,
  }
  for (const segment of params.pointsSegments) {
    if (timestamp >= segment.fromTs && timestamp < segment.toTs) {
      weights = {
        weightNew: segment.weightNew,
        weightExt: segment.weightExt,
        weightBoost: segment.weightBoost,
      }
    }
  }
  return weights
}

function isCronActor(addr: Address | undefined): boolean {
  if (!addr) return false
  try {
    return isAddressEqual(getAddress(addr), MEZO_BOOST_POKE_CRON_ADDRESS)
  } catch {
    return false
  }
}

function sameAddress(a: Address, b: Address): boolean {
  try {
    return isAddressEqual(getAddress(a), getAddress(b))
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
  openEpochVotePointsWad: bigint
  participationBonusWad: bigint
  vePowerWad: bigint
  voteWeightEpochSumWad: bigint
  newLockCount: number
  extensionCount: number
  // Distinct (tokenId, epochStart) pairs the actor boosted in-range. The
  // simulator displays its size as `boostCount`.
  boostTokenEpochs: Set<string>
  flagged: boolean
  participatedEpochs: Set<number>
  lastLockByToken: Map<string, LockSnapshot>
}

function emptyActor(actor: Address): ActorAccumulator {
  return {
    actor,
    lockPointsWad: 0n,
    extensionPointsWad: 0n,
    votePointsWad: 0n,
    openEpochVotePointsWad: 0n,
    participationBonusWad: 0n,
    vePowerWad: 0n,
    voteWeightEpochSumWad: 0n,
    newLockCount: 0,
    extensionCount: 0,
    boostTokenEpochs: new Set(),
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
  opts: SimOptions = {},
): SimResult {
  const epochs = enumerateEpochsForWindow(fromTs, toTs, {
    includeOpenEpoch: opts.includeOpenEpoch === true,
  })
  const totalEpochs = epochs.length
  const openEpochStart = epochStartFor(toTs)
  const hasOpenEpoch =
    opts.includeOpenEpoch === true &&
    openEpochStart !== toTs &&
    epochs[epochs.length - 1] === openEpochStart
  const participationEpochs = hasOpenEpoch ? epochs.slice(0, -1) : epochs
  const participationEpochCount = participationEpochs.length

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

    const isLockTrack =
      actionType === "lockCreated" ||
      actionType === "lockAmountIncreased" ||
      actionType === "lockPermanent" ||
      actionType === "lockExtended" ||
      actionType === "lockMerged"
    if (!isLockTrack) continue

    // SNF / system addresses are excluded from lock-creation credit. Other
    // lock-track actions (extends, merges, permanent conversions) we still
    // pass through — they're rare from SNF wallets anyway, and excluding
    // them would silently zero a real Δve. The original code only filtered
    // SNF for new-lock-like events so we preserve that scope.
    const isNewLockLike =
      actionType === "lockCreated" ||
      actionType === "lockAmountIncreased" ||
      actionType === "lockPermanent"
    if (isNewLockLike && isSnfActor(ev.actorAddress)) continue

    const tokenKey = ev.tokenId?.toString()
    const fallbackPrev = tokenKey
      ? (acc.lastLockByToken.get(tokenKey) ?? null)
      : null
    const delta = computeLockTrackDelta(ev, fallbackPrev)
    if (delta.flagged) acc.flagged = true

    const weights = pointsWeightsAt(params, ev.timestamp)
    const newPts = scaleWad(delta.amountAddedVeWad, weights.weightNew)
    const extPts = scaleWad(delta.durationExtendedVeWad, weights.weightExt)
    acc.lockPointsWad += newPts
    acc.extensionPointsWad += extPts
    acc.vePowerWad += delta.amountAddedVeWad + delta.durationExtendedVeWad

    if (actionType === "lockCreated" || actionType === "lockAmountIncreased") {
      acc.newLockCount += 1
    } else if (
      actionType === "lockExtended" ||
      actionType === "lockPermanent" ||
      actionType === "lockMerged"
    ) {
      acc.extensionCount += 1
    }

    if (tokenKey) {
      const next = snapshotAfter(ev, fallbackPrev)
      if (next) acc.lastLockByToken.set(tokenKey, next)
    }
  }

  // ───────────────────────────────
  // Vote events (EPOCH-SNAPSHOT REPLAY)
  // ───────────────────────────────
  //
  // The voteEvents stream contains three action types: boostVote,
  // boostAbstain, and lockTransferred. We sort them all together and walk
  // forward, taking an epoch-end snapshot each time the next event crosses
  // a boundary.
  //
  // Two non-obvious behaviours encoded here:
  //
  //   • POKE GATE: poke-driven boostVote events (where the maintainer cron
  //     called pokeBoost(s)) carry the *new* NFT owner as `actor` (resolved
  //     by the subgraph) but the cron as `txFrom`. We treat them as no-ops
  //     for state mutation — they do NOT re-establish a sticky vote and do
  //     NOT bump boostCount. Only a manual `Voted` (txFrom != cron) can
  //     create or update an activeVotes entry.
  //
  //   • TRANSFER DRAIN: a lockTransferred event marks the tokenId as
  //     "pending-cleared" but does NOT mutate activeVotes immediately. The
  //     drain happens at the END of the next epoch snapshot, AFTER the
  //     credit loop — so the seller still earns for the epoch the transfer
  //     fell inside (they were the active voter when the epoch's events
  //     started), but from the next epoch onwards their stale vote is gone
  //     and the new owner earns nothing until they themselves call vote().
  //
  // Both behaviours rely on `ev.txFrom == MEZO_BOOST_POKE_CRON_ADDRESS`
  // being the *only* way the cron appears. The cron's address is treated as
  // stable; if a new cron infrastructure is deployed, update
  // MEZO_BOOST_POKE_CRON_ADDRESS or add the new address to a list.
  const sortedVotes = [...input.voteEvents].sort(compareActivityOrder)

  const activeVotes = new Map<VoteKey, ActiveVote>()
  // tokenIds whose sticky votes should be evicted at the end of the next
  // epoch snapshot. Adding here does NOT immediately mutate activeVotes.
  const pendingTransferredTokens = new Set<string>()
  let nextEpochIdx = 0

  const snapshotEpoch = (epochStart: number) => {
    for (const vote of activeVotes.values()) {
      if (vote.weight <= 0n) continue
      const acc = get(vote.owner)
      const weights = pointsWeightsAt(params, epochStart)
      const pts = scaleWad(vote.weight, weights.weightBoost)
      acc.votePointsWad += pts
      if (hasOpenEpoch && epochStart === openEpochStart) {
        acc.openEpochVotePointsWad += pts
      }
      acc.voteWeightEpochSumWad += vote.weight
      acc.participatedEpochs.add(epochStart)
    }
    // Drain transfers AFTER crediting — the seller earns one last epoch.
    if (pendingTransferredTokens.size > 0) {
      for (const [key] of activeVotes) {
        // VoteKey format: `${contract}|${tokenId}|${gauge}`
        const tokenId = key.split("|")[1]
        if (tokenId && pendingTransferredTokens.has(tokenId)) {
          activeVotes.delete(key)
        }
      }
      pendingTransferredTokens.clear()
    }
  }

  const advanceEpochsTo = (timestamp: number) => {
    while (
      nextEpochIdx < epochs.length &&
      (epochs[nextEpochIdx] as number) + WEEK <= timestamp
    ) {
      snapshotEpoch(epochs[nextEpochIdx] as number)
      nextEpochIdx += 1
    }
  }

  for (const ev of sortedVotes) {
    // Advance epoch snapshots first — every event (vote OR transfer) can
    // tick us across boundaries.
    advanceEpochsTo(ev.timestamp)

    if (ev.actionType === "lockTransferred") {
      // Transfer queues the tokenId for eviction at the next snapshot.
      // No blacklist / cron filter here: the seller might already be
      // blacklisted, but their stale vote still needs to be drained.
      if (ev.tokenId !== undefined) {
        pendingTransferredTokens.add(ev.tokenId.toString())
      }
      continue
    }

    if (isCronActor(ev.actorAddress)) {
      droppedCronEvents += 1
      continue
    }
    if (isBlacklisted(ev.actorAddress, blacklist)) {
      droppedBlacklistEvents += 1
      continue
    }
    // Only veBTC pair boost votes count for the Academy boost track.
    if (ev.boostContext !== "mezoVeBtcPairBoost") continue

    const key = voteKey(ev)
    if (!key || !ev.actorAddress) continue
    const actor = ev.actorAddress

    if (ev.actionType === "boostVote") {
      const w = ev.weight ?? 0n
      const isPoke = isCronActor(ev.txFrom)

      if (isPoke) {
        // POKE GATE — cron-driven Voted (the second half of an
        // abstain→vote poke pair). Only refresh weight on an existing
        // entry whose owner matches the resolved actor; never create new
        // entries or shift attribution. This keeps decay-aware accounting
        // for active stickies, while preventing the cron from resurrecting
        // a vote after a transfer drain or moving credit to a new owner
        // who hasn't manually re-voted.
        const existing = activeVotes.get(key)
        if (existing && sameAddress(existing.owner, actor)) {
          if (w > 0n) existing.weight = w
          else activeVotes.delete(key)
        }
        // Pokes do not bump boostCount.
        continue
      }

      if (w > 0n) {
        activeVotes.set(key, { owner: actor, weight: w })
      } else {
        activeVotes.delete(key)
      }
      // Credit one boost action per (tokenId, epoch) inside the simulator
      // range. Voting on 5 gauges with the same NFT in the same epoch is
      // still one boost, matching how points already collapse.
      if (
        ev.timestamp >= fromTs &&
        ev.timestamp <= toTs &&
        ev.tokenId !== undefined
      ) {
        const acc = get(actor)
        const epoch = epochStartFor(ev.timestamp)
        acc.boostTokenEpochs.add(`${ev.tokenId.toString()}|${epoch}`)
      }
    } else if (ev.actionType === "boostAbstain") {
      // POKE GATE — cron-driven abstain is the first half of a poke pair;
      // the accompanying cron Voted will refresh weight. Treat as no-op.
      // A manual abstain is still an explicit cancellation and must
      // delete the active vote.
      if (isCronActor(ev.txFrom)) continue
      activeVotes.delete(key)
    }
  }
  // Snapshot any remaining epochs after the last event.
  while (nextEpochIdx < epochs.length) {
    snapshotEpoch(epochs[nextEpochIdx] as number)
    nextEpochIdx += 1
  }

  const allActors = [...accs.values()]

  // Full-participation bonus applies only to boost points. New-lock and
  // extension points remain unchanged. Exclude boost points earned in an
  // open epoch because only closed epochs determine full participation.
  for (const acc of allActors) {
    const closedParticipatedEpochs = participationEpochs.filter((epoch) =>
      acc.participatedEpochs.has(epoch),
    ).length
    if (
      participationEpochCount > 0 &&
      closedParticipatedEpochs >= participationEpochCount &&
      params.participationMultiplier > 1
    ) {
      const eligible = acc.votePointsWad - acc.openEpochVotePointsWad
      acc.participationBonusWad = scaleWad(
        eligible,
        params.participationMultiplier - 1,
      )
    }
  }

  let totalPoints = 0n
  let activeVoteAggregateWad = 0n
  for (const acc of allActors) {
    totalPoints +=
      acc.lockPointsWad +
      acc.extensionPointsWad +
      acc.votePointsWad +
      acc.participationBonusWad
  }
  for (const vote of activeVotes.values()) {
    if (vote.weight > 0n) activeVoteAggregateWad += vote.weight
  }

  const rows: LeaderboardRow[] = allActors
    .map((acc) => {
      const pointsWad =
        acc.lockPointsWad +
        acc.extensionPointsWad +
        acc.votePointsWad +
        acc.participationBonusWad
      return { acc, pointsWad }
    })
    .filter((entry) => entry.pointsWad > 0n)
    .map(({ acc, pointsWad }) => {
      const rewardMezoWad =
        totalPoints > 0n ? (params.budgetMezoWad * pointsWad) / totalPoints : 0n

      const fullyParticipated =
        participationEpochCount > 0 &&
        participationEpochs.every((epoch) => acc.participatedEpochs.has(epoch))

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
        participationBonusWad: acc.participationBonusWad,
        rewardMezoWad,
        apr,
        vePowerWad: acc.vePowerWad,
        aprBasisWad,
        newLockCount: acc.newLockCount,
        extensionCount: acc.extensionCount,
        boostCount: acc.boostTokenEpochs.size,
        activeEpochs: acc.participatedEpochs.size,
        fullyParticipated,
        flagged: acc.flagged,
        culledBelowFloor: false,
      }
    })
    .sort((a, b) => (b.pointsWad > a.pointsWad ? 1 : -1))

  // ──────────────────────────────────────────────────────────────────────
  // Reward-floor pass
  // ──────────────────────────────────────────────────────────────────────
  // Actors whose INITIAL pro-rata reward is strictly below the floor are
  // dropped from the payout and their share is redistributed to the kept
  // actors in proportion to points. Algebraically this is equivalent to
  // recomputing each kept actor's reward as
  //     budgetMezo × pts_kept / Σ pts_kept_actors
  // (the forfeited share cancels nicely). We do it that way to avoid a
  // two-step compounded rounding error.
  let culledBelowFloorCount = 0
  let redistributedMezoWad = 0n
  if (params.rewardFloorMezoWad > 0n && rows.length > 0) {
    const culledIdx = new Set<number>()
    let keptPointsWad = 0n
    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i] as LeaderboardRow
      if (row.rewardMezoWad < params.rewardFloorMezoWad) {
        culledIdx.add(i)
        redistributedMezoWad += row.rewardMezoWad
      } else {
        keptPointsWad += row.pointsWad
      }
    }
    culledBelowFloorCount = culledIdx.size
    if (culledIdx.size > 0) {
      for (let i = 0; i < rows.length; i += 1) {
        const row = rows[i] as LeaderboardRow
        if (culledIdx.has(i)) {
          rows[i] = {
            ...row,
            rewardMezoWad: 0n,
            apr: 0,
            culledBelowFloor: true,
          }
          continue
        }
        // Kept row: redistribute. If keptPointsWad is 0 (everyone was below
        // floor) this branch isn't reached because every row would be in
        // culledIdx, so no division-by-zero.
        const newReward =
          keptPointsWad > 0n
            ? (params.budgetMezoWad * row.pointsWad) / keptPointsWad
            : 0n
        const newApr = computeAprPct({
          rewardMezoWad: newReward,
          vePowerWad: row.aprBasisWad,
          mezoUsd: params.mezoUsd,
          totalEpochs,
        })
        rows[i] = {
          ...row,
          rewardMezoWad: newReward,
          apr: newApr,
        }
      }
    }
  }

  // Median APR — robust to the heavy right tail caused by a few outsized
  // vePower holders. Empty pool → 0.
  const aprValues = rows
    .map((r) => r.apr)
    .filter((v) => Number.isFinite(v) && v > 0)
    .sort((a, b) => a - b)
  let medianApr = 0
  if (aprValues.length > 0) {
    const mid = Math.floor(aprValues.length / 2)
    medianApr =
      aprValues.length % 2 === 1
        ? (aprValues[mid] as number)
        : ((aprValues[mid - 1] as number) + (aprValues[mid] as number)) / 2
  }

  // Count totals across ALL actors that had in-range activity, not just rows
  // that earned points. An actor who voted mid-range (after the epoch start
  // snapshot) earns no boost points and gets filtered out of `rows`, but their
  // boost ACTION still happened and the user expects to see it reflected.
  let totalBoostCount = 0
  let totalNewLockCount = 0
  let totalExtensionCount = 0
  for (const acc of allActors) {
    totalBoostCount += acc.boostTokenEpochs.size
    totalNewLockCount += acc.newLockCount
    totalExtensionCount += acc.extensionCount
  }

  const totals: SimTotals = {
    pointsWad: totalPoints,
    participants: rows.length,
    boostCount: totalBoostCount,
    newLockCount: totalNewLockCount,
    extensionCount: totalExtensionCount,
    medianApr,
    totalEpochs,
    fullParticipationCount: rows.filter((r) => r.fullyParticipated).length,
    droppedCronEvents,
    droppedBlacklistEvents,
    voteSnapshots: epochs.length,
    activeVoteAggregateWad,
    culledBelowFloorCount,
    redistributedMezoWad,
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
