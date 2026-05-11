import { enumerateEpochs, epochStartFor } from "@/lib/academy/epoch"
import { isSnfActor } from "@/lib/academy/snfActors"
import { MEZO_BOOST_POKE_CRON_ADDRESS } from "@/lib/mezoActivity/constants"
import type { MezoActivityItem } from "@/types/mezoActivity"
import { type Address, getAddress, isAddressEqual } from "viem"

// ──────────────────────────────────────────────────────────────────────────
// Academy reward model — single source of truth
// ──────────────────────────────────────────────────────────────────────────
//
// Three tracks of behavior earn points. Each is weighted independently so you
// can tune the program toward what you want to incentivize.
//
//   1. Locking veMEZO         (LOCK_CREATED + LOCK_AMOUNT_INCREASED + LOCK_PERMANENT)
//        points = weightNew  × ΔvePower      (one-shot, at the time of the lock)
//
//   2. Extending a lock        (LOCK_EXTENDED)
//        points = weightExt  × ΔvePower      (one-shot, at the extension event)
//
//   3. Casting boost votes     (BOOST_VOTE) — covers both
//        a) voting on Matchbox gauges via PoolsVoter
//        b) pairing a veMEZO lock with a veBTC position (BoostVoter)
//        points = weightBoost × voteWeight   (one-shot, per (epoch, gauge))
//
// Notes:
//
//   ve-power is computed as `amount × min(duration, 4 years) / 4 years`. A 1-year
//   lock of 100 MEZO produces 25 ve-power; a 4-year lock of 100 MEZO produces
//   100 ve-power. Permanent locks are treated as the 4-year cap.
//
//   The boost MULTIPLIER (2× vs 3×) that the Mezo app shows is a property of the
//   gauge, not the voter: it's how much veMEZO the gauge has attracted relative
//   to supply. A user with weight W on a gauge earns the same W points regardless
//   of the multiplier — the multiplier is just the public-facing "popularity".
//
//   If a user votes on the same gauge multiple times in the same epoch (e.g. spam),
//   only the first vote scores at full weight; further votes are discounted to
//   25% × weightBoost via `boostCapPerEpoch` (default 1).
//
//   Full-participation bonus: if an actor cast at least one vote in EVERY epoch
//   of the range, their lock+extension points are multiplied by
//   (participationMultiplier − 1) and added as a bonus.
//
//   The CRON address `0xf8176Df5…` (Tigris maintainer) is hard-filtered out of
//   the actor set, because some Voted events emitted by the contract carry
//   `voter = msg.sender` when the maintainer calls `poke(tokenId)` to refresh a
//   user's vote — that's NOT a user action, just maintenance. The subgraph
//   should ideally resolve these back to the original lock owner; until that's
//   live the simulator just drops them rather than mis-attribute.
//
//   Reward distribution is a simple proportional split:
//        reward(actor) = budgetMezo × (actor.points / Σ all_actors.points)
//
//   APR is annualised from epoch returns:
//        apr = (reward × mezoUsd / vePower × mezoUsd) × (52 / epochsInRange) × 100
//   The mezoUsd factor cancels; it's there for parity with real-world inputs.
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
}

export type SimResult = {
  rows: LeaderboardRow[]
  totals: SimTotals
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
  lastLockSnapshot: { amount: bigint; duration: bigint } | undefined
  boostsPerEpochGauge: Map<string, number>
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
    lastLockSnapshot: undefined,
    boostsPerEpochGauge: new Map(),
  }
}

export function simulate(
  events: MezoActivityItem[],
  params: AcademyParams,
  fromTs: number,
  toTs: number,
): SimResult {
  const epochs = enumerateEpochs(fromTs, toTs)
  const totalEpochs = epochs.length

  const sorted = [...events].sort((a, b) => a.timestamp - b.timestamp)
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

  for (const ev of sorted) {
    if (!ev.actorAddress) continue
    // Drop maintainer-impersonated events outright. Some Voted events carry
    // `voter = msg.sender` when the maintainer calls poke() to refresh a vote;
    // those should belong to the original lock owner, not the cron. Without a
    // subgraph-side resolution we drop them so the cron can't earn points.
    if (isCronActor(ev.actorAddress)) {
      droppedCronEvents += 1
      continue
    }
    const acc = get(ev.actorAddress)
    const actionType = ev.actionType

    if (
      actionType === "lockCreated" ||
      actionType === "lockAmountIncreased" ||
      actionType === "lockPermanent"
    ) {
      // New money entering, or existing money becoming non-decaying.
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
      if (ev.amount !== undefined && ev.duration !== undefined) {
        acc.lastLockSnapshot = { amount: ev.amount, duration: ev.duration }
      }
    } else if (actionType === "lockExtended") {
      // Duration extended on an existing lock — credit the delta ve-power only.
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
        // No prior lock event in this stream — coarse fallback (¼ of full).
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
      if (ev.amount !== undefined && ev.duration !== undefined) {
        acc.lastLockSnapshot = { amount: ev.amount, duration: ev.duration }
      }
    } else if (actionType === "boostVote") {
      const epoch = epochStartFor(ev.timestamp)
      acc.participatedEpochs.add(epoch)
      acc.boostCount += 1

      let weightWad = ev.weight ?? 0n
      if (weightWad === 0n) {
        // No weight on event — proxy with actor's most recent lock power.
        if (acc.lastLockSnapshot) {
          weightWad = vePowerWad(
            acc.lastLockSnapshot.amount,
            acc.lastLockSnapshot.duration,
          )
        }
        acc.flagged = acc.flagged || weightWad === 0n
      }

      const gaugeKey = `${ev.gaugeAddress?.toLowerCase() ?? "none"}:${epoch}`
      const seen = acc.boostsPerEpochGauge.get(gaugeKey) ?? 0
      acc.boostsPerEpochGauge.set(gaugeKey, seen + 1)

      let factor = params.weightBoost
      if (seen >= params.boostCapPerEpoch) {
        // Over the per-epoch-per-gauge cap → discount to 25 %.
        factor = params.weightBoost * 0.25
      }
      acc.votePointsWad += scaleWad(weightWad, factor)
    }
  }

  const allActors = [...accs.values()]
  // Apply full-participation bonus to lock+extension points.
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
  for (const acc of allActors) {
    totalPoints +=
      acc.lockPointsWad + acc.extensionPointsWad + acc.votePointsWad
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

export { WAD }
