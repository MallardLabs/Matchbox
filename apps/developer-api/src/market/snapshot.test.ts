import {
  gaugeIncentivesSchema,
  gaugeSchema,
} from "@repo/platform-contracts/market"
import { describe, expect, it } from "vitest"
import {
  fixtureEpoch,
  fixtureNextEpoch,
  fixturePrices,
  fixtureRead,
  gauges,
  tokens,
} from "./fixtures"
import { type EpochSnapshot, buildSnapshot } from "./snapshot"

const takenAt = new Date("2026-09-30T12:00:00.000Z")

function epochAt(index: number): EpochSnapshot {
  const epoch = buildSnapshot(fixtureRead(), fixturePrices, takenAt).epochs[
    index
  ]
  if (epoch === undefined) throw new Error(`no epoch ${index}`)
  return epoch
}

function rowFor(epoch: EpochSnapshot, gaugeAddress: string) {
  const row = epoch.gauges.find(
    (candidate) => candidate.gauge.gaugeAddress === gaugeAddress,
  )
  if (row === undefined) throw new Error(`no row for ${gaugeAddress}`)
  return row
}

describe("buildSnapshot", () => {
  it("writes one header per epoch from the read", () => {
    const snapshot = buildSnapshot(fixtureRead(), fixturePrices, takenAt)
    expect(snapshot.network).toBe("mezo")
    expect(snapshot.epochs.map((epoch) => epoch.epoch)).toEqual([
      {
        network: "mezo",
        epochStart: fixtureEpoch,
        blockNumber: "12000000",
        asOf: "2026-09-30T12:00:00.000Z",
        totalWeights: {
          boost: "10000000000000000000000",
          pools: "5000000000000000000",
          validators: "7000000000000000000",
          "third-party": null,
        },
        prices: fixturePrices,
      },
      expect.objectContaining({ epochStart: fixtureNextEpoch }),
    ])
  })

  it("keeps every gauge in the current epoch, rewarded ones in the next", () => {
    expect(epochAt(0).gauges).toHaveLength(5)
    expect(epochAt(1).gauges.map((row) => row.gauge.gaugeAddress)).toEqual([
      gauges.boost,
      gauges.thirdParty,
    ])
  })

  it("produces rows that match the public contract", () => {
    for (const epoch of [epochAt(0), epochAt(1)]) {
      for (const row of epoch.gauges) {
        expect(gaugeSchema.parse(row.gauge)).toEqual(row.gauge)
        expect(gaugeIncentivesSchema.parse(row.incentives)).toEqual(
          row.incentives,
        )
      }
    }
  })

  it("maps each voter's links", () => {
    const current = epochAt(0)
    expect(rowFor(current, gauges.boost).gauge).toEqual({
      voter: "boost",
      network: "mezo",
      gaugeAddress: gauges.boost,
      isAlive: true,
      weight: "2000000000000000000000",
      bribeContract: "0xb000000000000000000000000000000000000001",
      vebtcTokenId: "2",
      beneficiary: "0xc000000000000000000000000000000000000001",
      boostMultiplier: "1.5",
    })
    expect(rowFor(current, gauges.pool).gauge).toMatchObject({
      voter: "pools",
      poolAddress: "0x5000000000000000000000000000000000000001",
      poolSymbol: "vAMM-BTC/MUSD",
      feesContract: "0xf000000000000000000000000000000000000001",
    })
    expect(rowFor(current, gauges.validator).gauge).toMatchObject({
      voter: "validators",
      isAlive: false,
      operatorAddress: "0x6000000000000000000000000000000000000001",
      moniker: "Validator One",
    })
    expect(rowFor(current, gauges.thirdParty).gauge).toEqual({
      voter: "third-party",
      network: "mezo",
      gaugeAddress: gauges.thirdParty,
      isAlive: true,
      weight: null,
      bribeContract: "0xb000000000000000000000000000000000000004",
    })
  })

  it("prices registry tokens only and annualizes against veMEZO", () => {
    const incentives = rowFor(epochAt(0), gauges.boost).incentives
    expect(incentives.rewards).toEqual([
      {
        kind: "bribe",
        contract: "0xb000000000000000000000000000000000000001",
        token: tokens.mezo,
        symbol: "MEZO",
        decimals: 18,
        amount: "100000000000000000000",
        usd: "25",
      },
      {
        kind: "bribe",
        contract: "0xb000000000000000000000000000000000000001",
        token: tokens.fake,
        symbol: "FAKEBTC",
        decimals: 6,
        amount: "5000000",
        usd: null,
      },
    ])
    expect(incentives.totalUsd).toBe("25")
    expect(incentives.unpricedRewards).toBe(1)
    // 25 USD * 52 / (2000 veMEZO * 0.25 USD) * 100
    expect(incentives.aprPercent).toBe("260")
  })

  it("annualizes pool fees against veBTC and drops zero or unread amounts", () => {
    const current = rowFor(epochAt(0), gauges.pool).incentives
    expect(current.rewards).toEqual([
      expect.objectContaining({ kind: "fees", token: tokens.btc, usd: "1000" }),
    ])
    // 1000 USD * 52 / (1 veBTC * 100000 USD) * 100
    expect(current.aprPercent).toBe("52")
    expect(
      epochAt(1).gauges.some((row) => row.gauge.gaugeAddress === gauges.pool),
    ).toBe(false)
  })

  it("leaves APR null without a weight, a priced reward or a price", () => {
    expect(rowFor(epochAt(0), gauges.thirdParty).incentives).toMatchObject({
      totalUsd: "12.5",
      aprPercent: null,
    })
    expect(rowFor(epochAt(1), gauges.boost).incentives).toMatchObject({
      rewards: [expect.objectContaining({ token: tokens.fake })],
      totalUsd: null,
      unpricedRewards: 1,
      aprPercent: null,
    })
    const unpriced = buildSnapshot(
      fixtureRead(),
      { btcUsd: null, mezoUsd: null },
      takenAt,
    ).epochs[0]
    const boost = unpriced?.gauges.find(
      (row) => row.gauge.gaugeAddress === gauges.boost,
    )
    expect(boost?.incentives).toMatchObject({
      totalUsd: null,
      unpricedRewards: 2,
      aprPercent: null,
    })
  })
})
