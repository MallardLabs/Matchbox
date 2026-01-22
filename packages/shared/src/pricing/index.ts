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
