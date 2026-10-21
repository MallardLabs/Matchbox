import { type Address, getAddress } from "viem"
import { describe, expect, it } from "vitest"
import type { PoolMarket, ValidatorMarket } from "./contract"
import { poolTargets, validatorTargets } from "./marketTargets"

function addr(n: number): Address {
  return getAddress(`0x${n.toString(16).padStart(40, "0")}`)
}
const E18 = 10n ** 18n
const prices = { btc: "100000", mezo: "0.01", tokens: new Map() }
const MUSD = getAddress("0xdD468A1DDc392dcdbEf6db6e34E89AA338F9F186")
const SATS = addr(0x5a75)

describe("poolTargets", () => {
  const market: PoolMarket = {
    chainId: 31_612,
    generatedAt: "",
    epochStart: 1n,
    totalWeight: 4n * E18,
    targets: [
      {
        target: addr(0x9001),
        kind: "pool",
        gauge: addr(0xa1),
        isAlive: true,
        weight: E18,
        name: "Volatile AMM - MUSD/SATS",
        symbol: "vAMM-MUSD/SATS",
        tokens: [
          { address: MUSD, symbol: "MUSD" },
          { address: SATS, symbol: "SATS" },
        ],
        fees: [
          {
            tokenAddress: SATS,
            symbol: "SATS",
            decimals: 18,
            epochAmount: 1_000n * E18,
            priceUsd: "0.5",
          },
        ],
        bribes: [
          {
            tokenAddress: MUSD,
            symbol: "MUSD",
            decimals: 18,
            epochAmount: 100n * E18,
            // A stablecoin keeps its verified $1 over the API's market quote.
            priceUsd: "0.99",
          },
        ],
      },
      {
        target: addr(0x9002),
        kind: "vault",
        gauge: addr(0xa2),
        isAlive: false,
        weight: 3n * E18,
        name: "MUSD Savings Rate",
        symbol: "sMUSD",
        tokens: [],
        fees: [
          {
            tokenAddress: addr(0xdead),
            symbol: "ODD",
            decimals: 18,
            epochAmount: 5n,
            priceUsd: null,
          },
        ],
        bribes: [],
      },
    ],
  }

  it("prices fee tokens from the API only when no reference price exists", () => {
    const [pool] = poolTargets(market, prices)
    expect(pool?.name).toBe("MUSD / SATS")
    expect(pool?.incentiveMicroUsd).toBe(600_000_000n)
    expect(pool?.hasUnpriced).toBe(false)
    expect(pool?.footer?.value).toBe("$500.00")
    expect(pool?.footer?.side?.text).toBe("Incentives $100.00")
    expect(pool?.stats[1]).toEqual({ label: "Share", value: "25.0%" })
  })

  it("prices a token from the separately loaded API prices", () => {
    const vault = poolTargets(market, {
      ...prices,
      tokens: new Map([[addr(0xdead).toLowerCase(), "2"]]),
    })[1]
    // 5 wei at $2 is priced (no longer "Unpriced"), just worth nothing.
    expect(vault?.hasUnpriced).toBe(false)
    expect(vault?.incentiveMicroUsd).toBe(0n)
  })

  it("labels vaults and never shows an unpriced reward as $0", () => {
    const vault = poolTargets(market, prices)[1]
    expect(vault).toMatchObject({
      name: "MUSD Savings Rate",
      description: "Vault · sMUSD",
      isAlive: false,
      hasUnpriced: true,
      incentiveMicroUsd: 0n,
    })
    expect(vault?.footer?.value).toBe("Unpriced")
  })
})

describe("validatorTargets", () => {
  const gauge = addr(0x61)
  const market: ValidatorMarket = {
    chainId: 31_612,
    generatedAt: "",
    epochStart: 1n,
    totalWeight: 10n * E18,
    gauges: [
      {
        gauge,
        bribe: addr(0xb1),
        isAlive: true,
        weight: E18,
        operator: addr(0x0f),
        moniker: "chorus-one",
        details: "Registry details",
        rewardTokens: [],
      },
    ],
  }

  it("prefers the Supabase profile name and falls back to the moniker", () => {
    expect(validatorTargets(market, [], prices)[0]?.name).toBe("chorus-one")
    const named = validatorTargets(
      market,
      [{ gauge_address: gauge.toLowerCase(), display_name: "Chorus One" }],
      prices,
    )[0]
    expect(named?.name).toBe("Chorus One")
    expect(named?.description).toBe("Registry details")
    expect(named?.footer?.label).toBe("Operator")
    expect(named?.apyBps).toBeNull()
  })
})
