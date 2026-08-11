import { describe, expect, it } from "vitest"
import { normalizeWormholeOperation } from "./wormholescan"

describe("Wormholescan normalization", () => {
  it("keeps an explicitly linked Mezo NTT journey", () => {
    const result = normalizeWormholeOperation({
      id: "50/emitter/1",
      content: {
        standarizedProperties: { fromChain: 50, toChain: 2 },
      },
      sourceChain: {
        chainId: 50,
        timestamp: "2026-08-11T15:16:55Z",
        status: "confirmed",
        feeUSD: "0.02",
        transaction: { txHash: "0xsource" },
      },
      targetChain: {
        chainId: 2,
        status: "completed",
        feeUSD: "0.18",
        transaction: { txHash: "0xtarget" },
      },
      data: { symbol: "mezo", tokenAmount: "199.5", usdAmount: "12.30" },
    })

    expect(result).toEqual(
      expect.objectContaining({
        direction: "out",
        sourceChain: "Mezo",
        destinationChain: "Ethereum",
        sourceHash: "0xsource",
        destinationHash: "0xtarget",
        feeUsd: "0.20",
        status: "completed",
      }),
    )
  })

  it("drops operations with no Mezo leg", () => {
    expect(
      normalizeWormholeOperation({
        id: "2/emitter/1",
        content: { standarizedProperties: { fromChain: 2, toChain: 30 } },
        sourceChain: { chainId: 2 },
        targetChain: { chainId: 30 },
      }),
    ).toBeNull()
  })
})
