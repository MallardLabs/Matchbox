import { getAddress } from "viem"
import type {
  ParsedProposalRefreshRequest,
  Proposal,
  ProposalRefreshResponse,
} from "../../features/query/contract"
import type { StuartContext } from "./context"
import { displayToken, displayUsd, microFromUsd6 } from "./format"
import { StuartHttpError } from "./http"
import { materialReasons, voteDiffBlock } from "./materiality"
import type { StuartRuntime } from "./orchestrator"
import { IdScope } from "./outcome"
import { REFRESH_GRACE_MS, verifyProposal } from "./proposals"
import { APPROVED_DESTINATIONS, APPROVED_ZAP_ROUTES } from "./providers/zap"
import {
  buildRepayProposal,
  buildSurplusProposal,
  troveFigures,
} from "./tools/loans"
import { buildClaimProposal, scanClaims } from "./tools/rewards"
import type { ToolContext } from "./tools/tool"
import { planVotes, presentVotePlan } from "./tools/votes"
import { buildSavingsDeposit, buildSwapZap } from "./tools/zap"

type Fresh = {
  proposal: Proposal
  recommended: Proposal | null
  preservedManualEdits: boolean
  evidence: ProposalRefreshResponse["evidence"]
  trace: ProposalRefreshResponse["activityTrace"]
}

function unavailable(): StuartHttpError {
  return new StuartHttpError(
    409,
    "invalid_proposal",
    "This proposal can no longer be prepared. Ask Stuart again.",
  )
}

async function refreshVote(
  context: ToolContext,
  request: ParsedProposalRefreshRequest,
): Promise<Fresh> {
  const { proposal } = request
  if (proposal.content.kind !== "vote") throw unavailable()
  const ballots = proposal.content.ballots
  const branch = ballots[0]?.branch ?? "boost"
  const edits = request.edits?.ballots ?? null
  const selectedIds = (edits ?? ballots)
    .filter((ballot) => ballot.selected)
    .map((ballot) => ballot.ballotKey.split(":")[1] ?? "")
  const manualSource = edits?.find((ballot) => ballot.selected) ?? null
  const keepManual =
    !request.acceptNewOptimum &&
    (request.manualOverride ||
      manualSource !== null ||
      proposal.origin !== "optimizer")
  const manualBps = keepManual
    ? new Map(
        (
          manualSource?.allocations ??
          ballots[0]?.allocations.map((allocation) => ({
            targetId: allocation.targetId,
            bps: allocation.bps,
          })) ??
          []
        ).map((allocation) => [
          allocation.targetId.toLowerCase(),
          BigInt(allocation.bps),
        ]),
      )
    : null
  const optimum = await planVotes(context, {
    branch,
    lockIds: selectedIds,
    manual: null,
  })
  if (!optimum || optimum.eligible.length === 0) throw unavailable()
  const optimumView = await presentVotePlan(
    { ...context, scope: new IdScope("o") },
    optimum,
    { tool: "optimize_votes", intent: "optimize_votes", origin: "optimizer" },
  )
  if (!optimumView.proposal) throw unavailable()
  if (!manualBps) {
    return {
      proposal: optimumView.proposal,
      recommended: null,
      preservedManualEdits: false,
      evidence: optimumView.outcome.evidence,
      trace: optimumView.outcome.trace,
    }
  }
  const manualView = await presentVotePlan(
    context,
    { ...optimum, bps: manualBps },
    { tool: "prepare_vote", intent: "custom_vote", origin: "manual" },
  )
  if (!manualView.proposal) throw unavailable()
  return {
    proposal: manualView.proposal,
    recommended: optimumView.proposal,
    preservedManualEdits: true,
    evidence: manualView.outcome.evidence,
    trace: manualView.outcome.trace,
  }
}

async function refreshOther(
  context: ToolContext,
  request: ParsedProposalRefreshRequest,
): Promise<Fresh> {
  const { proposal } = request
  const content = proposal.content
  const done = (
    fresh: Proposal | null,
    evidence: Fresh["evidence"] = [],
  ): Fresh => {
    if (!fresh) throw unavailable()
    return {
      proposal: fresh,
      recommended: null,
      preservedManualEdits: false,
      evidence,
      trace: [],
    }
  }
  if (content.kind === "claim") {
    const sources = [
      ...new Set(
        content.rows.flatMap((row) =>
          row.source === "collateral_surplus" ? [] : [row.source],
        ),
      ),
    ]
    const lockIds = content.rows.flatMap((row) =>
      row.tokenId ? [row.tokenId] : [],
    )
    const scan = await scanClaims(context, sources, lockIds)
    return done(await buildClaimProposal(context, scan))
  }
  if (content.kind === "repay" || content.kind === "claim_surplus") {
    const trove = await context.providers.trove(context.wallet.address)
    if (content.kind === "claim_surplus")
      return done(await buildSurplusProposal(context, trove))
    const figures = troveFigures(trove)
    const amount =
      content.mode === "max_partial"
        ? figures.maxRepay
        : BigInt(content.amount.raw)
    return done(
      await buildRepayProposal(context, {
        trove,
        figures,
        amount,
        mode: content.mode,
      }),
    )
  }
  const destination = APPROVED_DESTINATIONS.find(
    (item) =>
      item.id ===
      (content.kind === "zap" || content.kind === "earn_deposit"
        ? content.destinationId
        : ""),
  )
  if (!destination) throw unavailable()
  if (content.kind === "earn_deposit") {
    const built = await buildSavingsDeposit(context, {
      destination,
      amount: BigInt(content.amount.raw),
      tool: "prepare_zap",
    })
    return done(built.proposal, built.outcome.evidence)
  }
  const route = APPROVED_ZAP_ROUTES.find(
    (item) => item.routeId === proposal.quote?.routerId,
  )
  if (!route || !proposal.quote) throw unavailable()
  const built = await buildSwapZap(context, {
    route,
    destination,
    amountIn: BigInt(proposal.quote.amountIn.raw),
    amountUsd: null,
    slippageBps: request.edits?.slippageBps ?? proposal.quote.slippageBps,
    prepare: true,
    tool: "prepare_zap",
  })
  return done(built.proposal, built.outcome.evidence)
}

function changesFor(
  before: Proposal,
  after: Proposal,
): ProposalRefreshResponse["changes"] {
  const changes: ProposalRefreshResponse["changes"] = []
  if (before.quote && after.quote) {
    changes.push({
      key: "min_out",
      label: "Min received",
      before: displayToken(before.quote.minOut),
      after: displayToken(after.quote.minOut),
      material:
        BigInt(after.quote.minOut.raw) < BigInt(before.quote.minOut.raw),
    })
  }
  if (before.content.kind === "repay" && after.content.kind === "repay") {
    changes.push({
      key: "debt",
      label: "Debt",
      before: displayToken(before.content.debtBefore),
      after: displayToken(after.content.debtBefore),
      material: false,
    })
  }
  if (before.content.kind === "claim" && after.content.kind === "claim") {
    const usd = (value: string | null) =>
      value === null ? "Unpriced" : displayUsd(microFromUsd6(value))
    changes.push({
      key: "claimable",
      label: "Claimable",
      before: usd(before.content.totalUsd),
      after: usd(after.content.totalUsd),
      material: false,
    })
  }
  if (before.canSign !== after.canSign) {
    changes.push({
      key: "can_sign",
      label: "Signable",
      before: before.canSign ? "Yes" : "No",
      after: after.canSign ? "Yes" : "No",
      material: true,
    })
  }
  return changes.slice(0, 16)
}

export async function refreshProposal(
  request: ParsedProposalRefreshRequest,
  runtime: StuartRuntime,
): Promise<ProposalRefreshResponse> {
  const { proposal } = request
  if (!(await verifyProposal(proposal, runtime.secret))) {
    throw new StuartHttpError(
      400,
      "invalid_proposal",
      "Proposal handle is not valid.",
    )
  }
  const now = runtime.now()
  if (now.getTime() - Date.parse(proposal.expiresAt) > REFRESH_GRACE_MS) {
    throw new StuartHttpError(
      410,
      "proposal_expired",
      "Proposal expired. Ask Stuart again.",
    )
  }
  if (request.wallet.address.toLowerCase() !== proposal.from.toLowerCase()) {
    throw new StuartHttpError(
      403,
      "wallet_mismatch",
      "Proposal belongs to another wallet.",
    )
  }
  const context: StuartContext & { scope: IdScope } = {
    providers: runtime.providers,
    wallet: {
      address: getAddress(proposal.from),
      mode: request.wallet.mode,
      label: "Wallet",
    },
    query: "",
    choice: null,
    now: runtime.now,
    secret: runtime.secret,
    scope: new IdScope("p"),
  }
  const fresh =
    proposal.kind === "vote"
      ? await refreshVote(context, request)
      : await refreshOther(context, request)
  const reasons = materialReasons(proposal, fresh.proposal)
  const material = reasons.length > 0
  const diff =
    proposal.kind === "vote"
      ? voteDiffBlock({
          id: "p.b.diff",
          before: proposal,
          after: fresh.recommended ?? fresh.proposal,
          material,
          reasons,
          manualEditsPreserved: fresh.preservedManualEdits,
          evidenceRefs: fresh.evidence.map((item) => item.id),
        })
      : null
  runtime.log({
    message: "stuart.refresh",
    kind: proposal.kind,
    material,
    reasons,
    preservedManualEdits: fresh.preservedManualEdits,
  })
  return {
    version: 1,
    proposal: fresh.proposal,
    recommended: fresh.recommended,
    preservedManualEdits: fresh.preservedManualEdits,
    material,
    reasons,
    diff,
    changes: changesFor(proposal, fresh.proposal),
    evidence: fresh.evidence.slice(0, 24),
    activityTrace: fresh.trace.slice(0, 16),
  }
}
