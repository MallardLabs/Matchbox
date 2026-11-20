import type { Address } from "viem"
import { getAddress } from "viem"
import { CHAIN_ID, type SupportedChainId } from "../contracts"

// Toggle between hardcoded price and Pyth oracle
// Set to true once Pyth price feed is available and configured
export const USE_PYTH_ORACLE = false

// Legacy placeholder retained only for compatibility with older callers.
// Active app pricing should return null when a live MEZO feed is unavailable.
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
 * This registry is the only source of peg prices. A token is priced as a
 * stablecoin, as BTC or as MEZO only when its ADDRESS is listed here. Its
 * symbol never sets a price: incentive tokens are permissionless, so anyone
 * can deploy a worthless token called "FAKEBTC" or "xUSD" and bribe a gauge
 * with it.
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

  // Native BTC address used across the app and token lists on Mezo
  "0x7b7c000000000000000000000000000000000000": {
    symbol: "BTC",
    priceType: "btc-pegged",
  },

  // ============================================================================
  // Stablecoins - pegged to $1 USD
  // ============================================================================

  // MUSD — Mezo USD (testnet / mainnet per Mezo docs)
  "0x118917a40faf1cd7a13db0ef56c86de7973ac503": {
    symbol: "MUSD",
    priceType: "stablecoin",
    fixedPrice: 1.0,
  },
  "0xdd468a1ddc392dcdbef6db6e34e89aa338f9f186": {
    symbol: "MUSD",
    priceType: "stablecoin",
    fixedPrice: 1.0,
  },

  // Bridged stablecoins on Mezo mainnet (Mezo docs, "Contracts reference").
  // Registry symbols use lowercase "m" — mUSDC / mUSDT — not USDC / USDT.
  "0x04671c72aab5ac02a03c1098314b1bb6b560c197": {
    symbol: "mUSDC",
    priceType: "stablecoin",
    fixedPrice: 1.0,
  },
  "0xeb5a5d39de4ea42c2aa6a57eca2894376683bb8e": {
    symbol: "mUSDT",
    priceType: "stablecoin",
    fixedPrice: 1.0,
  },
  "0xdf6542260a9f768f07030e4895083f804241f4c4": {
    symbol: "mUSDe",
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

  // Bridged BTC wrappers on Mezo mainnet (Mezo docs, "Contracts reference")
  "0x6a7cd8e1384d49f502b4a4ce9ac9eb320835c5d7": {
    symbol: "mcbBTC",
    priceType: "btc-pegged",
  },
  "0x812fcc0bb8c207fd8d6165a7a1173037f43b2db8": {
    symbol: "mFBTC",
    priceType: "btc-pegged",
  },
  "0xa10ad2570ea7b93d19fdae6bd7189ff4929bc747": {
    symbol: "mSolvBTC",
    priceType: "btc-pegged",
  },
  "0x29fa8f46cbb9562b87773c8f50a7f9f27178261c": {
    symbol: "mswBTC",
    priceType: "btc-pegged",
  },
  "0xdf708431162ba247ddae362d2c919e0fbafcf9de": {
    symbol: "mxSolvBTC",
    priceType: "btc-pegged",
  },
}

/**
 * Get token info from the registry by address (any letter case)
 */
export function getTokenFromRegistry(
  address: string,
): TokenRegistryEntry | undefined {
  const key = address.trim().toLowerCase()
  return Object.hasOwn(TOKEN_REGISTRY, key) ? TOKEN_REGISTRY[key] : undefined
}

/**
 * The price type of a token, from its registry entry. A token that is not in
 * the registry is "unknown", whatever its symbol says.
 */
export function getTokenPriceType(address: string): TokenPriceType {
  return getTokenFromRegistry(address)?.priceType ?? "unknown"
}

/**
 * Get the USD price for a token given reference prices. Looks the token up by
 * address only.
 *
 * @param address - Token contract address
 * @param btcPrice - Current BTC price in USD
 * @param mezoPrice - Current MEZO price in USD
 * @returns USD price per token, or null when the token is not in the registry
 *   or its reference price is unavailable
 */
export function getTokenUsdPrice(
  address: string,
  btcPrice: number | null,
  mezoPrice: number | null,
): number | null {
  const registryEntry = getTokenFromRegistry(address)
  if (registryEntry === undefined) return null
  if (registryEntry.fixedPrice !== undefined) return registryEntry.fixedPrice

  switch (registryEntry.priceType) {
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
 * Check if a token is a registered stablecoin
 */
export function isStablecoin(address: string): boolean {
  return getTokenPriceType(address) === "stablecoin"
}

/**
 * Check if a token is a registered BTC-pegged token
 */
export function isBtcPegged(address: string): boolean {
  return getTokenPriceType(address) === "btc-pegged"
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
