import { strict as assert } from "node:assert"
import { test } from "node:test"

import { getLockStatus, toLockReadFields } from "./lockReads"

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
