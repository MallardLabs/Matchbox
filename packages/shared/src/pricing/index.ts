import type { Address } from "viem"
import { getAddress } from "viem"
import { CHAIN_ID, type SupportedChainId } from "../contracts"

// Toggle between hardcoded price and Pyth oracle
// Set to true once Pyth price feed is available and configured
export const USE_PYTH_ORACLE = false

// Fallback price used when USE_PYTH_ORACLE is false
export const MEZO_FALLBACK_PRICE = 0.22

// MEZO token address (same on testnet and mainnet)
export const MEZO_TOKEN_ADDRESS = getAddress(
  "0x7B7c000000000000000000000000000000000001",
)

// ============================================================================
// Token Type System
// ============================================================================

/**
 * Token pricing types determine how a token's USD value is calculated
 */
export type TokenPriceType =
  | "stablecoin" // Pegged to $1 USD
  | "btc-pegged" // Pegged to BTC price
  | "mezo" // MEZO token with its own price
  | "unknown" // Unknown token, no price available

/**
 * Token registry entry with pricing information
 */
export type TokenRegistryEntry = {
  symbol: string
  priceType: TokenPriceType
  // Optional fixed price override (e.g., for stablecoins that aren't exactly $1)
  fixedPrice?: number
}

/**
 * Known token addresses mapped to their pricing configuration.
 * Addresses are stored lowercase for case-insensitive lookups.
 *
 * To add a new token:
 * 1. Add its address (lowercase) as the key
 * 2. Set the symbol and priceType
 * 3. Optionally set a fixedPrice for tokens with known static values
 */
const TOKEN_REGISTRY: Record<string, TokenRegistryEntry> = {
  // MEZO token (same on testnet and mainnet)
  "0x7b7c000000000000000000000000000000000001": {
    symbol: "MEZO",
    priceType: "mezo",
  },

  // ============================================================================
  // Stablecoins - pegged to $1 USD
  // ============================================================================

  // mUSD - Mezo USD stablecoin (testnet)
  "0xab2f9f25a2c5bde10078ebf48ee85af7e9a27e74": {
    symbol: "mUSD",
    priceType: "stablecoin",
    fixedPrice: 1.0,
  },
  // mUSD - Mezo USD stablecoin (mainnet) - same address pattern
  "0x980fe4c37f420e9d6a0cb11e2f1f35c5e2739254": {
    symbol: "mUSD",
    priceType: "stablecoin",
    fixedPrice: 1.0,
  },

  // USDC variants
  "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48": {
    symbol: "USDC",
    priceType: "stablecoin",
    fixedPrice: 1.0,
  },

  // USDT variants
  "0xdac17f958d2ee523a2206206994597c13d831ec7": {
    symbol: "USDT",
    priceType: "stablecoin",
    fixedPrice: 1.0,
  },

  // DAI
  "0x6b175474e89094c44da98b954eedeac495271d0f": {
    symbol: "DAI",
    priceType: "stablecoin",
    fixedPrice: 1.0,
  },

  // ============================================================================
  // BTC-pegged tokens - use BTC price
  // ============================================================================

  // WBTC
  "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599": {
    symbol: "WBTC",
    priceType: "btc-pegged",
  },

  // tBTC
  "0x18084fba666a33d37592fa2633fd49a74dd93a88": {
    symbol: "tBTC",
    priceType: "btc-pegged",
  },

  // sBTC (Stacks BTC)
  "0x5c6a8ea1e714dd3de1a28de1a00f5d5289313822": {
    symbol: "sBTC",
    priceType: "btc-pegged",
  },
}

/**
 * Common stablecoin symbols that should be treated as $1 USD
 * Used as a fallback when a token isn't in the registry
 */
const STABLECOIN_SYMBOLS = new Set([
  "USDC",
  "USDT",
  "DAI",
  "BUSD",
  "TUSD",
  "USDP",
  "GUSD",
  "FRAX",
  "LUSD",
  "SUSD",
  "MIM",
  "MUSD",
  "USD",
  "USDC.E",
  "USDT.E",
])

/**
 * Common BTC-pegged token symbols
 * Used as a fallback when a token isn't in the registry
 */
const BTC_PEGGED_SYMBOLS = new Set([
  "WBTC",
  "TBTC",
  "SBTC",
  "BTCB",
  "RENBTC",
  "HBTC",
  "OBTC",
  "PBTC",
  "IMBTC",
  "BTC",
])

/**
 * Get token info from the registry by address
 */
export function getTokenFromRegistry(
  address: string,
): TokenRegistryEntry | undefined {
  return TOKEN_REGISTRY[address.toLowerCase()]
}

/**
 * Determine the price type for a token based on address and symbol
 *
 * Priority:
 * 1. Check address in registry
 * 2. Check if symbol matches known stablecoin patterns
 * 3. Check if symbol matches known BTC-pegged patterns
 * 4. Return "unknown" if no match
 */
export function getTokenPriceType(
  address: string,
  symbol?: string,
): TokenPriceType {
  // First, check the registry by address
  const registryEntry = getTokenFromRegistry(address)
  if (registryEntry) {
    return registryEntry.priceType
  }

  // If symbol is provided, try to infer the type
  if (symbol) {
    const upperSymbol = symbol.toUpperCase()

    // Check for MEZO token by symbol
    if (upperSymbol === "MEZO") {
      return "mezo"
    }

    // Check for stablecoins by symbol
    if (STABLECOIN_SYMBOLS.has(upperSymbol)) {
      return "stablecoin"
    }

    // Check for BTC-pegged tokens by symbol
    if (BTC_PEGGED_SYMBOLS.has(upperSymbol)) {
      return "btc-pegged"
    }
  }

  return "unknown"
}

/**
 * Get the USD price for a token given reference prices
 *
 * @param address - Token contract address
 * @param symbol - Token symbol (optional, used for fallback identification)
 * @param btcPrice - Current BTC price in USD
 * @param mezoPrice - Current MEZO price in USD
 * @returns USD price per token, or null if unknown
 */
export function getTokenUsdPrice(
  address: string,
  symbol: string | undefined,
  btcPrice: number | null,
  mezoPrice: number | null,
): number | null {
  const registryEntry = getTokenFromRegistry(address)

  // If in registry with a fixed price, use it
  if (registryEntry?.fixedPrice !== undefined) {
    return registryEntry.fixedPrice
  }

  const priceType = getTokenPriceType(address, symbol)

  switch (priceType) {
    case "stablecoin":
      return 1.0
    case "btc-pegged":
      return btcPrice
    case "mezo":
      return mezoPrice
    case "unknown":
      return null
  }
}

/**
 * Check if a token is a known stablecoin
 */
export function isStablecoin(address: string, symbol?: string): boolean {
  return getTokenPriceType(address, symbol) === "stablecoin"
}

/**
 * Check if a token is BTC-pegged
 */
export function isBtcPegged(address: string, symbol?: string): boolean {
  return getTokenPriceType(address, symbol) === "btc-pegged"
}

// ============================================================================
// Pyth Oracle Configuration (existing)
// ============================================================================

// Pyth Network oracle proxy contracts on Mezo
export const PYTH_ORACLE_CONTRACTS = {
  [CHAIN_ID.testnet]: getAddress("0x2880aB155794e7179c9eE2e38200202908C17B43"),
  [CHAIN_ID.mainnet]: getAddress("0x2880aB155794e7179c9eE2e38200202908C17B43"),
} as const

// Pyth price feed ID for MEZO token
// TODO: Replace with actual MEZO price feed ID from Pyth
// Find feed IDs at: https://pyth.network/developers/price-feed-ids
export const MEZO_PYTH_PRICE_FEED_ID =
  "0x0000000000000000000000000000000000000000000000000000000000000000" as `0x${string}`

// Pyth oracle ABI (minimal interface for reading prices)
export const PYTH_ORACLE_ABI = [
  {
    inputs: [{ internalType: "bytes32", name: "id", type: "bytes32" }],
    name: "getPrice",
    outputs: [
      {
        components: [
          { internalType: "int64", name: "price", type: "int64" },
          { internalType: "uint64", name: "conf", type: "uint64" },
          { internalType: "int32", name: "expo", type: "int32" },
          { internalType: "uint256", name: "publishTime", type: "uint256" },
        ],
        internalType: "struct PythStructs.Price",
        name: "price",
        type: "tuple",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { internalType: "bytes32", name: "id", type: "bytes32" },
      { internalType: "uint256", name: "age", type: "uint256" },
    ],
    name: "getPriceNoOlderThan",
    outputs: [
      {
        components: [
          { internalType: "int64", name: "price", type: "int64" },
          { internalType: "uint64", name: "conf", type: "uint64" },
          { internalType: "int32", name: "expo", type: "int32" },
          { internalType: "uint256", name: "publishTime", type: "uint256" },
        ],
        internalType: "struct PythStructs.Price",
        name: "price",
        type: "tuple",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "bytes32", name: "id", type: "bytes32" }],
    name: "getPriceUnsafe",
    outputs: [
      {
        components: [
          { internalType: "int64", name: "price", type: "int64" },
          { internalType: "uint64", name: "conf", type: "uint64" },
          { internalType: "int32", name: "expo", type: "int32" },
          { internalType: "uint256", name: "publishTime", type: "uint256" },
        ],
        internalType: "struct PythStructs.Price",
        name: "price",
        type: "tuple",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
] as const

export type PythPrice = {
  price: bigint
  conf: bigint
  expo: number
  publishTime: bigint
}

// Convert Pyth price to USD number
// Pyth prices are integers with an exponent (e.g., price=12345, expo=-4 means 1.2345)
export function pythPriceToNumber(pythPrice: PythPrice): number {
  const price = Number(pythPrice.price)
  const expo = pythPrice.expo
  return price * 10 ** expo
}

// Maximum age for Pyth price (5 minutes in seconds)
export const PYTH_MAX_PRICE_AGE = 300n

// Get Pyth oracle contract address for a given chain
export function getPythOracleAddress(chainId: SupportedChainId): Address {
  return PYTH_ORACLE_CONTRACTS[chainId]
}

// Check if an address is the MEZO token
export function isMezoToken(address: string): boolean {
  return address.toLowerCase() === MEZO_TOKEN_ADDRESS.toLowerCase()
}
