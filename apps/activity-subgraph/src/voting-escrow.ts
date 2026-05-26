import { Address, BigInt } from "@graphprotocol/graph-ts"
import { LockPosition } from "../generated/schema"
import {
  Deposit,
  LockPermanent,
  Merge,
  Transfer,
  UnlockPermanent,
  UpdateBoost,
  Withdraw,
} from "../generated/VeMEZO/VotingEscrow"
import {
  baseActivity,
  getOrCreateAccount,
  getOrCreateLock,
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
  remainingDuration,
  saveActivity,
  WEEK,
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
  const prev: LockSnapshot =
    actionType == LOCK_CREATED ? zeroSnapshot() : snapshotLock(lock, blockTs)

  // Mezo's veMEZO does NOT route merges through Deposit — merge() emits a
  // dedicated `Merge` event handled by handleMerge below. So unlike
  // Velodrome v2, we don't need to sniff merge() calldata here.

  // Apply mutations to the destination lock so its post-state reflects this
  // event. `event.params.value` is the AMOUNT BEING ADDED (delta) in Curve-
  // style escrows: full create amount for CREATE_LOCK, added delta for
  // INCREASE_LOCK_AMOUNT, and 0 for INCREASE_UNLOCK_TIME.
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
  saveActivity(activity)

  const account = getOrCreateAccount(event.params.provider, blockTs)
  if (actionType == LOCK_CREATED) {
    account.lockCount = account.lockCount.plus(ONE)
  }
  account.save()
}

export function handleMerge(event: Merge): void {
  // Mezo's veMEZO emits a dedicated Merge event (rather than Velodrome's
  // Deposit + Withdraw pattern). Params describe the full transition:
  //   _sender      = msg.sender (the NFT owner doing the merge)
  //   _from / _to  = source / destination tokenIds
  //   _amountFrom  = source's pre-merge amount
  //   _amountTo    = destination's pre-merge amount
  //   _amountFinal = destination's post-merge amount (== from + to)
  //   _locktime    = destination's new unlockAt (0 when dest is permanent)
  //   _ts          = block.timestamp
  //
  // We do NOT receive a separate Deposit or Withdraw for this tx, so all
  // entity mutations must happen here.

  const blockTs = event.block.timestamp
  const fromTokenId = event.params._from
  const toTokenId = event.params._to

  // Snapshot source pre-burn.
  const sourceLock = getOrCreateLock(event.address, fromTokenId)
  const sourcePrev = snapshotLock(sourceLock, blockTs)

  // Snapshot destination pre-merge.
  const destLock = getOrCreateLock(event.address, toTokenId)
  const destPrev = snapshotLock(destLock, blockTs)

  // Update destination with the merged state. The contract preserves the
  // destination's isPermanent flag (you can't merge into a non-permanent
  // and have it become permanent via merge alone). For non-permanent
  // destinations the new unlockAt is max(source.end, dest.end), which the
  // contract surfaces directly as _locktime.
  destLock.amount = event.params._amountFinal
  destLock.unlockAt = event.params._locktime
  destLock.activityCount = destLock.activityCount.plus(ONE)
  destLock.save()

  const destPost = snapshotLock(destLock, blockTs)

  // Mark source as merged. The contract burns the source NFT (Transfer to
  // 0x0) but does NOT emit Withdraw, so the source's amount/unlockAt are
  // already stale; we just flag them. Preserve the historical amount so
  // downstream analytics can still attribute the absorbed value.
  sourceLock.isMerged = true
  sourceLock.mergedIntoTokenId = toTokenId
  sourceLock.mergedAt = blockTs
  sourceLock.activityCount = sourceLock.activityCount.plus(ONE)
  sourceLock.save()

  // Emit the LOCK_MERGED activity on the destination tokenId. prev*/post*
  // describe the SOURCE NFT's transition (its amount × prevDur → postDur),
  // which is the half of the merge that the simulator's source-extension
  // credit reads. mergeDestPrev* captures the destination's pre-merge
  // state so the simulator can also credit dest-side extension when the
  // source's end pushes the destination further out.
  const activity = baseActivity(event, LOCK_MERGED, UNKNOWN, VOTING_ESCROW)
  activity.actor = event.params._sender
  activity.tokenId = toTokenId
  activity.amount = event.params._amountFrom
  activity.duration = destPost.duration
  activity.prevAmount = sourcePrev.amount
  activity.prevDuration = sourcePrev.duration
  activity.prevIsPermanent = sourcePrev.isPermanent
  activity.postAmount = destPost.amount
  activity.postDuration = destPost.duration
  activity.postIsPermanent = destPost.isPermanent
  activity.mergeSourceTokenId = fromTokenId
  activity.mergeDestTokenId = toTokenId
  activity.mergeDestPrevAmount = destPrev.amount
  activity.mergeDestPrevDuration = destPrev.duration
  activity.mergeDestPrevIsPermanent = destPrev.isPermanent
  saveActivity(activity)
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
  // Velodrome-style veNFTs reset `locked.end = ((blockTs + MAXTIME) / WEEK) *
  // WEEK` when a permanent lock is unlocked — i.e. the NFT immediately has
  // ~4 years remaining again. The UnlockPermanent event doesn't include the
  // new end timestamp, so we reconstruct it here. Without this, lock.unlockAt
  // keeps its stale "permanent sentinel" (0) and any subsequent event sees
  // prevDuration = 0, which makes a quick `unlockPermanent → lockPermanent`
  // round-trip earn the lock's full ve-power as if it were a fresh extension.
  lock.unlockAt = blockTs.plus(MAXTIME).div(WEEK).times(WEEK)
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

  // Mezo's veMEZO does not emit Withdraw during merge() — the source NFT is
  // burned via _burn (Transfer to 0x0) and the merge bookkeeping happens in
  // the dedicated Merge event (see handleMerge). So any Withdraw we see here
  // is a real user-initiated exit.

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
