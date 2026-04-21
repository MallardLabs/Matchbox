import { useNetwork } from "@/contexts/NetworkContext"
import { CHAIN_ID } from "@repo/shared/contracts"
import { useQuery } from "@tanstack/react-query"
import { useMemo } from "react"
import type { Address } from "viem"

export type PoolTokenStat = {
  token: Address
  amount: string
  amountUSD: string
}

export type PoolTokenInfo = {
  address: Address
  name: string
  symbol: string
  decimals: number
  price: string | null
  reserve: string
}

type PoolStats = {
  volume: PoolTokenStat[]
  fees: PoolTokenStat[]
  apr: number
}

type PoolBase = {
  address: Address
  name: string
  symbol: string
  token0: PoolTokenInfo
  token1: PoolTokenInfo
  tvl: string
  matsBoost: number
  emissionsApr: number
  stats: PoolStats
  gauge: Address | null
  volatility: "stable" | "volatility"
  isVotable: boolean
}

export type BasicPool = PoolBase & {
  type: "basic"
  supply: string
}

export type ConcentratedPool = PoolBase & {
  type: "concentrated"
  stakedLiquidity: string
  liquidity: string
  tick: number
  sqrtPriceX96: string
  currentPrice: string
  tickSpacing?: number
}

export type Pool = BasicPool | ConcentratedPool

type GetLiquidityPoolResponse = {
  success: boolean
  data: Pool[]
}

const POOLS_NETWORK: Record<number, "mainnet" | "testnet"> = {
  [CHAIN_ID.mainnet]: "mainnet",
  [CHAIN_ID.testnet]: "testnet",
}

function extractTickSpacing(symbol: string | undefined): number {
  if (!symbol) return 0
  const parts = symbol.split("-")
  const last = parts[parts.length - 1]
  const n = Number.parseInt(last ?? "", 10)
  return Number.isNaN(n) ? 0 : n
}

async function fetchPools(chainId: number): Promise<Pool[]> {
  const network = POOLS_NETWORK[chainId]
  if (!network) throw new Error(`Unsupported chainId ${chainId}`)
  const url = `/api/pools?network=${network}&filter=known`
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to fetch pools: ${response.status}`)
  }
  const json = (await response.json()) as GetLiquidityPoolResponse
  if (!json.success) throw new Error("API reported failure for /pools")
  return json.data.map((pool) =>
    pool.type === "concentrated"
      ? { ...pool, tickSpacing: extractTickSpacing(pool.symbol) }
      : pool,
  )
}

export function usePools() {
  const { chainId, isNetworkReady } = useNetwork()

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["pools", chainId],
    queryFn: () => fetchPools(chainId),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    enabled: isNetworkReady,
  })

  return {
    pools: data ?? [],
    isLoading,
    error: error as Error | null,
    refetch,
  }
}

export function usePool(address: Address | undefined) {
  const { pools, isLoading, error, refetch } = usePools()
  const pool = useMemo(() => {
    if (!address) return undefined
    const lower = address.toLowerCase()
    return pools.find((p) => p.address.toLowerCase() === lower)
  }, [address, pools])

  return { pool, isLoading, error, refetch }
}

export function poolFeesAprPercent(pool: Pool): number {
  return (pool.stats.apr ?? 0) / 100
}

export function poolEmissionsAprPercent(pool: Pool): number {
  return (pool.emissionsApr ?? 0) / 100
}

export function poolDailyVolumeUsd(pool: Pool): number {
  return pool.stats.volume.reduce(
    (acc, v) => acc + Number.parseFloat(v.amountUSD || "0"),
    0,
  )
}

export function poolDailyFeesUsd(pool: Pool): number {
  return pool.stats.fees.reduce(
    (acc, v) => acc + Number.parseFloat(v.amountUSD || "0"),
    0,
  )
}

export function poolTvlUsd(pool: Pool): number {
  return Number.parseFloat(pool.tvl || "0")
}
