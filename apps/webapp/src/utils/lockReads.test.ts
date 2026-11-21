import { strict as assert } from "node:assert"
import { test } from "node:test"

import {
  LOCK_DATA_UNAVAILABLE_REASON,
  LOCK_READ_RETRY_INTERVAL_MS,
  ballotPrefillDecision,
  getCanVoteCell,
  getLockActionBlockReason,
  getLockStatus,
  hasFailedRead,
  hasUnavailableLock,
  lockReadRefetchInterval,
  selectedLockReadsFailed,
  singleReadRefetchInterval,
  sumLockField,
  toLockReadFields,
} from "./lockReads"

// veMEZO #191 and #64 on Mezo mainnet, read on 20 Nov 2026.
const NOW_MS = 1_795_222_724_000
const datedLock = {
  amount: 36_630_503_072_955_960_461_116n,
  end: 1_906_934_400n,
  isPermanent: false,
  boost: 0n,
}
const permanentLock = {
  amount: 73_170_450_196_094_418_332_947n,
  end: 0n,
  isPermanent: true,
  boost: 0n,
}

test("a failed locked read is unavailable, never an expired zero lock", () => {
  const fields = toLockReadFields(
    { status: "failure", error: new Error("rpc down") },
    { status: "failure", error: new Error("rpc down") },
  )

  assert.equal(fields.hasLockData, false)
  assert.equal(getLockStatus(fields, NOW_MS), "unavailable")
})

test("a read that has not returned yet is unavailable", () => {
  const fields = toLockReadFields(undefined, undefined)

  assert.equal(fields.hasLockData, false)
  assert.equal(getLockStatus(fields, NOW_MS), "unavailable")
})

test("a missing voting power read keeps the lock unavailable", () => {
  const fields = toLockReadFields(
    { status: "success", result: datedLock },
    { status: "failure" },
  )

  assert.equal(fields.amount, datedLock.amount)
  assert.equal(fields.hasLockData, false)
  assert.equal(getLockStatus(fields, NOW_MS), "unavailable")
})

test("a dated lock that ends in 2030 is active", () => {
  const fields = toLockReadFields(
    { status: "success", result: datedLock },
    { status: "success", result: 32_528_673_158_999_402_896_960n },
  )

  assert.equal(fields.hasLockData, true)
  assert.equal(fields.amount, datedLock.amount)
  assert.equal(fields.votingPower, 32_528_673_158_999_402_896_960n)
  assert.equal(getLockStatus(fields, NOW_MS), "active")
})

test("a permanent lock with end 0 is permanent, not expired", () => {
  const fields = toLockReadFields(
    { status: "success", result: permanentLock },
    { status: "success", result: permanentLock.amount },
  )

  assert.equal(getLockStatus(fields, NOW_MS), "permanent")
})

test("a dated lock past its end is expired", () => {
  const fields = toLockReadFields(
    { status: "success", result: { ...datedLock, end: 1_700_000_000n } },
    { status: "success", result: 0n },
  )

  assert.equal(getLockStatus(fields, NOW_MS), "expired")
})

// The member's six veMEZO locks from PR #50: voting power in MEZO, 18 decimals.
const MEZO = 10n ** 18n
const memberLocks = [
  { tokenId: 64n, votingPower: 73_170n * MEZO },
  { tokenId: 191n, votingPower: 32_528n * MEZO },
  { tokenId: 189n, votingPower: 35_558n * MEZO },
  { tokenId: 156n, votingPower: 61_155n * MEZO },
  { tokenId: 2306n, votingPower: 355_503n * MEZO },
  { tokenId: 2652n, votingPower: 55_121n * MEZO },
].map((lock) => ({ ...lock, hasLockData: true }))
const withFailedRead = memberLocks.map((lock) =>
  lock.tokenId === 2306n
    ? {
        ...lock,
        ...toLockReadFields(
          { status: "failure", error: new Error("rpc down") },
          { status: "failure", error: new Error("rpc down") },
        ),
      }
    : lock,
)

test("a total across locks is the sum when every lock read returned", () => {
  assert.equal(
    sumLockField(memberLocks, (lock) => lock.votingPower),
    613_035n * MEZO,
  )
  assert.equal(
    sumLockField([], (_lock: (typeof memberLocks)[0]) => 0n),
    0n,
  )
})

test("a total that includes an unavailable lock is unavailable, not short", () => {
  assert.equal(hasUnavailableLock(withFailedRead), true)
  assert.equal(
    sumLockField(withFailedRead, (lock) => lock.votingPower),
    null,
  )
})

test("vote, optimize and unpair are blocked while a selected lock is unavailable", () => {
  assert.equal(
    getLockActionBlockReason({ locks: withFailedRead }),
    LOCK_DATA_UNAVAILABLE_REASON,
  )
  // Deselecting the unavailable lock unblocks the others.
  assert.equal(
    getLockActionBlockReason({
      locks: withFailedRead.filter((lock) => lock.hasLockData),
    }),
    null,
  )
  assert.equal(getLockActionBlockReason({ locks: memberLocks }), null)
})

test("failed vote state reads block the action like a failed lock read", () => {
  assert.equal(
    getLockActionBlockReason({ locks: memberLocks, readsFailed: true }),
    LOCK_DATA_UNAVAILABLE_REASON,
  )
})

const votedState = { hasVotedThisEpoch: true, usedWeight: 32_528n * MEZO }
const freshState = { hasVotedThisEpoch: false, usedWeight: 0n }

test("vote state that returned, including a real zero used weight, is not a failure", () => {
  assert.equal(
    selectedLockReadsFailed({
      isLoading: false,
      voteStates: [votedState, freshState],
      priorVotesFailed: false,
    }),
    false,
  )
})

test("a failed lastVoted, usedWeights or votes read is a failure once loaded", () => {
  const failedLastVoted = { hasVotedThisEpoch: undefined, usedWeight: 0n }
  const failedUsedWeight = { hasVotedThisEpoch: true, usedWeight: undefined }

  for (const voteStates of [
    [votedState, failedLastVoted],
    [failedUsedWeight],
  ]) {
    assert.equal(
      selectedLockReadsFailed({
        isLoading: false,
        voteStates,
        priorVotesFailed: false,
      }),
      true,
    )
  }
  assert.equal(
    selectedLockReadsFailed({
      isLoading: false,
      voteStates: [votedState],
      priorVotesFailed: true,
    }),
    true,
  )
})

test("pending reads and an empty selection are not failures", () => {
  const pending = { hasVotedThisEpoch: undefined, usedWeight: undefined }
  assert.equal(
    selectedLockReadsFailed({
      isLoading: true,
      voteStates: [pending],
      priorVotesFailed: false,
    }),
    false,
  )
  assert.equal(
    selectedLockReadsFailed({
      isLoading: false,
      voteStates: [],
      priorVotesFailed: true,
    }),
    false,
  )
})

test("a multicall with one failed call keeps polling until it succeeds", () => {
  const partial = [
    { status: "success" },
    { status: "failure" },
    { status: "success" },
  ]
  assert.equal(hasFailedRead(partial), true)
  assert.equal(
    lockReadRefetchInterval({ status: "success", data: partial }),
    LOCK_READ_RETRY_INTERVAL_MS,
  )
  assert.equal(
    lockReadRefetchInterval({ status: "error", data: undefined }),
    LOCK_READ_RETRY_INTERVAL_MS,
  )
})

test("lock reads that all returned stop polling", () => {
  const ok = [{ status: "success" }, { status: "success" }]
  assert.equal(hasFailedRead(ok), false)
  assert.equal(hasFailedRead(undefined), false)
  assert.equal(lockReadRefetchInterval({ status: "success", data: ok }), false)
  assert.equal(
    lockReadRefetchInterval({ status: "pending", data: undefined }),
    false,
  )
})

// veMEZO #191 selected; the ballot reads have returned unless a case says so.
const prefillBase = {
  selectionKey: "191",
  prefilledSelectionKey: "",
  editedSelectionKey: null,
  isLoading: false,
  hasRows: true,
  readsFailed: false,
}

test("a new selection prefills the ballot once its reads return", () => {
  assert.equal(ballotPrefillDecision(prefillBase), "prefill")
  assert.equal(
    ballotPrefillDecision({ ...prefillBase, prefilledSelectionKey: "191" }),
    "keep-ballot",
  )
})

test("the ballot waits while the selected reads load or failed", () => {
  assert.equal(
    ballotPrefillDecision({ ...prefillBase, isLoading: true }),
    "wait",
  )
  assert.equal(
    ballotPrefillDecision({ ...prefillBase, hasRows: false }),
    "wait",
  )
  assert.equal(
    ballotPrefillDecision({ ...prefillBase, readsFailed: true }),
    "wait",
  )
})

test("a late recovery of failed reads keeps the ballot the member typed", () => {
  // The votes read failed, so nothing was prefilled, and the member edited.
  const edited = { ...prefillBase, editedSelectionKey: "191" }

  assert.equal(
    ballotPrefillDecision({ ...edited, readsFailed: true }),
    "keep-ballot",
  )
  assert.equal(ballotPrefillDecision(edited), "keep-ballot")
})

test("an edit under one selection does not stop the next selection prefilling", () => {
  assert.equal(
    ballotPrefillDecision({
      ...prefillBase,
      selectionKey: "64,191",
      prefilledSelectionKey: "191",
      editedSelectionKey: "191",
    }),
    "prefill",
  )
})

test("an empty selection never prefills", () => {
  assert.equal(
    ballotPrefillDecision({ ...prefillBase, selectionKey: "" }),
    "keep-ballot",
  )
})

test("a failed epoch read is re-read on a timer until it returns", () => {
  assert.equal(
    singleReadRefetchInterval({ status: "error" }),
    LOCK_READ_RETRY_INTERVAL_MS,
  )
  assert.equal(singleReadRefetchInterval({ status: "pending" }), false)
  assert.equal(singleReadRefetchInterval({ status: "success" }), false)
})

test("the Can Vote cell shows loading, not Unavailable, while a read is pending", () => {
  // MEZO Gauges: lastVoted returned but epochStart is still loading, so
  // hasVotedThisEpoch is not known yet.
  assert.equal(
    getCanVoteCell({
      isLoading: true,
      canVote: false,
      hasVotedThisEpoch: undefined,
    }),
    "loading",
  )
})

test("the Can Vote cell shows Unavailable only once a read has failed", () => {
  assert.equal(
    getCanVoteCell({
      isLoading: false,
      canVote: false,
      hasVotedThisEpoch: undefined,
    }),
    "unavailable",
  )
  assert.equal(
    getCanVoteCell({
      isLoading: false,
      canVote: true,
      hasVotedThisEpoch: false,
    }),
    "vote-now",
  )
  assert.equal(
    getCanVoteCell({
      isLoading: false,
      canVote: false,
      hasVotedThisEpoch: true,
    }),
    "voted",
  )
  assert.equal(
    getCanVoteCell({
      isLoading: false,
      canVote: false,
      hasVotedThisEpoch: false,
    }),
    "window-closed",
  )
})
