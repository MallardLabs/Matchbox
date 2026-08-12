import { describe, expect, it, vi } from "vitest"
import {
  type DispatchCallState,
  dispatchProposalRequests,
} from "./useProposalDispatch"

const address = "0x9999999999999999999999999999999999999999"
const requests = [
  {
    chainId: 31_612 as const,
    from: address,
    to: "0x1111111111111111111111111111111111111111",
    data: "0x1234",
    value: "0x0" as const,
    label: "First call",
  },
  {
    chainId: 31_612 as const,
    from: address,
    to: "0x2222222222222222222222222222222222222222",
    data: "0xabcd",
    value: "0x0" as const,
    label: "Second call",
  },
]

function dependencies(overrides: Record<string, unknown> = {}) {
  return {
    accountAddress: address,
    accountChainId: 31_612,
    wallet: {
      address,
      label: "Connected wallet",
      mode: "connected" as const,
      network: "Mezo Mainnet" as const,
    },
    requests,
    switchChain: vi.fn(async () => undefined),
    send: vi
      .fn()
      .mockResolvedValueOnce(`0x${"a".repeat(64)}`)
      .mockResolvedValueOnce(`0x${"b".repeat(64)}`),
    wait: vi.fn(async () => "success" as const),
    onCalls: vi.fn<(calls: DispatchCallState[]) => void>(),
    ...overrides,
  }
}

describe("proposal dispatch", () => {
  it("never sends for a watched wallet", async () => {
    const input = dependencies({
      wallet: {
        address,
        label: "Treasury",
        mode: "watching",
        network: "Mezo Mainnet",
      },
    })

    await expect(dispatchProposalRequests(input)).rejects.toThrow(
      "Connect this wallet to continue",
    )
    expect(input.send).not.toHaveBeenCalled()
  })

  it("sends and confirms each request in order", async () => {
    const input = dependencies()
    const result = await dispatchProposalRequests(input)

    expect(input.send).toHaveBeenCalledTimes(2)
    expect(input.wait).toHaveBeenCalledTimes(2)
    expect(result.map((call) => call.status)).toEqual([
      "confirmed",
      "confirmed",
    ])
  })

  it("refuses a proposal prepared for another wallet", async () => {
    const input = dependencies({
      requests: requests.map((request) => ({
        ...request,
        from: "0x8888888888888888888888888888888888888888",
      })),
    })

    await expect(dispatchProposalRequests(input)).rejects.toThrow(
      /does not match/,
    )
    expect(input.send).not.toHaveBeenCalled()
  })

  it("does not repeat a confirmed call when a later call is retried", async () => {
    const firstAttempt = dependencies({
      wait: vi
        .fn()
        .mockResolvedValueOnce("success")
        .mockResolvedValueOnce("reverted"),
    })
    const first = await dispatchProposalRequests(firstAttempt)
    const retry = dependencies({ previousCalls: first })
    const result = await dispatchProposalRequests(retry)

    expect(retry.send).toHaveBeenCalledTimes(1)
    expect(retry.send).toHaveBeenCalledWith(requests[1])
    expect(result.map((call) => call.status)).toEqual([
      "confirmed",
      "confirmed",
    ])
  })
})
