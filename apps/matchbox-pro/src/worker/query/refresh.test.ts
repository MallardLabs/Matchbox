import { describe, expect, it } from "vitest"
import {
  type Proposal,
  proposalRefreshRequestSchema,
  proposalRefreshResponseSchema,
  stuartRequestSchema,
} from "../../features/query/contract"
import type { StuartProviders } from "./context"
import {
  NOW,
  WALLET,
  fakeDomain,
  fakeProviders,
  fakeTarget,
  fakeTrove,
} from "./fakes"
import { StuartHttpError } from "./http"
import { type StuartRuntime, runStuartQuery } from "./orchestrator"
import { refreshProposal } from "./refresh"

const E18 = 10n ** 18n

function runtime(
  overrides: Partial<StuartProviders> = {},
  now = NOW,
): StuartRuntime {
  return {
    providers: fakeProviders(overrides),
    secret: "test-secret",
    now: () => now,
    claude: null,
    log: () => undefined,
  }
}

async function proposalFor(query: string): Promise<Proposal> {
  const response = await runStuartQuery(
    stuartRequestSchema.parse({
      version: 1,
      query,
      sessionId: "6f1c1b8e-3c55-4a3f-9b8a-1d2e3f4a5b6c",
      turn: 0,
      surface: "canvas",
      chainId: 31_612,
      wallet: { address: WALLET, mode: "connected" },
    }),
    runtime(),
  )
  const proposal = response.proposedActions[0]
  if (!proposal) throw new Error(`no proposal for ${query}`)
  return proposal
}

function refreshRequest(
  proposal: Proposal,
  extra: Record<string, unknown> = {},
) {
  return proposalRefreshRequestSchema.parse({
    version: 1,
    proposal,
    wallet: { address: WALLET, mode: "connected" },
    ...extra,
  })
}

async function expectHttpError(
  promise: Promise<unknown>,
  status: number,
): Promise<void> {
  try {
    await promise
  } catch (error) {
    expect(error).toBeInstanceOf(StuartHttpError)
    if (error instanceof StuartHttpError) expect(error.status).toBe(status)
    return
  }
  throw new Error("expected an error")
}

describe("POST /api/proposal/refresh", () => {
  it("re-prepares an unchanged vote without asking for acknowledgement", async () => {
    const proposal = await proposalFor("optimize my votes")
    const result = await refreshProposal(refreshRequest(proposal), runtime())
    expect(proposalRefreshResponseSchema.safeParse(result).success).toBe(true)
    expect(result.material).toBe(false)
    expect(result.reasons).toEqual([])
    expect(result.diff?.material).toBe(false)
    expect(result.proposal.refreshToken).not.toBe("")
  })

  it("flags a moved optimum as material and shows the frame 38 diff", async () => {
    const proposal = await proposalFor("optimize my votes")
    const shifted = runtime({
      votingDomain: async () =>
        fakeDomain([
          fakeTarget({
            index: 1,
            name: "Stackbridge",
            weight: 1_000n * E18,
            mezo: 30_000n * E18,
          }),
          fakeTarget({
            index: 2,
            name: "tBTC / WBTC",
            weight: 2_000n * E18,
            mezo: 20_000n * E18,
          }),
          fakeTarget({
            index: 3,
            name: "Lombard",
            weight: 3_000n * E18,
            mezo: 20_000n * E18,
          }),
        ]),
    })
    const result = await refreshProposal(refreshRequest(proposal), shifted)
    expect(result.material).toBe(true)
    expect(result.reasons).toEqual(
      expect.arrayContaining(["allocation_pp", "projected_pct"]),
    )
    expect(result.diff?.actions).toEqual(["acknowledge_new_optimum"])
    expect(result.diff?.rows.length).toBeGreaterThan(0)
  })

  it("keeps manual edits unless the user accepts the new optimum", async () => {
    const proposal = await proposalFor("optimize my votes")
    if (proposal.content.kind !== "vote") throw new Error("expected vote")
    const ballots = proposal.content.ballots.map((ballot) => ({
      ballotKey: ballot.ballotKey,
      selected: true,
      allocations: [
        { targetId: ballot.allocations[0]?.targetId ?? "", bps: 6_000 },
        { targetId: ballot.allocations[1]?.targetId ?? "", bps: 4_000 },
      ],
    }))
    const kept = await refreshProposal(
      refreshRequest(proposal, { edits: { ballots }, manualOverride: true }),
      runtime(),
    )
    expect(kept.preservedManualEdits).toBe(true)
    expect(kept.proposal.origin).toBe("manual")
    expect(kept.recommended?.origin).toBe("optimizer")
    expect(kept.diff?.actions).toEqual([
      "acknowledge_new_optimum",
      "keep_my_allocation",
    ])
    const accepted = await refreshProposal(
      refreshRequest(proposal, { edits: { ballots }, acceptNewOptimum: true }),
      runtime(),
    )
    expect(accepted.preservedManualEdits).toBe(false)
    expect(accepted.proposal.origin).toBe("optimizer")
  })

  it("rejects a forged handle, a different wallet and a long-expired proposal", async () => {
    const proposal = await proposalFor("optimize my votes")
    await expectHttpError(
      refreshProposal(
        refreshRequest({ ...proposal, origin: "manual" }),
        runtime(),
      ),
      400,
    )
    await expectHttpError(
      refreshProposal(
        proposalRefreshRequestSchema.parse({
          version: 1,
          proposal,
          wallet: {
            address: "0x0000000000000000000000000000000000000001",
            mode: "connected",
          },
        }),
        runtime(),
      ),
      403,
    )
    const later = new Date(NOW.getTime() + 25 * 60 * 60_000)
    await expectHttpError(
      refreshProposal(refreshRequest(proposal), runtime({}, later)),
      410,
    )
  })

  it("treats accrued interest on a repay as immaterial but a redemption as material", async () => {
    const proposal = await proposalFor("repay 5,000 mUSD on my trove")
    const accrued = await refreshProposal(
      refreshRequest(proposal),
      runtime({ trove: async () => fakeTrove({ interest: 201n * E18 }) }),
    )
    expect(accrued.material).toBe(false)
    const redeemed = await refreshProposal(
      refreshRequest(proposal),
      runtime({
        trove: async () => fakeTrove({ status: "closed_by_redemption" }),
      }),
    )
    expect(redeemed.material).toBe(true)
    expect(redeemed.proposal.canSign).toBe(false)
  })

  it("re-quotes a zap with the same input and flags a worse min-out", async () => {
    const proposal = await proposalFor("Zap $50 MEZO into the mUSD vault")
    const same = await refreshProposal(refreshRequest(proposal), runtime())
    expect(same.material).toBe(false)
    const worse = await refreshProposal(
      refreshRequest(proposal),
      runtime({
        zapQuote: async (_route, amountIn) => ({
          amountIn,
          amountOut: (amountIn * 2_800_000_000_000_000n) / E18,
        }),
      }),
    )
    expect(worse.material).toBe(true)
    expect(worse.reasons).toContain("quote")
  })
})
