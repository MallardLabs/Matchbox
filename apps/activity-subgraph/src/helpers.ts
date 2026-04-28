import { BigInt, Bytes, ethereum } from "@graphprotocol/graph-ts"
import { ActivityEvent, ActivityStats } from "../generated/schema"

export const LOCK_CREATED = "LOCK_CREATED"
export const LOCK_AMOUNT_INCREASED = "LOCK_AMOUNT_INCREASED"
export const LOCK_EXTENDED = "LOCK_EXTENDED"
export const BOOST_VOTE = "BOOST_VOTE"
export const BOOST_POKE = "BOOST_POKE"
export const PAIR_CREATED = "PAIR_CREATED"
export const GAUGE_CREATED = "GAUGE_CREATED"

export const MATCHBOX_GAUGE_BOOST = "MATCHBOX_GAUGE_BOOST"
export const MEZO_VEBTC_PAIR_BOOST = "MEZO_VEBTC_PAIR_BOOST"
export const UNKNOWN = "UNKNOWN"

export const VOTING_ESCROW = "VOTING_ESCROW"
export const BOOST_VOTER = "BOOST_VOTER"
export const POOLS_VOTER = "POOLS_VOTER"

const ZERO = BigInt.fromI32(0)
const ONE = BigInt.fromI32(1)

export function eventId(event: ethereum.Event, suffix: string): string {
  return event.transaction.hash.toHexString() + "-" + event.logIndex.toString() + "-" + suffix
}

export function baseActivity(
  event: ethereum.Event,
  actionType: string,
  boostContext: string,
  source: string,
): ActivityEvent {
  const activity = new ActivityEvent(eventId(event, actionType))
  activity.actionType = actionType
  activity.boostContext = boostContext
  activity.source = source
  activity.txHash = event.transaction.hash
  activity.logIndex = event.logIndex
  activity.blockNumber = event.block.number
  activity.timestamp = event.block.timestamp
  activity.contractAddress = event.address
  return activity
}

export function incrementStats(actionType: string, timestamp: BigInt): void {
  let stats = ActivityStats.load("global")
  if (stats == null) {
    stats = new ActivityStats("global")
    stats.totalEvents = ZERO
    stats.locks = ZERO
    stats.boosts = ZERO
    stats.extensions = ZERO
  }

  stats.totalEvents = stats.totalEvents.plus(ONE)
  if (actionType == LOCK_CREATED || actionType == LOCK_AMOUNT_INCREASED) {
    stats.locks = stats.locks.plus(ONE)
  }
  if (actionType == LOCK_EXTENDED) {
    stats.extensions = stats.extensions.plus(ONE)
  }
  if (
    actionType == BOOST_VOTE ||
    actionType == BOOST_POKE ||
    actionType == PAIR_CREATED ||
    actionType == GAUGE_CREATED
  ) {
    stats.boosts = stats.boosts.plus(ONE)
  }
  stats.lastUpdatedAt = timestamp
  stats.save()
}

export function saveActivity(activity: ActivityEvent): void {
  activity.save()
  incrementStats(activity.actionType, activity.timestamp)
}

export function maybeBytes(value: Bytes): Bytes {
  return value
}
