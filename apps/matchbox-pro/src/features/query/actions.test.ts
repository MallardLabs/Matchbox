import { describe, expect, it } from "vitest"
import { answerActions, visibleFollowups } from "./actions"
import type { Followup, Proposal, UiBlock } from "./contract"
import { proposalFixture, responseFixture } from "./fixtures"

function actionsFor(
  blocks: readonly UiBlock[],
  proposals: readonly Proposal[],
  cancelled: ReadonlySet<string> = new Set(),
) {
  return answerActions({
    blocks,
    proposals,
    proposalFor: (id) =>
      proposals.find((proposal) => proposal.proposalId === id) ?? null,
    cancelled,
    hasWhy: true,
    now: Date.parse("2026-10-21T12:00:00.000Z"),
  })
}

describe("answer actions", () => {
  it("offers Review vote then Edit allocation for a ranking", () => {
    const response = responseFixture()
    const actions = actionsFor(response.uiBlocks, response.proposedActions)
    expect(actions.map((action) => [action.label, action.tone])).toEqual([
      ["Review vote", "primary"],
      ["Edit allocation", "secondary"],
    ])
    const edit = actions[1]
    expect(edit?.kind === "review" && edit.edit).toBe(true)
  })

  it("asks for a repayment when the answer has no repay proposal", () => {
    const blocks = responseFixture().uiBlocks.filter(
      (block) => block.type !== "gauge_ranking",
    )
    const scenario: UiBlock = {
      type: "liquidation_scenario",
      version: 1,
      id: "scn",
      evidenceRefs: [],
      asset: "BTC",
      base: {
        priceUsd: "59200.000000",
        collateralRatioBps: 29477,
        liquidationPriceUsd: "22091.670000",
      },
      rows: [
        {
          shockBps: -1000,
          priceUsd: "53280.000000",
          collateralRatioBps: 26529,
          band: "healthy",
          requested: true,
          isLiquidationRow: false,
        },
      ],
      thresholds: { minCollateralRatioBps: 11000, nearBandBps: 15000 },
      requestedOutcome: "safe",
      snapshotBlock: "4128440",
    }
    const actions = actionsFor([...blocks, scenario], [])
    expect(actions.map((action) => action.kind)).toEqual(["ask", "why"])
    const first = actions[0]
    expect(first?.kind === "ask" && first.query).toBe("Repay my mUSD trove")
  })

  it("turns an expired zap quote into Refresh quote, and a cancel into a note", () => {
    const zap = proposalFixture({
      proposalId: "zap_1",
      kind: "zap",
      expiresAt: "2026-10-21T11:59:00.000Z",
    })
    const block: UiBlock = {
      type: "zap_route",
      version: 1,
      id: "zap",
      evidenceRefs: [],
      proposalId: "zap_1",
      status: "quoted",
      unavailableReason: null,
      destination: {
        vaultId: "musd-savings",
        name: "sMUSD",
        address: null,
        kind: "single_sided",
      },
      steps: [],
      youPay: null,
      youPayUsd: null,
      quotedOut: null,
      minReceived: null,
      feeBps: null,
      priceImpactBps: null,
      priceImpactLevel: null,
      slippageBps: null,
      slippageEditable: false,
      approvals: [],
      shares: null,
      sharesExact: true,
      quoteExpiresAt: null,
      callCount: 4,
      atomicity: "batchable",
    }
    expect(actionsFor([block], [zap]).map((action) => action.label)).toEqual([
      "Refresh quote",
      "Cancel quote",
    ])
    expect(
      actionsFor([block], [zap], new Set(["zap_1"])).map(
        (action) => action.kind,
      ),
    ).toEqual(["note"])
  })
})

describe("surplus claims", () => {
  it("shows one Claim BTC surplus button for a loan with a surplus claim", () => {
    const surplus = proposalFixture({
      proposalId: "claim_surplus_1",
      kind: "claim_surplus",
      atomicity: "single",
      content: {
        kind: "claim_surplus",
        amount: { raw: "663000000000000000", decimals: 18, symbol: "BTC" },
      },
    })
    const loan = {
      type: "loan_position",
      version: 1,
      id: "loan",
      evidenceRefs: [],
      actions: ["claim_collateral_surplus"],
    } as unknown as UiBlock
    const claim: UiBlock = {
      type: "claim_review",
      version: 1,
      id: "claim",
      evidenceRefs: [],
      proposalId: "claim_surplus_1",
      rows: [],
      totalUsd: null,
      unpricedCount: 0,
      signatures: { count: 1, atomic: true },
      irreversibilityNote: "claim_final",
    }
    const actions = actionsFor([loan, claim], [surplus])
    expect(actions.map((action) => [action.label, action.kind])).toEqual([
      ["Claim BTC surplus", "review"],
    ])
  })
})

describe("visible follow-ups", () => {
  it("drops follow-ups that repeat an action label or page", () => {
    const response = responseFixture()
    const ranking = response.uiBlocks.map((block) =>
      block.type === "gauge_ranking"
        ? {
            ...block,
            actions: [...block.actions, "open_vote_page" as const],
          }
        : block,
    )
    const actions = actionsFor(ranking, response.proposedActions)
    const followups: Followup[] = [
      {
        id: "a",
        label: "Open Vote",
        action: { kind: "navigate", to: "/vote?optimize=1" },
      },
      { id: "b", label: "review vote", action: { kind: "query", query: "x" } },
      {
        id: "c",
        label: "Most incentives deposited",
        action: {
          kind: "clarification",
          cardId: "gauge-objective",
          optionId: "most_incentives_deposited",
        },
      },
    ]
    expect(
      visibleFollowups(followups, actions).map((followup) => followup.id),
    ).toEqual(["c"])
  })
})
