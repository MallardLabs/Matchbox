import { Bytes } from "@graphprotocol/graph-ts"
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
  LOCK_AMOUNT_INCREASED,
  LOCK_CREATED,
  LOCK_EXTENDED,
  LOCK_PERMANENT,
  LOCK_PERMANENT_UNLOCKED,
  LOCK_WITHDRAWN,
  ONE,
  saveActivity,
  ZERO,
  UNKNOWN,
  VOTING_ESCROW,
} from "./helpers"

const CREATE_LOCK_TYPE = 1
const INCREASE_LOCK_AMOUNT_TYPE = 2
const INCREASE_UNLOCK_TIME_TYPE = 3

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

  // For LOCK_CREATED, the preceding ERC-721 Transfer (mint from 0x0) has
  // already populated lock.owner with the NFT recipient. When a relayer or
  // claim handler creates the lock on behalf of a user (e.g. the merkle
  // ClaimAndLockHandler) the recipient differs from `provider`, and the
  // recipient is the meaningful "creator" of the lock. Use lock.owner as
  // the actor for LOCK_CREATED so simulator attribution lands on the user.
  const lock = getOrCreateLock(event.address, event.params.tokenId)
  let actor: Bytes = event.params.provider
  if (actionType == LOCK_CREATED) {
    const owner = lock.owner
    if (owner) {
      actor = owner
    }
  }

  const activity = baseActivity(event, actionType, UNKNOWN, VOTING_ESCROW)
  activity.actor = actor
  activity.tokenId = event.params.tokenId
  activity.amount = event.params.value
  activity.duration = event.params.locktime
  saveActivity(activity)

  const account = getOrCreateAccount(actor, event.block.timestamp)
  if (actionType == LOCK_CREATED) {
    account.lockCount = account.lockCount.plus(ONE)
  }
  account.save()

  if (actionType == LOCK_CREATED) {
    // Leave lock.owner as set by handleTransfer (the mint recipient).
    lock.createdAt = event.block.timestamp
  } else {
    lock.owner = event.params.provider
    if (actionType == LOCK_EXTENDED) {
      lock.lastExtendedAt = event.block.timestamp
    }
  }
  lock.amount = event.params.value
  lock.unlockAt = event.params.locktime
  lock.activityCount = lock.activityCount.plus(ONE)
  lock.save()
}

export function handleLockPermanent(event: LockPermanent): void {
  const activity = baseActivity(event, LOCK_PERMANENT, UNKNOWN, VOTING_ESCROW)
  activity.actor = event.params._owner
  activity.tokenId = event.params._tokenId
  activity.amount = event.params.amount
  saveActivity(activity)

  const lock = getOrCreateLock(event.address, event.params._tokenId)
  lock.owner = event.params._owner
  lock.isPermanent = true
  lock.activityCount = lock.activityCount.plus(ONE)
  lock.save()
}

export function handleUnlockPermanent(event: UnlockPermanent): void {
  const activity = baseActivity(event, LOCK_PERMANENT_UNLOCKED, UNKNOWN, VOTING_ESCROW)
  activity.actor = event.params._owner
  activity.tokenId = event.params._tokenId
  activity.amount = event.params.amount
  saveActivity(activity)

  const lock = getOrCreateLock(event.address, event.params._tokenId)
  lock.owner = event.params._owner
  lock.isPermanent = false
  lock.activityCount = lock.activityCount.plus(ONE)
  lock.save()
}

export function handleWithdraw(event: Withdraw): void {
  const activity = baseActivity(event, LOCK_WITHDRAWN, UNKNOWN, VOTING_ESCROW)
  activity.actor = event.params.provider
  activity.tokenId = event.params.tokenId
  activity.amount = event.params.value
  saveActivity(activity)

  const lock = getOrCreateLock(event.address, event.params.tokenId)
  lock.owner = event.params.provider
  lock.amount = ZERO
  lock.withdrawnAt = event.block.timestamp
  lock.isWithdrawn = true
  lock.activityCount = lock.activityCount.plus(ONE)
  lock.save()
}

export function handleTransfer(event: Transfer): void {
  const lock = getOrCreateLock(event.address, event.params.tokenId)
  lock.owner = event.params.to
  lock.save()
}

export function handleUpdateBoost(event: UpdateBoost): void {
  const lock = getOrCreateLock(event.address, event.params._tokenId)
  lock.boost = event.params._boost
  lock.save()
}
