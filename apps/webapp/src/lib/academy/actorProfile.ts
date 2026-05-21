import { WEEK, enumerateEpochs } from "@/lib/academy/epoch"
import { isSnfActor } from "@/lib/academy/snfActors"
import { MEZO_BOOST_POKE_CRON_ADDRESS } from "@/lib/mezoActivity/constants"
import type { MezoActivityItem } from "@/types/mezoActivity"
import { type Address, getAddress, isAddressEqual } from "viem"

// Per-actor replay that mirrors simulate.ts but only tracks the requested
// address. Powers the actor profile drawer in the Academy simulator.

export type ActorEpochSlice = {
  epochStart: number
  activeWeightWad: bigint
  activeVotes: Array<{
    key: string
    gauge: Address
    tokenId: bigint | undefined
    weight: bigint
  }>
  newLocksAtEpoch: number
  extensionsAtEpoch: number
  boostActionsAtEpoch: number
}

export type ActorVoteActionInRange = {
  event: MezoActivityItem
  epochStart: number
  countedFromEpoch: number | null
}

export type LockDelta = {
  // ΔvePower contributed by this event in WAD. For new locks / amount
  // increases / made-permanent it equals the ve-power of the lock state
  // assigned at the event. For extensions it's (new ve-power − prior ve-power).
  deltaVeWad: bigint
  // Heuristic estimate used (because we lacked prior state for the token).
  flagged: boolean
  // ve-power AFTER this event (snapshot of the token's current ve-power).
  postVeWad: bigint
}

export type ActorProfile = {
  actor: Address
  totalEpochs: number
  activeEpochs: number
  newLockCount: number
  extensionCount: number
  boostActionCount: number
  inRangeLocks: MezoActivityItem[]
  // Keyed by `event.id` → ΔvePower for that event. Includes one entry per
  // lock-track event in range.
  lockDeltaByEventId: Map<string, LockDelta>
  inRangeBoosts: MezoActivityItem[]
  preRangeBoosts: MezoActivityItem[]
  epochs: ActorEpochSlice[]
  diagnostics: string[]
  blacklisted: boolean
  filtered: boolean
}

const MAXTIME = BigInt(4 * 365 * 86_400)

function vePowerWad(amount: bigint, duration: bigint): bigint {
  if (duration <= 0n || amount <= 0n) return 0n
  const cappedDuration = duration > MAXTIME ? MAXTIME : duration
  return (amount * cappedDuration) / MAXTIME
}

function isCronActor(addr: Address | undefined): boolean {
  if (!addr) return false
  try {
    return isAddressEqual(getAddress(addr), MEZO_BOOST_POKE_CRON_ADDRESS)
  } catch {
    return false
  }
}

function sameActor(a: Address | undefined, target: Address): boolean {
  if (!a) return false
  try {
    return isAddressEqual(getAddress(a), target)
  } catch {
    return false
  }
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

function voteKey(item: MezoActivityItem): string | null {
  if (item.tokenId === undefined) return null
  if (!item.gaugeAddress) return null
  const contract = item.contract ?? "unknown"
  return `${contract}|${item.tokenId.toString()}|${item.gaugeAddress.toLowerCase()}`
}

export function computeActorProfile(args: {
  actor: Address
  lockEvents: MezoActivityItem[]
  voteEvents: MezoActivityItem[]
  fromTs: number
  toTs: number
  blacklist?: ReadonlySet<Address>
}): ActorProfile {
  const { actor, lockEvents, voteEvents, fromTs, toTs, blacklist } = args
  const epochs = enumerateEpochs(fromTs, toTs)
  const totalEpochs = epochs.length

  const checksummed = (() => {
    try {
      return getAddress(actor)
    } catch {
      return actor
    }
  })()

  const isBlacklisted = !!blacklist?.has(checksummed)
  const isCron = isCronActor(actor)
  const isSnf = isSnfActor(actor)

  // Active-vote replay restricted to this actor.
  type ActiveVote = {
    gauge: Address
    tokenId: bigint | undefined
    weight: bigint
  }
  const activeVotes = new Map<string, ActiveVote>()

  const epochSlices: ActorEpochSlice[] = epochs.map((epochStart) => ({
    epochStart,
    activeWeightWad: 0n,
    activeVotes: [],
    newLocksAtEpoch: 0,
    extensionsAtEpoch: 0,
    boostActionsAtEpoch: 0,
  }))

  let nextEpochIdx = 0
  const snapshot = (idx: number) => {
    const slice = epochSlices[idx]
    if (!slice) return
    for (const [key, vote] of activeVotes.entries()) {
      if (vote.weight <= 0n) continue
      slice.activeWeightWad += vote.weight
      slice.activeVotes.push({
        key,
        gauge: vote.gauge,
        tokenId: vote.tokenId,
        weight: vote.weight,
      })
    }
  }

  // Sort the full vote history; we need pre-range events to replay sticky
  // state correctly.
  const actorVotes = voteEvents
    .filter((ev) => sameActor(ev.actorAddress, checksummed))
    .filter((ev) => ev.boostContext === "mezoVeBtcPairBoost")
    .sort(compareActivityOrder)

  const inRangeBoosts: MezoActivityItem[] = []
  const preRangeBoosts: MezoActivityItem[] = []
  let boostActionCount = 0

  for (const ev of actorVotes) {
    // Snapshot epochs we've moved PAST — epoch end is at (start + WEEK).
    while (
      nextEpochIdx < epochs.length &&
      (epochs[nextEpochIdx] as number) + WEEK <= ev.timestamp
    ) {
      snapshot(nextEpochIdx)
      nextEpochIdx += 1
    }

    const key = voteKey(ev)
    if (!key) continue

    if (ev.actionType === "boostVote") {
      const w = ev.weight ?? 0n
      if (w > 0n) {
        activeVotes.set(key, {
          gauge: ev.gaugeAddress as Address,
          tokenId: ev.tokenId,
          weight: w,
        })
      } else {
        activeVotes.delete(key)
      }
      if (ev.timestamp >= fromTs && ev.timestamp <= toTs) {
        inRangeBoosts.push(ev)
        boostActionCount += 1
        const epochIdx = findEpochIndex(epochs, ev.timestamp)
        if (epochIdx >= 0) {
          const slice = epochSlices[epochIdx]
          if (slice) slice.boostActionsAtEpoch += 1
        }
      } else if (ev.timestamp < fromTs) {
        preRangeBoosts.push(ev)
      }
    } else if (ev.actionType === "boostAbstain") {
      activeVotes.delete(key)
      if (ev.timestamp >= fromTs && ev.timestamp <= toTs) {
        inRangeBoosts.push(ev)
      } else if (ev.timestamp < fromTs) {
        preRangeBoosts.push(ev)
      }
    }
  }
  while (nextEpochIdx < epochs.length) {
    snapshot(nextEpochIdx)
    nextEpochIdx += 1
  }

  // Lock track — in-range only, this actor only.
  const inRangeLocks = lockEvents
    .filter((ev) => sameActor(ev.actorAddress, checksummed))
    .filter((ev) => ev.timestamp >= fromTs && ev.timestamp <= toTs)
    .sort(compareActivityOrder)

  // Build prior-lock state from the SAME pre-range lock events we have for
  // this actor, so an in-range extension can compare against its real prior
  // ve-power instead of falling back to the heuristic when we already know it.
  const lastLockByToken = new Map<
    string,
    { amount: bigint; duration: bigint }
  >()
  const preRangeLocks = lockEvents
    .filter((ev) => sameActor(ev.actorAddress, checksummed))
    .filter((ev) => ev.timestamp < fromTs)
    .sort(compareActivityOrder)
  for (const ev of preRangeLocks) {
    const tokenKey = ev.tokenId?.toString()
    if (!tokenKey) continue
    if (
      ev.actionType === "lockCreated" ||
      ev.actionType === "lockAmountIncreased" ||
      ev.actionType === "lockPermanent"
    ) {
      lastLockByToken.set(tokenKey, {
        amount: ev.amount ?? 0n,
        duration: ev.duration ?? 0n,
      })
    } else if (ev.actionType === "lockExtended") {
      const prev = lastLockByToken.get(tokenKey)
      lastLockByToken.set(tokenKey, {
        amount: ev.amount ?? prev?.amount ?? 0n,
        duration: ev.duration ?? prev?.duration ?? 0n,
      })
    }
  }

  const lockDeltaByEventId = new Map<string, LockDelta>()
  let newLockCount = 0
  let extensionCount = 0
  for (const ev of inRangeLocks) {
    const tokenKey = ev.tokenId?.toString()
    if (
      ev.actionType === "lockCreated" ||
      ev.actionType === "lockAmountIncreased" ||
      ev.actionType === "lockPermanent"
    ) {
      if (isSnf) continue
      newLockCount += 1
      const idx = findEpochIndex(epochs, ev.timestamp)
      if (idx >= 0) {
        const slice = epochSlices[idx]
        if (slice) slice.newLocksAtEpoch += 1
      }
      const ve = vePowerWad(ev.amount ?? 0n, ev.duration ?? 0n)
      lockDeltaByEventId.set(ev.id, {
        deltaVeWad: ve,
        flagged: false,
        postVeWad: ve,
      })
      if (tokenKey) {
        lastLockByToken.set(tokenKey, {
          amount: ev.amount ?? 0n,
          duration: ev.duration ?? 0n,
        })
      }
    } else if (ev.actionType === "lockExtended") {
      extensionCount += 1
      const idx = findEpochIndex(epochs, ev.timestamp)
      if (idx >= 0) {
        const slice = epochSlices[idx]
        if (slice) slice.extensionsAtEpoch += 1
      }
      const prev = tokenKey ? lastLockByToken.get(tokenKey) : undefined
      const newAmount = ev.amount ?? prev?.amount ?? 0n
      const newDuration = ev.duration ?? 0n
      const newPower = vePowerWad(newAmount, newDuration)
      let deltaWad = 0n
      let flagged = false
      if (prev) {
        const prevPower = vePowerWad(prev.amount, prev.duration)
        deltaWad = newPower > prevPower ? newPower - prevPower : 0n
      } else {
        deltaWad = newPower / 4n
        flagged = true
      }
      lockDeltaByEventId.set(ev.id, {
        deltaVeWad: deltaWad,
        flagged,
        postVeWad: newPower,
      })
      if (tokenKey) {
        lastLockByToken.set(tokenKey, {
          amount: newAmount,
          duration: newDuration,
        })
      }
    }
  }

  const activeEpochs = epochSlices.filter((s) => s.activeWeightWad > 0n).length

  const diagnostics: string[] = []
  if (isBlacklisted) {
    diagnostics.push(
      "This actor is on the blacklist — their events are excluded from the simulator.",
    )
  }
  if (isCron) {
    diagnostics.push(
      "This actor is the boost-poke cron — all events from this address are dropped.",
    )
  }
  if (isSnf) {
    diagnostics.push(
      "This actor is an SNF / system address — new-lock and amount-increase events are not counted.",
    )
  }

  if (boostActionCount > 0 && activeEpochs === 0) {
    diagnostics.push(
      "Boosted in range but counted in 0 epochs — every in-range boost was either zero-weight or removed (abstained) before its epoch closed.",
    )
  } else if (boostActionCount > activeEpochs && activeEpochs > 0) {
    diagnostics.push(
      "More boost actions than active epochs — multiple boosts within the same epoch only credit once, and a vote followed by an abstain inside the same epoch nets to zero for that epoch.",
    )
  } else if (boostActionCount === 0 && activeEpochs > 0) {
    diagnostics.push(
      "Active in epochs with no in-range boost actions — vote was placed before the range and remains sticky.",
    )
  }

  for (let i = 0; i < epochSlices.length; i += 1) {
    const slice = epochSlices[i]
    if (!slice) continue
    if (slice.boostActionsAtEpoch > 0 && slice.activeWeightWad === 0n) {
      diagnostics.push(
        `Epoch ${i + 1} (${new Date(slice.epochStart * 1000).toISOString().slice(0, 10)}): ${slice.boostActionsAtEpoch} boost action${slice.boostActionsAtEpoch === 1 ? "" : "s"} but no active weight at epoch end — boost was abstained/cleared before the epoch closed.`,
      )
    }
  }

  return {
    actor: checksummed,
    totalEpochs,
    activeEpochs,
    newLockCount,
    extensionCount,
    boostActionCount,
    inRangeLocks,
    lockDeltaByEventId,
    inRangeBoosts,
    preRangeBoosts,
    epochs: epochSlices,
    diagnostics,
    blacklisted: isBlacklisted,
    filtered: isBlacklisted || isCron,
  }
}

function findEpochIndex(epochs: number[], ts: number): number {
  if (epochs.length === 0) return -1
  if (ts < (epochs[0] as number)) return -1
  let idx = -1
  for (let i = 0; i < epochs.length; i += 1) {
    if ((epochs[i] as number) <= ts) idx = i
    else break
  }
  return idx
}
