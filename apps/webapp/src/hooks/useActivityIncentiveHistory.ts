import { useNetwork } from "@/contexts/NetworkContext"
import { usePools } from "@/hooks/usePools"
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

export type IncentiveHistoryTarget = {
  domain: IncentiveHistoryDomain
  gaugeAddress?: Address
  totalUsd: number
  eventCount: number
  unpricedEvents: number
  tokens: IncentiveHistoryToken[]
}

export type IncentiveHistoryEpoch = {
  epochStart: number
  epochEnd: number
  label: string
  vebtcUsd: number
  poolsUsd: number
  totalUsd: number
  vebtcEvents: number
  poolsEvents: number
  totalEvents: number
  unpricedEvents: number
  tokens: IncentiveHistoryToken[]
  targets: IncentiveHistoryTarget[]
}

const WEEK_SECONDS = 7 * 24 * 60 * 60
const HISTORY_START_EPOCH = Math.floor(Date.UTC(2026, 3, 2) / 1000)
const INCENTIVE_ACTION_TYPES = ["INCENTIVE_ADDED"] as const

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

function createEpoch(epochStart: number, label: string): IncentiveHistoryEpoch {
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
    targets: [],
  }
}

function tokenSortValue(token: IncentiveHistoryToken): number {
  return token.usdValue ?? 0
}

function targetSortValue(target: IncentiveHistoryTarget): number {
  return target.totalUsd
}

export function useActivityIncentiveHistory(): {
  epochs: IncentiveHistoryEpoch[]
  historyStartEpoch: number
  currentEpochStart: number
  isLoading: boolean
  isError: boolean
  error: unknown
  isFetching: boolean
} {
  const { chainId, isNetworkReady } = useNetwork()
  const network = NETWORK_BY_CHAIN[chainId]
  const { tokens: knownTokens, isLoading: isLoadingTokenList } = useTokenList()
  const { isLoading: isLoadingPools } = usePools()

  const currentEpochStart = useMemo(
    () => epochStartFor(Math.floor(Date.now() / 1000)),
    [],
  )
  const historyStartEpoch = Math.min(HISTORY_START_EPOCH, currentEpochStart)
  const toTimestamp = currentEpochStart + WEEK_SECONDS - 1

  const query = useQuery({
    queryKey: [
      "activity-incentive-history",
      network,
      historyStartEpoch,
      currentEpochStart,
    ],
    enabled: isNetworkReady && !!network,
    queryFn: async () => {
      if (!network) throw new Error("Unsupported network")
      const items: MezoActivityItem[] = []
      for (let page = 0; page < 10; page += 1) {
        const params = new URLSearchParams({
          network,
          from: String(historyStartEpoch),
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
    const orderedEpochs: IncentiveHistoryEpoch[] = []
    const byEpoch = new Map<number, IncentiveHistoryEpoch>()
    for (
      let epochStart = historyStartEpoch;
      epochStart <= currentEpochStart;
      epochStart += WEEK_SECONDS
    ) {
      const epoch = createEpoch(
        epochStart,
        epochStart === currentEpochStart ? "Current epoch" : "Past epoch",
      )
      orderedEpochs.push(epoch)
      byEpoch.set(epochStart, epoch)
    }
    const tokenTotals = new Map<string, IncentiveHistoryToken>()
    const targetTotals = new Map<string, IncentiveHistoryTarget>()
    const targetTokenTotals = new Map<string, IncentiveHistoryToken>()

    for (const item of query.data ?? []) {
      if (item.actionType !== "incentiveAdded") continue
      const domain = domainForItem(item)
      if (!domain) continue

      const epochStart = epochStartFor(item.timestamp)
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

      const targetAddress = item.gaugeAddress

      const targetKey = `${epochStart}:${domain}:${
        targetAddress?.toLowerCase() ?? "unknown"
      }`
      const target = targetTotals.get(targetKey)
      if (target) {
        target.eventCount += 1
        if (usdValue === null) target.unpricedEvents += 1
        else target.totalUsd += usdValue
      } else {
        targetTotals.set(targetKey, {
          domain,
          ...(targetAddress ? { gaugeAddress: targetAddress } : {}),
          totalUsd: usdValue ?? 0,
          eventCount: 1,
          unpricedEvents: usdValue === null ? 1 : 0,
          tokens: [],
        })
      }

      const targetTokenKey = `${targetKey}:${
        tokenAddress?.toLowerCase() ?? "unknown"
      }`
      const existingTargetToken = targetTokenTotals.get(targetTokenKey)
      if (existingTargetToken) {
        existingTargetToken.amount += amount
        existingTargetToken.eventCount += 1
        existingTargetToken.usdValue =
          existingTargetToken.usdValue === null || usdValue === null
            ? existingTargetToken.usdValue
            : existingTargetToken.usdValue + usdValue
      } else {
        targetTokenTotals.set(targetTokenKey, {
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
    for (const [key, token] of targetTokenTotals) {
      const targetKey = key.split(":").slice(0, 3).join(":")
      targetTotals.get(targetKey)?.tokens.push(token)
    }
    for (const [key, target] of targetTotals) {
      const epochStart = Number(key.split(":")[0])
      target.tokens.sort((a, b) => tokenSortValue(b) - tokenSortValue(a))
      byEpoch.get(epochStart)?.targets.push(target)
    }
    for (const epoch of byEpoch.values()) {
      epoch.tokens.sort((a, b) => tokenSortValue(b) - tokenSortValue(a))
      epoch.targets.sort((a, b) => targetSortValue(b) - targetSortValue(a))
    }

    return orderedEpochs
  }, [query.data, tokenMeta, prices, historyStartEpoch, currentEpochStart])

  return {
    epochs,
    historyStartEpoch,
    currentEpochStart,
    isLoading:
      query.isLoading ||
      isLoadingTokenList ||
      isLoadingUnknownMeta ||
      isLoadingPrices ||
      isLoadingPools,
    isError: query.isError,
    error: query.error,
    isFetching: query.isFetching,
  }
}
