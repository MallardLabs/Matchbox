import {
  type RewardOptimizerGauge,
  optimizeRewardAllocations,
} from "../../lib/rewardOptimizer"
import { type PriceSnapshot, tokenMicroUsd } from "./providers/prices"
import type { IncentiveToken, VoteTarget } from "./providers/voting"

// Inputs and projections for Pro's closed-form reward optimizer — the only
// optimizer. Stuart and the Vote page must agree to the micro-USD, so the
// projection below mirrors the optimizer's pro-rata rule exactly.

const TOTAL_BPS = 10_000n

export type PricedTarget = {
  target: VoteTarget
  incentiveMicroUsd: bigint
  pricingStatus: "complete" | "partial" | "unpriced"
  unpricedTokens: string[]
  // Competing weight: the voter's weight minus the selected locks' standing
  // votes, which `vote()` resets before re-applying.
  existingWeight: bigint
}

export function priceTarget(
  target: VoteTarget,
  prices: PriceSnapshot,
  ownVotes: bigint,
): PricedTarget {
  let incentiveMicroUsd = 0n
  let priced = 0
  const unpricedTokens: string[] = []
  for (const incentive of target.incentives) {
    if (incentive.amount <= 0n) continue
    const usd = tokenMicroUsd({
      amount: incentive.amount,
      decimals: incentive.decimals,
      token: incentive.token,
      symbol: incentive.symbol,
      prices,
    })
    if (usd === null) {
      unpricedTokens.push(incentive.symbol)
    } else {
      incentiveMicroUsd += usd
      priced += 1
    }
  }
  const existing = target.weight - ownVotes
  return {
    target,
    incentiveMicroUsd,
    pricingStatus:
      unpricedTokens.length === 0
        ? "complete"
        : priced > 0
          ? "partial"
          : "unpriced",
    unpricedTokens,
    existingWeight: existing > 0n ? existing : 0n,
  }
}

export function optimizerGauges(
  priced: readonly PricedTarget[],
): RewardOptimizerGauge[] {
  return priced
    .filter((entry) => entry.target.isAlive && entry.incentiveMicroUsd > 0n)
    .map((entry) => ({
      id: entry.target.targetAddress.toLowerCase(),
      existingWeight: entry.existingWeight,
      incentiveValueMicroUsd: entry.incentiveMicroUsd,
    }))
}

function competingFloor(totalVotingPower: bigint): bigint {
  const unit = totalVotingPower / TOTAL_BPS
  return unit > 0n ? unit : 1n
}

function density(gauge: RewardOptimizerGauge, floor: bigint) {
  return {
    gauge,
    competing: gauge.existingWeight > floor ? gauge.existingWeight : floor,
  }
}

/**
 * Runs the optimizer and, if the ballot exceeds the voter's target cap
 * (`maxVotingNum`, 30 on every Mezo voter), re-runs on the densest targets.
 */
export function optimizeCapped(input: {
  gauges: readonly RewardOptimizerGauge[]
  votingPowers: readonly bigint[]
  maxTargets: number
}): Map<string, bigint> | null {
  const total = input.votingPowers.reduce((sum, power) => sum + power, 0n)
  const floor = competingFloor(total)
  let candidates = [...input.gauges]
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const result = optimizeRewardAllocations({
      gauges: candidates,
      votingPowers: input.votingPowers,
    })
    if (!result) return null
    if (result.allocations.length <= input.maxTargets) {
      return new Map(
        result.allocations.map((allocation) => [
          allocation.id,
          allocation.basisPoints,
        ]),
      )
    }
    const active = new Set(
      result.allocations.map((allocation) => allocation.id),
    )
    candidates = candidates
      .filter((gauge) => active.has(gauge.id))
      .map((gauge) => density(gauge, floor))
      .sort((left, right) => {
        const a = left.gauge.incentiveValueMicroUsd * right.competing
        const b = right.gauge.incentiveValueMicroUsd * left.competing
        return a === b
          ? left.gauge.id.localeCompare(right.gauge.id)
          : a > b
            ? -1
            : 1
      })
      .slice(0, input.maxTargets)
      .map((entry) => entry.gauge)
  }
  return null
}

export type Projection = {
  perTarget: Map<
    string,
    { bps: bigint; voteWeight: bigint; competing: bigint; projected: bigint }
  >
  total: bigint
}

/** Pro-rata projection for any ballot (optimizer output or manual edits). */
export function projectAllocation(input: {
  gauges: readonly RewardOptimizerGauge[]
  votingPowers: readonly bigint[]
  bps: ReadonlyMap<string, bigint>
}): Projection {
  const powers = input.votingPowers.filter((power) => power > 0n)
  const total = powers.reduce((sum, power) => sum + power, 0n)
  const floor = competingFloor(total)
  const byId = new Map(input.gauges.map((gauge) => [gauge.id, gauge]))
  const perTarget: Projection["perTarget"] = new Map()
  let sum = 0n
  for (const [id, bps] of input.bps) {
    const voteWeight = powers.reduce(
      (weight, power) => weight + (power * bps) / TOTAL_BPS,
      0n,
    )
    const gauge = byId.get(id)
    const competing = gauge
      ? gauge.existingWeight > floor
        ? gauge.existingWeight
        : floor
      : floor
    const projected =
      gauge && voteWeight > 0n
        ? (gauge.incentiveValueMicroUsd * voteWeight) / (competing + voteWeight)
        : 0n
    perTarget.set(id, { bps, voteWeight, competing, projected })
    sum += projected
  }
  return { perTarget, total: sum }
}

/** One lock's share of a target's projection (same bps on every lock). */
export function lockShare(input: {
  projected: bigint
  voteWeight: bigint
  lockPower: bigint
  bps: bigint
}): bigint {
  if (input.voteWeight <= 0n) return 0n
  const lockWeight = (input.lockPower * input.bps) / TOTAL_BPS
  return (input.projected * lockWeight) / input.voteWeight
}

/** The voter's native share of each incentive token at this vote weight. */
export function nativeShares(input: {
  incentives: readonly IncentiveToken[]
  voteWeight: bigint
  competing: bigint
}): IncentiveToken[] {
  if (input.voteWeight <= 0n) return []
  return input.incentives
    .filter((incentive) => incentive.amount > 0n)
    .map((incentive) => ({
      ...incentive,
      amount:
        (incentive.amount * input.voteWeight) /
        (input.competing + input.voteWeight),
    }))
}

/** Sums native amounts only when they are all one token. */
export function singleTokenTotal(
  shares: readonly IncentiveToken[],
): IncentiveToken | null {
  const first = shares[0]
  if (!first) return null
  if (
    shares.some(
      (share) => share.token.toLowerCase() !== first.token.toLowerCase(),
    )
  ) {
    return null
  }
  return {
    ...first,
    amount: shares.reduce((sum, share) => sum + share.amount, 0n),
  }
}

/** Percent text with ≤ 2 decimals → bps, without floating point. */
export function percentToBps(text: string): number | null {
  const match = /^(\d{1,3})(?:\.(\d{1,2}))?$/.exec(
    text.trim().replace(/%$/, ""),
  )
  if (!match) return null
  const bps =
    Number.parseInt(match[1] ?? "0", 10) * 100 +
    Number.parseInt((match[2] ?? "").padEnd(2, "0") || "0", 10)
  return bps > 10_000 ? null : bps
}
