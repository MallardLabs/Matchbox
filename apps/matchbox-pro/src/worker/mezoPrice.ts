import { http, createPublicClient, getAddress } from "viem"
import { base } from "viem/chains"
import { sqrtPriceX96ToPriceString } from "../lib/money"

const POOL_ADDRESS = getAddress("0xef458a3263d2a8c7f3ed9e949ae2f9b345d08b1f")
const Q96_PRICE_CAP_WHOLE = 1_000_000n

const SLIPSTREAM_POOL_ABI = [
  {
    inputs: [],
    name: "slot0",
    outputs: [
      { internalType: "uint160", name: "sqrtPriceX96", type: "uint160" },
      { internalType: "int24", name: "tick", type: "int24" },
      { internalType: "uint16", name: "observationIndex", type: "uint16" },
      {
        internalType: "uint16",
        name: "observationCardinality",
        type: "uint16",
      },
      {
        internalType: "uint16",
        name: "observationCardinalityNext",
        type: "uint16",
      },
      { internalType: "bool", name: "unlocked", type: "bool" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "liquidity",
    outputs: [{ internalType: "uint128", name: "", type: "uint128" }],
    stateMutability: "view",
    type: "function",
  },
] as const

type MezoPriceResponse = {
  price: string | null
  source: "aerodrome-cl" | "unavailable"
  reason?: string
  timestamp: number
  liquidity?: string
}

function publicBaseRpcs(envRpc?: string): string[] {
  return [
    envRpc,
    "https://mainnet.base.org",
    "https://base.llamarpc.com",
    "https://base-rpc.publicnode.com",
  ].filter((url): url is string => Boolean(url))
}

function wholeUnits(price: string): bigint {
  const [whole = "0"] = price.split(".")
  return BigInt(whole)
}

export async function fetchMezoUsdPrice(
  envRpc?: string,
): Promise<MezoPriceResponse> {
  const timestamp = Date.now()
  const errors: string[] = []

  for (const rpcUrl of publicBaseRpcs(envRpc)) {
    try {
      const client = createPublicClient({
        chain: base,
        transport: http(rpcUrl),
      })
      const [slot0, liquidity] = await Promise.all([
        client.readContract({
          address: POOL_ADDRESS,
          abi: SLIPSTREAM_POOL_ABI,
          functionName: "slot0",
        }),
        client.readContract({
          address: POOL_ADDRESS,
          abi: SLIPSTREAM_POOL_ABI,
          functionName: "liquidity",
        }),
      ])
      const sqrtPriceX96 = slot0[0]
      if (liquidity === 0n || sqrtPriceX96 === 0n) {
        return {
          price: null,
          source: "unavailable",
          reason: "pool-empty",
          timestamp,
        }
      }
      const price = sqrtPriceX96ToPriceString(sqrtPriceX96)
      if (wholeUnits(price) >= Q96_PRICE_CAP_WHOLE) {
        return {
          price: null,
          source: "unavailable",
          reason: "price-out-of-range",
          timestamp,
        }
      }
      return {
        price,
        source: "aerodrome-cl",
        timestamp,
        liquidity: liquidity.toString(),
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "rpc-error"
      errors.push(`${rpcUrl}: ${message}`.slice(0, 240))
    }
  }

  return {
    price: null,
    source: "unavailable",
    reason: errors[0] ?? "rpc-error",
    timestamp,
  }
}
