import { FULL_BALLOT_BPS } from "./ballot"

const BPS = BigInt(FULL_BALLOT_BPS)

export type RewardToken = {
  tokenAddress: string
  symbol: string
  decimals: number
  /** Native amount deposited for the current epoch. */
  amount: bigint
  /** null when the token has no verified price. */
  microUsd: bigint | null
}

export type ProjectionTarget = {
  /** Votes already on the target that this ballot does not replace. */
  competingWeight: bigint
  rewards: readonly RewardToken[]
}

export type NativeAmount = {
  tokenAddress: string
  symbol: string
  decimals: number
  amount: bigint
}

export type Projection = {
  voteWeight: bigint
  /** Sum of the priced rewards only. */
  microUsd: bigint
  native: NativeAmount[]
  hasUnpriced: boolean
}

/**
 * Weight the voter contracts give one ballot share: each lock votes
 * `power * share / total`, truncated per lock exactly like the contract.
 */
export function voteWeightForBps(
  votingPowers: readonly bigint[],
  bps: number,
): bigint {
  const share = BigInt(bps)
  return votingPowers.reduce(
    (total, power) => total + (power * share) / BPS,
    0n,
  )
}

/**
 * A re-vote replaces the selected locks' current votes, so those must not
 * count as competition for the same pot.
 */
export function competingWeight(
  totalWeight: bigint,
  ownWeight: bigint,
): bigint {
  const competing = totalWeight - ownWeight
  return competing > 0n ? competing : 0n
}

/** Pro-rata share of each reward: `amount * w / (competing + w)`. */
export function projectTarget(
  target: ProjectionTarget,
  voteWeight: bigint,
): Projection {
  if (voteWeight <= 0n) {
    return {
      voteWeight: 0n,
      microUsd: 0n,
      native: [],
      hasUnpriced: target.rewards.some((reward) => reward.microUsd === null),
    }
  }
  const denominator = target.competingWeight + voteWeight
  let microUsd = 0n
  let hasUnpriced = false
  const native: NativeAmount[] = []
  for (const reward of target.rewards) {
    if (reward.amount <= 0n) continue
    native.push({
      tokenAddress: reward.tokenAddress,
      symbol: reward.symbol,
      decimals: reward.decimals,
      amount: (reward.amount * voteWeight) / denominator,
    })
    if (reward.microUsd === null) hasUnpriced = true
    else microUsd += (reward.microUsd * voteWeight) / denominator
  }
  return { voteWeight, microUsd, native, hasUnpriced }
}

/** Adds native amounts token by token, keeping first-seen order. */
export function sumNative(
  groups: ReadonlyArray<readonly NativeAmount[]>,
): NativeAmount[] {
  const byToken = new Map<string, NativeAmount>()
  for (const group of groups) {
    for (const item of group) {
      const key = item.tokenAddress.toLowerCase()
      const existing = byToken.get(key)
      byToken.set(
        key,
        existing
          ? { ...existing, amount: existing.amount + item.amount }
          : { ...item },
      )
    }
  }
  return [...byToken.values()].filter((item) => item.amount > 0n)
}
