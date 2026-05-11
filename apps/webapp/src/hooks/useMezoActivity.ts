import { useNetwork } from "@/contexts/NetworkContext"
import { deserializeActivityItem } from "@/lib/mezoActivity/normalize"
import type {
  MezoActivityApiResponse,
  MezoActivityFilter,
  MezoActivityItem,
} from "@/types/mezoActivity"
import { CHAIN_ID } from "@repo/shared/contracts"
import { useInfiniteQuery } from "@tanstack/react-query"
import { useMemo } from "react"

type UseMezoActivityParams = {
  filters: MezoActivityFilter[]
  fromTimestamp?: number
  toTimestamp?: number
  limit?: number
}

const NETWORK_BY_CHAIN: Record<number, "mainnet" | "testnet"> = {
  [CHAIN_ID.mainnet]: "mainnet",
  [CHAIN_ID.testnet]: "testnet",
}

const LOCK_ACTIONS: MezoActivityItem["actionType"][] = [
  "lockCreated",
  "lockAmountIncreased",
  "lockWithdrawn",
  "lockPermanent",
  "lockPermanentUnlocked",
]

const INCENTIVE_ACTIONS: MezoActivityItem["actionType"][] = [
  "incentiveAdded",
  "rewardDistributed",
  "rewardNotified",
  "rebaseClaimed",
  "merkleClaimed",
  "savingsDeposit",
  "savingsWithdraw",
  "savingsYieldClaimed",
]

function filterItems(
  items: MezoActivityItem[],
  filters: MezoActivityFilter[],
): MezoActivityItem[] {
  const selected = new Set(filters)
  return items.filter((item) => {
    if (LOCK_ACTIONS.includes(item.actionType)) return selected.has("locks")
    if (item.actionType === "lockExtended") return selected.has("extensions")
    if (INCENTIVE_ACTIONS.includes(item.actionType)) {
      return selected.has("incentives")
    }
    if (item.boostContext === "matchboxGaugeBoost") {
      return selected.has("boostMatchbox")
    }
    if (item.boostContext === "mezoVeBtcPairBoost") {
      return selected.has("boostPair")
    }
    return selected.has("boostMatchbox") || selected.has("boostPair")
  })
}

type ActivityPage = {
  data: MezoActivityItem[]
  nextCursor: { id: string; timestamp: number; logIndex: number } | null
  meta?: MezoActivityApiResponse["meta"]
}

export function useMezoActivity({
  filters,
  fromTimestamp,
  toTimestamp,
  limit = 50,
}: UseMezoActivityParams) {
  const { chainId, isNetworkReady } = useNetwork()
  const network = NETWORK_BY_CHAIN[chainId]

  const query = useInfiniteQuery<ActivityPage, Error>({
    queryKey: ["activity", network, fromTimestamp, toTimestamp, limit],
    enabled: isNetworkReady && !!network,
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) =>
      lastPage.nextCursor ? JSON.stringify(lastPage.nextCursor) : undefined,
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams()
      if (network) params.set("network", network)
      params.set("limit", String(limit))
      if (fromTimestamp !== undefined) params.set("from", String(fromTimestamp))
      if (toTimestamp !== undefined) params.set("to", String(toTimestamp))
      if (typeof pageParam === "string" && pageParam) {
        params.set("cursor", pageParam)
      }
      const response = await fetch(`/api/activity?${params.toString()}`, {
        cache: "no-store",
      })
      if (!response.ok) {
        throw new Error(`Failed to fetch activity: ${response.status}`)
      }
      const json = (await response.json()) as MezoActivityApiResponse
      if (!json.success) throw new Error("Activity API reported failure")
      return {
        data: json.data.map(deserializeActivityItem),
        nextCursor: json.nextCursor,
        meta: json.meta,
      }
    },
    staleTime: 15_000,
    refetchOnWindowFocus: false,
  })

  const flatItems = useMemo(
    () => query.data?.pages.flatMap((page) => page.data) ?? [],
    [query.data],
  )

  const filteredData = useMemo(
    () => filterItems(flatItems, filters),
    [flatItems, filters],
  )

  return {
    ...query,
    data: filteredData,
    rawData: flatItems,
    meta: query.data?.pages[0]?.meta,
  }
}
