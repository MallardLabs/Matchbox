import type { ReferencePrices } from "./prices"
import type { MarketRead } from "./reader"

/**
 * Test fixtures: a small mainnet read with one gauge per voter shape.
 * The harness clock (2026-09-30T12:00Z) falls in `fixtureEpoch`.
 */

/** Thursday 2026-09-24 00:00 UTC. */
export const fixtureEpoch = 1_790_208_000
export const fixtureNextEpoch = fixtureEpoch + 604_800

export const tokens = {
  btc: "0x7b7c000000000000000000000000000000000000",
  mezo: "0x7b7c000000000000000000000000000000000001",
  musd: "0xdd468a1ddc392dcdbef6db6e34e89aa338f9f186",
  /** Unregistered; priced by nothing even though its symbol says BTC. */
  fake: "0x00000000000000000000000000000000000fa4e0",
} as const

export const gauges = {
  boost: "0x1000000000000000000000000000000000000001",
  idleBoost: "0x1000000000000000000000000000000000000002",
  pool: "0x2000000000000000000000000000000000000001",
  validator: "0x3000000000000000000000000000000000000001",
  thirdParty: "0x4000000000000000000000000000000000000001",
} as const

const wad = 10n ** 18n

export const fixturePrices: ReferencePrices = {
  btcUsd: { usd: "100000", source: "skip-oracle" },
  mezoUsd: { usd: "0.25", source: "aerodrome-cl" },
}

export function fixtureRead(
  overrides: Partial<Pick<MarketRead, "blockNumber" | "epochStarts">> = {},
): MarketRead {
  return {
    network: "mezo",
    blockNumber: overrides.blockNumber ?? 12_000_000n,
    epochStarts: overrides.epochStarts ?? [fixtureEpoch, fixtureNextEpoch],
    totalWeights: {
      boost: 10_000n * wad,
      pools: 5n * wad,
      validators: 7n * wad,
      "third-party": null,
    },
    gauges: [
      {
        gaugeAddress: gauges.boost,
        isAlive: true,
        weight: 2_000n * wad,
        bribeContract: "0xb000000000000000000000000000000000000001",
        link: {
          voter: "boost",
          vebtcTokenId: "2",
          beneficiary: "0xc000000000000000000000000000000000000001",
          boost: (3n * wad) / 2n,
        },
        rewards: [
          {
            kind: "bribe",
            contract: "0xb000000000000000000000000000000000000001",
            token: tokens.mezo,
            amounts: [100n * wad, 0n],
          },
          {
            kind: "bribe",
            contract: "0xb000000000000000000000000000000000000001",
            token: tokens.fake,
            amounts: [5_000_000n, 7_000_000n],
          },
        ],
      },
      {
        gaugeAddress: gauges.idleBoost,
        isAlive: true,
        weight: 0n,
        bribeContract: null,
        link: {
          voter: "boost",
          vebtcTokenId: null,
          beneficiary: null,
          boost: null,
        },
        rewards: [],
      },
      {
        gaugeAddress: gauges.pool,
        isAlive: true,
        weight: wad,
        bribeContract: "0xb000000000000000000000000000000000000002",
        link: {
          voter: "pools",
          poolAddress: "0x5000000000000000000000000000000000000001",
          poolSymbol: "vAMM-BTC/MUSD",
          feesContract: "0xf000000000000000000000000000000000000001",
        },
        rewards: [
          {
            kind: "fees",
            contract: "0xf000000000000000000000000000000000000001",
            token: tokens.btc,
            amounts: [wad / 100n, null],
          },
          {
            kind: "bribe",
            contract: "0xb000000000000000000000000000000000000002",
            token: tokens.musd,
            amounts: [0n, 0n],
          },
        ],
      },
      {
        gaugeAddress: gauges.validator,
        isAlive: false,
        weight: 3n * wad,
        bribeContract: "0xb000000000000000000000000000000000000003",
        link: {
          voter: "validators",
          operatorAddress: "0x6000000000000000000000000000000000000001",
          moniker: "Validator One",
        },
        rewards: [],
      },
      {
        gaugeAddress: gauges.thirdParty,
        isAlive: true,
        weight: null,
        bribeContract: "0xb000000000000000000000000000000000000004",
        link: { voter: "third-party" },
        rewards: [
          {
            kind: "bribe",
            contract: "0xb000000000000000000000000000000000000004",
            token: tokens.mezo,
            amounts: [50n * wad, 25n * wad],
          },
        ],
      },
    ],
    tokens: new Map([
      [tokens.btc, { symbol: "BTC", decimals: 18 }],
      [tokens.mezo, { symbol: "MEZO", decimals: 18 }],
      [tokens.musd, { symbol: "MUSD", decimals: 18 }],
      [tokens.fake, { symbol: "FAKEBTC", decimals: 6 }],
    ]),
  }
}
