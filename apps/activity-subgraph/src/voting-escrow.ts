import { Address } from "@graphprotocol/graph-ts"
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
  LOCK_TRANSFERRED,
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

  // actor = Deposit.provider for every depositType. Claim/grant flows have
  // `provider = relayer proxy` (e.g. MerkleClaimAndLockHandler), which is
  // blacklisted at the simulator level — receiving a granted lock is not
  // "creating a lock," only direct callers of createLock earn lock points.
  const activity = baseActivity(event, actionType, UNKNOWN, VOTING_ESCROW)
  activity.actor = event.params.provider
  activity.tokenId = event.params.tokenId
  activity.amount = event.params.value
  activity.duration = event.params.locktime
  saveActivity(activity)

  const account = getOrCreateAccount(event.params.provider, event.block.timestamp)
  if (actionType == LOCK_CREATED) {
    account.lockCount = account.lockCount.plus(ONE)
  }
  account.save()

  const lock = getOrCreateLock(event.address, event.params.tokenId)
  if (actionType == LOCK_CREATED) {
    // Do NOT overwrite lock.owner. The preceding ERC-721 Transfer (mint
    // from 0x0) has already set it to the NFT recipient, which may differ
    // from `provider` for grant/claim flows where a Safe or relayer is the
    // depositor. Activity.actor stays as `provider` (the relayer is
    // blacklisted, so no lock-creation credit), but lock.owner must stay
    // accurate so downstream BoostVoter actor-resolution attributes votes
    // to the real NFT owner.
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

  // Emit LOCK_TRANSFERRED only on secondary-market moves. Mints (from=0x0)
  // are paired with a Deposit that already attributes lock creation; burns
  // (to=0x0) accompany Withdraw, which records its own activity. Emitting
  // here would create noisy "phantom" transfer rows that the simulator
  // would mis-interpret as ownership changes against zero-address actors.
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
