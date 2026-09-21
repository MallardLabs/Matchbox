import { createLogger } from "@repo/shared/logger"
import {
  http,
  type Address,
  createPublicClient,
  erc20Abi,
  getAddress,
} from "viem"
import { base } from "viem/chains"
import { z } from "zod"

import { MEZO_GAUGES, TOKEN_ADDRESSES } from "./constants"

const logger = createLogger("mezo-gauges-liquidity")

const BASE_RPC_URLS = [
  process.env.BASE_RPC_URL,
  "https://mainnet.base.org",
  "https://base.llamarpc.com",
  "https://base-rpc.publicnode.com",
].filter((url): url is string => Boolean(url))

const CURVE_POOL_ADDRESS = getAddress(
  "0xb5571e76693ba60110b5811dd650ffefce1c955f",
)

export type VenueLiquidity = {
  tvlUsd: string | null
  composition: { token: string; amount: string }[]
  volume24hUsd?: string | null
  volume7dUsd?: string | null
  source: string
  status: "ok" | "unavailable"
}

export type MezoGaugesLiquidity = Record<string, VenueLiquidity>

const curvePoolsSchema = z.object({
  success: z.boolean().optional(),
  data: z.object({
    poolData: z.array(
      z.object({
        address: z.string(),
        usdTotal: z.union([z.string(), z.number()]).optional(),
        name: z.string().optional(),
      }),
    ),
  }),
})

const curveVolumesSchema = z.object({
  success: z.boolean().optional(),
  data: z.object({
    pools: z.array(
      z.object({
        address: z.string(),
        volumeUSD: z.union([z.string(), z.number()]).optional(),
        interval: z.union([z.string(), z.number()]).optional(),
      }),
    ),
  }),
})

async function fetchCurveLiquidity(): Promise<VenueLiquidity> {
  const [poolsRes, volumesRes] = await Promise.all([
    fetch("https://api.curve.finance/v1/getPools/all/ethereum", {
      cache: "no-store",
    }),
    fetch("https://api.curve.finance/v1/getVolumes/ethereum", {
      cache: "no-store",
    }),
  ])
  if (!poolsRes.ok) throw new Error(`curve pools ${poolsRes.status}`)
  const pools = curvePoolsSchema.parse(await poolsRes.json())
  const pool = pools.data.poolData.find(
    (p) => p.address.toLowerCase() === CURVE_POOL_ADDRESS.toLowerCase(),
  )
  if (!pool) throw new Error("curve pool not found")

  let volume24hUsd: string | null = null
  if (volumesRes.ok) {
    const volumes = curveVolumesSchema.parse(await volumesRes.json())
    const row = volumes.data.pools.find(
      (p) => p.address.toLowerCase() === CURVE_POOL_ADDRESS.toLowerCase(),
    )
    volume24hUsd = row?.volumeUSD != null ? String(row.volumeUSD) : null
  }

  return {
    tvlUsd: pool.usdTotal != null ? String(pool.usdTotal) : null,
    composition: [],
    volume24hUsd,
    source: "curve-api",
    status: "ok",
  }
}

const llamaPoolsSchema = z.object({
  status: z.string().optional(),
  data: z.array(
    z.object({
      pool: z.string(),
      chain: z.string().nullish(),
      project: z.string().nullish(),
      underlyingTokens: z.array(z.string()).nullish(),
      tvlUsd: z.number().nullish(),
      volumeUsd1d: z.number().nullish(),
      volumeUsd7d: z.number().nullish(),
    }),
  ),
})

type LlamaPool = z.infer<typeof llamaPoolsSchema>["data"][number]

async function fetchLlamaPools(): Promise<LlamaPool[]> {
  const response = await fetch("https://yields.llama.fi/pools", {
    cache: "no-store",
  })
  if (!response.ok) throw new Error(`defillama ${response.status}`)
  return llamaPoolsSchema.parse(await response.json()).data
}

function containsMusd(pool: LlamaPool): boolean {
  const musd = TOKEN_ADDRESSES.musd.toLowerCase()
  return pool.underlyingTokens?.some((t) => t.toLowerCase() === musd) ?? false
}

function llamaVenue(
  pool: LlamaPool | undefined,
  source: string,
): VenueLiquidity {
  if (!pool) {
    return {
      tvlUsd: null,
      composition: [],
      source,
      status: "unavailable",
    }
  }
  return {
    tvlUsd: pool.tvlUsd != null ? String(pool.tvlUsd) : null,
    composition: [],
    volume24hUsd: pool.volumeUsd1d != null ? String(pool.volumeUsd1d) : null,
    volume7dUsd: pool.volumeUsd7d != null ? String(pool.volumeUsd7d) : null,
    source,
    status: "ok",
  }
}

async function readBaseBalances(
  poolAddress: Address,
  tokens: Address[],
): Promise<Map<string, bigint>> {
  const out = new Map<string, bigint>()
  for (const rpcUrl of BASE_RPC_URLS) {
    try {
      const client = createPublicClient({
        chain: base,
        transport: http(rpcUrl),
      })
      const results = await Promise.all(
        tokens.map((token) =>
          client.readContract({
            address: token,
            abi: erc20Abi,
            functionName: "balanceOf",
            args: [poolAddress],
          }),
        ),
      )
      tokens.forEach((token, i) =>
        out.set(token.toLowerCase(), results[i] ?? 0n),
      )
      return out
    } catch (error) {
      logger.warn({
        message: "Base balanceOf read failed",
        rpcUrl,
        pool: poolAddress,
        error: error instanceof Error ? error.message : "unknown",
      })
    }
  }
  return out
}

const AERODROME_POOL_TOKENS: Record<
  string,
  { symbol: string; address: Address; decimals: number; stableUsd?: boolean }[]
> = {
  "0xff56d037d948fad1027a1ac82ae610e4b694c641": [
    {
      symbol: "USDC",
      address: TOKEN_ADDRESSES.usdcBase,
      decimals: 6,
      stableUsd: true,
    },
    {
      symbol: "MUSD",
      address: TOKEN_ADDRESSES.musd,
      decimals: 18,
      stableUsd: true,
    },
  ],
  "0xef458a3263d2a8c7f3ed9e949ae2f9b345d08b1f": [
    { symbol: "MEZO", address: TOKEN_ADDRESSES.mezoBase, decimals: 18 },
    {
      symbol: "MUSD",
      address: TOKEN_ADDRESSES.musd,
      decimals: 18,
      stableUsd: true,
    },
  ],
}

const SLIPSTREAM_SLOT0_ABI = [
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
] as const

const Q96 = 2n ** 96n

// Same sqrtPriceX96 → price math as apps/webapp/src/app/api/pricing/mezo/route.ts.
// Display-only estimate; both pool tokens use 18 decimals so no decimal
// adjustment is needed.
function sqrtPriceX96ToPrice(sqrtPriceX96: bigint): number {
  const sqrtPrice = Number(sqrtPriceX96) / Number(Q96)
  return sqrtPrice * sqrtPrice
}

/** MEZO/USD price from the MEZO/MUSD Slipstream pool (token0 = MEZO). */
async function readMezoUsdPrice(): Promise<number | null> {
  for (const rpcUrl of BASE_RPC_URLS) {
    try {
      const client = createPublicClient({
        chain: base,
        transport: http(rpcUrl),
      })
      const [sqrtPriceX96] = await client.readContract({
        address: getAddress("0xEF458A3263d2a8C7f3ed9e949aE2F9B345D08b1F"),
        abi: SLIPSTREAM_SLOT0_ABI,
        functionName: "slot0",
      })
      const price = sqrtPriceX96ToPrice(sqrtPriceX96)
      if (price > 0 && Number.isFinite(price)) return price
    } catch (error) {
      logger.warn({
        message: "MEZO slot0 read failed",
        rpcUrl,
        error: error instanceof Error ? error.message : "unknown",
      })
    }
  }
  return null
}

/** TVL estimate from raw balances when DefiLlama has no entry. */
function estimateTvlUsd(
  tokenDefs: {
    symbol: string
    address: Address
    decimals: number
    stableUsd?: boolean
  }[],
  balances: Map<string, bigint>,
  mezoUsd: number | null,
): string | null {
  let total = 0
  for (const token of tokenDefs) {
    const balance = balances.get(token.address.toLowerCase())
    if (balance === undefined) return null
    const amount = Number(balance) / 10 ** token.decimals
    if (token.stableUsd) {
      total += amount
    } else {
      if (mezoUsd === null) return null
      total += amount * mezoUsd
    }
  }
  return Number.isFinite(total) ? String(total) : null
}

export async function fetchMezoGaugesLiquidity(): Promise<MezoGaugesLiquidity> {
  const gaugeEntries = Object.entries(MEZO_GAUGES)
  const result: MezoGaugesLiquidity = {}

  const llamaPools = await fetchLlamaPools().catch((error) => {
    logger.warn({
      message: "DefiLlama pools fetch failed",
      error: error instanceof Error ? error.message : "unknown",
    })
    return [] as LlamaPool[]
  })

  await Promise.all(
    gaugeEntries.map(async ([gauge, config]) => {
      try {
        if (config.protocol === "Curve") {
          result[gauge] = await fetchCurveLiquidity()
          return
        }

        const poolKey = config.poolAddress?.toLowerCase()
        let llamaMatch = poolKey
          ? llamaPools.find((p) => p.pool.toLowerCase() === poolKey)
          : undefined
        if (!llamaMatch && config.protocol === "Uniswap v4") {
          llamaMatch = llamaPools.find(
            (p) =>
              containsMusd(p) &&
              p.project === "uniswap-v4" &&
              p.chain === "Ethereum",
          )
        }
        if (!llamaMatch && config.protocol === "Aerodrome") {
          const tokenSet = new Set(
            (AERODROME_POOL_TOKENS[poolKey ?? ""] ?? []).map((t) =>
              t.address.toLowerCase(),
            ),
          )
          llamaMatch = llamaPools.find(
            (p) =>
              p.chain === "Base" &&
              containsMusd(p) &&
              (p.underlyingTokens?.every((t) =>
                tokenSet.has(t.toLowerCase()),
              ) ??
                false),
          )
        }
        const venue = llamaVenue(llamaMatch, "defillama")

        if (config.protocol === "Aerodrome" && config.poolAddress) {
          const tokenDefs =
            AERODROME_POOL_TOKENS[config.poolAddress.toLowerCase()] ?? []
          const balances = await readBaseBalances(
            config.poolAddress,
            tokenDefs.map((t) => t.address),
          )
          venue.composition = tokenDefs
            .filter((t) => balances.has(t.address.toLowerCase()))
            .map((t) => ({
              token: t.symbol,
              amount: (balances.get(t.address.toLowerCase()) ?? 0n).toString(),
            }))
          // No DefiLlama row → price the composition on-chain instead.
          if (venue.tvlUsd === null && venue.composition.length > 0) {
            const needsMezo = tokenDefs.some((t) => !t.stableUsd)
            const mezoUsd = needsMezo ? await readMezoUsdPrice() : null
            const tvl = estimateTvlUsd(tokenDefs, balances, mezoUsd)
            if (tvl !== null) {
              venue.tvlUsd = tvl
              venue.source = "onchain-composition"
              venue.status = "ok"
            }
          }
        }

        result[gauge] = venue
      } catch (error) {
        logger.warn({
          message: "Venue liquidity fetch failed",
          gauge,
          protocol: config.protocol,
          error: error instanceof Error ? error.message : "unknown",
        })
        result[gauge] = {
          tvlUsd: null,
          composition: [],
          source: "none",
          status: "unavailable",
        }
      }
    }),
  )

  return result
}
