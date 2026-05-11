import { useNetwork } from "@/contexts/NetworkContext"
import { deserializeActivityItem } from "@/lib/mezoActivity/normalize"
import type {
  MezoActivityApiResponse,
  MezoActivityFilter,
  MezoActivityItem,
} from "@/types/mezoActivity"
import { CHAIN_ID } from "@repo/shared/contracts"
import { useQuery } from "@tanstack/react-query"
import { useMemo } from "react"

type UseMezoActivityParams = {
  filters: MezoActivityFilter[]
  fromTimestamp?: number
  toTimestamp?: number
  page?: number
  limit?: number
  actionTypes?: readonly string[]
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

export function useMezoActivity({
  filters,
  fromTimestamp,
  toTimestamp,
  page = 0,
  limit = 50,
  actionTypes,
}: UseMezoActivityParams) {
  const { chainId, isNetworkReady } = useNetwork()
  const network = NETWORK_BY_CHAIN[chainId]
  const actionTypesKey = actionTypes ? [...actionTypes].sort().join(",") : ""

  const query = useQuery({
    queryKey: [
      "activity",
      network,
      fromTimestamp,
      toTimestamp,
      limit,
      page,
      actionTypesKey,
    ],
    enabled: isNetworkReady && !!network,
    // Don't use keepPreviousData here: when the user pages forward and back,
    // stale page data would briefly flash in for the new page and (worse) the
    // visible rows would not reliably update to the new page's contents. Clear
    // the table on page change and show a loading state instead.
    queryFn: async () => {
      const params = new URLSearchParams()
      if (network) params.set("network", network)
      params.set("limit", String(limit))
      params.set("page", String(page))
      if (fromTimestamp !== undefined) params.set("from", String(fromTimestamp))
      if (toTimestamp !== undefined) params.set("to", String(toTimestamp))
      if (actionTypes && actionTypes.length > 0) {
        params.set("actionTypes", actionTypes.join(","))
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
        hasMore: json.hasMore,
        page: json.page,
        meta: json.meta,
      }
    },
    // Re-fetch on every page change. Caching across pages was the original
    // source of the "stuck on page 2" report: a cached entry for a queryKey
    // (or stale placeholderData) would render before the new page's data and
    // the user could not tell the page had changed. With gcTime:0 the cache
    // entry is evicted as soon as no observer is mounted, so navigating back
    // to a previous page guarantees a fresh fetch and a visible loading
    // state.
    gcTime: 0,
    staleTime: 0,
    refetchOnWindowFocus: false,
  })

  const items = query.data?.data ?? []
  const filteredData = useMemo(
    () => filterItems(items, filters),
    [items, filters],
  )

  return {
    ...query,
    data: filteredData,
    rawData: items,
    hasMore: query.data?.hasMore ?? false,
    page: query.data?.page ?? page,
    meta: query.data?.meta,
  }
}
