// Ballots are integer basis points end to end: a complete ballot sums to
// exactly 10 000, so "100%" never depends on float addition.
export const FULL_BALLOT_BPS = 10_000
export const STEP_BPS = 500
const WHOLE_PERCENT_BPS = 100

export type BallotEntry = { id: string; bps: number }
export type Ballot = readonly BallotEntry[]

export function ballotTotal(ballot: Ballot): number {
  return ballot.reduce((total, entry) => total + entry.bps, 0)
}

/** Entries that carry weight; zero-share rows stay on the ballot but are not voted. */
export function weightedEntries(ballot: Ballot): BallotEntry[] {
  return ballot.filter((entry) => entry.bps > 0)
}

export function isBallotComplete(ballot: Ballot): boolean {
  return (
    weightedEntries(ballot).length > 0 &&
    ballotTotal(ballot) === FULL_BALLOT_BPS
  )
}

export function hasEntry(ballot: Ballot, id: string): boolean {
  const key = id.toLowerCase()
  return ballot.some((entry) => entry.id.toLowerCase() === key)
}

export function entryBps(ballot: Ballot, id: string): number | undefined {
  const key = id.toLowerCase()
  return ballot.find((entry) => entry.id.toLowerCase() === key)?.bps
}

/** A new entry takes whatever share is still unallocated (all of it on an empty ballot). */
export function addToBallot(ballot: Ballot, id: string): Ballot {
  if (hasEntry(ballot, id)) return ballot
  const remaining = Math.max(0, FULL_BALLOT_BPS - ballotTotal(ballot))
  return [...ballot, { id, bps: remaining }]
}

export function removeFromBallot(ballot: Ballot, id: string): Ballot {
  const key = id.toLowerCase()
  return ballot.filter((entry) => entry.id.toLowerCase() !== key)
}

export function setEntryBps(ballot: Ballot, id: string, bps: number): Ballot {
  const key = id.toLowerCase()
  const clamped = Math.min(FULL_BALLOT_BPS, Math.max(0, Math.round(bps)))
  return ballot.map((entry) =>
    entry.id.toLowerCase() === key ? { ...entry, bps: clamped } : entry,
  )
}

/** Steps to the next 5% mark, so an optimizer share like 37% lands on 40% or 35%. */
export function stepEntry(
  ballot: Ballot,
  id: string,
  direction: 1 | -1,
): Ballot {
  const current = entryBps(ballot, id)
  if (current === undefined) return ballot
  const next =
    direction === 1
      ? (Math.floor(current / STEP_BPS) + 1) * STEP_BPS
      : (Math.ceil(current / STEP_BPS) - 1) * STEP_BPS
  return setEntryBps(ballot, id, next)
}

/**
 * Splits `total` into multiples of `unit` proportional to `weights`, using
 * largest remainder so the parts always sum to `total` exactly.
 */
export function largestRemainder(
  weights: readonly bigint[],
  total: number,
  unit: number,
): number[] {
  const units = BigInt(Math.floor(total / unit))
  const sum = weights.reduce(
    (acc, weight) => acc + (weight > 0n ? weight : 0n),
    0n,
  )
  if (sum === 0n || units === 0n) return weights.map(() => 0)
  const scaled = weights.map((weight) => (weight > 0n ? weight : 0n) * units)
  const parts = scaled.map((value) => value / sum)
  const remainders = scaled.map((value) => value % sum)
  let leftover = units - parts.reduce((acc, part) => acc + part, 0n)
  const order = parts
    .map((_, index) => index)
    .sort((a, b) => {
      const left = remainders[a] ?? 0n
      const right = remainders[b] ?? 0n
      if (left !== right) return left > right ? -1 : 1
      return a - b
    })
  for (let index = 0; leftover > 0n; index++, leftover--) {
    const target = order[index % order.length] ?? 0
    parts[target] = (parts[target] ?? 0n) + 1n
  }
  return parts.map((part) => Number(part) * unit)
}

/**
 * Optimizer output arrives in 0.01% units; the ballot shows whole percents.
 * Rounding the near-flat optimum to 1% costs a negligible amount of return.
 */
export function ballotFromAllocations(
  allocations: ReadonlyArray<{ id: string; basisPoints: bigint }>,
): Ballot {
  const shares = largestRemainder(
    allocations.map((allocation) => allocation.basisPoints),
    FULL_BALLOT_BPS,
    WHOLE_PERCENT_BPS,
  )
  return allocations
    .map((allocation, index) => ({
      id: allocation.id,
      bps: shares[index] ?? 0,
    }))
    .filter((entry) => entry.bps > 0)
}

/** "45%", "45.5%" or "45.37%". */
export function formatBps(bps: number): string {
  const whole = Math.trunc(bps / 100)
  const fraction = Math.abs(bps % 100)
  if (fraction === 0) return `${whole}%`
  const digits = fraction.toString().padStart(2, "0").replace(/0$/, "")
  return `${whole}.${digits}%`
}
