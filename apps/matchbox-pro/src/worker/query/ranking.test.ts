import { describe, expect, it } from "vitest"
import {
  type ParsedStuartRequest,
  stuartRequestSchema,
  stuartResponseSchema,
} from "../../features/query/contract"
import type { StuartProviders } from "./context"
import { NOW, WALLET, fakeDomain, fakeProviders, fakeTarget } from "./fakes"
import { runStuartQuery } from "./orchestrator"
import { routeQuery } from "./router"

const E18 = 10n ** 18n

async function ask(
  query: string,
  options: {
    wallet?: ParsedStuartRequest["wallet"] | null
    providers?: Partial<StuartProviders>
  } = {},
) {
  const logs: Array<Record<string, unknown>> = []
  const response = await runStuartQuery(
    stuartRequestSchema.parse({
      version: 1,
      query,
      sessionId: "6f1c1b8e-3c55-4a3f-9b8a-1d2e3f4a5b6c",
      turn: 0,
      surface: "palette",
      chainId: 31_612,
      ...(options.wallet === null
        ? {}
        : { wallet: options.wallet ?? { address: WALLET, mode: "watching" } }),
    }),
    {
      providers: fakeProviders(options.providers ?? {}),
      secret: "test-secret",
      now: () => NOW,
      claude: null,
      log: (event) => logs.push(event),
    },
  )
  // The sourced-answer gate stays on: nothing unsourced, nothing invalid.
  expect(logs.filter((event) => event.message !== "stuart.query")).toEqual([])
  expect(stuartResponseSchema.safeParse(response).success).toBe(true)
  expect(response.service.runtime).toBe("deterministic")
  return response
}

describe("ranking and earnings phrasings route deterministically", () => {
  const cases: Array<[string, string, unknown]> = [
    [
      "top incentives this epoch",
      "rank_gauges",
      { objective: "most_incentives_deposited", branch: null },
    ],
    [
      "highest bribes",
      "rank_gauges",
      { objective: "most_incentives_deposited" },
    ],
    [
      "which validator has the biggest incentives",
      "rank_gauges",
      { objective: "most_incentives_deposited", branch: "validators" },
    ],
    [
      "which gauge pays the most this epoch",
      "rank_gauges",
      { objective: "highest_apy", branch: null },
    ],
    ["what pays best right now", "rank_gauges", { objective: "highest_apy" }],
    [
      "best paying validators",
      "rank_gauges",
      { objective: "highest_apy", branch: "validators" },
    ],
    [
      "top-paying pools",
      "rank_gauges",
      { objective: "highest_apy", branch: "pools" },
    ],
    [
      "highest APY gauges",
      "rank_gauges",
      { objective: "highest_apy", branch: null },
    ],
    ["APY leaderboard", "rank_gauges", { objective: "highest_apy" }],
    ["what is my APY", "get_wallet_earnings", {}],
    ["what am I earning", "get_wallet_earnings", {}],
    ["how much am I making per epoch?", "get_wallet_earnings", {}],
    ["show my earnings", "get_wallet_earnings", {}],
    ["what's my yield", "get_wallet_earnings", {}],
  ]
  for (const [query, tool, input] of cases) {
    it(query, () => {
      expect(routeQuery(query)).toMatchObject({ kind: "tool", tool, input })
    })
  }

  it("still clarifies an unqualified 'best gauge'", () => {
    expect(routeQuery("best gauge to vote for")).toMatchObject({
      kind: "clarify",
      cardId: "gauge-objective",
    })
    expect(routeQuery("show my claimable rewards")).toMatchObject({
      tool: "list_claimable_rewards",
    })
  })
})

describe("ranking answers", () => {
  it("ranks by incentives deposited for 'top incentives this epoch'", async () => {
    const response = await ask("top incentives this epoch")
    expect(response.intent).toBe("rank_gauges")
    expect(response.answer.text).toBe(
      "tBTC / WBTC has the most incentives deposited this epoch: $400.00.",
    )
  })

  it("ranks by incentives per vote for 'which gauge pays the most'", async () => {
    const response = await ask("which gauge pays the most this epoch", {
      providers: {
        votingDomain: async () =>
          fakeDomain([
            fakeTarget({
              index: 1,
              name: "Stackbridge",
              weight: 1_000_000n * E18,
              mezo: 30_000n * E18,
            }),
            fakeTarget({
              index: 2,
              name: "tBTC / WBTC",
              weight: 4_000_000n * E18,
              mezo: 40_000n * E18,
            }),
            fakeTarget({
              index: 3,
              name: "Lombard",
              weight: 0n,
              mezo: 20_000n * E18,
            }),
          ]),
      },
    })
    expect(response.answer.text).toBe(
      "Stackbridge pays the most per vote this epoch: APY 156% on $300.00 incentives.",
    )
    const ranking = response.uiBlocks.find(
      (block) => block.type === "gauge_ranking",
    )
    expect(ranking).toMatchObject({
      objective: "highest_apy",
      rows: [
        expect.objectContaining({ name: "Stackbridge", apyBps: 15_600 }),
        expect.objectContaining({ name: "tBTC / WBTC", apyBps: 5_200 }),
      ],
    })
    expect(
      response.why?.items.some((item) =>
        /1 funded targets have no votes/.test(item.text),
      ),
    ).toBe(true)
  })
})

describe("QA fixes", () => {
  it("fills the Funded column on every ranking table", async () => {
    for (const query of [
      "which gauge pays the most this epoch",
      "top incentives this epoch",
    ]) {
      const response = await ask(query)
      const ranking = response.uiBlocks.find(
        (block) => block.type === "gauge_ranking",
      )
      if (ranking?.type !== "gauge_ranking")
        throw new Error(`no ranking for ${query}`)
      expect(ranking.rows.length).toBeGreaterThan(0)
      for (const row of ranking.rows) {
        expect(row.observedEpochs, query).toBe(8)
        expect(row.fundedEpochs, query).not.toBeNull()
      }
    }
    const optimized = await ask("optimize my votes", {
      wallet: { address: WALLET, mode: "connected" },
    })
    const table = optimized.uiBlocks.find(
      (block) => block.type === "gauge_ranking",
    )
    if (table?.type !== "gauge_ranking") throw new Error("no optimizer table")
    expect(table.rows.every((row) => row.observedEpochs === 8)).toBe(true)
  })

  it("leaves Funded as unknown, not zero, when history can't be read", async () => {
    const response = await ask("which gauge pays the most this epoch", {
      providers: {
        fundedEpochs: async () => {
          throw new Error("rpc down")
        },
      },
    })
    const ranking = response.uiBlocks.find(
      (block) => block.type === "gauge_ranking",
    )
    if (ranking?.type !== "gauge_ranking") throw new Error("no ranking")
    expect(ranking.rows.every((row) => row.fundedEpochs === null)).toBe(true)
  })

  it("pluralises lock counts and states the wallet mode once", async () => {
    const response = await ask("show my locks", {
      providers: {
        walletLocks: async (_owner, asset) => [
          {
            asset,
            tokenId: asset === "veMEZO" ? 4821n : 221n,
            amount: 10n * E18,
            end: 0n,
            isPermanent: true,
            votingPower: 10n * E18,
          },
        ],
      },
    })
    expect(response.answer.text).toBe(
      "1 veMEZO lock (10.00 veMEZO) and 1 veBTC lock.",
    )
    expect(response.snapshot.label).toBe("Watched (read only)")
    expect(response.answer.text).not.toContain("read only")
  })

  it("marks earnings live after a settled retry and stale only when still partial", async () => {
    const live = await ask("what is my APY")
    expect(
      live.evidence.find((item) => item.label.startsWith("Earnings"))?.status,
    ).toBe("live")
    const base = await fakeProviders().walletEarnings(WALLET)
    const stale = await ask("what is my APY", {
      providers: { walletEarnings: async () => ({ ...base, partial: true }) },
    })
    expect(
      stale.evidence.find((item) => item.label.startsWith("Earnings"))?.status,
    ).toBe("stale")
    expect(stale.why?.items[0]?.text).toMatch(/lower bounds/)
  })
})

describe("wallet earnings", () => {
  it("answers 'what is my APY' from the wallet's earnings", async () => {
    const response = await ask("what is my APY")
    expect(response.intent).toBe("wallet_earnings")
    expect(response.answer.text).toBe(
      "Earning $86.40 this epoch on 12,888.00 veMEZO, APY 3,486.03%. Last epoch $72.11; $241.20 claimable.",
    )
    expect(response.uiBlocks[0]).toMatchObject({
      type: "metric_summary",
      label: "Projected this epoch",
      primaryUsd: "86.400000",
      apyBps: 348_603,
      apyStatus: "extrapolated",
    })
  })

  it("reads a priced zero claimable as words, never $0.00", async () => {
    const base = await fakeProviders().walletEarnings(WALLET)
    const response = await ask("what am I earning", {
      providers: {
        walletEarnings: async () => ({
          ...base,
          totals: {
            ...base.totals,
            claimable: { tokens: [], usdAtEarn: "0", usdNow: "0", unpriced: 0 },
          },
        }),
      },
    })
    expect(response.answer.text).toMatch(/; nothing claimable\.$/)
    expect(response.answer.text).not.toContain("$0.00")
  })

  it("asks to connect or watch a wallet when none is selected", async () => {
    const response = await ask("what am I earning", { wallet: null })
    expect(response.answer).toMatchObject({
      kind: "empty",
      text: "Connect or watch a wallet to see what it earns.",
    })
  })

  it("says so when the wallet has no veMEZO lock", async () => {
    const response = await ask("what is my APY", {
      providers: {
        walletLocks: async () => [],
        walletEarnings: async () => ({
          tokenIds: [],
          current: {
            epochStart: "1792022400",
            epochEnd: "1792627200",
            status: "projected",
            tokens: [],
            usdNow: null,
          },
          epochs: [],
          totals: {
            realized: {
              tokens: [],
              usdAtEarn: null,
              usdNow: null,
              unpriced: 0,
            },
            claimed: { tokens: [], usdAtEarn: null, usdNow: null, unpriced: 0 },
            claimable: {
              tokens: [],
              usdAtEarn: null,
              usdNow: null,
              unpriced: 0,
            },
            projected: {
              tokens: [],
              usdAtEarn: null,
              usdNow: null,
              unpriced: 0,
            },
          },
          verified: false,
          partial: false,
        }),
      },
    })
    expect(response.answer.text).toBe(
      "No veMEZO lock earning voting incentives for this wallet.",
    )
  })
})
