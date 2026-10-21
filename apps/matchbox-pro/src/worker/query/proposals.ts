import { getAddress, isHex } from "viem"
import type {
  Proposal,
  Simulation,
  TransactionRequest,
  WalletMode,
} from "../../features/query/contract"
import { hmacHex, keccakJson, timingSafeEqualHex } from "./crypto"
import type { CallToSimulate, SimulatedCall } from "./providers/simulate"

export type ProposalDraft = Omit<
  Proposal,
  "proposalId" | "proposalHash" | "refreshToken"
>

// Expiry per kind (vote proposals must still refresh right before signing).
export const PROPOSAL_TTL_MS: Record<Proposal["kind"], number> = {
  vote: 15 * 60_000,
  claim: 2 * 60_000,
  repay: 2 * 60_000,
  claim_surplus: 2 * 60_000,
  earn_deposit: 2 * 60_000,
  zap: 60_000,
}

// A handle can be refreshed up to a day after it expired; after that the
// user starts over.
export const REFRESH_GRACE_MS = 24 * 60 * 60_000

function tokenMessage(proposal: {
  proposalHash: string
  from: string
  chainId: number
  expiresAt: string
}): string {
  return `${proposal.proposalHash}|${proposal.from.toLowerCase()}|${proposal.chainId}|${proposal.expiresAt}`
}

export function proposalHashOf(draft: ProposalDraft): `0x${string}` {
  return keccakJson(draft)
}

export async function sealProposal(
  draft: ProposalDraft,
  secret: string,
): Promise<Proposal> {
  const proposalHash = proposalHashOf(draft)
  const refreshToken = await hmacHex(
    secret,
    tokenMessage({ ...draft, proposalHash }),
  )
  return {
    ...draft,
    proposalId: `${draft.kind}_${proposalHash.slice(2, 10)}`,
    proposalHash,
    refreshToken,
  }
}

/** True only if every field is exactly what this server signed. */
export async function verifyProposal(
  proposal: Proposal,
  secret: string,
): Promise<boolean> {
  const { proposalId, proposalHash, refreshToken, ...draft } = proposal
  const expectedHash = proposalHashOf(draft)
  if (expectedHash !== proposalHash) return false
  if (proposalId !== `${draft.kind}_${proposalHash.slice(2, 10)}`) return false
  const expectedToken = await hmacHex(secret, tokenMessage(proposal))
  return timingSafeEqualHex(expectedToken, refreshToken)
}

export function simulationOf(
  results: readonly SimulatedCall[],
  method: Simulation["method"],
): Simulation {
  const calls = results.map((result, index) => ({
    index,
    status: result.status,
    gasEstimate:
      result.gasEstimate === null ? null : result.gasEstimate.toString(),
    reason: result.reason,
  }))
  const reverted = calls.filter((call) => call.status === "reverted").length
  const passed = calls.filter((call) => call.status === "passed").length
  const status: Simulation["status"] =
    calls.length === 0
      ? "not_run"
      : reverted === calls.length
        ? "blocked"
        : reverted > 0
          ? "partial"
          : passed === calls.length
            ? "passed"
            : "not_run"
  return { status, method: calls.length === 0 ? "none" : method, calls }
}

/** Status, canSign and blocked reason follow one rule for every kind. */
export function signability(input: {
  walletMode: WalletMode
  simulation: Simulation
  blockedReason: Proposal["blockedReason"]
  needsApproval: boolean
}): Pick<Proposal, "status" | "canSign" | "blockedReason"> {
  if (input.blockedReason) {
    return {
      status: "blocked",
      canSign: false,
      blockedReason: input.blockedReason,
    }
  }
  if (
    input.simulation.status === "blocked" ||
    input.simulation.status === "partial"
  ) {
    return {
      status: "blocked",
      canSign: false,
      blockedReason: "simulation_reverted",
    }
  }
  if (input.walletMode !== "connected") {
    return {
      status: "read_only",
      canSign: false,
      blockedReason: "connect_this_wallet",
    }
  }
  return {
    status: input.needsApproval ? "needs_approval" : "unsigned",
    canSign: input.simulation.status === "passed",
    blockedReason: null,
  }
}

export function expiresAt(kind: Proposal["kind"], now: Date): string {
  return new Date(now.getTime() + PROPOSAL_TTL_MS[kind]).toISOString()
}

/** A proposal call as viem types for simulation. */
export function callTarget(call: TransactionRequest): CallToSimulate {
  if (!isHex(call.data)) throw new Error("Call data is not hex")
  return { to: getAddress(call.to), data: call.data }
}
