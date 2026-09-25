import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

const state = vi.hoisted(() => ({
  connected: true,
  failedReads: 0,
  pending: false,
  claimable: false,
  error: false,
  loading: false,
  stale: false,
}))
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => ({ options }),
  Link: ({ children }: { children: React.ReactNode }) =>
    createElement("a", null, children),
}))
vi.mock("wagmi", () => ({
  useAccount: () => ({ address: "0x123", isConnected: state.connected }),
}))
vi.mock("@/lib/network", () => ({
  useNetwork: () => ({ chainId: 31612, networkName: "Testnet" }),
}))
vi.mock("@/components/wallet/WalletDialogContext", () => ({
  useWalletDialog: () => ({ openConnect: vi.fn() }),
}))
vi.mock("@/hooks/useLocks", () => ({
  useVeMEZOLocks: () => ({
    locks: [],
    isLoading: state.loading,
    error: null,
    refetch: vi.fn(),
  }),
}))
vi.mock("@/hooks/useEpoch", () => ({ useEpoch: () => ({ label: "2d" }) }))
vi.mock("@/hooks/useProfiles", () => ({
  useGaugeProfiles: () => ({ data: [] }),
  profileForGauge: () => undefined,
}))
vi.mock("@/hooks/useClaimable", () => ({
  useClaimable: () => ({
    rows: state.claimable
      ? [
          {
            tokenId: 42n,
            bribeAddress: "0x1111111111111111111111111111111111111111",
            gaugeAddress: "0x2222222222222222222222222222222222222222",
            rewards: [
              {
                tokenAddress: "0x3333333333333333333333333333333333333333",
                symbol: "MEZO",
                decimals: 18,
                earned: 12n * 10n ** 18n,
                usdMicro: 12_000_000n,
                priceAvailable: true,
              },
            ],
          },
        ]
      : [],
    claims: state.claimable ? [{ tokenId: 42n }] : [],
    totalMicro: state.claimable ? 12_000_000n : 0n,
    isLoading: false,
    error: state.error ? new Error("RPC unavailable") : null,
    failedReads: state.failedReads,
    isFetching: false,
    updatedAt: 0,
    indexedAt: new Date(
      Date.now() - (state.stale ? 3600_000 : 0),
    ).toISOString(),
    refetch: vi.fn(),
  }),
}))
vi.mock("@/hooks/usePersonalProjected", () => ({
  usePersonalProjected: () => ({
    projectedMicro: 5_000_000n,
    mezoPrice: "1",
    isLoading: false,
    error: null,
  }),
}))
vi.mock("@/hooks/useRewardClaims", () => ({
  useRewardClaims: () => ({
    rows: [],
    pending: state.pending,
    signing: false,
    ready: true,
    wrongNetwork: false,
    error: null,
    receiptError: null,
  }),
}))

import { Route } from "@/routes/rewards"

function render() {
  if (!Route.options.component) throw new Error("Missing rewards route")
  return renderToStaticMarkup(createElement(Route.options.component))
}

describe("Rewards states", () => {
  beforeEach(() =>
    Object.assign(state, {
      connected: true,
      failedReads: 0,
      pending: false,
      claimable: false,
      error: false,
      loading: false,
      stale: false,
    }),
  )
  it("does not show personal money while disconnected", () => {
    state.connected = false
    expect(render()).toContain("Not connected")
    expect(render()).not.toContain("$5.00")
  })
  it("distinguishes projected-only earnings from claimable rewards", () => {
    const html = render()
    expect(html).toContain("$5.00")
    expect(html).toContain("No claimable rewards")
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Review claim/)
  })
  it.each(["failedReads", "pending", "stale", "error", "loading"] as const)(
    "blocks claims when %s prevents a fresh review",
    (condition) => {
      state.claimable = true
      if (condition === "failedReads") state.failedReads = 1
      else state[condition] = true
      expect(render()).toMatch(/<button[^>]*disabled=""[^>]*>Review claim/)
    },
  )
  it("enables review only when claimable data is available", () => {
    state.claimable = true
    expect(render()).toContain("12.000000")
    expect(render()).toContain("$12.00")
    expect(render()).not.toMatch(/<button[^>]*disabled=""[^>]*>Review claim/)
  })
})
