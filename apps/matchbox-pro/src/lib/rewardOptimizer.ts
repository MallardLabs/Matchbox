const TOTAL_BASIS_POINTS = 10_000n
const EPOCHS_PER_YEAR = 52n
const WEI_PER_TOKEN = 10n ** 18n

// The optimum needs sqrt(incentives * competing weight). Scaling the radicand
// keeps the integer square root's truncation many orders of magnitude below one
// basis point of a realistic vote.
const SQRT_RADICAND_SCALE = 10n ** 18n

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

type Candidate = {
  gauge: RewardOptimizerGauge
  competingWeight: bigint
  scaledSqrt: bigint
}

function integerSquareRoot(value: bigint): bigint {
  if (value <= 0n) return 0n
  if (value < 4n) return 1n
  let root = 1n << BigInt(Math.ceil(value.toString(2).length / 2))
  for (;;) {
    const next = (root + value / root) / 2n
    if (next >= root) return root
    root = next
  }
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

// A voter's share of a gauge's incentives is pro rata against every other vote
// on it, so adding `voteWeight` earns `incentives * w / (competing + w)`.
function projectedReward(candidate: Candidate, voteWeight: bigint): bigint {
  if (voteWeight <= 0n) return 0n
  return (
    (candidate.gauge.incentiveValueMicroUsd * voteWeight) /
    (candidate.competingWeight + voteWeight)
  )
}

// A gauge nobody has voted for yet would otherwise look like free money: any
// weight at all captures the whole pool, so the true optimum is an
// infinitesimal vote. A ballot cannot express less than one basis point of the
// voter's own power, so that is the floor we hold competing weight to — it
// keeps the optimum finite and never claims more than a full basis point can
// realistically win.
function minimumCompetingWeight(totalVotingPower: bigint): bigint {
  const ballotUnit = totalVotingPower / TOTAL_BASIS_POINTS
  return ballotUnit > 0n ? ballotUnit : 1n
}

// Descending incentives per unit of competing weight. This is the marginal
// return of the first infinitesimal vote, so it is the order in which gauges
// enter the optimal ballot.
function compareIncentiveDensity(a: Candidate, b: Candidate): number {
  const left = a.gauge.incentiveValueMicroUsd * b.competingWeight
  const right = b.gauge.incentiveValueMicroUsd * a.competingWeight
  if (left !== right) return left > right ? -1 : 1
  if (a.gauge.incentiveValueMicroUsd !== b.gauge.incentiveValueMicroUsd) {
    return a.gauge.incentiveValueMicroUsd > b.gauge.incentiveValueMicroUsd
      ? -1
      : 1
  }
  return a.gauge.id.localeCompare(b.gauge.id)
}

// Maximising the concave sum of `I_i * w_i / (E_i + w_i)` subject to
// `sum(w_i) = votingPower` equates every gauge's marginal return, which solves
// in closed form to `w_i = sqrt(I_i * E_i) / sqrt(lambda) - E_i`. Gauges enter
// the active set in order of decreasing `I_i / E_i` and the set is the longest
// prefix whose last member still wants positive weight.
function solveOptimalWeights(
  candidates: readonly Candidate[],
  totalVotingPower: bigint,
): bigint[] {
  let activeCount = 0
  let sqrtTotal = 0n
  let competingTotal = 0n

  for (const candidate of candidates) {
    const nextSqrtTotal = sqrtTotal + candidate.scaledSqrt
    const nextCompetingTotal = competingTotal + candidate.competingWeight
    if (nextSqrtTotal <= 0n) break
    const weight =
      (candidate.scaledSqrt * (totalVotingPower + nextCompetingTotal)) /
        nextSqrtTotal -
      candidate.competingWeight
    if (weight <= 0n) break
    activeCount++
    sqrtTotal = nextSqrtTotal
    competingTotal = nextCompetingTotal
  }

  if (activeCount === 0) return []
  const budget = totalVotingPower + competingTotal
  return candidates.slice(0, activeCount).map((candidate) => {
    const weight =
      (candidate.scaledSqrt * budget) / sqrtTotal - candidate.competingWeight
    return weight > 0n ? weight : 0n
  })
}

// Converts continuous weights into the 0.01% ballot units the voter contracts
// accept, using largest remainder so the ballot always totals exactly 100%.
function distributeBasisPoints(
  weights: readonly bigint[],
  totalVotingPower: bigint,
): bigint[] {
  const scaled = weights.map((weight) => weight * TOTAL_BASIS_POINTS)
  const basisPoints = scaled.map((value) => value / totalVotingPower)
  const remainders = scaled.map((value) => value % totalVotingPower)
  const assigned = basisPoints.reduce((total, value) => total + value, 0n)
  let leftover = TOTAL_BASIS_POINTS - assigned
  if (leftover <= 0n) return basisPoints

  // Candidates arrive sorted by marginal return, so index order is the tie
  // break that keeps leftover units on the most productive gauges.
  const order = basisPoints
    .map((_, index) => index)
    .sort((a, b) => {
      const left = remainders[a] ?? 0n
      const right = remainders[b] ?? 0n
      if (left !== right) return left > right ? -1 : 1
      return a - b
    })
  for (let index = 0; leftover > 0n; index++, leftover--) {
    const target = order[index % order.length] ?? 0
    basisPoints[target] = (basisPoints[target] ?? 0n) + 1n
  }
  return basisPoints
}

export function optimizeRewardAllocations({
  gauges,
  votingPowers,
}: {
  gauges: readonly RewardOptimizerGauge[]
  votingPowers: readonly bigint[]
}): RewardOptimizerResult | null {
  const eligibleVotingPowers = votingPowers.filter((power) => power > 0n)
  const totalVotingPower = eligibleVotingPowers.reduce(
    (total, power) => total + power,
    0n,
  )
  if (totalVotingPower <= 0n) return null

  const competingWeightFloor = minimumCompetingWeight(totalVotingPower)
  const candidates = gauges
    .flatMap((gauge) => {
      if (gauge.incentiveValueMicroUsd <= 0n) return []
      const competingWeight =
        gauge.existingWeight > competingWeightFloor
          ? gauge.existingWeight
          : competingWeightFloor
      return [
        {
          gauge,
          competingWeight,
          scaledSqrt: integerSquareRoot(
            gauge.incentiveValueMicroUsd *
              competingWeight *
              SQRT_RADICAND_SCALE,
          ),
        },
      ]
    })
    .sort(compareIncentiveDensity)
  if (candidates.length === 0) return null

  const weights = solveOptimalWeights(candidates, totalVotingPower)
  if (weights.length === 0) return null
  const basisPointsByCandidate = distributeBasisPoints(
    weights,
    totalVotingPower,
  )

  const allocations = candidates
    .slice(0, basisPointsByCandidate.length)
    .flatMap((candidate, index) => {
      const basisPoints = basisPointsByCandidate[index] ?? 0n
      if (basisPoints <= 0n) return []
      const voteWeight = aggregateVoteWeight(eligibleVotingPowers, basisPoints)
      return [
        {
          id: candidate.gauge.id,
          basisPoints,
          voteWeight,
          projectedRewardMicroUsd: projectedReward(candidate, voteWeight),
        },
      ]
    })
    .sort((a, b) => {
      if (a.basisPoints !== b.basisPoints) {
        return a.basisPoints > b.basisPoints ? -1 : 1
      }
      if (a.projectedRewardMicroUsd !== b.projectedRewardMicroUsd) {
        return a.projectedRewardMicroUsd > b.projectedRewardMicroUsd ? -1 : 1
      }
      return a.id.localeCompare(b.id)
    })
  if (allocations.length === 0) return null

  return {
    allocations,
    projectedRewardMicroUsd: allocations.reduce(
      (total, allocation) => total + allocation.projectedRewardMicroUsd,
      0n,
    ),
    evaluatedGaugeCount: candidates.length,
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
  if (totalVotingPower <= 0n) return null
  // Divide once at the end so a sub-dollar principal cannot truncate to zero.
  return (
    (epochRewardMicroUsd *
      EPOCHS_PER_YEAR *
      TOTAL_BASIS_POINTS *
      WEI_PER_TOKEN) /
    (totalVotingPower * assetPriceMicroUsd)
  )
}
