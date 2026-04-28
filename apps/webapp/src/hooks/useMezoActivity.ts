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
  filter: MezoActivityFilter
  cursor?: string
  limit?: number
}

const NETWORK_BY_CHAIN: Record<number, "mainnet" | "testnet"> = {
  [CHAIN_ID.mainnet]: "mainnet",
  [CHAIN_ID.testnet]: "testnet",
}

function filterItems(
  items: MezoActivityItem[],
  filter: MezoActivityFilter,
): MezoActivityItem[] {
  switch (filter) {
    case "locks":
      return items.filter((item) => item.actionType === "lockCreated")
    case "extensions":
      return items.filter((item) => item.actionType === "lockExtended")
    case "boostMatchbox":
      return items.filter((item) => item.boostContext === "matchboxGaugeBoost")
    case "boostPair":
      return items.filter((item) => item.boostContext === "mezoVeBtcPairBoost")
    case "all":
    default:
      return items
  }
}

export function useMezoActivity({
  filter,
  cursor,
  limit = 50,
}: UseMezoActivityParams) {
  const { chainId, isNetworkReady } = useNetwork()
  const network = NETWORK_BY_CHAIN[chainId]

  const query = useQuery({
    queryKey: ["activity", network, cursor, limit],
    enabled: isNetworkReady && !!network,
    queryFn: async () => {
      const params = new URLSearchParams()
      if (network) params.set("network", network)
      params.set("limit", String(limit))
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
    return filterItems(query.data?.data ?? [], filter)
  }, [query.data, filter])

  return {
    ...query,
    data: filteredData,
    nextCursor: query.data?.nextCursor ?? null,
  }
}
