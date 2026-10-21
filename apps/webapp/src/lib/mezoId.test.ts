import { strict as assert } from "node:assert"
import { test } from "node:test"

import { mezoIdLookupSchema, parseMezoIdQuery, toMezoIdLookup } from "./mezoId"

test("parseMezoIdQuery checksums EVM addresses", () => {
  assert.deepEqual(
    parseMezoIdQuery("0x8daf5d971c5394db1c6aeaf05e5e339b1c61b64b"),
    { kind: "evm", value: "0x8dAf5D971C5394dB1C6AeAf05e5E339B1c61b64b" },
  )
})

test("parseMezoIdQuery rejects malformed EVM addresses", () => {
  assert.equal(parseMezoIdQuery("0x1234"), null)
})

test("parseMezoIdQuery lowercases bech32 but keeps base58 case", () => {
  assert.deepEqual(
    parseMezoIdQuery("  BC1QA4G2X8AGM2473GYVAFVN3UNUJ58MSFH28SNF8G "),
    { kind: "btc", value: "bc1qa4g2x8agm2473gyvafvn3unuj58msfh28snf8g" },
  )
  assert.deepEqual(parseMezoIdQuery("1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2"), {
    kind: "btc",
    value: "1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2",
  })
})

test("parseMezoIdQuery normalizes Mezo IDs", () => {
  const expected = { kind: "mezo-id", value: "mrmackey.mezo" }
  assert.deepEqual(parseMezoIdQuery("MrMackey.mezo"), expected)
  assert.deepEqual(parseMezoIdQuery("mrmackey"), expected)
})

test("parseMezoIdQuery rejects empty and path-like input", () => {
  assert.equal(parseMezoIdQuery("   "), null)
  assert.equal(parseMezoIdQuery("a/b.mezo"), null)
  assert.equal(parseMezoIdQuery("has space"), null)
})

test("toMezoIdLookup keeps Bitcoin-backed wallets", () => {
  assert.deepEqual(
    toMezoIdLookup({
      mezoId: "herobrine.mezo",
      linkedAccounts: [
        {
          type: "wallet",
          btcAddress: "bc1qa4g2x8agm2473gyvafvn3unuj58msfh28snf8g",
          evmAddress: "0x93e5270Aa700878b3eDfe3c94D88D8B426Edb27a",
        },
      ],
    }),
    {
      status: "found",
      mezoId: "herobrine.mezo",
      wallets: [
        {
          evmAddress: "0x93e5270Aa700878b3eDfe3c94D88D8B426Edb27a",
          btcAddress: "bc1qa4g2x8agm2473gyvafvn3unuj58msfh28snf8g",
        },
      ],
    },
  )
})

test("toMezoIdLookup handles EVM-only accounts without a Mezo ID", () => {
  assert.deepEqual(
    toMezoIdLookup({
      linkedAccounts: [
        {
          type: "wallet",
          evmAddress: "0x8dAf5D971C5394dB1C6AeAf05e5E339B1c61b64b",
        },
        { type: "social" },
      ],
    }),
    {
      status: "found",
      mezoId: null,
      wallets: [
        {
          evmAddress: "0x8dAf5D971C5394dB1C6AeAf05e5E339B1c61b64b",
          btcAddress: null,
        },
      ],
    },
  )
})

test("toMezoIdLookup drops malformed EVM addresses and checksums the rest", () => {
  const lookup = toMezoIdLookup({
    mezoId: "mrmackey.mezo",
    linkedAccounts: [
      { type: "wallet", evmAddress: "0xnope" },
      {
        type: "wallet",
        evmAddress: "0x8daf5d971c5394db1c6aeaf05e5e339b1c61b64b",
      },
    ],
  })
  assert.deepEqual(lookup, {
    status: "found",
    mezoId: "mrmackey.mezo",
    wallets: [
      {
        evmAddress: "0x8dAf5D971C5394dB1C6AeAf05e5E339B1c61b64b",
        btcAddress: null,
      },
    ],
  })
})

test("mezoIdLookupSchema rejects a malformed EVM address from the proxy", () => {
  const result = mezoIdLookupSchema.safeParse({
    status: "found",
    mezoId: null,
    wallets: [{ evmAddress: "0xnope", btcAddress: null }],
  })
  assert.equal(result.success, false)
})

test("toMezoIdLookup throws on unexpected shapes", () => {
  assert.throws(() => toMezoIdLookup({ linkedAccounts: "nope" }))
})
