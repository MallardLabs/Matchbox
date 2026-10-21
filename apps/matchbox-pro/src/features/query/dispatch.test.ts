import type { Viewer } from "@/lib/viewer"
import { getAddress } from "viem"
import { describe, expect, it } from "vitest"
import {
  dispatchGuard,
  dispatchOutcome,
  firstStoppedCall,
  initialCallStates,
  isExpired,
  pendingCalls,
  requestKey,
  updateCall,
} from "./dispatch"
import { WALLET, proposalFixture } from "./fixtures"

const connected: Viewer = {
  mode: "connected",
  address: getAddress(WALLET),
  canSign: true,
  wrongNetwork: false,
}

describe("dispatch guards", () => {
  it("never signs for watched, disconnected or other wallets", () => {
    const proposal = proposalFixture()
    expect(
      dispatchGuard({
        viewer: {
          mode: "watching",
          address: getAddress(WALLET),
          canSign: false,
          connectedAddress: undefined,
        },
        appChainId: 31_612,
        proposal,
      }),
    ).toEqual({ ok: false, reason: "watching" })
    expect(
      dispatchGuard({
        viewer: { mode: "disconnected", address: undefined, canSign: false },
        appChainId: 31_612,
        proposal,
      }),
    ).toEqual({ ok: false, reason: "disconnected" })
    expect(
      dispatchGuard({
        viewer: {
          ...connected,
          address: getAddress("0x1111111111111111111111111111111111111111"),
        },
        appChainId: 31_612,
        proposal,
      }),
    ).toEqual({ ok: false, reason: "wrong_account" })
  })

  it("asks for a network switch and refuses testnet", () => {
    const proposal = proposalFixture()
    expect(
      dispatchGuard({
        viewer: { ...connected, wrongNetwork: true, canSign: false },
        appChainId: 31_612,
        proposal,
      }),
    ).toEqual({ ok: false, reason: "wrong_network" })
    expect(
      dispatchGuard({ viewer: connected, appChainId: 31_611, proposal }),
    ).toEqual({ ok: false, reason: "testnet" })
  })

  it("rejects a call from another sender", () => {
    const proposal = proposalFixture()
    const [first, second] = proposal.calls
    if (!first || !second) throw new Error("fixture")
    const bad = proposalFixture({
      calls: [
        first,
        { ...second, from: "0x1111111111111111111111111111111111111111" },
      ],
    })
    expect(
      dispatchGuard({ viewer: connected, appChainId: 31_612, proposal: bad }),
    ).toEqual({
      ok: false,
      reason: "malformed",
    })
    expect(
      dispatchGuard({ viewer: connected, appChainId: 31_612, proposal }),
    ).toEqual({
      ok: true,
    })
  })
})

describe("dispatch state", () => {
  it("never re-sends a call the wallet already landed", () => {
    const proposal = proposalFixture()
    const [first] = proposal.calls
    if (!first) throw new Error("fixture")
    const mined = [requestKey(first)]
    expect(pendingCalls(proposal, mined).map((call) => call.index)).toEqual([1])
    expect(
      initialCallStates(proposal, mined).map((call) => call.status),
    ).toEqual(["mined", "not_sent"])
  })

  it("keys requests case-insensitively on address and data", () => {
    const [call] = proposalFixture().calls
    if (!call) throw new Error("fixture")
    expect(requestKey(call)).toBe(
      requestKey({ ...call, to: call.to.toUpperCase().replace("0X", "0x") }),
    )
  })

  it("derives success, failure and partial outcomes", () => {
    const calls = initialCallStates(proposalFixture(), [])
    expect(dispatchOutcome(calls)).toBe("idle")
    const sending = updateCall(calls, 0, { status: "awaiting_wallet" })
    expect(dispatchOutcome(sending)).toBe("in_progress")
    const failed = updateCall(calls, 0, { status: "rejected" })
    expect(dispatchOutcome(failed)).toBe("failed")
    const partial = updateCall(updateCall(calls, 0, { status: "mined" }), 1, {
      status: "reverted",
    })
    expect(dispatchOutcome(partial)).toBe("partial")
    expect(firstStoppedCall(partial)?.index).toBe(1)
    const done = updateCall(updateCall(calls, 0, { status: "mined" }), 1, {
      status: "mined",
    })
    expect(dispatchOutcome(done)).toBe("success")
  })

  it("treats a past expiry as expired", () => {
    const proposal = proposalFixture()
    expect(isExpired(proposal, Date.parse("2026-10-21T12:14:59.000Z"))).toBe(
      false,
    )
    expect(isExpired(proposal, Date.parse("2026-10-21T12:15:00.000Z"))).toBe(
      true,
    )
  })
})
