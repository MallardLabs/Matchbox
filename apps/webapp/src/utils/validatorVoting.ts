export function percentageToBasisPoints(value: string): bigint | null {
  const trimmed = value.trim()
  if (!/^\d{1,3}(\.\d{0,2})?$/.test(trimmed)) return null
  const [whole = "0", fraction = ""] = trimmed.split(".")
  const result = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"))
  return result <= 10_000n ? result : null
}

export function allocationTotalBasisPoints(
  values: Iterable<string>,
): bigint | null {
  let total = 0n
  for (const value of values) {
    if (!value.trim()) continue
    const parsed = percentageToBasisPoints(value)
    if (parsed === null) return null
    total += parsed
  }
  return total
}

export function basisPointsToPercentage(value: bigint): string {
  const whole = value / 100n
  const fraction = (value % 100n).toString().padStart(2, "0")
  return fraction === "00" ? whole.toString() : `${whole}.${fraction}`
}

export function equalVoteBasisPoints(itemCount: number): bigint[] {
  if (!Number.isSafeInteger(itemCount) || itemCount <= 0) return []

  const count = BigInt(itemCount)
  const base = 10_000n / count
  const remainder = 10_000n % count

  return Array.from({ length: itemCount }, (_, index) =>
    BigInt(index) < remainder ? base + 1n : base,
  )
}

export type SelectedValidatorVote = {
  vote: bigint
  usedWeight: bigint
  votingPower: bigint
  eligible: boolean
}

export function aggregateSelectedVoteBasisPoints(
  votes: readonly Pick<SelectedValidatorVote, "vote" | "usedWeight">[],
): bigint {
  const totals = votes.reduce(
    (current, item) => ({
      vote: current.vote + item.vote,
      usedWeight: current.usedWeight + item.usedWeight,
    }),
    { vote: 0n, usedWeight: 0n },
  )
  if (totals.usedWeight === 0n) return 0n
  return (totals.vote * 10_000n) / totals.usedWeight
}

export function calculateProjectedValidatorWeight(
  currentWeight: bigint,
  selectedVotes: readonly SelectedValidatorVote[],
  allocationBasisPoints: bigint,
): bigint {
  const eligibleVotes = selectedVotes.filter((item) => item.eligible)
  const existingVotes = eligibleVotes.reduce(
    (total, item) => total + item.vote,
    0n,
  )
  const proposedVotes = eligibleVotes.reduce(
    (total, item) =>
      total + (item.votingPower * allocationBasisPoints) / 10_000n,
    0n,
  )
  const baseWeight =
    currentWeight > existingVotes ? currentWeight - existingVotes : 0n
  return baseWeight + proposedVotes
}

export function voteNeedsPoke(
  votingPowerChangedAt: bigint | undefined,
  oldestActiveVoteUpdatedAt: bigint | undefined,
): boolean {
  return (
    votingPowerChangedAt !== undefined &&
    oldestActiveVoteUpdatedAt !== undefined &&
    votingPowerChangedAt > oldestActiveVoteUpdatedAt
  )
}

export type ValidatorSortMode =
  | "incentives"
  | "apy"
  | "share"
  | "weight"
  | "name"

export type ValidatorSortEntry = {
  gauge: string
  name: string
  weight: bigint
  shareBasisPoints: bigint
  incentivesMicroUsd: bigint | null
  apyBasisPoints: bigint | null
}

function compareBigInt(a: bigint, b: bigint): number {
  return a < b ? -1 : a > b ? 1 : 0
}

function sortableApy(value: bigint | null): bigint {
  if (value === -1n) return 2n ** 255n
  return value ?? -1n
}

export function compareValidatorSortEntries(
  a: ValidatorSortEntry,
  b: ValidatorSortEntry,
  mode: ValidatorSortMode,
  direction: "asc" | "desc",
): number {
  let comparison = 0
  if (mode === "name") comparison = a.name.localeCompare(b.name)
  if (mode === "weight") comparison = compareBigInt(a.weight, b.weight)
  if (mode === "share")
    comparison = compareBigInt(a.shareBasisPoints, b.shareBasisPoints)
  if (mode === "incentives")
    comparison = compareBigInt(
      a.incentivesMicroUsd ?? -1n,
      b.incentivesMicroUsd ?? -1n,
    )
  if (mode === "apy")
    comparison = compareBigInt(
      sortableApy(a.apyBasisPoints),
      sortableApy(b.apyBasisPoints),
    )

  if (comparison !== 0) return direction === "asc" ? comparison : -comparison
  const nameComparison = a.name.localeCompare(b.name)
  if (nameComparison !== 0) return nameComparison
  return a.gauge.toLowerCase().localeCompare(b.gauge.toLowerCase())
}
