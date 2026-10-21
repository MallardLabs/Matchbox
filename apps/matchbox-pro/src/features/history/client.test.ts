import { afterEach, describe, expect, it, vi } from "vitest"
import { fetchHistory, historyUrl, isUnavailableError } from "./client"
import { parseEarnings } from "./parse"
import { earningsSchema } from "./schema"

const FRESHNESS = {
  source: "rpc",
  indexedThroughBlock: null,
  indexedAt: null,
  headBlock: null,
  lagBlocks: null,
  lagSeconds: 0,
  state: "fresh",
}
const TOTALS = {
  tokens: [],
  usdAtEarn: "0.000000",
  usdNow: "0.000000",
  unpriced: 0,
}
const MEZO = {
  token: "0x7b7c000000000000000000000000000000000001",
  symbol: "MEZO",
  decimals: 18,
  amount: "46773423016480748120634",
  usdAtEarn: "342.230734",
  usdNow: null,
}

function stubFetch(response: Response): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => response),
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("history client", () => {
  it("parses decimal strings into bigints and micro-USD", async () => {
    stubFetch(
      new Response(
        JSON.stringify({
          network: "mezo",
          generatedAt: "2026-10-21T00:00:00.000Z",
          freshness: FRESHNESS,
          data: {
            tokenIds: ["1174"],
            current: {
              epochStart: "1792022400",
              epochEnd: "1792627200",
              status: "projected",
              tokens: [],
              usdNow: null,
            },
            epochs: [
              {
                epochStart: "1787184000",
                epochEnd: "1787788800",
                status: "sealed",
                tokens: [MEZO],
                usdAtEarn: "342.230734",
                usdNow: null,
                unpriced: 0,
              },
            ],
            totals: {
              realized: TOTALS,
              claimed: TOTALS,
              claimable: TOTALS,
              projected: TOTALS,
            },
            verified: true,
          },
        }),
      ),
    )
    const result = await fetchHistory(
      "/api/wallets/0x1/earnings",
      earningsSchema,
      parseEarnings,
      new AbortController().signal,
    )
    const [epoch] = result.data.epochs
    expect(result.data.tokenIds).toEqual([1174n])
    expect(epoch?.epochStart).toBe(1_787_184_000)
    expect(epoch?.tokens[0]?.amount).toBe(46_773_423_016_480_748_120_634n)
    expect(epoch?.usdAtEarnMicro).toBe(342_230_734n)
    // Unpriced stays null, never 0.
    expect(epoch?.usdNowMicro).toBeNull()
    expect(result.freshness.state).toBe("fresh")
  })

  it("treats a missing endpoint as unavailable, other failures as errors", async () => {
    stubFetch(new Response("{}", { status: 404 }))
    const missing = fetchHistory(
      "/api/x",
      earningsSchema,
      parseEarnings,
      new AbortController().signal,
    )
    await expect(missing).rejects.toSatisfy(isUnavailableError)
    stubFetch(new Response("{}", { status: 500 }))
    const failed = fetchHistory(
      "/api/x",
      earningsSchema,
      parseEarnings,
      new AbortController().signal,
    ).catch((error: unknown) => error)
    expect(isUnavailableError(await failed)).toBe(false)
  })

  it("rejects JSON floats where money must be a string", async () => {
    stubFetch(
      new Response(
        JSON.stringify({
          network: "mezo",
          generatedAt: "x",
          freshness: FRESHNESS,
          data: { rows: [{ amount: 1.5e24 }] },
        }),
      ),
    )
    await expect(
      fetchHistory(
        "/api/x",
        earningsSchema,
        parseEarnings,
        new AbortController().signal,
      ),
    ).rejects.toThrow()
  })

  it("builds query strings without empty params", () => {
    expect(
      historyUrl("/api/a", {
        network: "mezo",
        kinds: [],
        tokenId: 5n,
        x: undefined,
      }),
    ).toBe("/api/a?network=mezo&tokenId=5")
  })
})
