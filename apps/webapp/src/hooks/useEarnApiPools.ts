import { QUERY_PROFILES } from "@/config/queryProfiles"
import { useQuery } from "@tanstack/react-query"
import { z } from "zod"

const TokenAmountUSDSchema = z.object({
  token: z
    .object({
      address: z.string(),
      symbol: z.string().nullable().optional(),
      decimals: z.number().nullable().optional(),
    })
    .passthrough(),
  amount: z.string().optional(),
  amountUSD: z.string().optional(),
})

const PoolTokenSchema = z
  .object({
    address: z.string(),
    symbol: z.string().nullable().optional(),
    decimals: z.number().nullable().optional(),
    reserve: z.string().optional(),
    price: z.string().nullable().optional(),
  })
  .passthrough()

const PoolStatsSchema = z
  .object({
    volume: z.array(TokenAmountUSDSchema).optional(),
    fees: z.array(TokenAmountUSDSchema).optional(),
    apr: z.number().optional(),
  })
  .passthrough()

const PoolSchema = z
  .object({
    address: z.string(),
    name: z.string(),
    symbol: z.string().optional(),
    type: z.enum(["basic", "concentrated"]).optional(),
    token0: PoolTokenSchema,
    token1: PoolTokenSchema,
    tvl: z.string(),
    matsBoost: z.number().optional(),
    stats: PoolStatsSchema.optional(),
    gauge: z.string().nullable().optional(),
    volatility: z.string().optional(),
    isVotable: z.boolean().optional(),
  })
  .passthrough()

const EarnApiResponseSchema = z.object({
  data: z.unknown(),
  error: z.string().nullable().optional(),
  endpoint: z.string().optional(),
  timestamp: z.number().optional(),
})

// Upstream earn-api wraps arrays in { success, data: [...] } — handle both
// flat-array and wrapped responses.
const WrappedListSchema = z.union([
  z.array(PoolSchema),
  z.object({ success: z.boolean().optional(), data: z.array(PoolSchema) }),
])

export type EarnApiPool = z.infer<typeof PoolSchema>

function sumTokenUsd(
  amounts: z.infer<typeof TokenAmountUSDSchema>[] | undefined,
): number {
  if (!amounts || amounts.length === 0) return 0
  let total = 0
  for (const entry of amounts) {
    const raw = entry.amountUSD ?? "0"
    const numeric = Number(raw)
    if (Number.isFinite(numeric)) total += numeric
  }
  return total
}

export type PoolRow = {
  address: string
  name: string
  type: "basic" | "concentrated"
  tvlUsd: number
  volumeUsd: number
  feesUsd: number
  aprBps: number
  token0Symbol: string
  token1Symbol: string
  volatility: string
  isVotable: boolean
}

function normalizePool(pool: EarnApiPool): PoolRow {
  const tvlNum = Number(pool.tvl)
  const feesUsd = sumTokenUsd(pool.stats?.fees)
  const volumeUsd = sumTokenUsd(pool.stats?.volume)

  return {
    address: pool.address,
    name: pool.name,
    type: (pool.type ?? "basic") as "basic" | "concentrated",
    tvlUsd: Number.isFinite(tvlNum) ? tvlNum : 0,
    volumeUsd,
    feesUsd,
    aprBps: pool.stats?.apr ?? 0,
    token0Symbol: pool.token0.symbol ?? "?",
    token1Symbol: pool.token1.symbol ?? "?",
    volatility: pool.volatility ?? "volatile",
    isVotable: Boolean(pool.isVotable),
  }
}

async function fetchPools(): Promise<{
  pools: PoolRow[]
  isUnavailable: boolean
}> {
  const response = await fetch(
    "/api/analytics/earn-proxy?endpoint=pools&timeframe=week",
  )

  if (!response.ok) {
    return { pools: [], isUnavailable: true }
  }

  const bodyRaw = await response.json()
  const parsed = EarnApiResponseSchema.safeParse(bodyRaw)
  if (!parsed.success) {
    return { pools: [], isUnavailable: true }
  }

  const body = parsed.data
  if (body.error || body.data === null || body.data === undefined) {
    return { pools: [], isUnavailable: true }
  }

  const list = WrappedListSchema.safeParse(body.data)
  if (!list.success) {
    return { pools: [], isUnavailable: true }
  }

  const rawPools = Array.isArray(list.data) ? list.data : list.data.data
  return {
    pools: rawPools.map(normalizePool),
    isUnavailable: false,
  }
}

export function useEarnApiPools() {
  const query = useQuery({
    queryKey: ["earn-api", "pools"],
    queryFn: fetchPools,
    ...QUERY_PROFILES.SHORT_CACHE,
    retry: 1,
  })

  return {
    pools: query.data?.pools ?? [],
    isLoading: query.isLoading,
    isUnavailable: query.data?.isUnavailable ?? query.isError,
    refetch: query.refetch,
  }
}

export default useEarnApiPools
