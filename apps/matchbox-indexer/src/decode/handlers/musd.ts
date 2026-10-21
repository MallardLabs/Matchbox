import { type Address, decodeEventLog } from "viem"
import type { RawLog, RawTx } from "../../ingest/rpc"
import musdTrovesAbi from "../abis/musd-troves"
import { type Handler, eventTopics, lower } from "../helpers"
import type { TroveAction, TroveEmitter, TroveUpdateRow } from "../rows"
import type { Store } from "../store"

// Warehouse-only: mUSD trove history ("Recent repayments"). Every
// TroveUpdated carries the trove's state after the operation (except the
// interest after a borrow, see below). The change is that state minus the
// previous one plus the interest accrued in between, using musd's
// InterestRateMath, so no receipt or calldata is needed.
//
// The accrual matches the contract to the wei, except across an interest
// checkpoint that emitted no event (TroveManager.updateSystemAndTroveInterest
// is public): splitting one period floors twice, so debtChange can be off by
// at most 1 wei per such checkpoint. Redistributed debt is only seen through
// TroveManager's applyPendingRewards event.

const SECONDS_IN_A_YEAR = 31_556_952n
const BPS = 10_000n

// musd InterestRateMath.calculateInterestOwed.
export function interestOwed(
  principal: bigint,
  interestRate: bigint,
  startTime: bigint,
  endTime: bigint,
): bigint {
  if (endTime <= startTime) return 0n
  return (
    (principal * interestRate * (endTime - startTime)) /
    (BPS * SECONDS_IN_A_YEAR)
  )
}

type TroveState = {
  borrower: Address
  principal: bigint
  interest: bigint
  coll: bigint
  stake: bigint
  interestRate: bigint | null
  lastInterestUpdateTime: bigint | null
  operation: number
}

function decodeTroveUpdated(log: RawLog): TroveState | null {
  const event = decodeEventLog({
    abi: musdTrovesAbi,
    topics: eventTopics(log),
    data: log.data,
  })
  if (event.eventName !== "TroveUpdated") return null
  const args = event.args
  if ("_lastInterestUpdateTime" in args) {
    return {
      borrower: lower(args._borrower),
      principal: args._principal,
      interest: args._interest,
      coll: args._coll,
      stake: args._stake,
      interestRate: BigInt(args._interestRate),
      lastInterestUpdateTime: args._lastInterestUpdateTime,
      operation: args._operation,
    }
  }
  return {
    borrower: lower(args._borrower),
    principal: args._principal,
    interest: args._interest,
    coll: args._coll,
    stake: args.stake,
    interestRate: null,
    lastInterestUpdateTime: null,
    operation: args.operation,
  }
}

// BorrowerOperations: 0 openTrove, 1 closeTrove, 2 adjustTrove (classified
// by its change), 3 refinanceTrove. TroveManager: 0 applyPendingRewards,
// 1 liquidate, 2 redeemCollateral.
const BORROWER_OPERATIONS_ACTIONS: ReadonlyMap<number, TroveAction> = new Map([
  [0, "LOAN_OPENED"],
  [1, "LOAN_CLOSED"],
  [3, "LOAN_REFINANCED"],
])
const TROVE_MANAGER_ACTIONS: ReadonlyMap<number, TroveAction> = new Map([
  [0, "LOAN_REWARDS_APPLIED"],
  [1, "LOAN_LIQUIDATED"],
  [2, "LOAN_REDEEMED"],
])

type Change = {
  principal: bigint | null
  debt: bigint | null
  coll: bigint | null
}

// An adjustTrove by what moved. Principal has no accrual, so its sign is
// exact; a payment smaller than the interest owed moves only interest.
function classifyAdjust(change: Change): TroveAction {
  if (change.principal === null) return "LOAN_ADJUSTED"
  if (change.principal < 0n) return "LOAN_REPAID"
  if (change.principal > 0n) return "LOAN_BORROWED"
  if (change.coll !== null && change.coll > 0n) return "LOAN_COLL_ADDED"
  if (change.coll !== null && change.coll < 0n) return "LOAN_COLL_WITHDRAWN"
  if (change.debt !== null && change.debt < 0n) return "LOAN_REPAID"
  return "LOAN_ADJUSTED"
}

function classify(
  emitter: TroveEmitter,
  operation: number,
  change: Change,
): TroveAction {
  if (emitter === "TROVE_MANAGER") {
    return TROVE_MANAGER_ACTIONS.get(operation) ?? "LOAN_UNKNOWN"
  }
  if (operation === 2) return classifyAdjust(change)
  return BORROWER_OPERATIONS_ACTIONS.get(operation) ?? "LOAN_UNKNOWN"
}

function troveUpdatedHandler(emitter: TroveEmitter): Handler {
  return function handleTroveUpdated(
    log: RawLog,
    tx: RawTx,
    store: Store,
  ): void {
    const state = decodeTroveUpdated(log)
    if (state === null) return
    const prev = store.getTrove(state.borrower)
    const opening = emitter === "BORROWER_OPERATIONS" && state.operation === 0

    // A closed, liquidated or fully redeemed trove reports zeros, including
    // its update time; its interest was brought current at this block.
    const accrualEnd =
      state.lastInterestUpdateTime !== null && state.lastInterestUpdateTime > 0n
        ? state.lastInterestUpdateTime
        : log.blockTimestamp
    let accrued: bigint | null = null
    if (prev === undefined) {
      accrued = opening ? 0n : null
    } else if (
      prev.interestRate !== null &&
      prev.lastInterestUpdateTime !== null &&
      state.lastInterestUpdateTime !== null
    ) {
      accrued = interestOwed(
        prev.principal,
        prev.interestRate,
        prev.lastInterestUpdateTime,
        accrualEnd,
      )
    }

    const prevPrincipal = prev?.principal ?? (opening ? 0n : null)
    const prevInterest = prev?.interest ?? (opening ? 0n : null)
    const prevColl = prev?.coll ?? (opening ? 0n : null)
    const debtBefore =
      prevPrincipal === null || prevInterest === null || accrued === null
        ? null
        : prevPrincipal + prevInterest + accrued

    // BorrowerOperations reports interest 0 after any debt increase
    // (_updateTroveFromAdjustment never sets newInterest on that branch). A
    // borrow pays no interest, so the trove still owes its previous interest
    // plus the accrual; keep that, or the next repayment would look smaller.
    const borrowed =
      emitter === "BORROWER_OPERATIONS" &&
      state.operation === 2 &&
      prevPrincipal !== null &&
      state.principal > prevPrincipal
    const interest =
      borrowed && prevInterest !== null && accrued !== null
        ? prevInterest + accrued
        : state.interest

    const change: Change = {
      principal:
        prevPrincipal === null ? null : state.principal - prevPrincipal,
      debt:
        debtBefore === null ? null : state.principal + interest - debtBefore,
      coll: prevColl === null ? null : state.coll - prevColl,
    }

    const update: TroveUpdateRow = {
      txHash: lower(log.txHash),
      logIndex: BigInt(log.logIndex),
      blockNumber: log.blockNumber,
      timestamp: log.blockTimestamp,
      txFrom: lower(tx.from),
      contractAddress: lower(log.address),
      emitter,
      borrower: state.borrower,
      operation: state.operation,
      action: classify(emitter, state.operation, change),
      principal: state.principal,
      interest,
      coll: state.coll,
      stake: state.stake,
      interestRate: state.interestRate,
      lastInterestUpdateTime: state.lastInterestUpdateTime,
      prevPrincipal: prev?.principal ?? null,
      prevInterest: prev?.interest ?? null,
      prevColl: prev?.coll ?? null,
      accruedInterest: accrued,
      debtChange: change.debt,
      collChange: change.coll,
    }
    store.addTroveUpdate(update)
  }
}

export const musdBorrowerOperationsHandlers: Record<string, Handler> = {
  TroveUpdated: troveUpdatedHandler("BORROWER_OPERATIONS"),
}

export const musdTroveManagerHandlers: Record<string, Handler> = {
  TroveUpdated: troveUpdatedHandler("TROVE_MANAGER"),
}
