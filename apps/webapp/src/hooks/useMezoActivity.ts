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
  cursor?: string
  limit?: number
}

const NETWORK_BY_CHAIN: Record<number, "mainnet" | "testnet"> = {
  [CHAIN_ID.mainnet]: "mainnet",
  [CHAIN_ID.testnet]: "testnet",
}

function filterItems(
  items: MezoActivityItem[],
  filters: MezoActivityFilter[],
): MezoActivityItem[] {
  const selected = new Set(filters)
  const lockActions: MezoActivityItem["actionType"][] = [
    "lockCreated",
    "lockAmountIncreased",
    "lockWithdrawn",
    "lockPermanent",
    "lockPermanentUnlocked",
  ]
  return items.filter((item) => {
    if (lockActions.includes(item.actionType)) return selected.has("locks")
    if (item.actionType === "lockExtended") return selected.has("extensions")
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
  cursor,
  limit = 50,
}: UseMezoActivityParams) {
  const { chainId, isNetworkReady } = useNetwork()
  const network = NETWORK_BY_CHAIN[chainId]

  const query = useQuery({
    queryKey: ["activity", network, fromTimestamp, toTimestamp, cursor, limit],
    enabled: isNetworkReady && !!network,
    queryFn: async () => {
      const params = new URLSearchParams()
      if (network) params.set("network", network)
      params.set("limit", String(limit))
      if (fromTimestamp !== undefined) params.set("from", String(fromTimestamp))
      if (toTimestamp !== undefined) params.set("to", String(toTimestamp))
      if (cursor) params.set("cursor", cursor)
      const response = await fetch(`/api/activity?${params.toString()}`, {
        cache: "no-store",
      })
      if (!response.ok) {
        throw new Error(`Failed to fetch activity: ${response.status}`)
      }
      const json = (await response.json()) as MezoActivityApiResponse
      if (!json.success) throw new Error("Activity API reported failure")
      return {
        ...json,
        data: json.data.map(deserializeActivityItem),
      }
    },
    staleTime: 15_000,
    refetchOnWindowFocus: false,
  })

  const filteredData = useMemo(() => {
    return filterItems(query.data?.data ?? [], filters)
  }, [query.data, filters])

  return {
    ...query,
    data: filteredData,
    nextCursor: query.data?.nextCursor ?? null,
    meta: query.data?.meta,
  }
}
