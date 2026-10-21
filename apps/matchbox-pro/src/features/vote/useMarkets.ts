import { useEpoch } from "@/hooks/useEpoch"
import { useNetwork } from "@/lib/network"
import { QUERY_PROFILES } from "@/lib/queryProfiles"
import {
  gaugedPools,
  mapPoolMarket,
  mapValidatorMarket,
  okAddress,
  okBigint,
  okText,
  pairTokenAddresses,
} from "@/worker/vote/mappers"
import { VALIDATOR_POOL_ABI } from "@repo/shared/contracts"
import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useMemo, useState } from "react"
import { useReadContract, useReadContracts } from "wagmi"
import type { z } from "zod"
import {
  type PoolMarket,
  type ValidatorMarket,
  poolMarketSchema,
  tokenPricesSchema,
  validatorMarketSchema,
} from "./contract"
import { TOKEN_META_ABI, validatorPoolAddress, voterConfig } from "./contracts"
import { useEpochRewards } from "./useEpochRewards"

export type MarketState<T> = {
  market: T | undefined
  isLoading: boolean
  /** "server" normally; "chain" while the browser fallback is in use. */
  source: "server" | "chain"
  /** Both the Worker and the browser fallback failed. */
  unavailable: boolean
  retry: () => void
}

// A slow Worker never strands the page: after this long the browser starts
// its own chain reads alongside, and whichever lands first is shown.
const HEDGE_AFTER_MS = 6_000
const REQUEST_TIMEOUT_MS = 15_000

async function fetchMarket<S extends z.ZodType>(
  path: string,
  chainId: number,
  schema: S,
  signal: AbortSignal,
): Promise<z.output<S>> {
  const response = await fetch(`/api/vote/${path}?chainId=${chainId}`, {
    signal: AbortSignal.any([signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)]),
  })
  if (!response.ok) throw new Error(`${path} failed (${response.status})`)
  return schema.parse(await response.json())
}

export function validatorMarketQuery(chainId: number) {
  return queryOptions({
    queryKey: ["vote-market", "validators", chainId],
    queryFn: ({ signal }) =>
      fetchMarket("validators", chainId, validatorMarketSchema, signal),
    ...QUERY_PROFILES.SHORT_CACHE,
    retry: 1,
  })
}

export function poolMarketQuery(chainId: number) {
  return queryOptions({
    queryKey: ["vote-market", "pools", chainId],
    queryFn: ({ signal }) =>
      fetchMarket("pools", chainId, poolMarketSchema, signal),
    ...QUERY_PROFILES.SHORT_CACHE,
    retry: 1,
  })
}

export function tokenPricesQuery(chainId: number) {
  return queryOptions({
    queryKey: ["vote-token-prices", chainId],
    queryFn: async ({ signal }) => {
      const response = await fetch(`/api/vote/prices?chainId=${chainId}`, {
        signal: AbortSignal.any([
          signal,
          AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        ]),
      })
      if (!response.ok) throw new Error(`prices failed (${response.status})`)
      const body = tokenPricesSchema.parse(await response.json())
      return new Map(Object.entries(body.prices))
    },
    ...QUERY_PROFILES.LONG_CACHE,
    retry: 1,
  })
}

const NO_TOKEN_PRICES: ReadonlyMap<string, string> = new Map()

/**
 * Mezo pools API prices for tokens without a reference price. Loaded on its
 * own so cards never wait for it; rewards re-price when it lands.
 */
export function useTokenPrices(): ReadonlyMap<string, string> {
  const { chainId } = useNetwork()
  return useQuery(tokenPricesQuery(chainId)).data ?? NO_TOKEN_PRICES
}

/**
 * Warms both veBTC markets (and token prices) as soon as Vote opens,
 * whichever tab is showing, so switching to Validators or Pools is instant.
 */
export function usePrefetchVoteMarkets(): void {
  const { chainId } = useNetwork()
  const queryClient = useQueryClient()
  useEffect(() => {
    void queryClient.prefetchQuery(validatorMarketQuery(chainId))
    void queryClient.prefetchQuery(poolMarketQuery(chainId))
    void queryClient.prefetchQuery(tokenPricesQuery(chainId))
  }, [chainId, queryClient])
}

/** True once a request has been pending longer than `ms`. */
function usePendingFor(pending: boolean, ms: number): boolean {
  const [slow, setSlow] = useState(false)
  useEffect(() => {
    if (!pending) {
      setSlow(false)
      return
    }
    const id = window.setTimeout(() => setSlow(true), ms)
    return () => window.clearTimeout(id)
  }, [ms, pending])
  return slow
}

function combine<T>(
  server: { data: T | undefined; isError: boolean },
  chain: { market: T | undefined; failed: boolean },
  retry: () => void,
): MarketState<T> {
  const market = server.data ?? chain.market
  // Loading until something lands or both sources have failed outright, so
  // the hand-off to the fallback never flashes an empty list.
  const unavailable = market === undefined && server.isError && chain.failed
  return {
    market,
    isLoading: market === undefined && !unavailable,
    source: server.data ? "server" : "chain",
    unavailable,
    retry,
  }
}

/**
 * Validator gauges from the Worker (one cached request), falling back to
 * browser chain reads with the same mappers if it fails or is slow.
 */
export function useValidatorMarket(): MarketState<ValidatorMarket> {
  const { chainId } = useNetwork()
  const server = useQuery(validatorMarketQuery(chainId))
  const slow = usePendingFor(server.isPending, HEDGE_AFTER_MS)
  const fallback = server.isError || slow
  const chain = useValidatorChainMarket(fallback && !server.data)
  return combine(server, chain, () => void server.refetch())
}

export function usePoolMarket(): MarketState<PoolMarket> {
  const { chainId } = useNetwork()
  const server = useQuery(poolMarketQuery(chainId))
  const slow = usePendingFor(server.isPending, HEDGE_AFTER_MS)
  const fallback = server.isError || slow
  const chain = usePoolChainMarket(fallback && !server.data)
  return combine(server, chain, () => void server.refetch())
}

function useValidatorChainMarket(enabled: boolean): {
  market: ValidatorMarket | undefined
  failed: boolean
} {
  const { chainId } = useNetwork()
  const voter = voterConfig(chainId, "validators")
  const pool = validatorPoolAddress(chainId)
  const { epochStart } = useEpoch()

  const head = useReadContracts({
    contracts: [
      { ...voter, functionName: "length" as const },
      { ...voter, functionName: "totalWeight" as const },
    ],
    query: { ...QUERY_PROFILES.SHORT_CACHE, enabled },
  })
  const length = okBigint(head.data?.[0]) ?? 0n
  const gaugeRead = useReadContracts({
    contracts: Array.from({ length: Number(length) }, (_, index) => ({
      ...voter,
      functionName: "gauges" as const,
      args: [BigInt(index)] as const,
    })),
    query: { ...QUERY_PROFILES.SHORT_CACHE, enabled: enabled && length > 0n },
  })
  const gauges = useMemo(
    () =>
      (gaugeRead.data ?? []).flatMap((call) => {
        const gauge = okAddress(call)
        return gauge ? [gauge] : []
      }),
    [gaugeRead.data],
  )
  const states = useReadContracts({
    contracts: gauges.flatMap((gauge) => [
      { ...voter, functionName: "weights" as const, args: [gauge] as const },
      { ...voter, functionName: "isAlive" as const, args: [gauge] as const },
      {
        ...voter,
        functionName: "gaugeToBribe" as const,
        args: [gauge] as const,
      },
    ]),
    query: {
      ...QUERY_PROFILES.SHORT_CACHE,
      enabled: enabled && gauges.length > 0,
    },
  })
  const operatorsRead = useReadContract({
    address: pool,
    abi: VALIDATOR_POOL_ABI,
    chainId,
    functionName: "validators",
    query: { ...QUERY_PROFILES.LONG_CACHE, enabled },
  })
  const operators = useMemo(
    () =>
      (operatorsRead.data ?? []).flatMap((value) => {
        const operator = okAddress({ status: "success", result: value })
        return operator ? [operator] : []
      }),
    [operatorsRead.data],
  )
  const registry = useReadContracts({
    contracts: operators.flatMap((operator) => [
      {
        address: pool,
        abi: VALIDATOR_POOL_ABI,
        chainId,
        functionName: "validator" as const,
        args: [operator] as const,
      },
      {
        ...voter,
        functionName: "validatorToGauge" as const,
        args: [operator] as const,
      },
    ]),
    query: {
      ...QUERY_PROFILES.LONG_CACHE,
      enabled: enabled && operators.length > 0,
    },
  })
  const bribes = useMemo(
    () =>
      gauges.flatMap((_, index) => {
        const bribe = okAddress(states.data?.[index * 3 + 2])
        return bribe ? [bribe] : []
      }),
    [gauges, states.data],
  )
  const rewards = useEpochRewards(bribes, epochStart, enabled)

  // Only hand over a market once every stage has landed; a half-read one
  // would show every gauge as inactive and unfunded.
  const complete =
    head.data !== undefined &&
    (length === 0n || gaugeRead.data !== undefined) &&
    (gauges.length === 0 || states.data !== undefined) &&
    !rewards.isLoading
  const market = useMemo(() => {
    if (!enabled || !complete || !head.data || epochStart === undefined)
      return undefined
    const parsed = validatorMarketSchema.safeParse(
      mapValidatorMarket({
        chainId,
        generatedAt: new Date().toISOString(),
        epochStart,
        totalWeight: okBigint(head.data[1]) ?? 0n,
        gauges,
        states: states.data ?? [],
        operators,
        registry: registry.data ?? [],
        rewards: rewards.byContract,
      }),
    )
    return parsed.success ? parsed.data : undefined
  }, [
    chainId,
    complete,
    enabled,
    epochStart,
    gauges,
    head.data,
    operators,
    registry.data,
    rewards.byContract,
    states.data,
  ])

  return {
    market,
    // The first read failing means nothing below it can work.
    failed: enabled && head.isError,
  }
}

function usePoolChainMarket(enabled: boolean): {
  market: PoolMarket | undefined
  failed: boolean
} {
  const { chainId } = useNetwork()
  const voter = voterConfig(chainId, "pools")
  const { epochStart } = useEpoch()

  const head = useReadContracts({
    contracts: [
      { ...voter, functionName: "length" as const },
      { ...voter, functionName: "totalWeight" as const },
    ],
    query: { ...QUERY_PROFILES.SHORT_CACHE, enabled },
  })
  const length = okBigint(head.data?.[0]) ?? 0n
  const poolRead = useReadContracts({
    contracts: Array.from({ length: Number(length) }, (_, index) => ({
      ...voter,
      functionName: "pools" as const,
      args: [BigInt(index)] as const,
    })),
    query: { ...QUERY_PROFILES.SHORT_CACHE, enabled: enabled && length > 0n },
  })
  const pools = useMemo(
    () =>
      (poolRead.data ?? []).flatMap((call) => {
        const address = okAddress(call)
        return address ? [address] : []
      }),
    [poolRead.data],
  )
  const gaugeRead = useReadContracts({
    contracts: pools.flatMap((pool) => [
      { ...voter, functionName: "gauges" as const, args: [pool] as const },
      { ...voter, functionName: "weights" as const, args: [pool] as const },
    ]),
    query: {
      ...QUERY_PROFILES.SHORT_CACHE,
      enabled: enabled && pools.length > 0,
    },
  })
  const rows = useMemo(
    () => gaugedPools(pools, gaugeRead.data ?? []),
    [gaugeRead.data, pools],
  )
  const states = useReadContracts({
    contracts: rows.flatMap(({ gauge }) => [
      { ...voter, functionName: "isAlive" as const, args: [gauge] as const },
      {
        ...voter,
        functionName: "gaugeToBribe" as const,
        args: [gauge] as const,
      },
      {
        ...voter,
        functionName: "gaugeToFees" as const,
        args: [gauge] as const,
      },
    ]),
    query: {
      ...QUERY_PROFILES.SHORT_CACHE,
      enabled: enabled && rows.length > 0,
    },
  })
  const meta = useReadContracts({
    contracts: rows.flatMap(({ pool }) => [
      {
        address: pool,
        abi: TOKEN_META_ABI,
        chainId,
        functionName: "name" as const,
      },
      {
        address: pool,
        abi: TOKEN_META_ABI,
        chainId,
        functionName: "symbol" as const,
      },
      {
        address: pool,
        abi: TOKEN_META_ABI,
        chainId,
        functionName: "token0" as const,
      },
      {
        address: pool,
        abi: TOKEN_META_ABI,
        chainId,
        functionName: "token1" as const,
      },
    ]),
    query: {
      ...QUERY_PROFILES.LONG_CACHE,
      enabled: enabled && rows.length > 0,
    },
  })
  const pairTokens = useMemo(
    () => pairTokenAddresses(rows, meta.data ?? []),
    [meta.data, rows],
  )
  const symbols = useReadContracts({
    contracts: pairTokens.map((address) => ({
      address,
      abi: TOKEN_META_ABI,
      chainId,
      functionName: "symbol" as const,
    })),
    query: {
      ...QUERY_PROFILES.LONG_CACHE,
      enabled: enabled && pairTokens.length > 0,
    },
  })
  const rewardContracts = useMemo(
    () =>
      rows.flatMap((_, index) =>
        [
          okAddress(states.data?.[index * 3 + 1]),
          okAddress(states.data?.[index * 3 + 2]),
        ].flatMap((address) => (address ? [address] : [])),
      ),
    [rows, states.data],
  )
  const rewards = useEpochRewards(rewardContracts, epochStart, enabled)

  const complete =
    head.data !== undefined &&
    (length === 0n || poolRead.data !== undefined) &&
    (pools.length === 0 || gaugeRead.data !== undefined) &&
    (rows.length === 0 ||
      (states.data !== undefined && meta.data !== undefined)) &&
    (pairTokens.length === 0 || symbols.data !== undefined) &&
    !rewards.isLoading
  const market = useMemo(() => {
    if (!enabled || !complete || !head.data || epochStart === undefined)
      return undefined
    const pairSymbols = new Map<string, string>()
    pairTokens.forEach((address, index) => {
      const symbol = okText(symbols.data?.[index], 32)
      if (symbol) pairSymbols.set(address.toLowerCase(), symbol)
    })
    const parsed = poolMarketSchema.safeParse(
      mapPoolMarket({
        chainId,
        generatedAt: new Date().toISOString(),
        epochStart,
        totalWeight: okBigint(head.data[1]) ?? 0n,
        rows,
        states: states.data ?? [],
        meta: meta.data ?? [],
        pairSymbols,
        rewards: rewards.byContract,
      }),
    )
    return parsed.success ? parsed.data : undefined
  }, [
    chainId,
    complete,
    enabled,
    epochStart,
    head.data,
    meta.data,
    pairTokens,
    rewards.byContract,
    rows,
    states.data,
    symbols.data,
  ])

  return {
    market,
    // The first read failing means nothing below it can work.
    failed: enabled && head.isError,
  }
}
