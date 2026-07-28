const TOTAL_BASIS_POINTS = 10_000n
const MAX_SUPPORTED_GAUGES = 16

export type RewardOptimizerGauge = {
  id: string
  existingWeight: bigint
  incentiveValueMicroUsd: bigint
}

export type RewardOptimizerAllocation = {
  id: string
  basisPoints: bigint
  voteWeight: bigint
  projectedRewardMicroUsd: bigint
}

export type RewardOptimizerResult = {
  allocations: RewardOptimizerAllocation[]
  projectedRewardMicroUsd: bigint
  evaluatedGaugeCount: number
}

type MarginalReward = {
  numerator: bigint
  denominator: bigint
}

type FixedSubsetResult = {
  allocations: RewardOptimizerAllocation[]
  projectedRewardMicroUsd: bigint
}

function aggregateVoteWeight(
  votingPowers: readonly bigint[],
  basisPoints: bigint,
): bigint {
  return votingPowers.reduce(
    (total, votingPower) =>
      total + (votingPower * basisPoints) / TOTAL_BASIS_POINTS,
    0n,
  )
}

function buildVoteWeightTable(votingPowers: readonly bigint[]): bigint[] {
  return Array.from({ length: 10_001 }, (_, basisPoints) =>
    aggregateVoteWeight(votingPowers, BigInt(basisPoints)),
  )
}

function projectedReward(
  gauge: RewardOptimizerGauge,
  voteWeight: bigint,
): bigint {
  if (voteWeight <= 0n || gauge.incentiveValueMicroUsd <= 0n) return 0n
  if (gauge.existingWeight <= 0n) return gauge.incentiveValueMicroUsd
  return (
    (gauge.incentiveValueMicroUsd * voteWeight) /
    (gauge.existingWeight + voteWeight)
  )
}

function marginalReward(
  gauge: RewardOptimizerGauge,
  voteWeightsByBasisPoint: readonly bigint[],
  currentBasisPoints: bigint,
): MarginalReward {
  const currentIndex = Number(currentBasisPoints)
  const currentWeight = voteWeightsByBasisPoint[currentIndex] ?? 0n
  const nextWeight = voteWeightsByBasisPoint[currentIndex + 1] ?? currentWeight
  const addedWeight = nextWeight - currentWeight
  if (addedWeight <= 0n) return { numerator: 0n, denominator: 1n }

  if (gauge.existingWeight <= 0n) {
    return currentWeight === 0n
      ? { numerator: gauge.incentiveValueMicroUsd, denominator: 1n }
      : { numerator: 0n, denominator: 1n }
  }

  return {
    numerator:
      gauge.incentiveValueMicroUsd * gauge.existingWeight * addedWeight,
    denominator:
      (gauge.existingWeight + currentWeight) *
      (gauge.existingWeight + nextWeight),
  }
}

function compareMarginalRewards(a: MarginalReward, b: MarginalReward): number {
  const left = a.numerator * b.denominator
  const right = b.numerator * a.denominator
  return left < right ? -1 : left > right ? 1 : 0
}

function optimizeFixedSubset(
  gauges: readonly RewardOptimizerGauge[],
  voteWeightsByBasisPoint: readonly bigint[],
): FixedSubsetResult {
  const basisPointsById = new Map(gauges.map((gauge) => [gauge.id, 0n]))

  for (let allocated = 0n; allocated < TOTAL_BASIS_POINTS; allocated++) {
    let bestGauge: RewardOptimizerGauge | undefined
    let bestMarginal: MarginalReward | undefined

    for (const gauge of gauges) {
      const currentBasisPoints = basisPointsById.get(gauge.id) ?? 0n
      const marginal = marginalReward(
        gauge,
        voteWeightsByBasisPoint,
        currentBasisPoints,
      )
      const marginalComparison =
        bestMarginal === undefined
          ? 1
          : compareMarginalRewards(marginal, bestMarginal)
      const winsTie =
        marginalComparison === 0 &&
        bestGauge !== undefined &&
        (gauge.incentiveValueMicroUsd > bestGauge.incentiveValueMicroUsd ||
          (gauge.incentiveValueMicroUsd === bestGauge.incentiveValueMicroUsd &&
            gauge.id.localeCompare(bestGauge.id) < 0))

      if (bestGauge === undefined || marginalComparison > 0 || winsTie) {
        bestGauge = gauge
        bestMarginal = marginal
      }
    }

    if (!bestGauge) break
    basisPointsById.set(
      bestGauge.id,
      (basisPointsById.get(bestGauge.id) ?? 0n) + 1n,
    )
  }

  const allocations = gauges
    .map((gauge) => {
      const basisPoints = basisPointsById.get(gauge.id) ?? 0n
      const voteWeight = voteWeightsByBasisPoint[Number(basisPoints)] ?? 0n
      return {
        id: gauge.id,
        basisPoints,
        voteWeight,
        projectedRewardMicroUsd: projectedReward(gauge, voteWeight),
      }
    })
    .filter((allocation) => allocation.basisPoints > 0n)
    .sort((a, b) => {
      if (a.basisPoints !== b.basisPoints) {
        return a.basisPoints > b.basisPoints ? -1 : 1
      }
      if (a.projectedRewardMicroUsd !== b.projectedRewardMicroUsd) {
        return a.projectedRewardMicroUsd > b.projectedRewardMicroUsd ? -1 : 1
      }
      return a.id.localeCompare(b.id)
    })

  return {
    allocations,
    projectedRewardMicroUsd: allocations.reduce(
      (total, allocation) => total + allocation.projectedRewardMicroUsd,
      0n,
    ),
  }
}

function compareStandaloneReturns(
  a: RewardOptimizerGauge,
  b: RewardOptimizerGauge,
  voteWeightsByBasisPoint: readonly bigint[],
): number {
  const fullVotingPower = voteWeightsByBasisPoint[10_000] ?? 0n
  const aReward = projectedReward(a, fullVotingPower)
  const bReward = projectedReward(b, fullVotingPower)
  if (aReward !== bReward) return aReward > bReward ? -1 : 1
  if (a.incentiveValueMicroUsd !== b.incentiveValueMicroUsd) {
    return a.incentiveValueMicroUsd > b.incentiveValueMicroUsd ? -1 : 1
  }
  return a.id.localeCompare(b.id)
}

function compareInitialMarginalReturns(
  a: RewardOptimizerGauge,
  b: RewardOptimizerGauge,
  voteWeightsByBasisPoint: readonly bigint[],
): number {
  const comparison = compareMarginalRewards(
    marginalReward(a, voteWeightsByBasisPoint, 0n),
    marginalReward(b, voteWeightsByBasisPoint, 0n),
  )
  if (comparison !== 0) return comparison > 0 ? -1 : 1
  return compareStandaloneReturns(a, b, voteWeightsByBasisPoint)
}

export function optimizeRewardAllocations({
  gauges,
  votingPowers,
  maxGaugeCount = 8,
}: {
  gauges: readonly RewardOptimizerGauge[]
  votingPowers: readonly bigint[]
  maxGaugeCount?: number
}): RewardOptimizerResult | null {
  const eligibleVotingPowers = votingPowers.filter((power) => power > 0n)
  if (eligibleVotingPowers.length === 0) return null
  const voteWeightsByBasisPoint = buildVoteWeightTable(eligibleVotingPowers)

  const eligibleGauges = gauges
    .filter(
      (gauge) =>
        gauge.existingWeight >= 0n && gauge.incentiveValueMicroUsd > 0n,
    )
    .sort((a, b) => compareStandaloneReturns(a, b, voteWeightsByBasisPoint))
  if (eligibleGauges.length === 0) return null

  const requestedGaugeCount = Number.isSafeInteger(maxGaugeCount)
    ? maxGaugeCount
    : 8
  const gaugeLimit = Math.min(
    Math.max(requestedGaugeCount, 1),
    MAX_SUPPORTED_GAUGES,
    eligibleGauges.length,
  )

  if (eligibleGauges.length <= gaugeLimit) {
    return {
      ...optimizeFixedSubset(eligibleGauges, voteWeightsByBasisPoint),
      evaluatedGaugeCount: eligibleGauges.length,
    }
  }

  const gaugeById = new Map(eligibleGauges.map((gauge) => [gauge.id, gauge]))
  const unconstrained = optimizeFixedSubset(
    eligibleGauges,
    voteWeightsByBasisPoint,
  )
  const allocationSeed = unconstrained.allocations
    .slice(0, gaugeLimit)
    .flatMap((allocation) => {
      const gauge = gaugeById.get(allocation.id)
      return gauge ? [gauge] : []
    })
  const standaloneSeed = eligibleGauges.slice(0, gaugeLimit)
  const marginalRanked = [...eligibleGauges].sort((a, b) =>
    compareInitialMarginalReturns(a, b, voteWeightsByBasisPoint),
  )
  const marginalSeed = marginalRanked.slice(0, gaugeLimit)
  const candidatePoolSize = Math.min(gaugeLimit * 3, eligibleGauges.length)
  const candidatePool = new Map<string, RewardOptimizerGauge>()
  for (const gauge of [
    ...eligibleGauges.slice(0, candidatePoolSize),
    ...marginalRanked.slice(0, candidatePoolSize),
    ...unconstrained.allocations
      .slice(0, candidatePoolSize)
      .flatMap((allocation) => {
        const gauge = gaugeById.get(allocation.id)
        return gauge ? [gauge] : []
      }),
  ]) {
    candidatePool.set(gauge.id, gauge)
  }
  const primarySeed =
    allocationSeed.length > 0 ? allocationSeed : standaloneSeed
  const forcedCandidateSeeds = Array.from(candidatePool.values()).map(
    (candidate) =>
      [
        candidate,
        ...primarySeed.filter((gauge) => gauge.id !== candidate.id),
      ].slice(0, gaugeLimit),
  )
  const seedSets = [
    allocationSeed,
    standaloneSeed,
    marginalSeed,
    ...forcedCandidateSeeds,
  ]
  let optimized: FixedSubsetResult | undefined
  const evaluatedSeeds = new Set<string>()

  for (const seed of seedSets) {
    if (seed.length === 0) continue
    const seedKey = seed
      .map((gauge) => gauge.id)
      .sort()
      .join("|")
    if (evaluatedSeeds.has(seedKey)) continue
    evaluatedSeeds.add(seedKey)
    const result = optimizeFixedSubset(seed, voteWeightsByBasisPoint)
    if (
      optimized === undefined ||
      result.projectedRewardMicroUsd > optimized.projectedRewardMicroUsd
    ) {
      optimized = result
    }
  }

  if (!optimized) return null
  return {
    ...optimized,
    evaluatedGaugeCount: eligibleGauges.length,
  }
}

export function calculateAnnualizedReturnBasisPoints({
  epochRewardMicroUsd,
  votingPowers,
  assetPriceMicroUsd,
}: {
  epochRewardMicroUsd: bigint
  votingPowers: readonly bigint[]
  assetPriceMicroUsd: bigint
}): bigint | null {
  if (epochRewardMicroUsd <= 0n || assetPriceMicroUsd <= 0n) return null
  const totalVotingPower = votingPowers.reduce(
    (total, votingPower) => total + votingPower,
    0n,
  )
  const principalMicroUsd = (totalVotingPower * assetPriceMicroUsd) / 10n ** 18n
  if (principalMicroUsd <= 0n) return null
  return (epochRewardMicroUsd * 52n * 10_000n) / principalMicroUsd
}
