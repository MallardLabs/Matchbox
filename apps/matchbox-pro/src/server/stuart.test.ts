import { describe, expect, it, vi } from "vitest"
import { runStuartQuery } from "./stuart"

const address = "0xc1430fe45240351e9EbAe396A61Dd4917E75B765"

describe("Stuart runtime", () => {
  it("defaults missing wallet context to a read-only zero address", async () => {
    const response = await runStuartQuery({ query: "what is Mezo?" })

    expect(response.wallet).toEqual({
      address: "0x0000000000000000000000000000000000000000",
      label: "No wallet selected",
      mode: "inspecting",
      network: "Mezo Mainnet",
    })
  })

  it("uses live explicitly linked Wormholescan data without Groq", async () => {
    const fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            operations: [
              {
                id: "50/emitter/4135",
                content: {
                  standarizedProperties: { fromChain: 50, toChain: 2 },
                },
                sourceChain: {
                  chainId: 50,
                  timestamp: "2026-08-11T15:16:55Z",
                  transaction: { txHash: "0xsource" },
                  status: "confirmed",
                  feeUSD: "0.02",
                },
                targetChain: {
                  chainId: 2,
                  transaction: { txHash: "0xtarget" },
                  status: "completed",
                  feeUSD: "0.18",
                },
                data: {
                  symbol: "mezo",
                  tokenAmount: "199.5",
                  usdAmount: "12.30",
                },
              },
            ],
          }),
          { status: 200 },
        ),
    ) as unknown as typeof globalThis.fetch

    const response = await runStuartQuery(
      {
        query: "wormhole transactions",
        wallet: { address, mode: "connected" },
      },
      { fetch, allowDemoFallback: false },
    )

    expect(response.kind).toBe("bridge")
    expect(response.service?.runtime).toBe("deterministic")
    expect(response.evidence[0]?.status).toBe("live")
    expect(response.blocks[0]).toEqual(
      expect.objectContaining({
        type: "bridge_records",
        records: [expect.objectContaining({ sourceChain: "Mezo" })],
      }),
    )
  })

  it("lets Groq select a bounded tool and keeps a watched-wallet plan unsigned", async () => {
    let groqCalls = 0
    const fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes("api.groq.com")) {
        groqCalls += 1
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  role: "assistant",
                  content: null,
                  tool_calls: [
                    {
                      id: "call-zap",
                      type: "function",
                      function: {
                        name: "prepare_zap",
                        arguments: JSON.stringify({
                          amount: "50",
                          fundingAsset: "MUSD",
                          vault: "MEZO / MUSD Earn Vault",
                        }),
                      },
                    },
                  ],
                },
              },
            ],
          }),
          { status: 200 },
        )
      }
      throw new Error(`Unexpected fetch: ${url}`)
    }) as unknown as typeof globalThis.fetch

    const response = await runStuartQuery(
      {
        query: "put $50 into the MEZO/MUSD vault",
        wallet: { address, mode: "watching", label: "Treasury" },
      },
      { apiKey: "test-key", fetch },
    )

    expect(response.service).toEqual(
      expect.objectContaining({ runtime: "groq", degraded: false }),
    )
    expect(groqCalls).toBe(1)
    expect(response.blocks[0]).toEqual(
      expect.objectContaining({ type: "zap_route", canSign: false }),
    )
  })

  it("degrades cleanly on a Groq rate limit", async () => {
    const fetch = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes("api.groq.com")) {
        return new Response("rate limit", {
          status: 429,
          headers: { "retry-after": "2" },
        })
      }
      return new Response(JSON.stringify({ operations: [] }), { status: 200 })
    }) as unknown as typeof globalThis.fetch

    const response = await runStuartQuery(
      {
        query: "wormhole transactions",
        wallet: { address, mode: "connected" },
      },
      { apiKey: "test-key", fetch, allowDemoFallback: false },
    )

    expect(response.service).toEqual(
      expect.objectContaining({
        runtime: "deterministic",
        degraded: true,
        notice: expect.stringMatching(/rate-limited/i),
      }),
    )
  })

  it("clarifies ambiguous best gauges without calling Groq or a write tool", async () => {
    const fetch = vi.fn()
    const response = await runStuartQuery(
      {
        query: "which gauges are best?",
        wallet: { address, mode: "connected" },
      },
      { apiKey: "test-key", fetch },
    )

    expect(fetch).not.toHaveBeenCalled()
    expect(response.kind).toBe("clarification")
    expect(response.blocks[0]).toEqual(
      expect.objectContaining({ type: "clarification_card" }),
    )
  })

  it("clarifies a generic vote instead of silently choosing the optimizer", async () => {
    const response = await runStuartQuery({
      query: "help me vote",
      wallet: { address, mode: "connected" },
    })

    expect(response.kind).toBe("clarification")
  })

  it("clarifies an unspecified vault without rewriting it to Savings", async () => {
    const response = await runStuartQuery({
      query: "put $50 in the vault",
      wallet: { address, mode: "connected" },
    })

    expect(response.kind).toBe("clarification")
    expect(response.snapshotLabel).toMatch(/no financial tool/i)
    expect(response.blocks.some((block) => block.type === "zap_route")).toBe(
      false,
    )
  })

  it("keeps an explicit dual-deposit pool unavailable without a Savings rewrite", async () => {
    const response = await runStuartQuery({
      query: "zap $100 BTC into the BTC/MUSD LP pool",
      wallet: { address, mode: "connected" },
    })

    expect(response.kind).toBe("zap")
    expect(response.blocks[0]).toEqual(
      expect.objectContaining({
        type: "zap_route",
        status: "unavailable",
        transactionRequests: [],
        vault: "BTC / MUSD LP Pool",
      }),
    )
    expect(response.answer).not.toMatch(/Savings deposit/i)
  })

  it("returns fixed honest Rewards copy without Groq", async () => {
    const fetch = vi.fn()
    const response = await runStuartQuery(
      {
        query: "show my claimable rewards",
        wallet: { address, mode: "connected" },
      },
      { apiKey: "test-key", fetch },
    )

    expect(fetch).not.toHaveBeenCalled()
    expect(response.answer).toMatch(/claims are not in this prototype/i)
    expect(response.answer).not.toMatch(/\$\d/)
  })

  it("never repeats a model claim that Stuart submitted a transaction", async () => {
    const fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  role: "assistant",
                  content: "Stuart submitted the transaction for you.",
                },
              },
            ],
          }),
          { status: 200 },
        ),
    ) as unknown as typeof globalThis.fetch
    const response = await runStuartQuery(
      {
        query: "tell me a story",
        wallet: { address, mode: "connected" },
      },
      { apiKey: "test-key", fetch },
    )

    expect(response.answer).toMatch(/your wallet/i)
    expect(response.answer).not.toMatch(/Stuart submitted/i)
  })
})
