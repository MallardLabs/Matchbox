import { describe, expect, it } from "vitest"
import {
  fixtureEpoch,
  fixtureNextEpoch,
  fixturePrices,
  fixtureRead,
  gauges,
} from "./fixtures"
import { buildSnapshot } from "./snapshot"
import createSqliteMarketDatabase from "./sqlite-database"
import {
  type MarketStore,
  createD1MarketStore,
  createMemoryMarketStore,
} from "./store"

const takenAt = new Date("2026-09-30T12:00:00.000Z")
const later = new Date("2026-09-30T12:05:00.000Z")
const noFilter = { voter: null, gauges: null }

const stores: Array<[string, () => MarketStore]> = [
  ["memory", createMemoryMarketStore],
  ["d1 (sqlite)", () => createD1MarketStore(createSqliteMarketDatabase())],
]

describe.each(stores)("%s market store", (_name, createStore) => {
  async function seeded(): Promise<MarketStore> {
    const store = createStore()
    await store.saveSnapshot(
      buildSnapshot(fixtureRead(), fixturePrices, takenAt),
    )
    return store
  }

  it("is empty before the first snapshot", async () => {
    const store = createStore()
    expect(await store.latestEpoch("mezo", fixtureEpoch)).toBeNull()
    expect(await store.boostTokens("mezo", fixtureEpoch)).toEqual(new Map())
  })

  it("writes every row once and skips unchanged rows", async () => {
    const store = createStore()
    const first = await store.saveSnapshot(
      buildSnapshot(fixtureRead(), fixturePrices, takenAt),
    )
    expect(first).toEqual({ epochs: 2, written: 7, unchanged: 0 })
    const second = await store.saveSnapshot(
      buildSnapshot(
        fixtureRead({ blockNumber: 12_000_100n }),
        fixturePrices,
        later,
      ),
    )
    expect(second).toEqual({ epochs: 2, written: 0, unchanged: 7 })
    expect(await store.getEpoch("mezo", fixtureEpoch)).toMatchObject({
      blockNumber: "12000100",
      asOf: later.toISOString(),
    })
  })

  it("rewrites rows whose values changed", async () => {
    const store = await seeded()
    const moved = buildSnapshot(
      fixtureRead(),
      { ...fixturePrices, mezoUsd: { usd: "0.5", source: "aerodrome-cl" } },
      later,
    )
    // MEZO-paid rewards change (boost and third-party now, third-party next);
    // the BTC fees, the idle and validator gauges and FAKEBTC-only rows do not.
    expect(await store.saveSnapshot(moved)).toEqual({
      epochs: 2,
      written: 3,
      unchanged: 4,
    })
  })

  it("finds the newest epoch at or before a start", async () => {
    const store = await seeded()
    expect((await store.latestEpoch("mezo", fixtureEpoch))?.epochStart).toBe(
      fixtureEpoch,
    )
    expect(
      (await store.latestEpoch("mezo", fixtureNextEpoch + 604_800))?.epochStart,
    ).toBe(fixtureNextEpoch)
    expect(await store.latestEpoch("mezo", fixtureEpoch - 1)).toBeNull()
    expect(await store.latestEpoch("mezo-testnet", fixtureEpoch)).toBeNull()
  })

  it("lists and filters gauges in voter, address order", async () => {
    const store = await seeded()
    const all = await store.listGauges("mezo", fixtureEpoch, noFilter)
    expect(all.map((gauge) => gauge.gaugeAddress)).toEqual([
      gauges.boost,
      gauges.idleBoost,
      gauges.pool,
      gauges.thirdParty,
      gauges.validator,
    ])
    expect(
      await store.listGauges("mezo", fixtureEpoch, {
        voter: "boost",
        gauges: null,
      }),
    ).toHaveLength(2)
    expect(
      (
        await store.listGauges("mezo", fixtureEpoch, {
          voter: null,
          gauges: [gauges.pool, gauges.validator],
        })
      ).map((gauge) => gauge.voter),
    ).toEqual(["pools", "validators"])
    expect(
      await store.listGauges("mezo", fixtureEpoch, { voter: null, gauges: [] }),
    ).toEqual([])
  })

  it("lists only rewarded gauges as incentives", async () => {
    const store = await seeded()
    const current = await store.listIncentives("mezo", fixtureEpoch, noFilter)
    expect(current.map((entry) => entry.gaugeAddress)).toEqual([
      gauges.boost,
      gauges.pool,
      gauges.thirdParty,
    ])
    const next = await store.listIncentives("mezo", fixtureNextEpoch, noFilter)
    expect(next.map((entry) => entry.gaugeAddress)).toEqual([
      gauges.boost,
      gauges.thirdParty,
    ])
    expect(
      await store.listIncentives("mezo", fixtureEpoch, {
        voter: "validators",
        gauges: null,
      }),
    ).toEqual([])
  })

  it("gets a gauge by address and by veBTC token", async () => {
    const store = await seeded()
    expect(
      (await store.getGauge("mezo", fixtureEpoch, gauges.validator))?.gauge
        .voter,
    ).toBe("validators")
    expect(
      (await store.getGaugeByVebtc("mezo", fixtureEpoch, "2"))?.gauge
        .gaugeAddress,
    ).toBe(gauges.boost)
    expect(await store.getGaugeByVebtc("mezo", fixtureEpoch, "3")).toBeNull()
    expect(
      await store.getGauge("mezo", fixtureEpoch, `0x${"9".repeat(40)}`),
    ).toBeNull()
  })

  it("returns history newest first up to a start, with each epoch's header", async () => {
    const store = await seeded()
    await store.saveSnapshot(
      buildSnapshot(
        fixtureRead({
          epochStarts: [fixtureNextEpoch, fixtureNextEpoch + 604_800],
        }),
        fixturePrices,
        new Date("2026-10-02T00:00:00.000Z"),
      ),
    )
    const history = await store.listGaugeHistory(
      "mezo",
      gauges.boost,
      fixtureNextEpoch,
      12,
    )
    expect(history.map((entry) => entry.epoch.epochStart)).toEqual([
      fixtureNextEpoch,
      fixtureEpoch,
    ])
    expect(history[1]?.epoch.asOf).toBe(takenAt.toISOString())
    expect(
      await store.listGaugeHistory("mezo", gauges.boost, fixtureNextEpoch, 1),
    ).toHaveLength(1)
    expect(
      await store.listGaugeHistory("mezo", gauges.pool, fixtureEpoch, 12),
    ).toHaveLength(1)
  })

  it("remembers resolved boost tokens", async () => {
    const store = await seeded()
    expect(await store.boostTokens("mezo", fixtureEpoch)).toEqual(
      new Map([[gauges.boost, "2"]]),
    )
  })
})
