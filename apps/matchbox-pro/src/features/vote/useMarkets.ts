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
import { useQuery } from "@tanstack/react-query"
import { useMemo } from "react"
import { useReadContract, useReadContracts } from "wagmi"
import type { z } from "zod"
import {
  type PoolMarket,
  type ValidatorMarket,
  poolMarketSchema,
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

async function fetchMarket<S extends z.ZodType>(
  path: string,
  chainId: number,
  schema: S,
  signal: AbortSignal,
): Promise<z.output<S>> {
  const response = await fetch(`/api/vote/${path}?chainId=${chainId}`, {
    signal,
  })
  if (!response.ok) throw new Error(`${path} failed (${response.status})`)
  return schema.parse(await response.json())
}

/**
 * Validator gauges from the Worker (one cached request), falling back to
 * browser chain reads with the same mappers if the endpoint fails.
 */
export function useValidatorMarket(): MarketState<ValidatorMarket> {
  const { chainId } = useNetwork()
  const server = useQuery({
    queryKey: ["vote-market", "validators", chainId],
    queryFn: ({ signal }) =>
      fetchMarket("validators", chainId, validatorMarketSchema, signal),
    ...QUERY_PROFILES.SHORT_CACHE,
    retry: 1,
  })
  const chain = useValidatorChainMarket(server.isError)
  return {
    market: server.data ?? chain.market,
    isLoading: server.isPending || (server.isError && chain.isLoading),
    source: server.data ? "server" : "chain",
    unavailable: server.isError && !chain.isLoading && !chain.market,
    retry: () => void server.refetch(),
  }
}

export function usePoolMarket(): MarketState<PoolMarket> {
  const { chainId } = useNetwork()
  const server = useQuery({
    queryKey: ["vote-market", "pools", chainId],
    queryFn: ({ signal }) =>
      fetchMarket("pools", chainId, poolMarketSchema, signal),
    ...QUERY_PROFILES.SHORT_CACHE,
    retry: 1,
  })
  const chain = usePoolChainMarket(server.isError)
  return {
    market: server.data ?? chain.market,
    isLoading: server.isPending || (server.isError && chain.isLoading),
    source: server.data ? "server" : "chain",
    unavailable: server.isError && !chain.isLoading && !chain.market,
    retry: () => void server.refetch(),
  }
}

function useValidatorChainMarket(enabled: boolean): {
  market: ValidatorMarket | undefined
  isLoading: boolean
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

  const market = useMemo(() => {
    if (!enabled || !head.data || epochStart === undefined) return undefined
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
    isLoading:
      enabled &&
      (head.isLoading ||
        gaugeRead.isLoading ||
        states.isLoading ||
        rewards.isLoading),
  }
}

function usePoolChainMarket(enabled: boolean): {
  market: PoolMarket | undefined
  isLoading: boolean
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

  const market = useMemo(() => {
    if (!enabled || !head.data || epochStart === undefined) return undefined
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
    isLoading:
      enabled &&
      (head.isLoading ||
        poolRead.isLoading ||
        gaugeRead.isLoading ||
        states.isLoading ||
        rewards.isLoading),
  }
}
