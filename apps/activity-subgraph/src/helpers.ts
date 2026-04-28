import { BigInt, Bytes, ethereum } from "@graphprotocol/graph-ts"
import {
  Account,
  ActivityEvent,
  ActivityStats,
  Gauge,
  GaugeEpoch,
  LockPosition,
  Token,
} from "../generated/schema"

export const LOCK_CREATED = "LOCK_CREATED"
export const LOCK_AMOUNT_INCREASED = "LOCK_AMOUNT_INCREASED"
export const LOCK_EXTENDED = "LOCK_EXTENDED"
export const LOCK_WITHDRAWN = "LOCK_WITHDRAWN"
export const LOCK_PERMANENT = "LOCK_PERMANENT"
export const LOCK_PERMANENT_UNLOCKED = "LOCK_PERMANENT_UNLOCKED"
export const BOOST_VOTE = "BOOST_VOTE"
export const BOOST_ABSTAIN = "BOOST_ABSTAIN"
export const BOOST_POKE = "BOOST_POKE"
export const PAIR_CREATED = "PAIR_CREATED"
export const GAUGE_CREATED = "GAUGE_CREATED"
export const GAUGE_KILLED = "GAUGE_KILLED"
export const GAUGE_REVIVED = "GAUGE_REVIVED"
export const BOOSTABLE_TOKEN_BURNED = "BOOSTABLE_TOKEN_BURNED"
export const INCENTIVE_ADDED = "INCENTIVE_ADDED"
export const REWARD_DISTRIBUTED = "REWARD_DISTRIBUTED"
export const REWARD_NOTIFIED = "REWARD_NOTIFIED"

export const MATCHBOX_GAUGE_BOOST = "MATCHBOX_GAUGE_BOOST"
export const MEZO_VEBTC_PAIR_BOOST = "MEZO_VEBTC_PAIR_BOOST"
export const UNKNOWN = "UNKNOWN"

export const VOTING_ESCROW = "VOTING_ESCROW"
export const BOOST_VOTER = "BOOST_VOTER"
export const POOLS_VOTER = "POOLS_VOTER"

export const ZERO = BigInt.fromI32(0)
export const ONE = BigInt.fromI32(1)
const WEEK = BigInt.fromI32(604800)

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

export function accountId(address: Bytes): string {
  return address.toHexString()
}

export function gaugeId(address: Bytes): string {
  return address.toHexString()
}

export function lockId(contractAddress: Bytes, tokenId: BigInt): string {
  return contractAddress.toHexString() + "-" + tokenId.toString()
}

export function getOrCreateAccount(address: Bytes, timestamp: BigInt): Account {
  const id = accountId(address)
  let account = Account.load(id)
  if (account == null) {
    account = new Account(id)
    account.address = address
    account.lockCount = ZERO
    account.voteCount = ZERO
    account.incentiveCount = ZERO
    account.totalIncentiveAmount = ZERO
    account.firstSeenAt = timestamp
  }
  account.lastSeenAt = timestamp
  return account
}

export function getOrCreateLock(
  contractAddress: Bytes,
  tokenId: BigInt,
): LockPosition {
  const id = lockId(contractAddress, tokenId)
  let lock = LockPosition.load(id)
  if (lock == null) {
    lock = new LockPosition(id)
    lock.tokenId = tokenId
    lock.contractAddress = contractAddress
    lock.amount = ZERO
    lock.isPermanent = false
    lock.isWithdrawn = false
    lock.activityCount = ZERO
  }
  return lock
}

export function getOrCreateGauge(
  address: Bytes,
  boostContext: string,
  source: string,
): Gauge {
  const id = gaugeId(address)
  let gauge = Gauge.load(id)
  if (gauge == null) {
    gauge = new Gauge(id)
    gauge.address = address
    gauge.boostContext = boostContext
    gauge.source = source
    gauge.isAlive = true
    gauge.voteCount = ZERO
    gauge.incentiveCount = ZERO
    gauge.totalIncentiveAmount = ZERO
  }
  return gauge
}

export function getOrCreateToken(address: Bytes, timestamp: BigInt): Token {
  const id = address.toHexString()
  let token = Token.load(id)
  if (token == null) {
    token = new Token(id)
    token.address = address
    token.incentiveCount = ZERO
    token.totalIncentiveAmount = ZERO
    token.firstSeenAt = timestamp
  }
  token.lastSeenAt = timestamp
  return token
}

export function epochStart(timestamp: BigInt): BigInt {
  return timestamp.div(WEEK).times(WEEK)
}

export function getOrCreateGaugeEpoch(
  gaugeAddress: Bytes,
  boostContext: string,
  source: string,
  timestamp: BigInt,
): GaugeEpoch {
  const start = epochStart(timestamp)
  const id = gaugeAddress.toHexString() + "-" + start.toString()
  let gaugeEpoch = GaugeEpoch.load(id)
  if (gaugeEpoch == null) {
    const gauge = getOrCreateGauge(gaugeAddress, boostContext, source)
    gauge.save()
    gaugeEpoch = new GaugeEpoch(id)
    gaugeEpoch.gauge = gauge.id
    gaugeEpoch.epochStart = start
    gaugeEpoch.voteCount = ZERO
    gaugeEpoch.incentiveCount = ZERO
    gaugeEpoch.totalWeight = ZERO
    gaugeEpoch.totalIncentiveAmount = ZERO
  }
  gaugeEpoch.lastUpdatedAt = timestamp
  return gaugeEpoch
}

export function incrementStats(actionType: string, timestamp: BigInt): void {
  let stats = ActivityStats.load("global")
  if (stats == null) {
    stats = new ActivityStats("global")
    stats.totalEvents = ZERO
    stats.locks = ZERO
    stats.boosts = ZERO
    stats.extensions = ZERO
    stats.incentives = ZERO
    stats.gauges = ZERO
  }

  stats.totalEvents = stats.totalEvents.plus(ONE)
  if (
    actionType == LOCK_CREATED ||
    actionType == LOCK_AMOUNT_INCREASED ||
    actionType == LOCK_WITHDRAWN ||
    actionType == LOCK_PERMANENT ||
    actionType == LOCK_PERMANENT_UNLOCKED
  ) {
    stats.locks = stats.locks.plus(ONE)
  }
  if (actionType == LOCK_EXTENDED) {
    stats.extensions = stats.extensions.plus(ONE)
  }
  if (
    actionType == BOOST_VOTE ||
    actionType == BOOST_ABSTAIN ||
    actionType == BOOST_POKE ||
    actionType == PAIR_CREATED ||
    actionType == BOOSTABLE_TOKEN_BURNED
  ) {
    stats.boosts = stats.boosts.plus(ONE)
  }
  if (actionType == GAUGE_CREATED || actionType == GAUGE_KILLED || actionType == GAUGE_REVIVED) {
    stats.gauges = stats.gauges.plus(ONE)
  }
  if (
    actionType == INCENTIVE_ADDED ||
    actionType == REWARD_DISTRIBUTED ||
    actionType == REWARD_NOTIFIED
  ) {
    stats.incentives = stats.incentives.plus(ONE)
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
