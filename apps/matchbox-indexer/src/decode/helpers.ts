import type { Address, Hex } from "viem"
import type { RawLog, RawTx } from "../ingest/rpc"
import {
  MAXTIME,
  OWNER_LOOKUP_ESCROWS,
  POKE_BOOSTS_SELECTOR,
  POKE_BOOST_SELECTOR,
  POKE_SELECTOR,
  WEEK,
  ZERO,
} from "./constants"
import {
  type ActivityEventRow,
  type LockPositionRow,
  emptyActivity,
} from "./rows"
import type { Store } from "./store"

// Ports of apps/activity-subgraph/src/helpers.ts on main.

export type Handler = (log: RawLog, tx: RawTx, store: Store) => void

export function lower<T extends string>(value: T): T {
  return value.toLowerCase() as T
}

// viem wants a non-empty topic tuple; every handled event has topic0.
export function eventTopics(log: RawLog): [Hex, ...Hex[]] {
  const [signature, ...rest] = log.topics
  if (signature === undefined) {
    throw new Error(`Log ${log.txHash}-${log.logIndex} has no topics`)
  }
  return [signature, ...rest]
}

export function eventId(log: RawLog, suffix: string): string {
  return `${lower(log.txHash)}-${log.logIndex}-${suffix}`
}

export function baseActivity(
  log: RawLog,
  tx: RawTx,
  actionType: string,
  boostContext: string,
  source: string,
): ActivityEventRow {
  return {
    ...emptyActivity(),
    id: eventId(log, actionType),
    actionType,
    boostContext,
    source,
    txHash: lower(log.txHash),
    txFrom: lower(tx.from),
    logIndex: BigInt(log.logIndex),
    blockNumber: log.blockNumber,
    timestamp: log.blockTimestamp,
    contractAddress: lower(log.address),
  }
}

export function detectPokeMethod(input: Hex): string | null {
  // graph-ts Bytes.length counts bytes; "0x" plus 8 hex chars is 4 bytes.
  if (input.length < 10) return null
  const selector = input.slice(0, 10).toLowerCase()
  if (selector === POKE_SELECTOR) return "poke"
  if (selector === POKE_BOOST_SELECTOR) return "pokeBoost"
  if (selector === POKE_BOOSTS_SELECTOR) return "pokeBoosts"
  return null
}

// Absolute lock end to REMAINING seconds at the block time, capped at MAXTIME.
export function remainingDuration(
  unlockAt: bigint,
  blockTimestamp: bigint,
): bigint {
  if (unlockAt <= blockTimestamp) return ZERO
  const remaining = unlockAt - blockTimestamp
  return remaining > MAXTIME ? MAXTIME : remaining
}

export function lockId(contractAddress: Address, tokenId: bigint): string {
  return `${lower(contractAddress)}-${tokenId}`
}

export function getOrCreateLock(
  store: Store,
  contractAddress: Address,
  tokenId: bigint,
): LockPositionRow {
  const id = lockId(contractAddress, tokenId)
  return (
    store.getLock(id) ?? {
      id,
      tokenId,
      contractAddress: lower(contractAddress),
      owner: null,
      amount: ZERO,
      unlockAt: null,
      createdAt: null,
      lastExtendedAt: null,
      withdrawnAt: null,
      isPermanent: false,
      isWithdrawn: false,
      isMerged: false,
      mergedIntoTokenId: null,
      mergedAt: null,
      boost: null,
      activityCount: ZERO,
    }
  )
}

// Voted events carry `voter = msg.sender`, the maintainer on poke calls.
// Resolve the real owner from the LockPosition in the first escrow that has
// one; fall back to the event's voter.
export function resolveLockOwner(
  store: Store,
  tokenId: bigint,
  fallback: Address,
): Address {
  for (const escrow of OWNER_LOOKUP_ESCROWS) {
    const lock = store.getLock(`${escrow}-${tokenId}`)
    if (lock?.owner) return lock.owner
  }
  return lower(fallback)
}

export function resolveVoteActor(
  store: Store,
  tokenId: bigint,
  voter: Address,
  input: Hex,
): Address {
  return detectPokeMethod(input) !== null
    ? resolveLockOwner(store, tokenId, voter)
    : lower(voter)
}

export function epochStart(timestamp: bigint): bigint {
  return (timestamp / WEEK) * WEEK
}

// Each Voted / Abstained is the authoritative latest state for
// (voter contract, tokenId, gauge). Weight 0 is an abstain.
export function upsertVote(
  store: Store,
  contractAddress: Address,
  tokenId: bigint,
  gauge: Address,
  owner: Address,
  weight: bigint,
  timestamp: bigint,
): void {
  store.putVote({
    id: `${lower(contractAddress)}-${tokenId}-${lower(gauge)}`,
    voterContract: lower(contractAddress),
    tokenId,
    gauge: lower(gauge),
    owner: lower(owner),
    currentWeight: weight,
    lastUpdatedEpoch: epochStart(timestamp),
    lastUpdatedAt: timestamp,
    isActive: weight > ZERO,
  })
}
