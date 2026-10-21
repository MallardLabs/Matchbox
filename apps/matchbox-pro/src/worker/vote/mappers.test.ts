import { type Address, getAddress, zeroAddress } from "viem"
import { describe, expect, it } from "vitest"
import {
  poolMarketSchema,
  validatorMarketSchema,
} from "../../features/vote/contract"
import {
  type CallResult,
  MAX_REWARD_TOKENS,
  gaugedPools,
  groupRewards,
  mapPoolMarket,
  mapValidatorMarket,
  okAddress,
  pairTokenAddresses,
  poolsApiPrices,
  registryEntry,
  rewardPairs,
  rewardSlots,
  tokenMeta,
  uniqueTokens,
} from "./mappers"

function addr(n: number): Address {
  return getAddress(`0x${n.toString(16).padStart(40, "0")}`)
}
const ok = (result: unknown): CallResult => ({ status: "success", result })
const fail: CallResult = { status: "failure" }

const MEZO = addr(0x7b7c01)
const MUSD = addr(0xd468)
const SATS = addr(0x5a75)

describe("call helpers", () => {
  it("accepts only non-zero, successful addresses and checksums them", () => {
    expect(okAddress(ok(MEZO.toLowerCase()))).toBe(MEZO)
    expect(okAddress(ok(zeroAddress))).toBeNull()
    expect(okAddress(ok("0x123"))).toBeNull()
    expect(okAddress(fail)).toBeNull()
  })

  it("reads ValidatorPool descriptions out of the decoded tuple", () => {
    expect(
      registryEntry(
        ok([
          "0xabc",
          { moniker: " Chorus ", details: "Validator", identity: "" },
        ]),
      ),
    ).toEqual({ moniker: "Chorus", details: "Validator" })
    expect(registryEntry(ok("nope"))).toBeNull()
    expect(registryEntry(fail)).toBeNull()
  })
})

describe("reward discovery", () => {
  const bribe = addr(0xb1)
  const fees = addr(0xfee)

  it("caps runaway reward lists and skips failed lengths", () => {
    const slots = rewardSlots([bribe, fees], [ok(1000n), fail])
    expect(slots).toHaveLength(MAX_REWARD_TOKENS)
    expect(slots.every((slot) => slot.contract === bribe)).toBe(true)
  })

  it("dedupes tokens per contract and groups non-zero epoch amounts", () => {
    const slots = rewardSlots([bribe, fees], [ok(3n), ok(1n)])
    const pairs = rewardPairs(slots, [ok(MEZO), ok(MEZO), ok(SATS), ok(MUSD)])
    expect(pairs).toEqual([
      { contract: bribe, token: MEZO },
      { contract: bribe, token: SATS },
      { contract: fees, token: MUSD },
    ])
    const tokens = uniqueTokens(pairs)
    const meta = tokenMeta(tokens, [
      ok("MEZO"),
      ok(18),
      fail,
      fail,
      ok("MUSD"),
      ok(18),
    ])
    const grouped = groupRewards(
      pairs,
      [ok(5n * 10n ** 18n), ok(0n), ok(7n)],
      meta,
      new Map([[MUSD.toLowerCase(), "0.99"]]),
    )
    expect(grouped.get(bribe.toLowerCase())).toEqual([
      {
        tokenAddress: MEZO,
        symbol: "MEZO",
        decimals: 18,
        epochAmount: (5n * 10n ** 18n).toString(),
        priceUsd: null,
      },
    ])
    expect(grouped.get(fees.toLowerCase())?.[0]?.priceUsd).toBe("0.99")
    // Unknown metadata falls back rather than dropping the reward.
    expect(meta.get(SATS.toLowerCase())).toEqual({
      symbol: "Token",
      decimals: 18,
    })
  })
})

describe("mapValidatorMarket", () => {
  const live = addr(0x61)
  const killed = addr(0x62)
  const operator = addr(0x0f)
  const bribe = addr(0xb1)

  const wire = mapValidatorMarket({
    chainId: 31_612,
    generatedAt: "2026-10-21T00:00:00.000Z",
    epochStart: 1_792_022_400n,
    totalWeight: 900n,
    gauges: [live, killed],
    states: [
      ok(600n),
      ok(true),
      ok(bribe),
      ok(300n),
      ok(false),
      ok(zeroAddress),
    ],
    operators: [operator, addr(0x10)],
    // The second operator's gauge read failed; it must not attach anywhere.
    registry: [
      ok(["0x", { moniker: "Chorus One", details: "" }]),
      ok(live),
      ok(["0x", { moniker: "Ghost", details: "" }]),
      fail,
    ],
    rewards: new Map([
      [
        bribe.toLowerCase(),
        [
          {
            tokenAddress: MEZO,
            symbol: "MEZO",
            decimals: 18,
            epochAmount: "30",
            priceUsd: null,
          },
        ],
      ],
    ]),
  })

  it("joins the registry by gauge and keeps killed or departed gauges", () => {
    expect(wire.gauges).toHaveLength(2)
    expect(wire.gauges[0]).toMatchObject({
      gauge: live,
      operator,
      moniker: "Chorus One",
      isAlive: true,
      weight: "600",
    })
    expect(wire.gauges[0]?.rewardTokens).toHaveLength(1)
    expect(wire.gauges[1]).toMatchObject({
      gauge: killed,
      bribe: null,
      operator: null,
      moniker: "",
      isAlive: false,
      rewardTokens: [],
    })
  })

  it("round-trips through the client schema as bigints", () => {
    const market = validatorMarketSchema.parse(wire)
    expect(market.totalWeight).toBe(900n)
    expect(market.gauges[0]?.weight).toBe(600n)
    expect(market.gauges[0]?.rewardTokens[0]?.epochAmount).toBe(30n)
  })
})

describe("mapPoolMarket", () => {
  const pool = addr(0x9001)
  const vault = addr(0x9002)
  const ungauged = addr(0x9003)
  const gaugeA = addr(0xa1)
  const gaugeB = addr(0xa2)
  const BTC = addr(0xb7c)

  const rows = gaugedPools(
    [pool, ungauged, vault],
    [ok(gaugeA), ok(10n), ok(zeroAddress), ok(0n), ok(gaugeB), ok(40n)],
  )
  const meta = [
    ok("Volatile AMM - BTC/SATS"),
    ok("vAMM-BTC/SATS"),
    ok(BTC),
    ok(SATS),
    ok("MUSD Savings Rate"),
    ok("sMUSD"),
    fail,
    fail,
  ]

  it("drops pools without a gauge", () => {
    expect(rows.map((row) => row.pool)).toEqual([pool, vault])
    expect(pairTokenAddresses(rows, meta)).toEqual([BTC, SATS])
  })

  it("labels pools by pair and vaults by name, and splits fees from bribes", () => {
    const feeContract = addr(0xfee)
    const bribeContract = addr(0xb1)
    const wire = mapPoolMarket({
      chainId: 31_612,
      generatedAt: "2026-10-21T00:00:00.000Z",
      epochStart: 1n,
      totalWeight: 50n,
      rows,
      states: [
        ok(true),
        ok(bribeContract),
        ok(feeContract),
        ok(true),
        ok(zeroAddress),
        ok(zeroAddress),
      ],
      meta,
      pairSymbols: new Map([
        [BTC.toLowerCase(), "BTC"],
        [SATS.toLowerCase(), "SATS"],
      ]),
      rewards: new Map([
        [
          feeContract.toLowerCase(),
          [
            {
              tokenAddress: SATS,
              symbol: "SATS",
              decimals: 18,
              epochAmount: "5",
              priceUsd: null,
            },
          ],
        ],
      ]),
    })
    expect(wire.targets[0]).toMatchObject({
      target: pool,
      kind: "pool",
      gauge: gaugeA,
      tokens: [
        { address: BTC, symbol: "BTC" },
        { address: SATS, symbol: "SATS" },
      ],
      bribes: [],
    })
    expect(wire.targets[0]?.fees).toHaveLength(1)
    expect(wire.targets[1]).toMatchObject({
      target: vault,
      kind: "vault",
      name: "MUSD Savings Rate",
      symbol: "sMUSD",
      tokens: [],
      fees: [],
    })
    expect(poolMarketSchema.parse(wire).targets[1]?.weight).toBe(40n)
  })
})

describe("poolsApiPrices", () => {
  it("keeps numeric prices by lower-case address and ignores junk", () => {
    const prices = poolsApiPrices({
      success: true,
      data: [
        {
          token0: { address: SATS, price: "0.0000012" },
          token1: { address: MUSD, price: null },
        },
        {
          token0: { address: "not-an-address", price: "1" },
          token1: { address: MEZO, price: "NaN" },
        },
      ],
    })
    expect([...prices.entries()]).toEqual([[SATS.toLowerCase(), "0.0000012"]])
    expect(poolsApiPrices({ error: "nope" }).size).toBe(0)
  })
})
