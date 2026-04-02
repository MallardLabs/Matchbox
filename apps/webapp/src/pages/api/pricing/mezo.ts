import { MEZO_FALLBACK_PRICE } from "@repo/shared"
import { http, createPublicClient, getAddress } from "viem"
import { base } from "viem/chains"

export const config = {
  runtime: "edge",
}

const BASE_RPC_URL = process.env.BASE_RPC_URL ?? "https://base.llamarpc.com"

// Aerodrome Slipstream pool: MEZO / MUSD on Base.
// Use the active liquid pool rather than the older near-empty one.
const POOL_ADDRESS = getAddress("0xfCd3F5cA230E7c1Bd5b415eb85d5186346De0fec")

// This pool is fixed and both assets use 18 decimals.
// We intentionally keep reads minimal to avoid Base RPC rate limits.
const SLIPSTREAM_POOL_ABI = [
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
  const sqrtPrice = Number(sqrtPriceX96) / Number(Q96)
  return sqrtPrice * sqrtPrice
}

function json(data: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  })
}

export default async function handler() {
  try {
    const client = createPublicClient({
      chain: base,
      transport: http(BASE_RPC_URL),
    })

    const [slot0Result, liquidityResult] = await Promise.all([
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

    const sqrtPriceX96 = slot0Result[0]
    const liquidity = liquidityResult

    if (liquidity === 0n || sqrtPriceX96 === 0n) {
      return json(
        {
          price: MEZO_FALLBACK_PRICE,
          source: "fallback",
          reason: "pool-empty",
          timestamp: Date.now(),
        },
        {
          status: 200,
          headers: {
            "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120",
          },
        },
      )
    }
    const price = sqrtPriceX96ToPrice(sqrtPriceX96)

    if (price <= 0 || price > 1_000_000 || !Number.isFinite(price)) {
      return json(
        {
          price: MEZO_FALLBACK_PRICE,
          source: "fallback",
          reason: "price-out-of-range",
          timestamp: Date.now(),
        },
        {
          status: 200,
          headers: {
            "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
          },
        },
      )
    }

    return json(
      {
        price,
        source: "aerodrome-cl",
        liquidity: liquidity.toString(),
        timestamp: Date.now(),
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
        },
      },
    )
  } catch (_err) {
    return json(
      {
        price: MEZO_FALLBACK_PRICE,
        source: "fallback",
        reason: "rpc-error",
        timestamp: Date.now(),
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "public, s-maxage=10, stale-while-revalidate=30",
        },
      },
    )
  }
}
