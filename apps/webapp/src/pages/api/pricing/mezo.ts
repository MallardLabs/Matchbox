import { http, createPublicClient, getAddress } from "viem"
import { base } from "viem/chains"

export const config = {
  runtime: "edge",
}

const BASE_RPC_URL = process.env.BASE_RPC_URL ?? "https://base.llamarpc.com"

// Aerodrome Slipstream pool: MEZO / MUSD on Base
const POOL_ADDRESS = getAddress("0x0dd2076128fae11da3d0f5522d3a52b532af3741")

// Mezo docs: Base token addresses (bridged)
const MEZO_ON_BASE = getAddress("0x8e4cbBcc33dB6c0a18561fDE1F6bA35906d4848b")
const MUSD_ON_BASE = getAddress("0xdD468A1DDc392dcdbEf6db6e34E89AA338F9F186")

/**
 * Slipstream `slot0` matches Uniswap V3 except there is **no** `feeProtocol`
 * field — decoding with the V3 ABI reads past return data and fails on-chain
 * reads for Slipstream pools.
 */
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
  {
    inputs: [],
    name: "token0",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "token1",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
] as const

const ERC20_DECIMALS_ABI = [
  {
    inputs: [],
    name: "decimals",
    outputs: [{ internalType: "uint8", name: "", type: "uint8" }],
    stateMutability: "view",
    type: "function",
  },
] as const

const Q96 = 2n ** 96n

function sqrtPriceX96ToToken1PerToken0(sqrtPriceX96: bigint): number {
  const sqrtPrice = Number(sqrtPriceX96) / Number(Q96)
  return sqrtPrice * sqrtPrice
}

function mezoUsdFromPool(params: {
  sqrtPriceX96: bigint
  token0: `0x${string}`
  decimals0: number
  decimals1: number
}): number {
  const rawToken1PerToken0 = sqrtPriceX96ToToken1PerToken0(params.sqrtPriceX96)
  const mezoIsToken0 =
    params.token0.toLowerCase() === MEZO_ON_BASE.toLowerCase()

  // Uniswap: raw ratio = token1_wei / token0_wei = token1 per token0
  const decimalFactor = 10 ** (params.decimals0 - params.decimals1)

  if (mezoIsToken0) {
    // token0 = MEZO, token1 = MUSD ≈ USD
    return rawToken1PerToken0 * decimalFactor
  }

  // token0 = MUSD, token1 = MEZO
  if (rawToken1PerToken0 <= 0 || !Number.isFinite(rawToken1PerToken0)) {
    return Number.NaN
  }
  return (1 / rawToken1PerToken0) * (1 / decimalFactor)
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

    const [slot0Result, liquidityResult, token0] = await Promise.all([
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
      client.readContract({
        address: POOL_ADDRESS,
        abi: SLIPSTREAM_POOL_ABI,
        functionName: "token0",
      }),
    ])

    const sqrtPriceX96 = slot0Result[0]
    const liquidity = liquidityResult

    if (
      token0.toLowerCase() !== MEZO_ON_BASE.toLowerCase() &&
      token0.toLowerCase() !== MUSD_ON_BASE.toLowerCase()
    ) {
      return json(
        {
          price: null,
          source: "fallback",
          reason: "unexpected-token0",
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

    if (liquidity === 0n || sqrtPriceX96 === 0n) {
      return json(
        {
          price: null,
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

    const token1 = await client.readContract({
      address: POOL_ADDRESS,
      abi: SLIPSTREAM_POOL_ABI,
      functionName: "token1",
    })

    const [decimals0, decimals1] = await Promise.all([
      client.readContract({
        address: token0,
        abi: ERC20_DECIMALS_ABI,
        functionName: "decimals",
      }),
      client.readContract({
        address: token1,
        abi: ERC20_DECIMALS_ABI,
        functionName: "decimals",
      }),
    ])

    const price = mezoUsdFromPool({
      sqrtPriceX96,
      token0,
      decimals0,
      decimals1,
    })

    if (price <= 0 || price > 1_000_000 || !Number.isFinite(price)) {
      return json(
        {
          price: null,
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
        price: null,
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
