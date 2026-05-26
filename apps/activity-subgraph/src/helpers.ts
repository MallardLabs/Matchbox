import { BigInt, Bytes, ethereum } from "@graphprotocol/graph-ts"
import {
  Account,
  ActivityEvent,
  ActivityStats,
  Gauge,
  GaugeEpoch,
  LockPosition,
  Token,
  Vote,
} from "../generated/schema"

export const LOCK_CREATED = "LOCK_CREATED"
export const LOCK_AMOUNT_INCREASED = "LOCK_AMOUNT_INCREASED"
export const LOCK_EXTENDED = "LOCK_EXTENDED"
export const LOCK_WITHDRAWN = "LOCK_WITHDRAWN"
export const LOCK_PERMANENT = "LOCK_PERMANENT"
export const LOCK_PERMANENT_UNLOCKED = "LOCK_PERMANENT_UNLOCKED"
export const LOCK_TRANSFERRED = "LOCK_TRANSFERRED"
export const LOCK_MERGED = "LOCK_MERGED"
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

export const THIRD_PARTY_GAUGE_CREATED = "THIRD_PARTY_GAUGE_CREATED"
export const VALIDATOR_GAUGE_CREATED = "VALIDATOR_GAUGE_CREATED"
export const VALIDATOR_LEFT = "VALIDATOR_LEFT"
export const PERIOD_UPDATED = "PERIOD_UPDATED"
export const EPOCH_PROCESSED = "EPOCH_PROCESSED"
export const EMISSIONS_ENABLED = "EMISSIONS_ENABLED"
export const REBASE_CLAIMED = "REBASE_CLAIMED"
export const REBASE_CHECKPOINT = "REBASE_CHECKPOINT"
export const MERKLE_CLAIMED = "MERKLE_CLAIMED"
export const MERKLE_DISTRIBUTION_ADDED = "MERKLE_DISTRIBUTION_ADDED"
export const SAVINGS_DEPOSIT = "SAVINGS_DEPOSIT"
export const SAVINGS_WITHDRAW = "SAVINGS_WITHDRAW"
export const SAVINGS_YIELD_CLAIMED = "SAVINGS_YIELD_CLAIMED"
export const PROTOCOL_YIELD_RECEIVED = "PROTOCOL_YIELD_RECEIVED"
export const STRATEGY_YIELD_RECEIVED = "STRATEGY_YIELD_RECEIVED"
export const PCV_DISTRIBUTION = "PCV_DISTRIBUTION"
export const PCV_DEBT_PAYMENT = "PCV_DEBT_PAYMENT"

export const MATCHBOX_GAUGE_BOOST = "MATCHBOX_GAUGE_BOOST"
export const MEZO_VEBTC_PAIR_BOOST = "MEZO_VEBTC_PAIR_BOOST"
export const UNKNOWN = "UNKNOWN"

export const VOTING_ESCROW = "VOTING_ESCROW"
export const BOOST_VOTER = "BOOST_VOTER"
export const POOLS_VOTER = "POOLS_VOTER"
export const THIRD_PARTY_VOTER = "THIRD_PARTY_VOTER"
export const VALIDATORS_VOTER = "VALIDATORS_VOTER"
export const CHAIN_FEE_SPLITTER = "CHAIN_FEE_SPLITTER"
export const MEZO_CHAIN_SPLITTER = "MEZO_CHAIN_SPLITTER"
export const MEZO_ECOSYSTEM_SPLITTER = "MEZO_ECOSYSTEM_SPLITTER"
export const MEZO_MINTER = "MEZO_MINTER"
export const MEZO_REBASE_DISTRIBUTOR = "MEZO_REBASE_DISTRIBUTOR"
export const MEZO_MERKLE_DISTRIBUTOR = "MEZO_MERKLE_DISTRIBUTOR"
export const MUSD_SAVINGS_RATE = "MUSD_SAVINGS_RATE"
export const PCV = "PCV"

export const ZERO = BigInt.fromI32(0)
export const ONE = BigInt.fromI32(1)
const WEEK = BigInt.fromI32(604800)
// 4 years in seconds — the ve-power saturation cap. Permanent locks are
// modelled as MAXTIME for the duration field.
export const MAXTIME = BigInt.fromI32(4 * 365 * 86400)

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
  activity.txFrom = event.transaction.from
  activity.logIndex = event.logIndex
  activity.blockNumber = event.block.number
  activity.timestamp = event.block.timestamp
  activity.contractAddress = event.address
  return activity
}

export const POKE_SELECTOR = "0x32145f90"
export const POKE_BOOST_SELECTOR = "0x673bbc86"
export const POKE_BOOSTS_SELECTOR = "0xd3672ab2"
// Selector for IVotingEscrow.merge(uint256 _from, uint256 _to). Curve/Velo
// veNFT contracts burn `_from` and add its amount + extended duration to `_to`
// in a single tx, emitting Withdraw + Transfer(→0x0) + Deposit. We detect the
// merge by tx.input selector so we can attribute the destination's Deposit as
// LOCK_MERGED rather than a fresh LOCK_AMOUNT_INCREASED, which would double-
// count points the user already earned when they first created `_from`.
export const MERGE_SELECTOR = "0xd1c2babb"

export function detectPokeMethod(input: Bytes): string | null {
  if (input.length < 4) return null
  const selector = input.toHexString().slice(0, 10).toLowerCase()
  if (selector == POKE_SELECTOR) return "poke"
  if (selector == POKE_BOOST_SELECTOR) return "pokeBoost"
  if (selector == POKE_BOOSTS_SELECTOR) return "pokeBoosts"
  return null
}

export function isMergeTx(input: Bytes): boolean {
  if (input.length < 4) return false
  const selector = input.toHexString().slice(0, 10).toLowerCase()
  return selector == MERGE_SELECTOR
}

// Decode the two uint256 args of merge(_from, _to). Returns [from, to] or
// null if the input doesn't match a merge call.
export function parseMergeArgs(input: Bytes): BigInt[] | null {
  if (!isMergeTx(input)) return null
  if (input.length < 68) return null
  // Strip the 4-byte selector, decode the remaining 64 bytes as (uint256,uint256).
  const payload = Bytes.fromUint8Array(input.subarray(4))
  const decoded = ethereum.decode("(uint256,uint256)", payload)
  if (decoded == null) return null
  const tuple = decoded.toTuple()
  const out: BigInt[] = [tuple[0].toBigInt(), tuple[1].toBigInt()]
  return out
}

// Convert an absolute lock end timestamp into REMAINING seconds at the given
// block time, capped at MAXTIME. Permanent locks should pass MAXTIME directly.
export function remainingDuration(
  unlockAt: BigInt,
  blockTimestamp: BigInt,
): BigInt {
  if (unlockAt.le(blockTimestamp)) return ZERO
  const remaining = unlockAt.minus(blockTimestamp)
  return remaining.gt(MAXTIME) ? MAXTIME : remaining
}

// veMEZO VotingEscrow addresses across supported networks. Voted events on
// BoostVoter/PoolsVoter carry `voter = msg.sender`, which is the maintainer
// when the cron calls `poke(tokenId)`. Resolve the real owner by looking up
// the LockPosition entity keyed on (veMEZO contract, tokenId).
const VE_MEZO_MAINNET_HEX = "0xb90fdad3dfd180458d62cc6acedc983d78e20122"
const VE_MEZO_TESTNET_HEX = "0xace816ca2bcc9b12c59799dcc5a959fb9b98111b"

// Returns the lock owner's address, or the provided fallback if no lock exists.
// Avoids returning a nullable Bytes across modules — the AS compiler crashes on
// that pattern. Callers pass the event's `voter` field as the fallback.
export function resolveLockOwner(tokenId: BigInt, fallback: Bytes): Bytes {
  const idMainnet = VE_MEZO_MAINNET_HEX + "-" + tokenId.toString()
  const mainnet = LockPosition.load(idMainnet)
  if (mainnet != null) {
    const owner = mainnet.owner
    if (owner) return owner
  }
  const idTestnet = VE_MEZO_TESTNET_HEX + "-" + tokenId.toString()
  const testnet = LockPosition.load(idTestnet)
  if (testnet != null) {
    const owner = testnet.owner
    if (owner) return owner
  }
  return fallback
}

// Manual Voted/Abstained events carry `voter = msg.sender`, which is already
// the actor who took the action. Poke calls also emit Voted/Abstained rows, but
// in those transactions msg.sender is the maintainer, so resolve those back to
// the current lock owner.
export function resolveVoteActor(
  tokenId: BigInt,
  voter: Bytes,
  input: Bytes,
): Bytes {
  return detectPokeMethod(input) != null
    ? resolveLockOwner(tokenId, voter)
    : voter
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
    lock.isMerged = false
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

export function voteId(
  contractAddress: Bytes,
  tokenId: BigInt,
  gauge: Bytes,
): string {
  return (
    contractAddress.toHexString() +
    "-" +
    tokenId.toString() +
    "-" +
    gauge.toHexString()
  )
}

// Upsert a Vote entity reflecting the current state of (contract, tokenId, gauge).
// `weight = 0` represents an abstain — the vote becomes inactive. Each event
// (Voted, Abstained) is the authoritative latest state for that triple.
export function upsertVote(
  contractAddress: Bytes,
  tokenId: BigInt,
  gauge: Bytes,
  owner: Bytes,
  weight: BigInt,
  timestamp: BigInt,
): void {
  const id = voteId(contractAddress, tokenId, gauge)
  let vote = Vote.load(id)
  if (vote == null) {
    vote = new Vote(id)
    vote.voterContract = contractAddress
    vote.tokenId = tokenId
    vote.gauge = gauge
  }
  vote.owner = owner
  vote.currentWeight = weight
  vote.lastUpdatedEpoch = epochStart(timestamp)
  vote.lastUpdatedAt = timestamp
  vote.isActive = weight.gt(ZERO)
  vote.save()
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

const SYSTEM_ACTION_TYPES: string[] = [
  PERIOD_UPDATED,
  EPOCH_PROCESSED,
  EMISSIONS_ENABLED,
  REBASE_CHECKPOINT,
  MERKLE_DISTRIBUTION_ADDED,
  PROTOCOL_YIELD_RECEIVED,
  STRATEGY_YIELD_RECEIVED,
  PCV_DISTRIBUTION,
  PCV_DEBT_PAYMENT,
]

function isSystemActionType(actionType: string): boolean {
  for (let i = 0; i < SYSTEM_ACTION_TYPES.length; i++) {
    if (SYSTEM_ACTION_TYPES[i] == actionType) return true
  }
  return false
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
    stats.systemEvents = ZERO
  }

  stats.totalEvents = stats.totalEvents.plus(ONE)
  if (isSystemActionType(actionType)) {
    stats.systemEvents = stats.systemEvents.plus(ONE)
  }
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
