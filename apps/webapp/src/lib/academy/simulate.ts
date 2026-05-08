import { enumerateEpochs, epochStartFor } from "@/lib/academy/epoch"
import { isSnfActor } from "@/lib/academy/snfActors"
import type { MezoActivityItem } from "@/types/mezoActivity"
import type { Address } from "viem"

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

type ActorAccumulator = {
  actor: Address
  pointsWad: bigint
  newLockPointsWad: bigint
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
    pointsWad: 0n,
    newLockPointsWad: 0n,
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

  for (const ev of sorted) {
    if (!ev.actorAddress) continue
    const acc = get(ev.actorAddress)
    const actionType = ev.actionType

    if (actionType === "lockCreated") {
      if (isSnfActor(ev.actorAddress)) continue
      const ve = vePowerWad(ev.amount ?? 0n, ev.duration ?? 0n)
      const pts = scaleWad(ve, params.weightNew)
      acc.pointsWad += pts
      acc.newLockPointsWad += pts
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
        // No prior lock event in this stream — coarse fallback proxy.
        deltaWad = vePowerWad(newAmount, newDuration) / 4n
        acc.flagged = true
      }
      const pts = scaleWad(deltaWad, params.weightExt)
      acc.pointsWad += pts
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
        // Over the per-epoch-per-gauge cap → discount.
        factor = params.weightBoost * 0.25
      }
      acc.pointsWad += scaleWad(weightWad, factor)
    }
  }

  const allActors = [...accs.values()]
  // Apply full-participation bonus.
  for (const acc of allActors) {
    if (
      totalEpochs > 0 &&
      acc.participatedEpochs.size >= totalEpochs &&
      params.participationMultiplier > 1
    ) {
      const bonus = scaleWad(
        acc.newLockPointsWad,
        params.participationMultiplier - 1,
      )
      acc.pointsWad += bonus
    }
  }

  let totalPoints = 0n
  for (const acc of allActors) totalPoints += acc.pointsWad

  const rows: LeaderboardRow[] = allActors
    .filter((a) => a.pointsWad > 0n)
    .map((acc) => {
      const rewardMezoWad =
        totalPoints > 0n
          ? (params.budgetMezoWad * acc.pointsWad) / totalPoints
          : 0n

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
        pointsWad: acc.pointsWad,
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
