// Pure Velodrome-V2 `Reward` math for per-epoch voting-incentive earnings.
// Bribe contracts keep one balance checkpoint per (tokenId, epoch) and one
// supply checkpoint per epoch. Replaying `earned()` epoch by epoch over the
// full checkpoint arrays gives each sealed epoch's share, and the sum over the
// unclaimed epochs equals `earned()` exactly (verified on chain, tokenId 111).

export const EPOCH = 604_800n

export function epochStartOf(timestamp: bigint): bigint {
  return timestamp - (timestamp % EPOCH)
}

export type Checkpoint = {
  timestamp: bigint
  /** balanceOf for a tokenId's checkpoints, supply for supply checkpoints. */
  value: bigint
}

/**
 * `getPriorBalanceIndex` / `getPriorSupplyIndex`: the index of the last
 * checkpoint at or before `timestamp`, or 0 when there is none (the contract
 * never evaluates epochs before the first checkpoint, so 0 is never misread).
 */
export function priorIndex(
  checkpoints: readonly Checkpoint[],
  timestamp: bigint,
): number {
  const count = checkpoints.length
  const last = checkpoints[count - 1]
  const first = checkpoints[0]
  if (!last || !first) return 0
  if (last.timestamp <= timestamp) return count - 1
  if (first.timestamp > timestamp) return 0
  let lower = 0
  let upper = count - 1
  while (upper > lower) {
    const center = upper - Math.floor((upper - lower) / 2)
    const checkpoint = checkpoints[center]
    if (!checkpoint) break
    if (checkpoint.timestamp === timestamp) return center
    if (checkpoint.timestamp < timestamp) lower = center
    else upper = center - 1
  }
  return lower
}

function valueAt(
  checkpoints: readonly Checkpoint[],
  timestamp: bigint,
): bigint {
  return checkpoints[priorIndex(checkpoints, timestamp)]?.value ?? 0n
}

export type EarnStatus = "claimed" | "claimable" | "pending"

export type EpochShare = {
  epochStart: bigint
  /** The lock's bribe balance at the epoch's last second. */
  balance: bigint
  /** The bribe's total supply at the epoch's last second (min 1). */
  supply: bigint
  /** tokenRewardsPerEpoch for this epoch. */
  deposited: bigint
  amount: bigint
  status: EarnStatus
}

export type PairInput = {
  /** The lock's checkpoints on one bribe contract, oldest first. */
  balances: readonly Checkpoint[]
  /** The bribe contract's supply checkpoints, oldest first. */
  supplies: readonly Checkpoint[]
  /** tokenRewardsPerEpoch(token, epochStart) for one reward token. */
  deposited: (epochStart: bigint) => bigint
  /** lastEarn(token, tokenId). */
  lastEarn: bigint
  /** epochStart(now). */
  currentEpoch: bigint
}

/** Epochs a pair can have earned in: from its first checkpoint's epoch. */
export function pairEpochs(
  balances: readonly Checkpoint[],
  currentEpoch: bigint,
): bigint[] {
  const first = balances[0]
  if (!first) return []
  const epochs: bigint[] = []
  for (
    let epoch = epochStartOf(first.timestamp);
    epoch <= currentEpoch;
    epoch += EPOCH
  ) {
    epochs.push(epoch)
  }
  return epochs
}

/** One epoch's share; `epochStart` must not precede the first checkpoint. */
export function epochShare(
  input: Omit<PairInput, "currentEpoch">,
  epochStart: bigint,
): Omit<EpochShare, "status"> {
  const end = epochStart + EPOCH - 1n
  const balance = valueAt(input.balances, end)
  const rawSupply = valueAt(input.supplies, end)
  const supply = rawSupply > 1n ? rawSupply : 1n
  const deposited = balance === 0n ? 0n : input.deposited(epochStart)
  return {
    epochStart,
    balance,
    supply,
    deposited,
    amount: (balance * deposited) / supply,
  }
}

/**
 * Claim status from `lastEarn`: a sealed epoch before the epoch of the last
 * claim was paid out; later sealed epochs are claimable; the current epoch is
 * still accruing (pending / projected).
 */
export function earnStatus(
  epochStart: bigint,
  lastEarn: bigint,
  currentEpoch: bigint,
): EarnStatus {
  if (epochStart >= currentEpoch) return "pending"
  return epochStart < epochStartOf(lastEarn) ? "claimed" : "claimable"
}

/**
 * Every epoch from the pair's first checkpoint through the current one,
 * including zero-amount epochs (callers drop them for display).
 */
export function pairShares(input: PairInput): EpochShare[] {
  return pairEpochs(input.balances, input.currentEpoch).map((epochStart) => ({
    ...epochShare(input, epochStart),
    status: earnStatus(epochStart, input.lastEarn, input.currentEpoch),
  }))
}

/** What `earned(token, tokenId)` returns now: Σ claimable shares. */
export function claimableTotal(shares: readonly EpochShare[]): bigint {
  return shares.reduce(
    (sum, share) => (share.status === "claimable" ? sum + share.amount : sum),
    0n,
  )
}
