import type { LockState, VoteLock } from "./model"

const DAY = 86_400n

export type LockInput = {
  tokenId: bigint
  votingPower: bigint
  end: bigint
  isPermanent: boolean
  /** Managed NFT this lock was deposited into, or 0n. */
  managedBy: bigint
  /** From this branch's voter; undefined while loading. */
  lastVoted: bigint | undefined
}

/** "Unlocks in 1y 4mo" style countdown, never rounding up past the real date. */
export function unlockLabel(end: bigint, nowSeconds: bigint): string {
  const remaining = end - nowSeconds
  if (remaining <= 0n) return "Expired"
  const days = remaining / DAY > 0n ? remaining / DAY : 1n
  const years = days / 365n
  const months = (days % 365n) / 30n
  const rest = (days % 365n) % 30n
  if (years > 0n) return `Unlocks in ${years}y${months ? ` ${months}mo` : ""}`
  if (months > 0n) return `Unlocks in ${months}mo${rest ? ` ${rest}d` : ""}`
  return `Unlocks in ${rest}d`
}

export function lockState(
  lock: LockInput,
  epochStart: bigint | undefined,
  nowSeconds: bigint,
): LockState {
  if (lock.managedBy > 0n) return "managed"
  if (!lock.isPermanent && lock.end > 0n && lock.end <= nowSeconds)
    return "expired"
  if (lock.votingPower === 0n) return "empty"
  if (
    lock.lastVoted !== undefined &&
    epochStart !== undefined &&
    lock.lastVoted >= epochStart
  )
    return "voted"
  return "votable"
}

/** "2d 14h" / "17h 14m" / "9m" until a timestamp. */
export function countdown(to: bigint, nowSeconds: bigint): string {
  const seconds = to > nowSeconds ? to - nowSeconds : 0n
  const days = seconds / DAY
  const hours = (seconds % DAY) / 3_600n
  const minutes = (seconds % 3_600n) / 60n
  if (days > 0n) return `${days}d ${hours}h`
  if (hours > 0n) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

export function toVoteLock(
  lock: LockInput,
  epochStart: bigint | undefined,
  nowSeconds: bigint,
  epochNext?: bigint,
): VoteLock {
  const state = lockState(lock, epochStart, nowSeconds)
  let detail: string
  if (state === "managed") detail = `Managed by #${lock.managedBy}`
  else if (state === "expired") detail = "Expired"
  else if (state === "empty") detail = "No voting power"
  else if (state === "voted")
    // One vote per lock per epoch: say when it can vote again.
    detail =
      epochNext !== undefined
        ? `Voted · next in ${countdown(epochNext, nowSeconds)}`
        : "Voted this epoch"
  else if (lock.isPermanent) detail = "Auto max-locked"
  else detail = unlockLabel(lock.end, nowSeconds)
  return {
    tokenId: lock.tokenId,
    votingPower: lock.votingPower,
    state,
    detail,
  }
}

export type VotingWindow = "opens-soon" | "open" | "closing" | "unknown"

/**
 * Votes revert in the first hour of an epoch (distribution) and, unless the
 * NFT is whitelisted, in the last hour.
 */
export function votingWindow(
  epochStart: bigint | undefined,
  epochNext: bigint | undefined,
  nowSeconds: bigint,
): VotingWindow {
  if (epochStart === undefined || epochNext === undefined) return "unknown"
  if (nowSeconds <= epochStart + 3_600n) return "opens-soon"
  if (nowSeconds > epochNext - 3_600n) return "closing"
  return "open"
}
