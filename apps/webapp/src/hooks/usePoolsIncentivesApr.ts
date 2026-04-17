import { getContractConfig } from "@/config/contracts"
import { QUERY_PROFILES } from "@/config/queryProfiles"
import { useNetwork } from "@/contexts/NetworkContext"
import { useBtcPrice } from "@/hooks/useBtcPrice"
import { useMezoPrice } from "@/hooks/useMezoPrice"
import { type Pool, poolTvlUsd } from "@/hooks/usePools"
import { useTokenList } from "@/hooks/useTokenList"
import { getTokenUsdPrice } from "@repo/shared"
import { useMemo } from "react"
import type { Address } from "viem"
import { erc20Abi, formatUnits, zeroAddress } from "viem"
import { useReadContracts } from "wagmi"

const EPOCHS_PER_YEAR = 52
const WEEK_SECONDS = 7 * 24 * 60 * 60

function currentEpochStart(nowSec: number): number {
  return Math.floor(nowSec / WEEK_SECONDS) * WEEK_SECONDS
}

export type PoolIncentiveToken = {
  tokenAddress: Address
  symbol: string
  decimals: number
  amount: bigint
  usdValue: number
}

export type PoolIncentivesData = {
  poolAddress: Address
  bribeAddress: Address | undefined
  /** Current-epoch bribes (from bribe.left(token)). */
  incentivesByToken: PoolIncentiveToken[]
  totalIncentivesUSD: number
  /** Next-epoch bribes (from tokenRewardsPerEpoch(token, nextEpochStart)). */
  nextEpochIncentivesByToken: PoolIncentiveToken[]
  totalNextEpochIncentivesUSD: number
  incentivesAprPercent: number | null
}

export function usePoolsIncentivesApr(pools: Pool[]): {
  map: Map<string, PoolIncentivesData>
  isLoading: boolean
} {
  const { chainId, isNetworkReady } = useNetwork()
  const contracts = getContractConfig(chainId)
  const { tokens: knownTokens } = useTokenList()
  const { price: btcPrice } = useBtcPrice()
  const { price: mezoPrice } = useMezoPrice()

  const gaugedPools = useMemo(
    () =>
      pools
        .map((p) => ({ pool: p, gauge: p.gauge }))
        .filter((x): x is { pool: Pool; gauge: Address } => !!x.gauge),
    [pools],
  )

  // Round 1: gaugeToBribe(gauge) for each gauged pool.
  const { data: bribeAddrsData, isLoading: isLoadingBribes } = useReadContracts(
    {
      contracts: gaugedPools.map(({ gauge }) => ({
        ...contracts.poolsVoter,
        functionName: "gaugeToBribe" as const,
        args: [gauge],
      })),
      query: {
        ...QUERY_PROFILES.SHORT_CACHE,
        enabled: isNetworkReady && gaugedPools.length > 0,
      },
    },
  )

  type BribeEntry = { pool: Pool; bribe: Address | undefined }
  const bribes = useMemo<BribeEntry[]>(
    () =>
      gaugedPools.map(({ pool }, i) => {
        const addr = bribeAddrsData?.[i]?.result as Address | undefined
        return {
          pool,
          bribe: addr && addr !== zeroAddress ? addr : undefined,
        }
      }),
    [gaugedPools, bribeAddrsData],
  )

  // Round 2: rewardsListLength for each bribe.
  const activeBribes = useMemo(
    () =>
      bribes.filter(
        (b): b is { pool: Pool; bribe: Address } => b.bribe !== undefined,
      ),
    [bribes],
  )

  const { data: lengthsData, isLoading: isLoadingLengths } = useReadContracts({
    contracts: activeBribes.map(({ bribe }) => ({
      address: bribe,
      abi: contracts.bribe.abi,
      chainId,
      functionName: "rewardsListLength" as const,
    })),
    query: {
      ...QUERY_PROFILES.SHORT_CACHE,
      enabled: isNetworkReady && activeBribes.length > 0,
    },
  })

  // Round 3: rewards(i) for each (bribe, index).
  type BribeTokenSlot = { bribe: Address; index: number; pool: Pool }
  const tokenSlots = useMemo<BribeTokenSlot[]>(() => {
    const slots: BribeTokenSlot[] = []
    activeBribes.forEach(({ bribe, pool }, i) => {
      const len = Number((lengthsData?.[i]?.result as bigint | undefined) ?? 0n)
      for (let j = 0; j < len; j++) {
        slots.push({ bribe, index: j, pool })
      }
    })
    return slots
  }, [activeBribes, lengthsData])

  const { data: rewardsData, isLoading: isLoadingRewards } = useReadContracts({
    contracts: tokenSlots.map(({ bribe, index }) => ({
      address: bribe,
      abi: contracts.bribe.abi,
      chainId,
      functionName: "rewards" as const,
      args: [BigInt(index)],
    })),
    query: {
      ...QUERY_PROFILES.SHORT_CACHE,
      enabled: isNetworkReady && tokenSlots.length > 0,
    },
  })

  const resolvedSlots = useMemo(
    () =>
      tokenSlots
        .map((slot, i) => {
          const token = rewardsData?.[i]?.result as Address | undefined
          if (!token || token === zeroAddress) return null
          return { ...slot, token }
        })
        .filter((s): s is BribeTokenSlot & { token: Address } => s !== null),
    [tokenSlots, rewardsData],
  )

  // Round 4: left(token) for each (bribe, token).
  const { data: leftData, isLoading: isLoadingLeft } = useReadContracts({
    contracts: resolvedSlots.map(({ bribe, token }) => ({
      address: bribe,
      abi: contracts.bribe.abi,
      chainId,
      functionName: "left" as const,
      args: [token],
    })),
    query: {
      ...QUERY_PROFILES.SHORT_CACHE,
      enabled: isNetworkReady && resolvedSlots.length > 0,
    },
  })

  // Round 4b: tokenRewardsPerEpoch(token, nextEpochStart) for each (bribe, token).
  const nextEpochStart = useMemo(
    () => currentEpochStart(Math.floor(Date.now() / 1000)) + WEEK_SECONDS,
    [],
  )
  const { data: nextEpochData, isLoading: isLoadingNext } = useReadContracts({
    contracts: resolvedSlots.map(({ bribe, token }) => ({
      address: bribe,
      abi: contracts.bribe.abi,
      chainId,
      functionName: "tokenRewardsPerEpoch" as const,
      args: [token, BigInt(nextEpochStart)],
    })),
    query: {
      ...QUERY_PROFILES.SHORT_CACHE,
      enabled: isNetworkReady && resolvedSlots.length > 0,
    },
  })

  // Resolve unknown token metadata.
  const unknownTokens = useMemo(() => {
    const set = new Set<Address>()
    for (const { token } of resolvedSlots) {
      const lower = token.toLowerCase()
      const known = knownTokens.some((t) => t.address.toLowerCase() === lower)
      if (!known) set.add(token)
    }
    return Array.from(set)
  }, [resolvedSlots, knownTokens])

  const { data: metaData } = useReadContracts({
    contracts: unknownTokens.flatMap((addr) => [
      {
        address: addr,
        abi: erc20Abi,
        chainId,
        functionName: "symbol" as const,
      },
      {
        address: addr,
        abi: erc20Abi,
        chainId,
        functionName: "decimals" as const,
      },
    ]),
    query: {
      ...QUERY_PROFILES.SHORT_CACHE,
      enabled: isNetworkReady && unknownTokens.length > 0,
    },
  })

  const map = useMemo(() => {
    const m = new Map<string, PoolIncentivesData>()

    // Seed every pool (including ungauged) with an empty entry.
    for (const pool of pools) {
      m.set(pool.address.toLowerCase(), {
        poolAddress: pool.address,
        bribeAddress: undefined,
        incentivesByToken: [],
        totalIncentivesUSD: 0,
        nextEpochIncentivesByToken: [],
        totalNextEpochIncentivesUSD: 0,
        incentivesAprPercent: null,
      })
    }
    for (const { pool, bribe } of bribes) {
      if (!bribe) continue
      const entry = m.get(pool.address.toLowerCase())
      if (entry) entry.bribeAddress = bribe
    }

    // Aggregate current + next epoch token amounts by pool.
    resolvedSlots.forEach((slot, i) => {
      const amount = (leftData?.[i]?.result as bigint | undefined) ?? 0n
      const nextAmount =
        (nextEpochData?.[i]?.result as bigint | undefined) ?? 0n
      if (amount <= 0n && nextAmount <= 0n) return

      const lower = slot.token.toLowerCase()
      const known = knownTokens.find((t) => t.address.toLowerCase() === lower)

      let symbol = known?.symbol
      let decimals = known?.decimals
      if (!known) {
        const unknownIdx = unknownTokens.findIndex(
          (t) => t.toLowerCase() === lower,
        )
        symbol =
          (metaData?.[unknownIdx * 2]?.result as string | undefined) ??
          `${slot.token.slice(0, 6)}…`
        decimals =
          (metaData?.[unknownIdx * 2 + 1]?.result as number | undefined) ?? 18
      }

      const d = decimals ?? 18
      const price = getTokenUsdPrice(slot.token, symbol, btcPrice, mezoPrice)
      const entry = m.get(slot.pool.address.toLowerCase())
      if (!entry) return

      if (amount > 0n) {
        const tokenAmount = Number(formatUnits(amount, d))
        const usdValue = price !== null ? tokenAmount * price : 0
        entry.incentivesByToken.push({
          tokenAddress: slot.token,
          symbol: symbol ?? "?",
          decimals: d,
          amount,
          usdValue,
        })
        entry.totalIncentivesUSD += usdValue
      }
      if (nextAmount > 0n) {
        const tokenAmount = Number(formatUnits(nextAmount, d))
        const usdValue = price !== null ? tokenAmount * price : 0
        entry.nextEpochIncentivesByToken.push({
          tokenAddress: slot.token,
          symbol: symbol ?? "?",
          decimals: d,
          amount: nextAmount,
          usdValue,
        })
        entry.totalNextEpochIncentivesUSD += usdValue
      }
    })

    // Compute APR: (weekly USD * 52) / poolTVLUSD * 100.
    for (const pool of pools) {
      const entry = m.get(pool.address.toLowerCase())
      if (!entry) continue
      const tvl = poolTvlUsd(pool)
      if (entry.totalIncentivesUSD <= 0 || tvl <= 0) {
        entry.incentivesAprPercent = null
      } else {
        entry.incentivesAprPercent =
          ((entry.totalIncentivesUSD * EPOCHS_PER_YEAR) / tvl) * 100
      }
    }

    return m
  }, [
    pools,
    bribes,
    resolvedSlots,
    leftData,
    nextEpochData,
    knownTokens,
    unknownTokens,
    metaData,
    btcPrice,
    mezoPrice,
  ])

  return {
    map,
    isLoading:
      isLoadingBribes ||
      isLoadingLengths ||
      isLoadingRewards ||
      isLoadingLeft ||
      isLoadingNext,
  }
}

export function computePoolIncentivesApr(
  totalIncentivesUSD: number,
  tvlUsd: number,
): number | null {
  if (totalIncentivesUSD <= 0 || tvlUsd <= 0) return null
  return ((totalIncentivesUSD * EPOCHS_PER_YEAR) / tvlUsd) * 100
}
