import { Address, BigInt } from "@graphprotocol/graph-ts"
import { LockPosition } from "../generated/schema"
import {
  Deposit,
  LockPermanent,
  Transfer,
  UnlockPermanent,
  UpdateBoost,
  Withdraw,
} from "../generated/VeMEZO/VotingEscrow"
import {
  baseActivity,
  getOrCreateAccount,
  getOrCreateLock,
  isMergeTx,
  lockId,
  LOCK_AMOUNT_INCREASED,
  LOCK_CREATED,
  LOCK_EXTENDED,
  LOCK_MERGED,
  LOCK_PERMANENT,
  LOCK_PERMANENT_UNLOCKED,
  LOCK_TRANSFERRED,
  LOCK_WITHDRAWN,
  MAXTIME,
  ONE,
  parseMergeArgs,
  remainingDuration,
  saveActivity,
  ZERO,
  UNKNOWN,
  VOTING_ESCROW,
} from "./helpers"

const CREATE_LOCK_TYPE = 1
const INCREASE_LOCK_AMOUNT_TYPE = 2
const INCREASE_UNLOCK_TIME_TYPE = 3

// Snapshot of a lock's ve-power-determining state. Used to populate the
// prev*/post* fields on activity events so the simulator can compute Δve =
// vePower(post) − vePower(prev) without replaying token history.
class LockSnapshot {
  amount: BigInt
  duration: BigInt
  isPermanent: boolean

  constructor(amount: BigInt, duration: BigInt, isPermanent: boolean) {
    this.amount = amount
    this.duration = duration
    this.isPermanent = isPermanent
  }
}

function snapshotLock(lock: LockPosition, blockTs: BigInt): LockSnapshot {
  let duration = ZERO
  if (lock.isPermanent) {
    duration = MAXTIME
  } else {
    const unlockAt = lock.unlockAt
    if (unlockAt !== null) {
      duration = remainingDuration(unlockAt, blockTs)
    }
  }
  return new LockSnapshot(lock.amount, duration, lock.isPermanent)
}

function zeroSnapshot(): LockSnapshot {
  return new LockSnapshot(ZERO, ZERO, false)
}

export function handleVotingEscrowDeposit(event: Deposit): void {
  const depositType = event.params.depositType
  let actionType = LOCK_AMOUNT_INCREASED

  if (depositType == CREATE_LOCK_TYPE) {
    actionType = LOCK_CREATED
  } else if (depositType == INCREASE_UNLOCK_TIME_TYPE) {
    actionType = LOCK_EXTENDED
  } else if (depositType == INCREASE_LOCK_AMOUNT_TYPE) {
    actionType = LOCK_AMOUNT_INCREASED
  }

  const lock = getOrCreateLock(event.address, event.params.tokenId)
  const blockTs = event.block.timestamp

  // Snapshot the destination's pre-event state for the activity's prev*
  // fields. For LOCK_CREATED the prev state is zero (token didn't exist).
  let prev: LockSnapshot =
    actionType == LOCK_CREATED ? zeroSnapshot() : snapshotLock(lock, blockTs)

  let isMergeDest = false
  let mergeSourceId: BigInt = ZERO
  let mergeDestPrev: LockSnapshot = zeroSnapshot()
  const merge = parseMergeArgs(event.transaction.input)
  if (
    merge !== null &&
    actionType != LOCK_CREATED &&
    actionType != LOCK_EXTENDED
  ) {
    const destArg = merge[1]
    if (destArg.equals(event.params.tokenId)) {
      // Re-attribute to LOCK_MERGED. The source NFT's pre-merge state
      // becomes the activity's prev* (this is the amount/duration whose
      // ve-power the user is effectively extending). The destination's
      // pre-state moves to mergeDestPrev* so the simulator can also credit
      // any duration delta on the dest's existing amount when the source's
      // end is later than the dest's.
      isMergeDest = true
      actionType = LOCK_MERGED
      mergeSourceId = merge[0]
      mergeDestPrev = prev
      const sourceLock = LockPosition.load(
        lockId(event.address, mergeSourceId),
      )
      prev = sourceLock !== null ? snapshotLock(sourceLock, blockTs) : zeroSnapshot()
    }
  }

  // Apply mutations to the destination lock so its post-state reflects this
  // event. `event.params.value` is the AMOUNT BEING ADDED (delta) in Curve-
  // style escrows: full create amount for CREATE_LOCK, source.amount for
  // MERGE_TYPE, added delta for INCREASE_LOCK_AMOUNT, and 0 for
  // INCREASE_UNLOCK_TIME. We accumulate it into lock.amount instead of
  // overwriting so the entity tracks the true running total.
  if (actionType == LOCK_CREATED) {
    lock.amount = event.params.value
    lock.createdAt = blockTs
    // The preceding ERC-721 Transfer (mint from 0x0) already set
    // lock.owner to the NFT recipient — preserve it.
  } else {
    lock.amount = lock.amount.plus(event.params.value)
    // For amount-increase / extend / merge-into-dest, the lock.owner was
    // initialized by the Transfer handler. Only fall back to provider if
    // owner is still unset (e.g., relayer-triggered create where the
    // Transfer hadn't fired yet — shouldn't happen, defensive).
    const currentOwner = lock.owner
    if (currentOwner === null) {
      lock.owner = event.params.provider
    }
    if (actionType == LOCK_EXTENDED) {
      lock.lastExtendedAt = blockTs
    }
  }
  // unlockAt is always the latest absolute timestamp. For permanent locks
  // the Mezo contract sets locktime = 0; the LockPermanent handler will set
  // unlockAt to a sentinel value (we use 0 to mean "permanent or never"
  // and rely on isPermanent to disambiguate).
  lock.unlockAt = event.params.locktime
  lock.activityCount = lock.activityCount.plus(ONE)
  lock.save()

  const post = snapshotLock(lock, blockTs)

  const activity = baseActivity(event, actionType, UNKNOWN, VOTING_ESCROW)
  // Actor for LOCK_MERGED is the merger (msg.sender = the NFT owner) which
  // equals event.params.provider for Mezo's merge() implementation. For
  // claim/grant flows on regular deposits the provider may be a relayer; the
  // simulator's blacklist filters those out, so we keep provider as actor.
  activity.actor = event.params.provider
  activity.tokenId = event.params.tokenId
  activity.amount = event.params.value
  activity.duration = event.params.locktime
  activity.prevAmount = prev.amount
  activity.prevDuration = prev.duration
  activity.prevIsPermanent = prev.isPermanent
  activity.postAmount = post.amount
  activity.postDuration = post.duration
  activity.postIsPermanent = post.isPermanent
  if (isMergeDest) {
    activity.mergeSourceTokenId = mergeSourceId
    activity.mergeDestTokenId = event.params.tokenId
    activity.mergeDestPrevAmount = mergeDestPrev.amount
    activity.mergeDestPrevDuration = mergeDestPrev.duration
    activity.mergeDestPrevIsPermanent = mergeDestPrev.isPermanent
  }
  saveActivity(activity)

  const account = getOrCreateAccount(event.params.provider, blockTs)
  if (actionType == LOCK_CREATED) {
    account.lockCount = account.lockCount.plus(ONE)
  }
  account.save()
}

export function handleLockPermanent(event: LockPermanent): void {
  const lock = getOrCreateLock(event.address, event.params._tokenId)
  const blockTs = event.block.timestamp
  const prev = snapshotLock(lock, blockTs)

  lock.owner = event.params._owner
  lock.isPermanent = true
  lock.activityCount = lock.activityCount.plus(ONE)
  lock.save()

  const post = snapshotLock(lock, blockTs)

  const activity = baseActivity(event, LOCK_PERMANENT, UNKNOWN, VOTING_ESCROW)
  activity.actor = event.params._owner
  activity.tokenId = event.params._tokenId
  activity.amount = event.params.amount
  // Surface the converted-to duration so downstream display can show "1y → 4y".
  activity.duration = MAXTIME
  activity.prevAmount = prev.amount
  activity.prevDuration = prev.duration
  activity.prevIsPermanent = prev.isPermanent
  activity.postAmount = post.amount
  activity.postDuration = post.duration
  activity.postIsPermanent = post.isPermanent
  saveActivity(activity)
}

export function handleUnlockPermanent(event: UnlockPermanent): void {
  const lock = getOrCreateLock(event.address, event.params._tokenId)
  const blockTs = event.block.timestamp
  const prev = snapshotLock(lock, blockTs)

  lock.owner = event.params._owner
  lock.isPermanent = false
  lock.activityCount = lock.activityCount.plus(ONE)
  lock.save()

  const post = snapshotLock(lock, blockTs)

  const activity = baseActivity(
    event,
    LOCK_PERMANENT_UNLOCKED,
    UNKNOWN,
    VOTING_ESCROW,
  )
  activity.actor = event.params._owner
  activity.tokenId = event.params._tokenId
  activity.amount = event.params.amount
  activity.prevAmount = prev.amount
  activity.prevDuration = prev.duration
  activity.prevIsPermanent = prev.isPermanent
  activity.postAmount = post.amount
  activity.postDuration = post.duration
  activity.postIsPermanent = post.isPermanent
  saveActivity(activity)
}

export function handleWithdraw(event: Withdraw): void {
  const lock = getOrCreateLock(event.address, event.params.tokenId)
  const blockTs = event.block.timestamp

  // Mezo's merge(from, to) burns the source NFT — depending on the contract
  // version this may or may not emit Withdraw. If we see a Withdraw inside a
  // merge tx, treat it as the bookkeeping side of the merge: mark the lock
  // as merged but preserve its pre-merge amount/unlockAt/isPermanent so the
  // destination's Deposit handler (firing later in the same tx) can read
  // them via LockPosition.load. We also skip emitting LOCK_WITHDRAWN so it
  // doesn't appear in the user's activity stream as a real exit.
  if (isMergeTx(event.transaction.input)) {
    const merge = parseMergeArgs(event.transaction.input)
    lock.isMerged = true
    if (merge !== null) {
      lock.mergedIntoTokenId = merge[1]
    }
    lock.mergedAt = blockTs
    lock.activityCount = lock.activityCount.plus(ONE)
    lock.save()
    return
  }

  const prev = snapshotLock(lock, blockTs)

  lock.owner = event.params.provider
  lock.amount = ZERO
  lock.withdrawnAt = blockTs
  lock.isWithdrawn = true
  lock.isPermanent = false
  lock.activityCount = lock.activityCount.plus(ONE)
  lock.save()

  const post = snapshotLock(lock, blockTs)

  const activity = baseActivity(event, LOCK_WITHDRAWN, UNKNOWN, VOTING_ESCROW)
  activity.actor = event.params.provider
  activity.tokenId = event.params.tokenId
  activity.amount = event.params.value
  activity.prevAmount = prev.amount
  activity.prevDuration = prev.duration
  activity.prevIsPermanent = prev.isPermanent
  activity.postAmount = post.amount
  activity.postDuration = post.duration
  activity.postIsPermanent = post.isPermanent
  saveActivity(activity)
}

export function handleTransfer(event: Transfer): void {
  const lock = getOrCreateLock(event.address, event.params.tokenId)
  lock.owner = event.params.to
  lock.save()

  // Emit LOCK_TRANSFERRED only on secondary-market moves. Mints (from=0x0)
  // are paired with a Deposit that already attributes lock creation; burns
  // (to=0x0) accompany Withdraw or merge() — both already record their own
  // semantics. Emitting here would create noisy "phantom" transfer rows
  // that the simulator would mis-interpret as ownership changes against
  // zero-address actors.
  const zero = Address.zero()
  if (event.params.from.equals(zero) || event.params.to.equals(zero)) {
    return
  }
  const activity = baseActivity(
    event,
    LOCK_TRANSFERRED,
    UNKNOWN,
    VOTING_ESCROW,
  )
  activity.actor = event.params.to
  activity.recipient = event.params.from
  activity.tokenId = event.params.tokenId
  saveActivity(activity)
}

export function handleUpdateBoost(event: UpdateBoost): void {
  const lock = getOrCreateLock(event.address, event.params._tokenId)
  lock.boost = event.params._boost
  lock.save()
}
