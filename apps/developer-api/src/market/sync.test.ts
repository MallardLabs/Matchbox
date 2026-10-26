import { describe, expect, it, vi } from "vitest"
import { silentLogger } from "../testing"
import {
  fixtureEpoch,
  fixtureNextEpoch,
  fixturePrices,
  fixtureRead,
  gauges,
} from "./fixtures"
import type { MarketReadInput, MarketReader } from "./reader"
import { createMemoryMarketStore } from "./store"
import syncMarket from "./sync"

const now = new Date("2026-09-30T12:00:00.000Z")

function fakeReader(): MarketReader & { inputs: MarketReadInput[] } {
  const inputs: MarketReadInput[] = []
  return {
    inputs,
    async blockNumber() {
      return 12_000_000n
    },
    async read(input) {
      inputs.push(input)
      return fixtureRead({
        blockNumber: input.blockNumber,
        epochStarts: [...input.epochStarts],
      })
    },
  }
}

describe("syncMarket", () => {
  it("reads the current and next epoch and stores the snapshot", async () => {
    const store = createMemoryMarketStore()
    const reader = fakeReader()
    const summary = await syncMarket({
      store,
      readers: { mezo: reader },
      readPrices: async () => fixturePrices,
      profileBoostTokens: async () => new Map(),
      now: () => now,
      logger: silentLogger,
    })
    expect(summary.status).toBe("ok")
    expect(summary.networks).toEqual([
      {
        network: "mezo",
        status: "ok",
        blockNumber: "12000000",
        gauges: 5,
        write: { epochs: 2, written: 7, unchanged: 0 },
      },
      {
        network: "mezo-testnet",
        status: "skipped",
        blockNumber: null,
        gauges: 0,
        write: null,
      },
    ])
    expect(reader.inputs[0]).toMatchObject({
      blockNumber: 12_000_000n,
      epochStarts: [fixtureEpoch, fixtureNextEpoch],
    })
    expect((await store.getEpoch("mezo", fixtureEpoch))?.asOf).toBe(
      now.toISOString(),
    )
  })

  it("passes stored tokens over profile tokens to the reader", async () => {
    const store = createMemoryMarketStore()
    const reader = fakeReader()
    const options = {
      store,
      readers: { mezo: reader },
      readPrices: async () => fixturePrices,
      profileBoostTokens: async () =>
        new Map([
          [gauges.boost, "999"],
          [gauges.idleBoost, "7"],
        ]),
      now: () => now,
      logger: silentLogger,
    }
    await syncMarket(options)
    expect(reader.inputs[0]?.knownBoostTokens).toEqual(
      new Map([
        [gauges.boost, "999"],
        [gauges.idleBoost, "7"],
      ]),
    )
    await syncMarket(options)
    expect(reader.inputs[1]?.knownBoostTokens).toEqual(
      new Map([
        [gauges.boost, "2"],
        [gauges.idleBoost, "7"],
      ]),
    )
  })

  it("keeps the previous snapshot when a read fails", async () => {
    const store = createMemoryMarketStore()
    const saved = vi.spyOn(store, "saveSnapshot")
    const summary = await syncMarket({
      store,
      readers: {
        mezo: {
          blockNumber: async () => 1n,
          read: async () => {
            throw new Error("rpc down")
          },
        },
      },
      readPrices: async () => fixturePrices,
      profileBoostTokens: async () => {
        throw new Error("supabase down")
      },
      now: () => now,
      logger: silentLogger,
    })
    expect(summary.status).toBe("failed")
    expect(summary.networks[0]).toMatchObject({
      network: "mezo",
      status: "failed",
      blockNumber: "1",
    })
    expect(saved).not.toHaveBeenCalled()
  })
})
