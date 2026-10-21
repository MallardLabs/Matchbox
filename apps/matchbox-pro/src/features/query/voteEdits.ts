import type { Ballot, BallotEdit } from "./contract"
import { usd6ToMicro } from "./format"

export type SharedRow = {
  targetId: string
  name: string
  bps: number | null
  /** Summed over selected locks; null once edited (re-priced at sign). */
  projectedMicro: bigint | null
}

/**
 * The one allocation every selected lock signs. Projections add up across
 * locks; an edited or unpriced allocation has no projection until the
 * refresh prices it.
 */
export function sharedAllocation(
  ballots: readonly Ballot[],
  edits: readonly BallotEdit[] | null,
): SharedRow[] {
  const names = new Map<string, string>()
  for (const ballot of ballots) {
    for (const allocation of ballot.allocations) {
      names.set(allocation.targetId, allocation.name)
    }
  }
  if (edits) {
    const first = edits.find((edit) => edit.selected) ?? edits[0]
    return (first?.allocations ?? []).map((allocation) => ({
      targetId: allocation.targetId,
      name: names.get(allocation.targetId) ?? allocation.targetId,
      bps: allocation.bps,
      projectedMicro: null,
    }))
  }
  const selected = ballots.filter((ballot) => ballot.selected)
  const lead = selected[0] ?? ballots[0]
  if (!lead) return []
  return lead.allocations.map((allocation) => {
    let total: bigint | null = 0n
    for (const ballot of selected) {
      const match = ballot.allocations.find(
        (item) => item.targetId === allocation.targetId,
      )
      if (!match) continue
      total =
        total === null || match.projectedUsd === null
          ? null
          : total + usd6ToMicro(match.projectedUsd)
    }
    return {
      targetId: allocation.targetId,
      name: allocation.name,
      bps: allocation.bps,
      projectedMicro: total,
    }
  })
}

/** Manual edits for the refresh endpoint: same vector on every selected lock. */
export function editsFromDraft(
  ballots: readonly Ballot[],
  selected: ReadonlySet<string>,
  allocations: readonly { targetId: string; bps: number }[],
): BallotEdit[] {
  const kept = allocations.filter((allocation) => allocation.bps > 0)
  return ballots.map((ballot) => ({
    ballotKey: ballot.ballotKey,
    selected: selected.has(ballot.ballotKey),
    allocations: kept.map((allocation) => ({ ...allocation })),
  }))
}
