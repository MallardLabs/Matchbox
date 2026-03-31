import { MEZO_FALLBACK_PRICE } from "@repo/shared"
import { http, createPublicClient } from "viem"
import { base } from "viem/chains"

export const config = {
  runtime: "edge",
}

const BASE_RPC = "https://base.llamarpc.com"

// Aerodrome CL pool: MEZO/MUSD on Base
const POOL_ADDRESS = "0x0dd2076128fae11da3d0f5522d3a52b532af3741" as const

// Both tokens are 18 decimals: token0 = MEZO, token1 = MUSD
// For equal-decimal CL pools: price = (sqrtPriceX96 / 2^96)^2

const CL_POOL_ABI = [
  {
    inputs: [],
    name: "slot0",
    outputs: [
      { internalType: "uint160", name: "sqrtPriceX96", type: "uint160" },
      { internalType: "int24", name: "tick", type: "int24" },
      {
        internalType: "uint16",
        name: "observationIndex",
        type: "uint16",
      },
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

const Q96 = 2n ** 96n

function sqrtPriceX96ToPrice(sqrtPriceX96: bigint): number {
  // price = (sqrtPriceX96 / 2^96)^2
  // Use floating point since we only need ~6 digits of precision
  const sqrtPrice = Number(sqrtPriceX96) / Number(Q96)
  return sqrtPrice * sqrtPrice
}

export default async function handler() {
  try {
    const client = createPublicClient({
      chain: base,
      transport: http(BASE_RPC),
    })

    const [slot0Result, liquidityResult] = await Promise.all([
      client.readContract({
        address: POOL_ADDRESS,
        abi: CL_POOL_ABI,
        functionName: "slot0",
      }),
      client.readContract({
        address: POOL_ADDRESS,
        abi: CL_POOL_ABI,
        functionName: "liquidity",
      }),
    ])

    const sqrtPriceX96 = slot0Result[0]
    const liquidity = liquidityResult

    // If pool has no liquidity, return fallback
    if (liquidity === 0n || sqrtPriceX96 === 0n) {
      return new Response(
        JSON.stringify({
          price: MEZO_FALLBACK_PRICE,
          source: "fallback",
          reason: "pool-empty",
          timestamp: Date.now(),
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120",
          },
        },
      )
    }

    // MEZO is token0, MUSD is token1 (stablecoin ~$1)
    // price = token0 price in terms of token1 = MEZO price in MUSD ≈ USD
    const price = sqrtPriceX96ToPrice(sqrtPriceX96)

    // Sanity check: reject obviously broken prices
    if (price <= 0 || price > 1_000_000 || !Number.isFinite(price)) {
      return new Response(
        JSON.stringify({
          price: MEZO_FALLBACK_PRICE,
          source: "fallback",
          reason: "price-out-of-range",
          timestamp: Date.now(),
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
          },
        },
      )
    }

    return new Response(
      JSON.stringify({
        price,
        source: "aerodrome-cl",
        liquidity: liquidity.toString(),
        timestamp: Date.now(),
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
        },
      },
    )
  } catch (err) {
    // On any RPC or decode error, return fallback
    return new Response(
      JSON.stringify({
        price: MEZO_FALLBACK_PRICE,
        source: "fallback",
        reason: "rpc-error",
        timestamp: Date.now(),
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "public, s-maxage=10, stale-while-revalidate=30",
        },
      },
    )
  }
}
