import type {
  AllocationDiffBlock,
  MaterialityReason,
  Proposal,
} from "../../features/query/contract"
import { microFromUsd6, usd6 } from "./format"

// Pre-sign refresh rule. A change needs acknowledgement when any target moves
// ≥ 1 percentage point, projected USD moves ≥ 1%, the target or ballot set
// changes, a quote's min-out falls or its route changes, an approval grows, the
// position moved, or signability flipped. Raw calldata inequality alone is
// never material: a 1 bp jitter re-encodes every ballot.

export const ALLOCATION_THRESHOLD_BPS = 100
export const PROJECTED_THRESHOLD_BPS = 100n

type TargetTotals = Map<
  string,
  { name: string; bps: number; projected: bigint }
>

function voteTargets(proposal: Proposal): TargetTotals {
  const totals: TargetTotals = new Map()
  if (proposal.content.kind !== "vote") return totals
  const selected = proposal.content.ballots.filter((ballot) => ballot.selected)
  const first = selected[0]
  for (const ballot of selected) {
    for (const allocation of ballot.allocations) {
      const current = totals.get(allocation.targetId) ?? {
        name: allocation.name,
        bps: 0,
        projected: 0n,
      }
      totals.set(allocation.targetId, {
        name: allocation.name,
        // Every selected ballot carries the same bps vector; read it once.
        bps: ballot === first ? allocation.bps : current.bps,
        projected:
          current.projected +
          (allocation.projectedUsd === null
            ? 0n
            : microFromUsd6(allocation.projectedUsd)),
      })
    }
  }
  return totals
}

function projectedOf(proposal: Proposal): bigint | null {
  return proposal.content.kind === "vote" &&
    proposal.content.projectedUsd !== null
    ? microFromUsd6(proposal.content.projectedUsd)
    : null
}

function approvalTotals(proposal: Proposal): Map<string, bigint> {
  const totals = new Map<string, bigint>()
  for (const approval of proposal.approvals) {
    const key = `${approval.token.toLowerCase()}:${approval.spender.toLowerCase()}`
    totals.set(key, (totals.get(key) ?? 0n) + BigInt(approval.amount.raw))
  }
  return totals
}

function sameSet(left: Iterable<string>, right: Iterable<string>): boolean {
  const a = new Set(left)
  const b = new Set(right)
  return a.size === b.size && [...a].every((value) => b.has(value))
}

export function materialReasons(
  before: Proposal,
  after: Proposal,
): MaterialityReason[] {
  const reasons = new Set<MaterialityReason>()
  if (before.canSign !== after.canSign) reasons.add("can_sign")

  if (before.content.kind === "vote" && after.content.kind === "vote") {
    const was = voteTargets(before)
    const now = voteTargets(after)
    if (!sameSet(was.keys(), now.keys())) reasons.add("target_set")
    const selectedKeys = (proposal: Proposal) =>
      proposal.content.kind === "vote"
        ? proposal.content.ballots
            .filter((ballot) => ballot.selected)
            .map((ballot) => ballot.ballotKey)
        : []
    if (!sameSet(selectedKeys(before), selectedKeys(after)))
      reasons.add("ballot_set")
    for (const key of new Set([...was.keys(), ...now.keys()])) {
      const delta = Math.abs(
        (was.get(key)?.bps ?? 0) - (now.get(key)?.bps ?? 0),
      )
      if (delta >= ALLOCATION_THRESHOLD_BPS) reasons.add("allocation_pp")
    }
    const beforeUsd = projectedOf(before)
    const afterUsd = projectedOf(after)
    if (beforeUsd !== null && afterUsd !== null) {
      const delta =
        afterUsd > beforeUsd ? afterUsd - beforeUsd : beforeUsd - afterUsd
      if (
        beforeUsd === 0n
          ? delta > 0n
          : delta * 10_000n >= beforeUsd * PROJECTED_THRESHOLD_BPS
      ) {
        reasons.add("projected_pct")
      }
    }
  }

  if (before.quote && after.quote) {
    if (BigInt(after.quote.minOut.raw) < BigInt(before.quote.minOut.raw))
      reasons.add("quote")
    if (
      before.quote.routerId !== after.quote.routerId ||
      before.quote.pool.toLowerCase() !== after.quote.pool.toLowerCase()
    ) {
      reasons.add("quote")
    }
  } else if ((before.quote === null) !== (after.quote === null)) {
    reasons.add("quote")
  }

  const beforeApprovals = approvalTotals(before)
  for (const [key, amount] of approvalTotals(after)) {
    if (amount > (beforeApprovals.get(key) ?? 0n)) reasons.add("approval")
  }

  if (before.content.kind === "repay" && after.content.kind === "repay") {
    const was = BigInt(before.content.debtBefore.raw)
    const now = BigInt(after.content.debtBefore.raw)
    const delta = was > now ? was - now : now - was
    if (was > 0n && delta * 100n >= was) reasons.add("position")
    if (before.content.amount.raw !== after.content.amount.raw)
      reasons.add("position")
  }
  if (before.content.kind === "claim" && after.content.kind === "claim") {
    const keys = (proposal: Proposal) =>
      proposal.content.kind === "claim"
        ? proposal.content.rows.map((row) => row.rowKey)
        : []
    if (!sameSet(keys(before), keys(after))) reasons.add("position")
  }
  if (
    before.content.kind === "claim_surplus" &&
    after.content.kind === "claim_surplus"
  ) {
    if (before.content.amount.raw !== after.content.amount.raw)
      reasons.add("position")
  }
  if (
    before.status !== after.status &&
    (after.status === "blocked" || after.status === "unavailable")
  ) {
    reasons.add("can_sign")
  }
  return [...reasons]
}

export function voteDiffBlock(input: {
  id: string
  before: Proposal
  after: Proposal
  material: boolean
  reasons: MaterialityReason[]
  manualEditsPreserved: boolean
  evidenceRefs: string[]
}): AllocationDiffBlock {
  const was = voteTargets(input.before)
  const now = voteTargets(input.after)
  const beforeUsd = projectedOf(input.before)
  const afterUsd = projectedOf(input.after)
  const deltaBps =
    beforeUsd !== null && afterUsd !== null && beforeUsd > 0n
      ? Number(((afterUsd - beforeUsd) * 10_000n) / beforeUsd)
      : null
  const native = (proposal: Proposal) =>
    proposal.content.kind === "vote" ? proposal.content.projectedNative : null
  const rows = [...new Set([...was.keys(), ...now.keys()])]
    .map((targetId) => {
      const before = was.get(targetId)
      const after = now.get(targetId)
      return {
        ballotKey: "all",
        targetId,
        name: (after?.name ?? before?.name ?? targetId).slice(0, 80),
        beforeBps: before?.bps ?? 0,
        afterBps: after?.bps ?? 0,
        deltaProjectedUsd: usd6(
          (after?.projected ?? 0n) - (before?.projected ?? 0n),
        ),
      }
    })
    .sort(
      (left, right) =>
        right.beforeBps - left.beforeBps || right.afterBps - left.afterBps,
    )
  const actions: AllocationDiffBlock["actions"] = input.manualEditsPreserved
    ? ["acknowledge_new_optimum", "keep_my_allocation"]
    : input.material
      ? ["acknowledge_new_optimum"]
      : []
  return {
    type: "allocation_diff",
    version: 1,
    id: input.id,
    evidenceRefs: input.evidenceRefs,
    proposalId: input.before.proposalId,
    refreshedProposalId: input.after.proposalId,
    refreshedAtBlock: input.after.snapshotBlock,
    material: input.material,
    reasons: input.reasons,
    beforeProjectedUsd: beforeUsd === null ? null : usd6(beforeUsd),
    afterProjectedUsd: afterUsd === null ? null : usd6(afterUsd),
    projectedDeltaBps: deltaBps,
    beforeNative: native(input.before),
    afterNative: native(input.after),
    rows: rows.slice(0, 100),
    manualEditsPreserved: input.manualEditsPreserved,
    actions,
  }
}
