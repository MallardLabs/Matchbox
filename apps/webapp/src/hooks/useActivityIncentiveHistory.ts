import { useNetwork } from "@/contexts/NetworkContext"
import { useTokenList } from "@/hooks/useTokenList"
import { useTokenPrices } from "@/hooks/useTokenPrices"
import { deserializeActivityItem } from "@/lib/mezoActivity/normalize"
import type {
  MezoActivityApiResponse,
  MezoActivityItem,
} from "@/types/mezoActivity"
import { CHAIN_ID } from "@repo/shared/contracts"
import { useQuery } from "@tanstack/react-query"
import { useMemo } from "react"
import type { Address } from "viem"
import { erc20Abi, formatUnits } from "viem"
import { useReadContracts } from "wagmi"

export type IncentiveHistoryDomain = "vebtc" | "pools"
export type IncentiveHistoryScope = "both" | IncentiveHistoryDomain

export type IncentiveHistoryToken = {
  domain: IncentiveHistoryDomain
  tokenAddress?: Address
  symbol: string
  amount: bigint
  decimals: number
  usdValue: number | null
  eventCount: number
}

export type IncentiveHistoryEpoch = {
  epochStart: number
  epochEnd: number
  label: "Previous epoch" | "This epoch"
  vebtcUsd: number
  poolsUsd: number
  totalUsd: number
  vebtcEvents: number
  poolsEvents: number
  totalEvents: number
  unpricedEvents: number
  tokens: IncentiveHistoryToken[]
}

const WEEK_SECONDS = 7 * 24 * 60 * 60
const INCENTIVE_ACTION_TYPES = ["INCENTIVE_ADDED", "REWARD_NOTIFIED"] as const

const NETWORK_BY_CHAIN: Record<number, "mainnet" | "testnet"> = {
  [CHAIN_ID.mainnet]: "mainnet",
  [CHAIN_ID.testnet]: "testnet",
}

function epochStartFor(timestamp: number): number {
  return Math.floor(timestamp / WEEK_SECONDS) * WEEK_SECONDS
}

function domainForItem(
  item: MezoActivityItem,
): IncentiveHistoryDomain | undefined {
  if (item.boostContext === "mezoVeBtcPairBoost") return "vebtc"
  if (item.boostContext === "matchboxGaugeBoost") return "pools"
  if (item.contract === "boostVoter") return "vebtc"
  if (item.contract === "poolsVoter") return "pools"
  return undefined
}

function createEpoch(
  epochStart: number,
  label: IncentiveHistoryEpoch["label"],
): IncentiveHistoryEpoch {
  return {
    epochStart,
    epochEnd: epochStart + WEEK_SECONDS,
    label,
    vebtcUsd: 0,
    poolsUsd: 0,
    totalUsd: 0,
    vebtcEvents: 0,
    poolsEvents: 0,
    totalEvents: 0,
    unpricedEvents: 0,
    tokens: [],
  }
}

function tokenSortValue(token: IncentiveHistoryToken): number {
  return token.usdValue ?? 0
}

export function useActivityIncentiveHistory(): {
  epochs: IncentiveHistoryEpoch[]
  previousEpochStart: number
  currentEpochStart: number
  isLoading: boolean
  isError: boolean
  error: unknown
  isFetching: boolean
} {
  const { chainId, isNetworkReady } = useNetwork()
  const network = NETWORK_BY_CHAIN[chainId]
  const { tokens: knownTokens, isLoading: isLoadingTokenList } = useTokenList()

  const currentEpochStart = useMemo(
    () => epochStartFor(Math.floor(Date.now() / 1000)),
    [],
  )
  const previousEpochStart = currentEpochStart - WEEK_SECONDS
  const toTimestamp = currentEpochStart + WEEK_SECONDS - 1

  const query = useQuery({
    queryKey: [
      "activity-incentive-history",
      network,
      previousEpochStart,
      currentEpochStart,
    ],
    enabled: isNetworkReady && !!network,
    queryFn: async () => {
      if (!network) throw new Error("Unsupported network")
      const items: MezoActivityItem[] = []
      for (let page = 0; page < 10; page += 1) {
        const params = new URLSearchParams({
          network,
          from: String(previousEpochStart),
          to: String(toTimestamp),
          limit: "1000",
          page: String(page),
          order: "asc",
          actionTypes: INCENTIVE_ACTION_TYPES.join(","),
        })
        const response = await fetch(`/api/activity?${params.toString()}`, {
          cache: "no-store",
        })
        if (!response.ok) {
          throw new Error(
            `Failed to fetch incentive history: ${response.status}`,
          )
        }
        const json = (await response.json()) as MezoActivityApiResponse
        if (!json.success) throw new Error("Activity API reported failure")
        items.push(...json.data.map(deserializeActivityItem))
        if (!json.hasMore) break
      }
      return items
    },
    staleTime: 30_000,
    gcTime: 60_000,
    refetchOnWindowFocus: false,
  })

  const tokenAddresses = useMemo(() => {
    const seen = new Set<string>()
    const addresses: Address[] = []
    for (const item of query.data ?? []) {
      if (!item.tokenAddress) continue
      const key = item.tokenAddress.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      addresses.push(item.tokenAddress)
    }
    return addresses
  }, [query.data])

  const unknownTokenAddresses = useMemo(() => {
    return tokenAddresses.filter((address) => {
      const key = address.toLowerCase()
      return !knownTokens.some((token) => token.address.toLowerCase() === key)
    })
  }, [tokenAddresses, knownTokens])

  const { data: unknownTokenMeta, isLoading: isLoadingUnknownMeta } =
    useReadContracts({
      contracts: unknownTokenAddresses.flatMap((address) => [
        {
          address,
          abi: erc20Abi,
          chainId,
          functionName: "symbol" as const,
        },
        {
          address,
          abi: erc20Abi,
          chainId,
          functionName: "decimals" as const,
        },
      ]),
      query: {
        enabled: isNetworkReady && unknownTokenAddresses.length > 0,
      },
    })

  const tokenMeta = useMemo(() => {
    const meta = new Map<
      string,
      { address: Address; symbol: string; decimals: number }
    >()
    for (const token of knownTokens) {
      meta.set(token.address.toLowerCase(), {
        address: token.address,
        symbol: token.symbol,
        decimals: token.decimals,
      })
    }
    unknownTokenAddresses.forEach((address, index) => {
      const symbol =
        (unknownTokenMeta?.[index * 2]?.result as string | undefined) ??
        `${address.slice(0, 6)}...`
      const decimals =
        (unknownTokenMeta?.[index * 2 + 1]?.result as number | undefined) ?? 18
      meta.set(address.toLowerCase(), { address, symbol, decimals })
    })
    return meta
  }, [knownTokens, unknownTokenAddresses, unknownTokenMeta])

  const priceInputs = useMemo(
    () =>
      Array.from(tokenMeta.values()).map((token) => ({
        address: token.address,
        symbol: token.symbol,
      })),
    [tokenMeta],
  )
  const { prices, isLoading: isLoadingPrices } = useTokenPrices(priceInputs)

  const epochs = useMemo(() => {
    const previous = createEpoch(previousEpochStart, "Previous epoch")
    const current = createEpoch(currentEpochStart, "This epoch")
    const byEpoch = new Map<number, IncentiveHistoryEpoch>([
      [previousEpochStart, previous],
      [currentEpochStart, current],
    ])
    const tokenTotals = new Map<string, IncentiveHistoryToken>()

    for (const item of query.data ?? []) {
      if (
        item.actionType !== "incentiveAdded" &&
        item.actionType !== "rewardNotified"
      ) {
        continue
      }
      const domain = domainForItem(item)
      if (!domain) continue

      const epochStart =
        item.timestamp >= currentEpochStart
          ? currentEpochStart
          : previousEpochStart
      const epoch = byEpoch.get(epochStart)
      if (!epoch) continue

      epoch.totalEvents += 1
      if (domain === "vebtc") epoch.vebtcEvents += 1
      else epoch.poolsEvents += 1

      const amount = item.amount ?? 0n
      const tokenAddress = item.tokenAddress
      const token = tokenAddress
        ? tokenMeta.get(tokenAddress.toLowerCase())
        : undefined
      const price = tokenAddress
        ? (prices.get(tokenAddress.toLowerCase()) ?? null)
        : null
      const usdValue =
        token && price !== null && amount > 0n
          ? Number(formatUnits(amount, token.decimals)) * price
          : null

      if (usdValue === null) {
        epoch.unpricedEvents += 1
      } else if (domain === "vebtc") {
        epoch.vebtcUsd += usdValue
        epoch.totalUsd += usdValue
      } else {
        epoch.poolsUsd += usdValue
        epoch.totalUsd += usdValue
      }

      const tokenKey = `${epochStart}:${domain}:${
        tokenAddress?.toLowerCase() ?? "unknown"
      }`
      const existing = tokenTotals.get(tokenKey)
      if (existing) {
        existing.amount += amount
        existing.eventCount += 1
        existing.usdValue =
          existing.usdValue === null || usdValue === null
            ? existing.usdValue
            : existing.usdValue + usdValue
      } else {
        tokenTotals.set(tokenKey, {
          domain,
          ...(tokenAddress ? { tokenAddress } : {}),
          symbol: token?.symbol ?? "Unknown",
          amount,
          decimals: token?.decimals ?? 18,
          usdValue,
          eventCount: 1,
        })
      }
    }

    for (const [key, token] of tokenTotals) {
      const epochStart = Number(key.split(":")[0])
      byEpoch.get(epochStart)?.tokens.push(token)
    }
    for (const epoch of byEpoch.values()) {
      epoch.tokens.sort((a, b) => tokenSortValue(b) - tokenSortValue(a))
    }

    return [previous, current]
  }, [query.data, tokenMeta, prices, previousEpochStart, currentEpochStart])

  return {
    epochs,
    previousEpochStart,
    currentEpochStart,
    isLoading:
      query.isLoading ||
      isLoadingTokenList ||
      isLoadingUnknownMeta ||
      isLoadingPrices,
    isError: query.isError,
    error: query.error,
    isFetching: query.isFetching,
  }
}
