import { describe, expect, it } from "vitest"
import { resolveCard } from "./cards"
import { extractSlots, routeQuery } from "./router"
import { percentToBps } from "./voteMath"

function tool(query: string): { tool: string; input: unknown } | string {
  const decision = routeQuery(query)
  if (decision.kind === "tool")
    return { tool: decision.tool, input: decision.input }
  if (decision.kind === "clarify") return `clarify:${decision.cardId}`
  return decision.kind
}

describe("deterministic router", () => {
  it("routes wormhole and bridge searches", () => {
    expect(tool("wormhole transactions")).toEqual({
      tool: "search_transactions",
      input: { provider: "wormhole", direction: null, limit: null },
    })
    expect(tool("bridge transactions out of mezo")).toEqual({
      tool: "search_transactions",
      input: { provider: "all", direction: "out", limit: null },
    })
  })

  it("clarifies ambiguous gauge and vote requests", () => {
    expect(tool("which gauges are best?")).toBe("clarify:gauge-objective")
    expect(tool("help me vote")).toBe("clarify:gauge-objective")
  })

  it("uses word boundaries: 'devote' is not a vote", () => {
    expect(tool("I devote my time to Mezo")).toBe("none")
  })

  it("routes the personal optimum and the two research rankings", () => {
    expect(tool("vote on the best gauges this epoch for me")).toEqual({
      tool: "optimize_votes",
      input: { branch: null, lockIds: null },
    })
    expect(tool("which validators have the most incentives")).toEqual({
      tool: "rank_gauges",
      input: {
        objective: "most_incentives_deposited",
        branch: "validators",
        window: null,
      },
    })
    expect(tool("which gauges are consistently funded over 12 epochs")).toEqual(
      {
        tool: "rank_gauges",
        input: {
          objective: "most_consistently_funded",
          branch: null,
          window: 12,
        },
      },
    )
    expect(tool("optimize my veBTC votes")).toBe("clarify:voting-domain")
  })

  it("parses custom ballots into exact percent strings", () => {
    expect(
      tool(
        "vote like the following: 30% to Stackbridge, 45.5% to Lombard and 24.5% to tBTC / WBTC",
      ),
    ).toEqual({
      tool: "prepare_vote",
      input: {
        branch: null,
        allocations: [
          { target: "Stackbridge", percent: "30" },
          { target: "Lombard", percent: "45.5" },
          { target: "tBTC / WBTC", percent: "24.5" },
        ],
      },
    })
  })

  it("converts percents to bps without floating point", () => {
    expect(["33.33", "33.33", "33.34"].map(percentToBps)).toEqual([
      3333, 3333, 3334,
    ])
    expect(percentToBps("33.333")).toBeNull()
    expect(percentToBps("100.01")).toBeNull()
    expect(percentToBps("0.01")).toBe(1)
  })

  it("routes loans: position, scenario, repay, surplus", () => {
    expect(tool("how healthy is my mUSD trove?")).toEqual({
      tool: "get_loan_position",
      input: {},
    })
    expect(tool("If BTC falls 35%, do I get liquidated?")).toEqual({
      tool: "scenario_liquidation",
      input: { drops: null, requested: 35 },
    })
    expect(tool("Repay 5,000 mUSD on my trove")).toEqual({
      tool: "prepare_repay",
      input: { amount: "5,000" },
    })
    expect(tool("repay my loan")).toBe("clarify:repay-amount")
    expect(tool("claim my collateral surplus")).toEqual({
      tool: "claim_collateral_surplus",
      input: {},
    })
  })

  it("lists claimable rewards and prepares claims only on the verb", () => {
    expect(tool("show my claimable rewards")).toEqual({
      tool: "list_claimable_rewards",
      input: { sources: null, lockIds: null },
    })
    expect(tool("claim all my rewards")).toEqual({
      tool: "prepare_claim",
      input: { sources: null, lockIds: null },
    })
  })

  it("never guesses an Earn destination or rewrites LP requests to Savings", () => {
    expect(tool("put $50 in the vault")).toBe("clarify:earn-destination")
    expect(tool("put $50 into the MEZO/MUSD vault")).toBe(
      "clarify:earn-destination",
    )
    expect(tool("zap $100 BTC into the BTC/MUSD LP pool")).toEqual({
      tool: "prepare_zap",
      input: {
        fundingAsset: "BTC",
        amount: null,
        amountUsd: "100",
        destination: "lp-pool",
        slippageBps: null,
      },
    })
    expect(tool("Zap $50 MEZO into the mUSD vault")).toEqual({
      tool: "prepare_zap",
      input: {
        fundingAsset: "MEZO",
        amount: null,
        amountUsd: "50",
        destination: "musd-savings",
        slippageBps: null,
      },
    })
    expect(tool("deposit 50 MUSD into Savings")).toEqual({
      tool: "prepare_zap",
      input: {
        fundingAsset: "MUSD",
        amount: "50",
        amountUsd: null,
        destination: "musd-savings",
        slippageBps: null,
      },
    })
    expect(tool("deposit into savings")).toBe("clarify:zap-amount")
    expect(tool("put $50 into savings")).toBe("clarify:funding-asset")
  })

  it("resolves only options the server could have offered", () => {
    const slots = extractSlots("put $50 into the MEZO/MUSD vault")
    expect(resolveCard("earn-destination", "musd-savings", slots)).toEqual({
      kind: "clarify",
      cardId: "funding-asset",
      slots: { ...slots, destination: "musd-savings" },
    })
    expect(
      resolveCard("funding-asset", "MEZO:musd-savings:50", {
        ...slots,
        destination: "musd-savings",
      }),
    ).toEqual({
      kind: "tool",
      intent: "zap",
      tool: "prepare_zap",
      input: {
        fundingAsset: "MEZO",
        amount: null,
        amountUsd: "50",
        destination: "musd-savings",
        slippageBps: null,
      },
    })
    expect(
      resolveCard("gauge-objective", "highest_incentives", slots),
    ).toBeNull()
    expect(
      resolveCard("zap-amount", "5000:MEZO:musd-savings", slots),
    ).toBeNull()
  })

  it("navigates without tools", () => {
    expect(routeQuery("go to rewards")).toEqual({
      kind: "navigate",
      to: "/rewards",
      label: "Rewards",
    })
  })
})
