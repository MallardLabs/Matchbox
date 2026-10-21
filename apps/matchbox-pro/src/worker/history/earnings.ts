import { CHAIN_ID, CONTRACTS } from "@repo/shared/contracts"
import type { Address } from "viem"
import type { GaugeTopologyResponse } from "../../lib/topology"
import { ApiError, cached } from "../router"
import { computeGaugeTopology } from "../topology"
import {
  ESCROW_ABI,
  REWARD_ABI,
  type ReadCall,
  asBigint,
  asPair,
  readAll,
} from "./chain"
import {
  type Checkpoint,
  EPOCH,
  type EpochShare,
  claimableTotal,
  epochStartOf,
  pairShares,
} from "./math"
import { sealedGet, sealedSet } from "./store"

// Per-epoch boost-bribe earnings for veMEZO locks, from head-state RPC reads
// of each bribe's checkpoints (no archive, no events). Past-epoch checkpoints
// and deposits never change, so they are memoized forever and only the
// current epoch's tail is re-read.

/** Locks per request; beyond this pass `tokenIds` explicitly. */
export const MAX_LOCKS = 30
/**
 * Epoch of the first BoostVoter bribe checkpoints (2026-01-21 falls in the
 * epoch starting Thursday 2026-01-15). No boost earnings exist before it.
 */
export const BOOST_FIRST_EPOCH = 1_768_435_200n
const MAX_CHECKPOINTS = 1_000

export type RewardTokenInfo = {
  token: Address
  symbol: string
  decimals: number
  /** tokenRewardsPerEpoch for the current epoch (30s fresh). */
  currentDeposit: bigint
}

export type BoostBribe = {
  gauge: Address
  bribe: Address
  tokens: RewardTokenInfo[]
}

export type PairTokenShares = {
  tokenId: bigint
  gauge: Address
  bribe: Address
  token: RewardTokenInfo
  shares: EpochShare[]
  lastEarn: bigint
  earned: bigint | undefined
}

export type WalletEarningsModel = {
  tokenIds: bigint[]
  currentEpoch: bigint
  lines: PairTokenShares[]
  /** Σ claimable equals `earned()` for every line. */
  verified: boolean
}

export function boostTopology(): Promise<GaugeTopologyResponse> {
  // Same memo key as /api/topology so the two share one read.
  return cached(`topology:${CHAIN_ID.mainnet}`, 30_000, () =>
    computeGaugeTopology(CHAIN_ID.mainnet),
  )
}

export async function boostBribes(): Promise<BoostBribe[]> {
  const topology = await boostTopology()
  return topology.gauges.flatMap((gauge) =>
    gauge.bribeAddress
      ? [
          {
            gauge: gauge.gaugeAddress.toLowerCase() as Address,
            bribe: gauge.bribeAddress.toLowerCase() as Address,
            tokens: gauge.rewardTokens.map((token) => ({
              token: token.tokenAddress.toLowerCase() as Address,
              symbol: token.symbol,
              decimals: token.decimals,
              currentDeposit: BigInt(token.epochAmount),
            })),
          },
        ]
      : [],
  )
}

/** veMEZO token ids owned by `wallet`, in escrow order. */
export async function walletLockIds(wallet: Address): Promise<bigint[]> {
  const escrow = CONTRACTS.mainnet.veMEZO
  const [balance] = await readAll([
    {
      address: escrow,
      abi: ESCROW_ABI,
      functionName: "balanceOf",
      args: [wallet],
    },
  ])
  const count = Number(asBigint(balance) ?? 0n)
  if (count === 0) return []
  const ids = await readAll(
    Array.from({ length: count }, (_, index) => ({
      address: escrow,
      abi: ESCROW_ABI,
      functionName: "ownerToNFTokenIdList",
      args: [wallet, BigInt(index)],
    })),
  )
  return ids.flatMap((id) => {
    const value = asBigint(id)
    return value !== undefined && value > 0n ? [value] : []
  })
}

type Pair = { tokenId: bigint; bribe: BoostBribe }

/**
 * Bribes that ever received a reward token. A bribe's rewards list only grows
 * on its first deposit of a token, so an empty list means nothing to earn and
 * no need to scan it (31 of 719 boost bribes at the time of writing).
 */
export function fundedBribes(bribes: readonly BoostBribe[]): BoostBribe[] {
  return bribes.filter((bribe) => bribe.tokens.length > 0)
}

/** Epochs from the first boost bribe epoch up to (not including) `current`. */
export function sealedEpochsSince(first: bigint, current: bigint): bigint[] {
  const epochs: bigint[] = []
  for (let epoch = first; epoch < current; epoch += EPOCH) epochs.push(epoch)
  return epochs
}

export type CheckpointSeries = { key: string; count: bigint; calls: ReadCall[] }

function cachedSealed(key: string): Checkpoint[] {
  return sealedGet<Checkpoint[]>(key) ?? []
}

/**
 * Full checkpoint arrays, reading only indices past the memoized sealed
 * prefix. `counts` come from the same request so the tail is current.
 */
export async function loadCheckpoints(
  series: readonly CheckpointSeries[],
  currentEpoch: bigint,
): Promise<Map<string, Checkpoint[]>> {
  const result = new Map<string, Checkpoint[]>()
  const calls: ReadCall[] = []
  const spans: Array<{ key: string; prefix: Checkpoint[]; length: number }> = []
  for (const item of series) {
    const count = Number(
      item.count > BigInt(MAX_CHECKPOINTS)
        ? BigInt(MAX_CHECKPOINTS)
        : item.count,
    )
    const prefix = cachedSealed(item.key).slice(0, count)
    const tail = item.calls.slice(prefix.length, count)
    calls.push(...tail)
    spans.push({ key: item.key, prefix, length: tail.length })
  }
  const values = await readAll(calls)
  let offset = 0
  for (const span of spans) {
    const tail = values.slice(offset, offset + span.length).flatMap((value) => {
      const pair = asPair(value)
      return pair ? [{ timestamp: pair[0], value: pair[1] }] : []
    })
    offset += span.length
    if (tail.length !== span.length) {
      throw new ApiError(503, "Chain data is unavailable right now.")
    }
    const checkpoints = [...span.prefix, ...tail]
    result.set(span.key, checkpoints)
    const sealed = checkpoints.filter(
      (checkpoint) => epochStartOf(checkpoint.timestamp) < currentEpoch,
    )
    if (sealed.length > span.prefix.length) sealedSet(span.key, sealed)
  }
  return result
}

function balanceCalls(bribe: Address, tokenId: bigint, count: bigint) {
  return Array.from({ length: Number(count) }, (_, index) => ({
    address: bribe,
    abi: REWARD_ABI,
    functionName: "checkpoints",
    args: [tokenId, BigInt(index)],
  }))
}

export function supplyCalls(bribe: Address, count: bigint) {
  return Array.from({ length: Number(count) }, (_, index) => ({
    address: bribe,
    abi: REWARD_ABI,
    functionName: "supplyCheckpoints",
    args: [BigInt(index)],
  }))
}

export function depositKey(
  bribe: Address,
  token: Address,
  epoch: bigint,
): string {
  return `deposit:${bribe}:${token}:${epoch}`
}

/** tokenRewardsPerEpoch for sealed epochs, memoized forever. */
export async function sealedDeposits(
  wanted: ReadonlyArray<{ bribe: Address; token: Address; epoch: bigint }>,
): Promise<Map<string, bigint>> {
  const result = new Map<string, bigint>()
  const missing: Array<{ bribe: Address; token: Address; epoch: bigint }> = []
  for (const item of wanted) {
    const key = depositKey(item.bribe, item.token, item.epoch)
    if (result.has(key)) continue
    const hit = sealedGet<bigint>(key)
    if (hit === undefined) {
      missing.push(item)
      result.set(key, 0n)
    } else {
      result.set(key, hit)
    }
  }
  const values = await readAll(
    missing.map((item) => ({
      address: item.bribe,
      abi: REWARD_ABI,
      functionName: "tokenRewardsPerEpoch",
      args: [item.token, item.epoch],
    })),
  )
  missing.forEach((item, index) => {
    const value = asBigint(values[index])
    if (value === undefined) {
      throw new ApiError(503, "Chain data is unavailable right now.")
    }
    const key = depositKey(item.bribe, item.token, item.epoch)
    result.set(key, value)
    sealedSet(key, value)
  })
  return result
}

/**
 * Every (lock, bribe, reward token) line with its per-epoch shares from the
 * first checkpoint through the current epoch, plus the `earned()` cross-check.
 * Two read rounds: counts and claim state for every (lock, funded bribe),
 * then the checkpoint tails alongside the sealed deposits.
 */
export async function computeWalletEarnings(input: {
  tokenIds: readonly bigint[]
  now: bigint
}): Promise<WalletEarningsModel> {
  const currentEpoch = epochStartOf(input.now)
  const tokenIds = [...new Set(input.tokenIds)].slice(0, MAX_LOCKS)
  const funded = fundedBribes(await boostBribes())
  if (tokenIds.length === 0 || funded.length === 0) {
    return { tokenIds, currentEpoch, lines: [], verified: true }
  }

  const candidates: Pair[] = tokenIds.flatMap((tokenId) =>
    funded.map((bribe) => ({ tokenId, bribe })),
  )
  const candidateLines = candidates.flatMap((pair) =>
    pair.bribe.tokens.map((token) => ({ pair, token })),
  )
  const round1 = await readAll([
    ...candidates.map((pair) => ({
      address: pair.bribe.bribe,
      abi: REWARD_ABI,
      functionName: "numCheckpoints",
      args: [pair.tokenId],
    })),
    ...funded.map((bribe) => ({
      address: bribe.bribe,
      abi: REWARD_ABI,
      functionName: "supplyNumCheckpoints",
    })),
    ...candidateLines.flatMap(({ pair, token }) => [
      {
        address: pair.bribe.bribe,
        abi: REWARD_ABI,
        functionName: "lastEarn",
        args: [token.token, pair.tokenId],
      },
      {
        address: pair.bribe.bribe,
        abi: REWARD_ABI,
        functionName: "earned",
        args: [token.token, pair.tokenId],
      },
    ]),
  ])
  const counts = new Map<Pair, bigint>()
  candidates.forEach((pair, index) => {
    const count = asBigint(round1[index])
    if (count === undefined) {
      throw new ApiError(503, "Chain data is unavailable right now.")
    }
    if (count > 0n) counts.set(pair, count)
  })
  const supplyCounts = new Map<Address, bigint>()
  funded.forEach((bribe, index) => {
    supplyCounts.set(
      bribe.bribe,
      asBigint(round1[candidates.length + index]) ?? 0n,
    )
  })
  const earnReads = new Map<string, { lastEarn: bigint; earned?: bigint }>()
  const earnOffset = candidates.length + funded.length
  candidateLines.forEach(({ pair, token }, index) => {
    const earned = asBigint(round1[earnOffset + index * 2 + 1])
    earnReads.set(`${pair.bribe.bribe}:${pair.tokenId}:${token.token}`, {
      lastEarn: asBigint(round1[earnOffset + index * 2]) ?? 0n,
      ...(earned === undefined ? {} : { earned }),
    })
  })

  const pairs = candidates.filter((pair) => counts.has(pair))
  if (pairs.length === 0) {
    return { tokenIds, currentEpoch, lines: [], verified: true }
  }
  const involved = [
    ...new Map(pairs.map((pair) => [pair.bribe.bribe, pair.bribe])).values(),
  ]

  // Round 2: checkpoint tails, and every sealed deposit on the bribes these
  // locks touched (shared by all wallets, memoized forever).
  const balanceKey = (pair: Pair) => `cp:${pair.bribe.bribe}:${pair.tokenId}`
  const supplyKey = (bribe: Address) => `supply:${bribe}`
  const epochs = sealedEpochsSince(BOOST_FIRST_EPOCH, currentEpoch)
  const [checkpoints, deposits] = await Promise.all([
    loadCheckpoints(
      [
        ...pairs.map((pair) => {
          const count = counts.get(pair) ?? 0n
          return {
            key: balanceKey(pair),
            count,
            calls: balanceCalls(pair.bribe.bribe, pair.tokenId, count),
          }
        }),
        ...involved.map((bribe) => {
          const count = supplyCounts.get(bribe.bribe) ?? 0n
          return {
            key: supplyKey(bribe.bribe),
            count,
            calls: supplyCalls(bribe.bribe, count),
          }
        }),
      ],
      currentEpoch,
    ),
    sealedDeposits(
      involved.flatMap((bribe) =>
        bribe.tokens.flatMap((token) =>
          epochs.map((epoch) => ({
            bribe: bribe.bribe,
            token: token.token,
            epoch,
          })),
        ),
      ),
    ),
  ])

  // Defensive: a checkpoint older than BOOST_FIRST_EPOCH needs those deposits too.
  const earliest = pairs.reduce((min, pair) => {
    const first = checkpoints.get(balanceKey(pair))?.[0]
    const epoch = first ? epochStartOf(first.timestamp) : min
    return epoch < min ? epoch : min
  }, BOOST_FIRST_EPOCH)
  if (earliest < BOOST_FIRST_EPOCH) {
    const early = await sealedDeposits(
      involved.flatMap((bribe) =>
        bribe.tokens.flatMap((token) =>
          sealedEpochsSince(earliest, BOOST_FIRST_EPOCH).map((epoch) => ({
            bribe: bribe.bribe,
            token: token.token,
            epoch,
          })),
        ),
      ),
    )
    for (const [key, value] of early) deposits.set(key, value)
  }

  let verified = true
  const lines = pairs.flatMap((pair) =>
    pair.bribe.tokens.map((token): PairTokenShares => {
      const reads = earnReads.get(
        `${pair.bribe.bribe}:${pair.tokenId}:${token.token}`,
      )
      const lastEarn = reads?.lastEarn ?? 0n
      const earned = reads?.earned
      const shares = pairShares({
        balances: checkpoints.get(balanceKey(pair)) ?? [],
        supplies: checkpoints.get(supplyKey(pair.bribe.bribe)) ?? [],
        deposited: (epoch) =>
          epoch >= currentEpoch
            ? token.currentDeposit
            : (deposits.get(depositKey(pair.bribe.bribe, token.token, epoch)) ??
              0n),
        lastEarn,
        currentEpoch,
      })
      if (earned === undefined || claimableTotal(shares) !== earned) {
        verified = false
      }
      return {
        tokenId: pair.tokenId,
        gauge: pair.bribe.gauge,
        bribe: pair.bribe.bribe,
        token,
        shares,
        lastEarn,
        earned,
      }
    }),
  )
  return { tokenIds, currentEpoch, lines, verified }
}
