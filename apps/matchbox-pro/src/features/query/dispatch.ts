import type { Viewer } from "@/lib/viewer"
import { MEZO_MAINNET_CHAIN_ID, type Proposal } from "./contract"
import type { CallState } from "./session"

// Pure guards and state for sending a Stuart proposal through the wallet
// (ported from the prototype's dispatchProposalRequests). Stuart never sends
// anything; every status here is what this browser's wallet reported.

export const STUART_CHAIN_ID = MEZO_MAINNET_CHAIN_ID

type ProposalCall = Proposal["calls"][number]

export function requestKey(call: ProposalCall): string {
  return [
    call.chainId,
    call.from.toLowerCase(),
    call.to.toLowerCase(),
    call.data.toLowerCase(),
    call.value,
  ].join(":")
}

export type BlockReason =
  | "disconnected"
  | "watching"
  | "wrong_account"
  | "testnet"
  | "wrong_network"
  | "malformed"
  | "nothing_to_send"

export type GuardResult = { ok: true } | { ok: false; reason: BlockReason }

/** Whether this browser may prompt the wallet for `proposal` at all. */
export function dispatchGuard({
  viewer,
  appChainId,
  proposal,
}: {
  viewer: Viewer
  appChainId: number
  proposal: Proposal
}): GuardResult {
  if (viewer.mode === "disconnected")
    return { ok: false, reason: "disconnected" }
  if (viewer.mode === "watching") return { ok: false, reason: "watching" }
  if (viewer.address.toLowerCase() !== proposal.from.toLowerCase()) {
    return { ok: false, reason: "wrong_account" }
  }
  if (appChainId !== STUART_CHAIN_ID) return { ok: false, reason: "testnet" }
  if (viewer.wrongNetwork) return { ok: false, reason: "wrong_network" }
  if (proposal.calls.length === 0)
    return { ok: false, reason: "nothing_to_send" }
  const malformed = proposal.calls.some(
    (call) =>
      call.chainId !== proposal.chainId ||
      call.from.toLowerCase() !== proposal.from.toLowerCase() ||
      call.value !== "0x0",
  )
  if (malformed) return { ok: false, reason: "malformed" }
  return { ok: true }
}

export function blockCopy(reason: BlockReason): string {
  switch (reason) {
    case "disconnected":
      return "Connect this wallet to sign."
    case "watching":
      return "Watching · read-only. Connect this wallet to sign."
    case "wrong_account":
      return "Prepared for another wallet. Ask again from this one."
    case "testnet":
      return "Stuart signs on Mezo mainnet only."
    case "wrong_network":
      return "Wallet is on another network."
    case "malformed":
      return "This proposal can't be sent from here."
    case "nothing_to_send":
      return "Nothing to sign."
  }
}

/** Calls still to send: anything the wallet already landed is skipped. */
export function pendingCalls(
  proposal: Proposal,
  minedRequestKeys: readonly string[],
): ProposalCall[] {
  const mined = new Set(minedRequestKeys)
  return proposal.calls.filter((call) => !mined.has(requestKey(call)))
}

export function initialCallStates(
  proposal: Proposal,
  minedRequestKeys: readonly string[],
): CallState[] {
  const mined = new Set(minedRequestKeys)
  return proposal.calls.map((call) => {
    const key = requestKey(call)
    return {
      index: call.index,
      requestKey: key,
      label: call.label,
      status: mined.has(key) ? "mined" : "not_sent",
      hash: null,
      error: null,
    }
  })
}

export type DispatchOutcome =
  | "idle"
  | "in_progress"
  | "success"
  | "failed"
  | "partial"

const STOPPED = new Set(["reverted", "rejected", "failed"])

export function dispatchOutcome(calls: readonly CallState[]): DispatchOutcome {
  if (calls.length === 0) return "idle"
  if (calls.every((call) => call.status === "mined")) return "success"
  if (
    calls.some(
      (call) =>
        call.status === "awaiting_wallet" || call.status === "submitted",
    )
  ) {
    return "in_progress"
  }
  const stopped = calls.some((call) => STOPPED.has(call.status))
  if (!stopped) {
    return calls.some((call) => call.status === "mined")
      ? "in_progress"
      : "idle"
  }
  return calls.some((call) => call.status === "mined") ? "partial" : "failed"
}

export function updateCall(
  calls: readonly CallState[],
  index: number,
  patch: Partial<Omit<CallState, "index" | "requestKey" | "label">>,
): CallState[] {
  return calls.map((call) =>
    call.index === index ? { ...call, ...patch } : call,
  )
}

/** First call that stopped the run; the one a retry resumes from. */
export function firstStoppedCall(
  calls: readonly CallState[],
): CallState | null {
  return calls.find((call) => STOPPED.has(call.status)) ?? null
}

export function isExpired(proposal: Proposal, now: number): boolean {
  const expiry = new Date(proposal.expiresAt).getTime()
  return Number.isNaN(expiry) || expiry <= now
}
