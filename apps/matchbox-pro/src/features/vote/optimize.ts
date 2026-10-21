import { optimizeRewardAllocations } from "@/lib/rewardOptimizer"
import { type Ballot, ballotFromAllocations } from "./ballot"
import { MAX_VOTING_TARGETS } from "./contracts"
import {
  type ProjectionTarget,
  competingWeight,
  projectTarget,
  voteWeightForBps,
} from "./projection"

export type OptimizerTarget = ProjectionTarget & {
  id: string
  isAlive: boolean
  /** Sum of the priced rewards; the optimizer's objective. */
  incentiveMicroUsd: bigint
}

export type AllocationSnapshot = {
  entries: Array<{ id: string; bps: number; projectedMicroUsd: bigint }>
  projectedMicroUsd: bigint
}

/**
 * Builds optimizer targets from gauge totals. `ownWeights` holds the selected
 * locks' current votes, which a new ballot replaces rather than competes with.
 */
export function toOptimizerTargets<
  T extends {
    id: string
    isAlive: boolean
    totalWeight: bigint
    incentiveMicroUsd: bigint
    rewards: ProjectionTarget["rewards"]
  },
>(
  targets: readonly T[],
  ownWeights: ReadonlyMap<string, bigint>,
): OptimizerTarget[] {
  return targets.map((target) => ({
    id: target.id,
    isAlive: target.isAlive,
    incentiveMicroUsd: target.incentiveMicroUsd,
    rewards: target.rewards,
    competingWeight: competingWeight(
      target.totalWeight,
      ownWeights.get(target.id.toLowerCase()) ?? 0n,
    ),
  }))
}

export function snapshotBallot(
  ballot: Ballot,
  targets: readonly OptimizerTarget[],
  votingPowers: readonly bigint[],
): AllocationSnapshot {
  const byId = new Map(
    targets.map((target) => [target.id.toLowerCase(), target]),
  )
  const entries = ballot.map((entry) => {
    const target = byId.get(entry.id.toLowerCase())
    const projected = target
      ? projectTarget(target, voteWeightForBps(votingPowers, entry.bps))
          .microUsd
      : 0n
    return { id: entry.id, bps: entry.bps, projectedMicroUsd: projected }
  })
  return {
    entries,
    projectedMicroUsd: entries.reduce(
      (total, entry) => total + entry.projectedMicroUsd,
      0n,
    ),
  }
}

type OptimizerGauge = {
  id: string
  existingWeight: bigint
  incentiveValueMicroUsd: bigint
}

/** Descending incentive per unit of competing weight: the optimizer's entry order. */
function byDensity(
  floor: bigint,
): (a: OptimizerGauge, b: OptimizerGauge) => number {
  return (a, b) => {
    const left = a.existingWeight > floor ? a.existingWeight : floor
    const right = b.existingWeight > floor ? b.existingWeight : floor
    const lhs = a.incentiveValueMicroUsd * right
    const rhs = b.incentiveValueMicroUsd * left
    if (lhs !== rhs) return lhs > rhs ? -1 : 1
    return a.id.localeCompare(b.id)
  }
}

/**
 * Runs the canonical optimizer over live, priced targets and rounds to a
 * ballot. Voters revert above `maxTargets`, so an optimum wider than that is
 * re-solved over the densest `maxTargets` (the optimizer fills gauges in
 * density order, so this is the best ballot the contract accepts).
 */
export function optimizeBallot(
  targets: readonly OptimizerTarget[],
  votingPowers: readonly bigint[],
  maxTargets = MAX_VOTING_TARGETS,
): { ballot: Ballot; snapshot: AllocationSnapshot } | null {
  let gauges: OptimizerGauge[] = targets
    .filter((target) => target.isAlive && target.incentiveMicroUsd > 0n)
    .map((target) => ({
      id: target.id,
      existingWeight: target.competingWeight,
      incentiveValueMicroUsd: target.incentiveMicroUsd,
    }))
  let result = optimizeRewardAllocations({ gauges, votingPowers })
  if (result && result.allocations.length > maxTargets) {
    const total = votingPowers.reduce((sum, power) => sum + power, 0n)
    const floor = total / 10_000n > 0n ? total / 10_000n : 1n
    gauges = [...gauges].sort(byDensity(floor)).slice(0, maxTargets)
    result = optimizeRewardAllocations({ gauges, votingPowers })
  }
  if (!result) return null
  const ballot = ballotFromAllocations(result.allocations)
  if (ballot.length === 0) return null
  return { ballot, snapshot: snapshotBallot(ballot, targets, votingPowers) }
}
