import { describe, expect, it } from "vitest"
import {
  stuartRequestSchema,
  stuartResponseSchema,
} from "../../features/query/contract"
import { NOW, WALLET, fakeProviders, fakeTrove } from "./fakes"
import { runStuartQuery } from "./orchestrator"

const CASES: Array<{ query: string; intent: string; text: RegExp }> = [
  {
    query: "wormhole transactions",
    intent: "bridge_search",
    text: /Wormhole transfers/,
  },
  {
    query: "optimize my votes",
    intent: "optimize_votes",
    text: /^Projected this epoch: /,
  },
  {
    query: "vote 30% to Stackbridge and 70% to Lombard",
    intent: "custom_vote",
    text: /if you allocate 70% Lombard and 30% Stackbridge on veMEZO #4821 and #4966\.$/,
  },
  {
    query: "which gauges have the most incentives",
    intent: "rank_gauges",
    text: /most incentives deposited this epoch: \$/,
  },
  {
    query: "which gauges are consistently funded",
    intent: "rank_gauges",
    text: /was funded in \d+ of the last 8 epochs\./,
  },
  {
    query: "show my claimable rewards",
    intent: "claim_rewards",
    text: /^Claimable: /,
  },
  {
    query: "claim all my rewards",
    intent: "claim_rewards",
    text: /^Claimable: /,
  },
  {
    query: "how healthy is my mUSD trove?",
    intent: "loan_position",
    text: /^Healthy at 294\.77% collateral ratio \(min 110\.00%\)\. Liquidation below \$22,091\.67 per BTC\.$/,
  },
  {
    query: "If BTC falls 35%, do I get liquidated?",
    intent: "liquidation_scenario",
    text: /^At BTC −35%, collateral ratio is 191\.60%: not liquidated\./,
  },
  {
    query: "repay 5,000 mUSD on my trove",
    intent: "repay",
    text: /^Repay 5,000\.00 mUSD: debt goes to 43,200\.00 mUSD and collateral ratio to 328\.89%\.$/,
  },
  {
    query: "repay max on my loan",
    intent: "repay",
    text: /^Wallet holds 10,000\.00 mUSD, less than 46,200\.00 mUSD\.$/,
  },
  {
    query: "Zap $50 MEZO into the mUSD vault",
    intent: "zap",
    text: /^Zap 17,399\.77 MEZO \(\$50\.00\) into MUSD Savings \(sMUSD\): min received [\d,.]+ mUSD, price impact [\d.]+%\.$/,
  },
  {
    query: "deposit 50 MUSD into Savings",
    intent: "earn_deposit",
    text: /^Deposit 50\.00 mUSD into MUSD Savings/,
  },
  {
    query: "zap $100 BTC into the BTC/MUSD LP pool",
    intent: "zap",
    text: /No approved dual-deposit zap router/,
  },
  {
    query: "report a problem: my claim reverts",
    intent: "support_report",
    text: /^Nothing has been sent\. Preview is the report\.$/,
  },
  {
    query: "show my locks",
    intent: "navigate",
    text: /^Connected: 2 veMEZO locks/,
  },
]

describe("every deterministic tool answer is sourced", () => {
  for (const testCase of CASES) {
    it(testCase.query, async () => {
      const logs: Array<Record<string, unknown>> = []
      const response = await runStuartQuery(
        stuartRequestSchema.parse({
          version: 1,
          query: testCase.query,
          sessionId: "6f1c1b8e-3c55-4a3f-9b8a-1d2e3f4a5b6c",
          turn: 0,
          surface: "canvas",
          chainId: 31_612,
          wallet: { address: WALLET, mode: "connected" },
        }),
        {
          providers: fakeProviders(),
          secret: "test-secret",
          now: () => NOW,
          claude: null,
          log: (event) => logs.push(event),
        },
      )
      expect(logs.filter((event) => event.message !== "stuart.query")).toEqual(
        [],
      )
      expect(stuartResponseSchema.safeParse(response).success).toBe(true)
      expect(response.intent).toBe(testCase.intent)
      expect(response.answer.text).toMatch(testCase.text)
      expect(response.answer.text).not.toMatch(/submitted|signed|sent your/i)
      for (const block of response.uiBlocks) {
        for (const ref of block.evidenceRefs) {
          expect(response.evidence.some((item) => item.id === ref)).toBe(true)
        }
      }
    })
  }

  it("offers the collateral surplus a redemption left behind", async () => {
    const response = await runStuartQuery(
      stuartRequestSchema.parse({
        version: 1,
        query: "how is my trove?",
        sessionId: "6f1c1b8e-3c55-4a3f-9b8a-1d2e3f4a5b6c",
        turn: 0,
        surface: "rail",
        chainId: 31_612,
        wallet: { address: WALLET, mode: "connected" },
      }),
      {
        providers: fakeProviders({
          trove: async () =>
            fakeTrove({
              status: "closed_by_redemption",
              coll: 0n,
              principal: 0n,
              interest: 0n,
              surplusCollateral: 663_000_000_000_000_000n,
            }),
        }),
        secret: "test-secret",
        now: () => NOW,
        claude: null,
        log: () => undefined,
      },
    )
    expect(response.answer.text).toBe(
      "This trove is closed by redemption. 0.6630 BTC collateral surplus is claimable.",
    )
    expect(response.uiBlocks[0]).toMatchObject({
      type: "loan_position",
      status: "closed_by_redemption",
      actions: ["claim_collateral_surplus"],
    })
  })
})
