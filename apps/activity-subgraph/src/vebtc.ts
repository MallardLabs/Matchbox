import {
  Deposit,
  LockPermanent,
  Merge,
  UnlockPermanent,
  UpdateBoost,
} from "../generated/VeBTC/VotingEscrow"
import { getOrCreateLock } from "./helpers"

export function handleVeBTCDeposit(event: Deposit): void {
  const lock = getOrCreateLock(event.address, event.params.tokenId)
  lock.lastVotingPowerChangeAt = event.block.timestamp
  lock.save()
}

export function handleVeBTCLockPermanent(event: LockPermanent): void {
  const lock = getOrCreateLock(event.address, event.params._tokenId)
  lock.lastVotingPowerChangeAt = event.block.timestamp
  lock.save()
}

export function handleVeBTCUnlockPermanent(event: UnlockPermanent): void {
  const lock = getOrCreateLock(event.address, event.params._tokenId)
  lock.lastVotingPowerChangeAt = event.block.timestamp
  lock.save()
}

export function handleVeBTCMerge(event: Merge): void {
  const sourceLock = getOrCreateLock(event.address, event.params._from)
  sourceLock.lastVotingPowerChangeAt = event.block.timestamp
  sourceLock.save()

  const destinationLock = getOrCreateLock(event.address, event.params._to)
  destinationLock.lastVotingPowerChangeAt = event.block.timestamp
  destinationLock.save()
}

export function handleVeBTCUpdateBoost(event: UpdateBoost): void {
  const lock = getOrCreateLock(event.address, event.params._tokenId)
  lock.boost = event.params._boost
  lock.lastVotingPowerChangeAt = event.block.timestamp
  lock.save()
}
