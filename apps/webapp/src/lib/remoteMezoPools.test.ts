import assert from "node:assert/strict"
import test from "node:test"
import {
  dexScreenerChainFor,
  geckoNetworkFor,
  mezoGaugeVenueLookups,
} from "./mezoGauges"
import {
  dexScreenerPairRequestPath,
  geckoPoolRequestPath,
  mergeRemotePoolStats,
  parseCurveFactoryTvl,
  parseCurveVolume,
  parseDexScreenerResponse,
  parseGeckoPoolResponse,
} from "./remoteMezoPools"

test("maps Mezo venue networks onto GeckoTerminal slugs", () => {
  assert.equal(geckoNetworkFor("base"), "base")
  assert.equal(geckoNetworkFor("ethereum"), "eth")
  assert.equal(dexScreenerChainFor("base"), "base")
  assert.equal(dexScreenerChainFor("ethereum"), "ethereum")
})

test("every catalog gauge has a GeckoTerminal pool id", () => {
  const lookups = mezoGaugeVenueLookups()
  assert.equal(lookups.length, 4)
  for (const lookup of lookups) {
    assert.match(lookup.geckoPoolId, /^0x[0-9a-fA-F]+$/)
    assert.equal(
      geckoPoolRequestPath(lookup.geckoNetwork, lookup.geckoPoolId).includes(
        lookup.geckoPoolId,
      ),
      true,
    )
  }
  const uniswap = lookups.find((lookup) => lookup.geckoPoolId.length > 42)
  assert.equal(uniswap?.geckoNetwork, "eth")
  assert.equal(uniswap?.geckoPoolId.length, 66)
})

test("parses GeckoTerminal pool TVL and 24h volume", () => {
  const stats = parseGeckoPoolResponse({
    data: {
      attributes: {
        name: "MUSD / USDC 0.005%",
        reserve_in_usd: "1107903.3409",
        volume_usd: { h24: "19203.1274773472" },
      },
    },
  })
  assert.equal(stats.venueName, "MUSD / USDC 0.005%")
  assert.equal(stats.reserveUsd, 1_107_903.3409)
  assert.equal(stats.volume24hUsd, 19_203.1274773472)
})

test("accepts numeric GeckoTerminal USD fields", () => {
  const stats = parseGeckoPoolResponse({
    data: {
      attributes: {
        name: "MUSD / USDC",
        reserve_in_usd: 1107903.3409,
        volume_usd: { h24: 19203.12 },
      },
    },
  })
  assert.equal(stats.reserveUsd, 1_107_903.3409)
  assert.equal(stats.volume24hUsd, 19_203.12)
})

test("parses DexScreener pair liquidity and 24h volume", () => {
  const stats = parseDexScreenerResponse({
    schemaVersion: "1.0.0",
    pairs: [
      {
        baseToken: { symbol: "MUSD" },
        quoteToken: { symbol: "USDC" },
        liquidity: { usd: 1_108_102.1 },
        volume: { h24: 80_583.83 },
      },
    ],
  })
  assert.equal(stats.venueName, "MUSD / USDC")
  assert.equal(stats.reserveUsd, 1_108_102.1)
  assert.equal(stats.volume24hUsd, 80_583.83)
  assert.equal(
    dexScreenerPairRequestPath(
      "ethereum",
      "0xa9bf5691768ef950a99efd74d722961ff2df3fec08d77ec784432c619bd283a0",
    ),
    "/latest/dex/pairs/ethereum/0xa9bf5691768ef950a99efd74d722961ff2df3fec08d77ec784432c619bd283a0",
  )
})

test("parses Curve volume and factory TVL by pool address", () => {
  const pool = "0xb5571e76693ba60110b5811dd650ffefce1c955f"
  const volume = parseCurveVolume(
    {
      success: true,
      data: {
        pools: [
          {
            address: "0xB5571E76693ba60110B5811DD650FFefce1C955f",
            volumeUSD: 95441.89,
          },
        ],
      },
    },
    pool,
  )
  const tvl = parseCurveFactoryTvl(
    {
      data: {
        poolData: [
          {
            address: pool,
            name: "MUSD/USDC/USDT",
            usdTotal: 646873.0206372939,
          },
        ],
      },
    },
    pool,
  )
  assert.equal(volume.volume24hUsd, 95_441.89)
  assert.equal(tvl.reserveUsd, 646_873.0206372939)
  assert.equal(tvl.venueName, "MUSD/USDC/USDT")
  const merged = mergeRemotePoolStats([volume, tvl])
  assert.equal(merged.reserveUsd, 646_873.0206372939)
  assert.equal(merged.volume24hUsd, 95_441.89)
})

test("treats malformed GeckoTerminal payloads as missing stats", () => {
  assert.deepEqual(parseGeckoPoolResponse({}), {
    venueName: null,
    reserveUsd: null,
    volume24hUsd: null,
  })
  assert.deepEqual(
    parseGeckoPoolResponse({
      data: { attributes: { reserve_in_usd: "-1" } },
    }),
    { venueName: null, reserveUsd: null, volume24hUsd: null },
  )
})
