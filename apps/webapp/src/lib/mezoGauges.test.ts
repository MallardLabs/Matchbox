import assert from "node:assert/strict"
import test from "node:test"
import { type Address, getAddress } from "viem"
import {
  MEZO_GAUGES,
  formatDistributionDate,
  geckoNetworkFor,
  mezoGaugeAddresses,
  mezoGaugeIdentity,
  mezoGaugeVenueLookups,
  mezoVenueTokenIconSymbol,
  mezoVenueTokenIconSymbols,
  resolveDistributionDate,
  resolveMezoGaugeRows,
} from "./mezoGauges"

const VOTE_EPOCH_END = new Date("2026-09-03T00:00:00Z")

test("catalog keys are checksummed EIP-55 addresses", () => {
  const keys = Object.keys(MEZO_GAUGES)
  assert.equal(keys.length, 4)
  for (const address of keys) {
    assert.equal(address, getAddress(address))
  }
  const expected = [
    getAddress("0xC7e81dd77A4624F0DD14A8bB97Bc721b0CEE6e26"),
    getAddress("0x4440A9b2954cB98416C0122e2ea996C46555F4B6"),
    getAddress("0x2ced96e759ab481210d41c567eee5c42edb59a1d"),
    getAddress("0xc39a294024dca62f579c49d7c83a6c831d4976d0"),
  ]
  expected.sort()
  assert.deepEqual([...mezoGaugeAddresses()].sort(), expected)
})

test("drops dead gauges and unknown addresses", () => {
  const known = getAddress("0xC7e81dd77A4624F0DD14A8bB97Bc721b0CEE6e26")
  const unknown = getAddress("0x1111111111111111111111111111111111111111")
  const rows = resolveMezoGaugeRows([
    { gauge: known, isAlive: false },
    { gauge: known.toLowerCase() as Address, isAlive: true },
    { gauge: unknown, isAlive: true },
  ])
  assert.equal(rows.length, 1)
  assert.equal(rows[0]?.gauge, known)
  assert.equal(rows[0]?.identity.name, "USDC/MUSD")
  assert.equal(rows[0]?.identity.protocol, "Aerodrome")
})

test("sorts alive catalog gauges by name", () => {
  const usdcMusd = getAddress("0xC7e81dd77A4624F0DD14A8bB97Bc721b0CEE6e26")
  const mezoMusd = getAddress("0x4440A9b2954cB98416C0122e2ea996C46555F4B6")
  const curve = getAddress("0xc39a294024dca62f579c49d7c83a6c831d4976d0")
  const rows = resolveMezoGaugeRows([
    { gauge: curve, isAlive: true },
    { gauge: usdcMusd, isAlive: true },
    { gauge: mezoMusd, isAlive: true },
  ])
  assert.deepEqual(
    rows.map((row) => row.identity.name),
    ["MEZO/MUSD", "MUSD/USDC/USDT", "USDC/MUSD"],
  )
})

test("advances distribution dates by whole UTC weeks", () => {
  assert.equal(
    resolveDistributionDate(VOTE_EPOCH_END, 0).toISOString(),
    "2026-09-03T00:00:00.000Z",
  )
  assert.equal(
    resolveDistributionDate(VOTE_EPOCH_END, 1).toISOString(),
    "2026-09-10T00:00:00.000Z",
  )
  const beforeDstEnd = new Date("2026-10-29T00:00:00Z")
  assert.equal(
    resolveDistributionDate(beforeDstEnd, 1).toISOString(),
    "2026-11-05T00:00:00.000Z",
  )
})

test("formats distribution dates in en-US UTC", () => {
  assert.equal(
    formatDistributionDate(new Date("2026-09-17T00:00:00Z")),
    "Sep 17, 2026",
  )
})

test("resolves catalog identity from checksummed or mixed-case addresses", () => {
  const known = getAddress("0xC7e81dd77A4624F0DD14A8bB97Bc721b0CEE6e26")
  assert.equal(mezoGaugeIdentity(known)?.name, "USDC/MUSD")
  assert.equal(
    mezoGaugeIdentity(known.toLowerCase() as Address)?.name,
    "USDC/MUSD",
  )
  assert.equal(
    mezoGaugeIdentity(getAddress("0x1111111111111111111111111111111111111111")),
    undefined,
  )
})

test("reuses mUSDC and mUSDT artwork for unlabeled USDC and USDT", () => {
  assert.equal(mezoVenueTokenIconSymbol("USDC"), "mUSDC")
  assert.equal(mezoVenueTokenIconSymbol("USDT"), "mUSDT")
  assert.equal(mezoVenueTokenIconSymbol("MUSD"), "MUSD")
  assert.equal(mezoVenueTokenIconSymbol("MEZO"), "MEZO")
  assert.deepEqual(mezoVenueTokenIconSymbols(["MUSD", "USDC", "USDT"]), [
    "MUSD",
    "mUSDC",
    "mUSDT",
  ])
})

test("attaches GeckoTerminal venue ids for every catalog gauge", () => {
  const lookups = mezoGaugeVenueLookups()
  assert.equal(lookups.length, 4)
  for (const lookup of lookups) {
    const identity = MEZO_GAUGES[lookup.gauge]
    assert.notEqual(identity, undefined)
    if (!identity) continue
    assert.equal(lookup.geckoPoolId, identity.geckoPoolId)
    assert.equal(lookup.geckoNetwork, geckoNetworkFor(identity.network))
  }
})
