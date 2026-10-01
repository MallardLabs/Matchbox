import { decodeEventLog } from "viem"
import type { RawLog, RawTx } from "../../ingest/rpc"
import votingEscrowAbi from "../abis/voting-escrow"
import {
  ACTION,
  BOOST_CONTEXT,
  MAXTIME,
  ONE,
  SOURCE,
  WEEK,
  ZERO,
  ZERO_ADDRESS,
} from "../constants"
import {
  type Handler,
  baseActivity,
  eventTopics,
  getOrCreateLock,
  lower,
  remainingDuration,
} from "../helpers"
import type { LockPositionRow } from "../rows"
import type { Store } from "../store"

// Port of apps/activity-subgraph/src/voting-escrow.ts (veMEZO and veBTC).

const CREATE_LOCK_TYPE = 1
const INCREASE_LOCK_AMOUNT_TYPE = 2
const INCREASE_UNLOCK_TIME_TYPE = 3

type LockSnapshot = {
  amount: bigint
  duration: bigint
  isPermanent: boolean
}

function snapshotLock(lock: LockPositionRow, blockTs: bigint): LockSnapshot {
  let duration = ZERO
  if (lock.isPermanent) {
    duration = MAXTIME
  } else if (lock.unlockAt !== null) {
    duration = remainingDuration(lock.unlockAt, blockTs)
  }
  return { amount: lock.amount, duration, isPermanent: lock.isPermanent }
}

const zeroSnapshot: LockSnapshot = {
  amount: ZERO,
  duration: ZERO,
  isPermanent: false,
}

function decode(log: RawLog) {
  return decodeEventLog({
    abi: votingEscrowAbi,
    topics: eventTopics(log),
    data: log.data,
  })
}

function handleDeposit(log: RawLog, tx: RawTx, store: Store): void {
  const event = decode(log)
  if (event.eventName !== "Deposit") return
  const params = event.args
  let actionType: string = ACTION.LOCK_AMOUNT_INCREASED
  if (params.depositType === CREATE_LOCK_TYPE) {
    actionType = ACTION.LOCK_CREATED
  } else if (params.depositType === INCREASE_UNLOCK_TIME_TYPE) {
    actionType = ACTION.LOCK_EXTENDED
  } else if (params.depositType === INCREASE_LOCK_AMOUNT_TYPE) {
    actionType = ACTION.LOCK_AMOUNT_INCREASED
  }

  const lock = getOrCreateLock(store, log.address, params.tokenId)
  const blockTs = log.blockTimestamp
  const prev =
    actionType === ACTION.LOCK_CREATED
      ? zeroSnapshot
      : snapshotLock(lock, blockTs)

  // `value` is the amount being added: the full amount on create, the delta
  // on increase, and 0 on extend.
  if (actionType === ACTION.LOCK_CREATED) {
    lock.amount = params.value
    lock.createdAt = blockTs
  } else {
    lock.amount = lock.amount + params.value
    if (lock.owner === null) {
      lock.owner = lower(params.provider)
    }
    if (actionType === ACTION.LOCK_EXTENDED) {
      lock.lastExtendedAt = blockTs
    }
  }
  lock.unlockAt = params.locktime
  lock.activityCount = lock.activityCount + ONE
  store.putLock(lock)

  const post = snapshotLock(lock, blockTs)

  const activity = baseActivity(
    log,
    tx,
    actionType,
    BOOST_CONTEXT.UNKNOWN,
    SOURCE.VOTING_ESCROW,
  )
  activity.actor = lower(params.provider)
  activity.tokenId = params.tokenId
  activity.amount = params.value
  activity.duration = params.locktime
  activity.prevAmount = prev.amount
  activity.prevDuration = prev.duration
  activity.prevIsPermanent = prev.isPermanent
  activity.postAmount = post.amount
  activity.postDuration = post.duration
  activity.postIsPermanent = post.isPermanent
  store.addActivity(activity)
}

// veMEZO emits a dedicated Merge event and no Deposit/Withdraw for merges,
// so all lock mutations for the merge happen here.
function handleMerge(log: RawLog, tx: RawTx, store: Store): void {
  const event = decode(log)
  if (event.eventName !== "Merge") return
  const params = event.args
  const blockTs = log.blockTimestamp

  const sourceLock = getOrCreateLock(store, log.address, params._from)
  const sourcePrev = snapshotLock(sourceLock, blockTs)
  const destLock = getOrCreateLock(store, log.address, params._to)
  const destPrev = snapshotLock(destLock, blockTs)

  destLock.amount = params._amountFinal
  destLock.unlockAt = params._locktime
  destLock.activityCount = destLock.activityCount + ONE
  store.putLock(destLock)
  const destPost = snapshotLock(destLock, blockTs)

  sourceLock.isMerged = true
  sourceLock.mergedIntoTokenId = params._to
  sourceLock.mergedAt = blockTs
  sourceLock.activityCount = sourceLock.activityCount + ONE
  store.putLock(sourceLock)

  // prev*/post* describe the source NFT's transition; mergeDestPrev* hold
  // the destination's pre-merge state.
  const activity = baseActivity(
    log,
    tx,
    ACTION.LOCK_MERGED,
    BOOST_CONTEXT.UNKNOWN,
    SOURCE.VOTING_ESCROW,
  )
  activity.actor = lower(params._sender)
  activity.tokenId = params._to
  activity.amount = params._amountFrom
  activity.duration = destPost.duration
  activity.prevAmount = sourcePrev.amount
  activity.prevDuration = sourcePrev.duration
  activity.prevIsPermanent = sourcePrev.isPermanent
  activity.postAmount = destPost.amount
  activity.postDuration = destPost.duration
  activity.postIsPermanent = destPost.isPermanent
  activity.mergeSourceTokenId = params._from
  activity.mergeDestTokenId = params._to
  activity.mergeDestPrevAmount = destPrev.amount
  activity.mergeDestPrevDuration = destPrev.duration
  activity.mergeDestPrevIsPermanent = destPrev.isPermanent
  store.addActivity(activity)
}

function handleLockPermanent(log: RawLog, tx: RawTx, store: Store): void {
  const event = decode(log)
  if (event.eventName !== "LockPermanent") return
  const params = event.args
  const lock = getOrCreateLock(store, log.address, params._tokenId)
  const blockTs = log.blockTimestamp
  const prev = snapshotLock(lock, blockTs)

  lock.owner = lower(params._owner)
  lock.isPermanent = true
  lock.activityCount = lock.activityCount + ONE
  store.putLock(lock)
  const post = snapshotLock(lock, blockTs)

  const activity = baseActivity(
    log,
    tx,
    ACTION.LOCK_PERMANENT,
    BOOST_CONTEXT.UNKNOWN,
    SOURCE.VOTING_ESCROW,
  )
  activity.actor = lower(params._owner)
  activity.tokenId = params._tokenId
  activity.amount = params.amount
  activity.duration = MAXTIME
  activity.prevAmount = prev.amount
  activity.prevDuration = prev.duration
  activity.prevIsPermanent = prev.isPermanent
  activity.postAmount = post.amount
  activity.postDuration = post.duration
  activity.postIsPermanent = post.isPermanent
  store.addActivity(activity)
}

function handleUnlockPermanent(log: RawLog, tx: RawTx, store: Store): void {
  const event = decode(log)
  if (event.eventName !== "UnlockPermanent") return
  const params = event.args
  const lock = getOrCreateLock(store, log.address, params._tokenId)
  const blockTs = log.blockTimestamp
  const prev = snapshotLock(lock, blockTs)

  lock.owner = lower(params._owner)
  lock.isPermanent = false
  // The contract resets the end to the next week boundary 4 years out; the
  // event does not carry it, so reconstruct it.
  lock.unlockAt = ((blockTs + MAXTIME) / WEEK) * WEEK
  lock.activityCount = lock.activityCount + ONE
  store.putLock(lock)
  const post = snapshotLock(lock, blockTs)

  const activity = baseActivity(
    log,
    tx,
    ACTION.LOCK_PERMANENT_UNLOCKED,
    BOOST_CONTEXT.UNKNOWN,
    SOURCE.VOTING_ESCROW,
  )
  activity.actor = lower(params._owner)
  activity.tokenId = params._tokenId
  activity.amount = params.amount
  activity.prevAmount = prev.amount
  activity.prevDuration = prev.duration
  activity.prevIsPermanent = prev.isPermanent
  activity.postAmount = post.amount
  activity.postDuration = post.duration
  activity.postIsPermanent = post.isPermanent
  store.addActivity(activity)
}

function handleWithdraw(log: RawLog, tx: RawTx, store: Store): void {
  const event = decode(log)
  if (event.eventName !== "Withdraw") return
  const params = event.args
  const lock = getOrCreateLock(store, log.address, params.tokenId)
  const blockTs = log.blockTimestamp
  const prev = snapshotLock(lock, blockTs)

  lock.owner = lower(params.provider)
  lock.amount = ZERO
  lock.withdrawnAt = blockTs
  lock.isWithdrawn = true
  lock.isPermanent = false
  lock.activityCount = lock.activityCount + ONE
  store.putLock(lock)
  const post = snapshotLock(lock, blockTs)

  const activity = baseActivity(
    log,
    tx,
    ACTION.LOCK_WITHDRAWN,
    BOOST_CONTEXT.UNKNOWN,
    SOURCE.VOTING_ESCROW,
  )
  activity.actor = lower(params.provider)
  activity.tokenId = params.tokenId
  activity.amount = params.value
  activity.prevAmount = prev.amount
  activity.prevDuration = prev.duration
  activity.prevIsPermanent = prev.isPermanent
  activity.postAmount = post.amount
  activity.postDuration = post.duration
  activity.postIsPermanent = post.isPermanent
  store.addActivity(activity)
}

function handleTransfer(log: RawLog, tx: RawTx, store: Store): void {
  const event = decode(log)
  if (event.eventName !== "Transfer") return
  const params = event.args
  const lock = getOrCreateLock(store, log.address, params.tokenId)
  lock.owner = lower(params.to)
  store.putLock(lock)

  // Mints pair with a Deposit and burns with Withdraw or Merge, which record
  // their own semantics. Only secondary moves become LOCK_TRANSFERRED.
  if (
    lower(params.from) === ZERO_ADDRESS ||
    lower(params.to) === ZERO_ADDRESS
  ) {
    return
  }
  const activity = baseActivity(
    log,
    tx,
    ACTION.LOCK_TRANSFERRED,
    BOOST_CONTEXT.UNKNOWN,
    SOURCE.VOTING_ESCROW,
  )
  activity.actor = lower(params.to)
  activity.recipient = lower(params.from)
  activity.tokenId = params.tokenId
  store.addActivity(activity)
}

function handleUpdateBoost(log: RawLog, _tx: RawTx, store: Store): void {
  const event = decode(log)
  if (event.eventName !== "UpdateBoost") return
  const lock = getOrCreateLock(store, log.address, event.args._tokenId)
  lock.boost = event.args._boost
  store.putLock(lock)
}

export const votingEscrowHandlers: Record<string, Handler> = {
  Deposit: handleDeposit,
  LockPermanent: handleLockPermanent,
  Merge: handleMerge,
  UnlockPermanent: handleUnlockPermanent,
  Withdraw: handleWithdraw,
  Transfer: handleTransfer,
  UpdateBoost: handleUpdateBoost,
}
