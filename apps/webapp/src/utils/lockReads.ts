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

/** The wording every page uses for a lock value whose reads failed. */
export const LOCK_UNAVAILABLE_LABEL = "Unavailable"

/** Why an action on a lock with failed reads is disabled. */
export const LOCK_DATA_UNAVAILABLE_REASON = "Lock data unavailable. Try again."

/** How often the lock hooks re-read while a read has failed. */
export const LOCK_READ_RETRY_INTERVAL_MS = 15_000

type LockDataFlag = Pick<LockReadFields, "hasLockData">

export function hasUnavailableLock(locks: readonly LockDataFlag[]): boolean {
  return locks.some((lock) => !lock.hasLockData)
}

/**
 * Sum a lock field across locks. Returns null when any lock's reads have not
 * returned: a total that silently includes a zero fallback is not a total, so
 * the page shows "Unavailable" instead.
 */
export function sumLockField<T extends LockDataFlag>(
  locks: readonly T[],
  pick: (lock: T) => bigint,
): bigint | null {
  let total = 0n
  for (const lock of locks) {
    if (!lock.hasLockData) {
      return null
    }
    total += pick(lock)
  }
  return total
}

/**
 * The reason an action built from these locks must not run, or null when it
 * may. `readsFailed` covers the page's other per-lock reads (vote state, prior
 * votes) that size or gate the same action.
 */
export function getLockActionBlockReason({
  locks,
  readsFailed = false,
}: {
  locks: readonly LockDataFlag[]
  readsFailed?: boolean
}): string | null {
  return readsFailed || hasUnavailableLock(locks)
    ? LOCK_DATA_UNAVAILABLE_REASON
    : null
}

type ReadResultStatus = { status: string } | undefined

/** True when any contract read in a `useReadContracts` result failed. */
export function hasFailedRead(
  results: readonly ReadResultStatus[] | undefined,
): boolean {
  return results?.some((result) => result?.status === "failure") ?? false
}

/**
 * `refetchInterval` for lock reads: poll again while the query errored or any
 * read in it failed, so an unavailable lock recovers without a reload. A
 * multicall with `allowFailure` resolves successfully even when calls inside it
 * failed, so react-query's own retry never fires for those.
 */
export function lockReadRefetchInterval(state: {
  status: string
  data?: readonly ReadResultStatus[] | undefined
}): number | false {
  return state.status === "error" || hasFailedRead(state.data)
    ? LOCK_READ_RETRY_INTERVAL_MS
    : false
}

/** What a voting page read for one selected lock beyond the lock itself. */
export type SelectedLockVoteState = {
  /** Undefined when `lastVoted` or the epoch read failed. */
  hasVotedThisEpoch: boolean | undefined
  /** Undefined when `usedWeights` failed. */
  usedWeight: bigint | undefined
}

/**
 * True when, once loading has finished, a selected lock's vote state or prior
 * votes did not come back. The voting pages size ballots, optimizer inputs and
 * unpair lists from these, so a failure blocks the action like a failed lock
 * read does.
 */
export function selectedLockReadsFailed({
  isLoading,
  voteStates,
  priorVotesFailed,
}: {
  isLoading: boolean
  voteStates: readonly SelectedLockVoteState[]
  priorVotesFailed: boolean
}): boolean {
  if (isLoading || voteStates.length === 0) {
    return false
  }

  return (
    priorVotesFailed ||
    voteStates.some(
      (state) =>
        state.hasVotedThisEpoch === undefined || state.usedWeight === undefined,
    )
  )
}

export type BallotPrefillDecision = "prefill" | "wait" | "keep-ballot"

/**
 * Whether a voting page should load the selected locks' prior votes into the
 * ballot now.
 *
 * The ballot is prefilled once per selection, and only while the member has
 * not edited it under that selection: a refetch or a late recovery from failed
 * reads must never replace what they typed. Prefill waits while the reads are
 * loading or failed, so it never fills from fallback zeros.
 */
export function ballotPrefillDecision({
  selectionKey,
  prefilledSelectionKey,
  editedSelectionKey,
  isLoading,
  hasRows,
  readsFailed,
}: {
  /** The selected token ids, joined; "" when nothing is selected. */
  selectionKey: string
  /** The selection the ballot was last prefilled for. */
  prefilledSelectionKey: string
  /** The selection the member last edited the ballot under, or null. */
  editedSelectionKey: string | null
  isLoading: boolean
  hasRows: boolean
  readsFailed: boolean
}): BallotPrefillDecision {
  if (
    selectionKey === "" ||
    selectionKey === prefilledSelectionKey ||
    selectionKey === editedSelectionKey
  ) {
    return "keep-ballot"
  }

  return isLoading || !hasRows || readsFailed ? "wait" : "prefill"
}

/**
 * `refetchInterval` for a single `useReadContract` read the lock gates depend
 * on, such as the epoch reads: poll again only while it errored, so "Lock data
 * unavailable" clears without a reload once the RPC recovers.
 */
export function singleReadRefetchInterval(state: {
  status: string
}): number | false {
  return state.status === "error" ? LOCK_READ_RETRY_INTERVAL_MS : false
}
