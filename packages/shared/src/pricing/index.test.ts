import { describe, expect, it } from "vitest"
import {
  MIN_MARKET_RESERVE_USD,
  getTokenFromRegistry,
  getTokenPriceType,
  getTokenUsdPrice,
  isBtcPegged,
  isStablecoin,
  trustedMarketPrice,
} from "./index"

const btcPrice = 97_000
const mezoPrice = 0.25

type TokenCase = { address: string; symbol: string }

// What a reward token looks like to Classic: an address from the chain and
// the symbol its contract reports, which its deployer chose freely.
function priceOf(token: TokenCase): number | null {
  return getTokenUsdPrice(token.address, btcPrice, mezoPrice)
}

// Registry tokens (Mezo mainnet)
const nativeBtc = {
  address: "0x7b7c000000000000000000000000000000000000",
  symbol: "BTC",
}
const mezo = {
  address: "0x7b7c000000000000000000000000000000000001",
  symbol: "MEZO",
}
const musd = {
  address: "0xdd468a1ddc392dcdbef6db6e34e89aa338f9f186",
  symbol: "MUSD",
}
const mUsdc = {
  address: "0x04671c72aab5ac02a03c1098314b1bb6b560c197",
  symbol: "mUSDC",
}
const mSolvBtc = {
  address: "0xa10ad2570ea7b93d19fdae6bd7189ff4929bc747",
  symbol: "mSolvBTC",
}

// Tokens anyone could deploy at unregistered addresses and bribe a gauge with
const fakeBtc = {
  address: "0x1111111111111111111111111111111111111111",
  symbol: "FAKEBTC",
}
const btcX = {
  address: "0x2222222222222222222222222222222222222222",
  symbol: "BTCX",
}
const xUsd = {
  address: "0x3333333333333333333333333333333333333333",
  symbol: "xUSD",
}
const usdFake = {
  address: "0x4444444444444444444444444444444444444444",
  symbol: "USDfake",
}
// Legitimate symbols at the wrong address
const musdLookalike = {
  address: "0x5555555555555555555555555555555555555555",
  symbol: "MUSD",
}
const btcLookalike = {
  address: "0x6666666666666666666666666666666666666666",
  symbol: "BTC",
}
const mezoLookalike = {
  address: "0x7777777777777777777777777777777777777777",
  symbol: "MEZO",
}

describe("getTokenUsdPrice", () => {
  it("prices registry BTC tokens at the BTC price", () => {
    expect(priceOf(nativeBtc)).toBe(btcPrice)
    expect(priceOf(mSolvBtc)).toBe(btcPrice)
  })

  it("prices registry stablecoins at $1", () => {
    expect(priceOf(musd)).toBe(1)
    expect(priceOf(mUsdc)).toBe(1)
  })

  it("prices MEZO at the MEZO price", () => {
    expect(priceOf(mezo)).toBe(mezoPrice)
  })

  it("is unpriced when the reference price is unavailable", () => {
    expect(getTokenUsdPrice(nativeBtc.address, null, mezoPrice)).toBeNull()
    expect(getTokenUsdPrice(mezo.address, btcPrice, null)).toBeNull()
  })

  it.each([fakeBtc, btcX, xUsd, usdFake])(
    "does not price $symbol at an unregistered address",
    (token) => {
      expect(priceOf(token)).toBeNull()
      expect(getTokenPriceType(token.address)).toBe("unknown")
      expect(isBtcPegged(token.address)).toBe(false)
      expect(isStablecoin(token.address)).toBe(false)
    },
  )

  it.each([musdLookalike, btcLookalike, mezoLookalike])(
    "does not price a $symbol lookalike at another address",
    (token) => {
      expect(getTokenFromRegistry(token.address)).toBeUndefined()
      expect(priceOf(token)).toBeNull()
    },
  )

  it("matches registry addresses in any letter case", () => {
    const checksummedMusd = {
      address: "0xdD468A1DDc392dcdbEf6db6e34E89AA338F9F186",
      symbol: "MUSD",
    }
    const upperSolvBtc = {
      address: `0x${mSolvBtc.address.slice(2).toUpperCase()}`,
      symbol: "mSolvBTC",
    }
    const paddedBtc = { address: ` ${nativeBtc.address} `, symbol: "BTC" }
    expect(priceOf(checksummedMusd)).toBe(1)
    expect(priceOf(upperSolvBtc)).toBe(btcPrice)
    expect(priceOf(paddedBtc)).toBe(btcPrice)
  })

  it("does not treat object keys as registry entries", () => {
    expect(getTokenFromRegistry("constructor")).toBeUndefined()
    expect(getTokenFromRegistry("__proto__")).toBeUndefined()
    expect(getTokenPriceType("toString")).toBe("unknown")
  })
})

describe("getTokenPriceType", () => {
  it("reads the type from the registry entry", () => {
    expect(getTokenPriceType(nativeBtc.address)).toBe("btc-pegged")
    expect(getTokenPriceType(musd.address)).toBe("stablecoin")
    expect(getTokenPriceType(mezo.address)).toBe("mezo")
    expect(isBtcPegged(mSolvBtc.address)).toBe(true)
    expect(isStablecoin(mUsdc.address)).toBe(true)
  })
})

describe("trustedMarketPrice", () => {
  it("keeps a price whose pools hold at least the minimum", () => {
    expect(trustedMarketPrice(1.02, MIN_MARKET_RESERVE_USD)).toBe(1.02)
    expect(trustedMarketPrice(0.5, 2_500_000)).toBe(0.5)
  })

  it("drops a price from a thin pool, however high", () => {
    expect(trustedMarketPrice(71_954, 16.81)).toBeNull()
    expect(trustedMarketPrice(3, MIN_MARKET_RESERVE_USD - 0.01)).toBeNull()
  })

  it("drops a price whose reserve is unknown, and keeps no price as none", () => {
    expect(trustedMarketPrice(1, null)).toBeNull()
    expect(trustedMarketPrice(null, 1_000_000)).toBeNull()
  })
})
