import assert from "node:assert/strict"
import test from "node:test"
import { geckoNetworkFor, mezoGaugeVenueLookups } from "./mezoGauges"
import { geckoPoolRequestPath, parseGeckoPoolResponse } from "./remoteMezoPools"

test("maps Mezo venue networks onto GeckoTerminal slugs", () => {
  assert.equal(geckoNetworkFor("base"), "base")
  assert.equal(geckoNetworkFor("ethereum"), "eth")
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
