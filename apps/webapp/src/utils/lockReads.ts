/**
 * Turn the per-lock contract reads from `useReadContracts` into the fields the
 * lock cards render.
 *
 * A read that failed or has not returned is not a zero balance: the fields fall
 * back to zero only so totals stay numeric, and `hasLockData` stays false so the
 * UI shows the lock as unavailable instead of "0 MEZO, Expired".
 */

export type LockedBalanceResult = {
  amount: bigint
  end: bigint
  isPermanent: boolean
  boost: bigint
}

type ContractReadResult =
  | { status: "success"; result: unknown }
  | { status: "failure"; error?: unknown; result?: undefined }
  | undefined

export type LockReadFields = {
  amount: bigint
  end: bigint
  isPermanent: boolean
  boost: bigint
  votingPower: bigint
  /** True only when both `locked` and `votingPowerOfNFT` returned. */
  hasLockData: boolean
}

function successResult(read: ContractReadResult): unknown {
  return read?.status === "success" ? read.result : undefined
}

function isLockedBalance(value: unknown): value is LockedBalanceResult {
  if (!value || typeof value !== "object") {
    return false
  }

  const candidate = value as Partial<LockedBalanceResult>
  return (
    typeof candidate.amount === "bigint" &&
    typeof candidate.end === "bigint" &&
    typeof candidate.isPermanent === "boolean"
  )
}

export function toLockReadFields(
  lockedRead: ContractReadResult,
  votingPowerRead: ContractReadResult,
): LockReadFields {
  const locked = successResult(lockedRead)
  const votingPower = successResult(votingPowerRead)
  const lockedBalance = isLockedBalance(locked) ? locked : undefined
  const votingPowerValue =
    typeof votingPower === "bigint" ? votingPower : undefined

  return {
    amount: lockedBalance?.amount ?? 0n,
    end: lockedBalance?.end ?? 0n,
    isPermanent: lockedBalance?.isPermanent ?? false,
    boost: typeof lockedBalance?.boost === "bigint" ? lockedBalance.boost : 0n,
    votingPower: votingPowerValue ?? 0n,
    hasLockData: lockedBalance !== undefined && votingPowerValue !== undefined,
  }
}

export type LockStatus = "unavailable" | "permanent" | "expired" | "active"

export function getLockStatus(
  lock: Pick<LockReadFields, "end" | "isPermanent" | "hasLockData">,
  nowMs: number,
): LockStatus {
  if (!lock.hasLockData) {
    return "unavailable"
  }

  if (lock.isPermanent) {
    return "permanent"
  }

  return Number(lock.end) * 1000 < nowMs ? "expired" : "active"
}
