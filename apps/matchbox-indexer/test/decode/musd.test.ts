import type { Address } from "viem"
import { describe, expect, it } from "vitest"
import musdTrovesAbi from "../../src/decode/abis/musd-troves"
import { troveKeysForLog } from "../../src/decode/dispatch"
import { interestOwed } from "../../src/decode/handlers/musd"
import { projectBlock } from "../../src/decode/projection"
import { InMemoryStore } from "../../src/decode/store"
import { logEntry } from "./entries"

// mUSD TroveUpdated history: each row's change against the borrower's
// previous update, with interest accrued by musd's InterestRateMath.

const BORROWER_OPERATIONS: Address =
  "0x44b1bac67dda612a41a58aaf779143b181dee031"
const TROVE_MANAGER: Address = "0x94afb503dbca74ac3e4929baceedfce19b93c193"
const BORROWER: Address = "0x00000000000000000000000000000000000b0b0b"
const E18 = 10n ** 18n
const YEAR = 31_556_952n
const T0 = 1_760_000_000n

type TroveArgs = {
  principal: bigint
  interest: bigint
  coll: bigint
  rate?: bigint
  updatedAt: bigint
  operation: number
}

let block = 1_000_000n

function troveUpdated(emitter: Address, args: TroveArgs, timestamp: bigint) {
  block += 1n
  return logEntry(
    musdTrovesAbi,
    "TroveUpdated",
    {
      _borrower: BORROWER,
      _principal: args.principal,
      _interest: args.interest,
      _coll: args.coll,
      _stake: args.coll,
      _interestRate: Number(args.rate ?? 100n),
      _lastInterestUpdateTime: args.updatedAt,
      _operation: args.operation,
    },
    { address: emitter, block, timestamp },
  )
}

function project(store: InMemoryStore, entry: ReturnType<typeof troveUpdated>) {
  expect(projectBlock([entry], store)).toBe(1)
  const update = store.troveUpdates.at(-1)
  if (update === undefined) throw new Error("no trove update")
  return update
}

describe("interestOwed", () => {
  it("matches musd InterestRateMath, flooring", () => {
    expect(interestOwed(2_000n * E18, 100n, T0, T0 + YEAR)).toBe(20n * E18)
    expect(interestOwed(1n, 100n, T0, T0 + YEAR)).toBe(0n)
    expect(interestOwed(2_000n * E18, 100n, T0, T0)).toBe(0n)
    expect(interestOwed(2_000n * E18, 100n, T0 + 1n, T0)).toBe(0n)
  })
})

describe("trove updates", () => {
  it("derives each operation's debt change from consecutive states", () => {
    const store = new InMemoryStore()
    const opened = project(
      store,
      troveUpdated(
        BORROWER_OPERATIONS,
        {
          principal: 2_000n * E18,
          interest: 0n,
          coll: E18,
          updatedAt: T0,
          operation: 0,
        },
        T0,
      ),
    )
    expect(opened).toMatchObject({
      action: "LOAN_OPENED",
      emitter: "BORROWER_OPERATIONS",
      borrower: BORROWER,
      prevPrincipal: null,
      accruedInterest: 0n,
      debtChange: 2_000n * E18,
      collChange: E18,
      interestRate: 100n,
    })

    // A year later, repay 500: 20 of interest first, then 480 of principal.
    const repaid = project(
      store,
      troveUpdated(
        BORROWER_OPERATIONS,
        {
          principal: 1_520n * E18,
          interest: 0n,
          coll: E18,
          updatedAt: T0 + YEAR,
          operation: 2,
        },
        T0 + YEAR,
      ),
    )
    expect(repaid).toMatchObject({
      action: "LOAN_REPAID",
      prevPrincipal: 2_000n * E18,
      accruedInterest: 20n * E18,
      debtChange: -500n * E18,
      collChange: 0n,
    })

    // Collateral only: interest is checkpointed, debt does not move.
    const later = T0 + YEAR + 86_400n
    const accrued = interestOwed(1_520n * E18, 100n, T0 + YEAR, later)
    const added = project(
      store,
      troveUpdated(
        BORROWER_OPERATIONS,
        {
          principal: 1_520n * E18,
          interest: accrued,
          coll: 2n * E18,
          updatedAt: later,
          operation: 2,
        },
        later,
      ),
    )
    expect(added).toMatchObject({
      action: "LOAN_COLL_ADDED",
      debtChange: 0n,
      collChange: E18,
    })

    // Redistribution applied by the TroveManager.
    const rewards = project(
      store,
      troveUpdated(
        TROVE_MANAGER,
        {
          principal: 1_600n * E18,
          interest: accrued,
          coll: 2n * E18 + 10n,
          updatedAt: later,
          operation: 0,
        },
        later,
      ),
    )
    expect(rewards).toMatchObject({
      action: "LOAN_REWARDS_APPLIED",
      emitter: "TROVE_MANAGER",
      debtChange: 80n * E18,
    })

    const borrowed = project(
      store,
      troveUpdated(
        BORROWER_OPERATIONS,
        {
          principal: 1_700n * E18,
          interest: accrued,
          coll: 2n * E18 + 10n,
          updatedAt: later,
          operation: 2,
        },
        later,
      ),
    )
    expect(borrowed.action).toBe("LOAN_BORROWED")

    // Closing zeroes the state, update time included: interest accrues to
    // the block's time.
    const closedAt = later + 3_600n
    const closed = project(
      store,
      troveUpdated(
        BORROWER_OPERATIONS,
        { principal: 0n, interest: 0n, coll: 0n, updatedAt: 0n, operation: 1 },
        closedAt,
      ),
    )
    const lastHour = interestOwed(1_700n * E18, 100n, later, closedAt)
    expect(closed).toMatchObject({
      action: "LOAN_CLOSED",
      accruedInterest: lastHour,
      debtChange: -(1_700n * E18 + accrued + lastHour),
      collChange: -(2n * E18 + 10n),
    })
  })

  it("keeps the interest a borrow's event reports as zero", () => {
    const store = new InMemoryStore()
    project(
      store,
      troveUpdated(
        BORROWER_OPERATIONS,
        {
          principal: 2_000n * E18,
          interest: 0n,
          coll: E18,
          updatedAt: T0,
          operation: 0,
        },
        T0,
      ),
    )
    // A year on, borrow 500: 20 of interest is owed, but BorrowerOperations
    // emits interest 0 after any debt increase.
    const borrowed = project(
      store,
      troveUpdated(
        BORROWER_OPERATIONS,
        {
          principal: 2_500n * E18,
          interest: 0n,
          coll: E18,
          updatedAt: T0 + YEAR,
          operation: 2,
        },
        T0 + YEAR,
      ),
    )
    expect(borrowed).toMatchObject({
      action: "LOAN_BORROWED",
      interest: 20n * E18,
      debtChange: 500n * E18,
    })
    // Repaying 520 in the same block clears the interest, then 500 of
    // principal: the payment, not 500.
    const repaid = project(
      store,
      troveUpdated(
        BORROWER_OPERATIONS,
        {
          principal: 2_000n * E18,
          interest: 0n,
          coll: E18,
          updatedAt: T0 + YEAR,
          operation: 2,
        },
        T0 + YEAR,
      ),
    )
    expect(repaid).toMatchObject({
      action: "LOAN_REPAID",
      debtChange: -520n * E18,
    })
  })

  it("classifies TroveManager liquidations and redemptions by operation", () => {
    const store = new InMemoryStore()
    project(
      store,
      troveUpdated(
        BORROWER_OPERATIONS,
        {
          principal: 2_000n * E18,
          interest: 0n,
          coll: E18,
          updatedAt: T0,
          operation: 0,
        },
        T0,
      ),
    )
    const redeemed = project(
      store,
      troveUpdated(
        TROVE_MANAGER,
        {
          principal: 1_000n * E18,
          interest: 0n,
          coll: E18 / 2n,
          updatedAt: T0,
          operation: 2,
        },
        T0,
      ),
    )
    expect(redeemed).toMatchObject({
      action: "LOAN_REDEEMED",
      debtChange: -1_000n * E18,
    })
    const liquidated = project(
      store,
      troveUpdated(
        TROVE_MANAGER,
        { principal: 0n, interest: 0n, coll: 0n, updatedAt: 0n, operation: 1 },
        T0,
      ),
    )
    expect(liquidated.action).toBe("LOAN_LIQUIDATED")
  })

  it("decodes the pre-1.0.2 event without a rate or accrual", () => {
    const store = new InMemoryStore()
    block += 1n
    const legacy = logEntry(
      musdTrovesAbi,
      "TroveUpdated",
      {
        _borrower: BORROWER,
        _principal: 1_800n * E18,
        _interest: 0n,
        _coll: E18,
        stake: E18,
        operation: 0,
      },
      { address: BORROWER_OPERATIONS, block, timestamp: T0 },
    )
    const opened = project(store, legacy)
    expect(opened).toMatchObject({
      action: "LOAN_OPENED",
      interestRate: null,
      lastInterestUpdateTime: null,
      accruedInterest: 0n,
    })
    block += 1n
    const adjusted = project(
      store,
      logEntry(
        musdTrovesAbi,
        "TroveUpdated",
        {
          _borrower: BORROWER,
          _principal: 1_700n * E18,
          _interest: 0n,
          _coll: E18,
          stake: E18,
          operation: 2,
        },
        { address: BORROWER_OPERATIONS, block, timestamp: T0 + 10n },
      ),
    )
    // Principal moved, so the repayment is known; the amount is not.
    expect(adjusted).toMatchObject({
      action: "LOAN_REPAID",
      accruedInterest: null,
      debtChange: null,
    })
  })

  it("prefetches the borrower of each TroveUpdated", () => {
    const entry = troveUpdated(
      TROVE_MANAGER,
      { principal: 1n, interest: 0n, coll: 1n, updatedAt: T0, operation: 0 },
      T0,
    )
    expect(troveKeysForLog(entry.log)).toEqual([BORROWER])
    expect(troveKeysForLog({ ...entry.log, blockNumber: 178_000n })).toEqual([])
  })
})
