import { QUERY_PROFILES } from "@/config/queryProfiles"
import { useNetwork } from "@/contexts/NetworkContext"
import {
  type MezoGaugesHistory,
  mezoGaugesHistorySchema,
} from "@/lib/mezoGauges/schema"
import { CHAIN_ID } from "@repo/shared/contracts"
import { useQuery } from "@tanstack/react-query"

async function fetchHistory(): Promise<MezoGaugesHistory> {
  const response = await fetch("/api/mezo-gauges/history", {
    cache: "no-store",
  })
  if (!response.ok) {
    throw new Error(`Unable to load history (${response.status})`)
  }
  return mezoGaugesHistorySchema.parse(await response.json())
}

export function useMezoGaugesHistory() {
  const { chainId, isNetworkReady } = useNetwork()
  const query = useQuery({
    queryKey: ["mezo-gauges-history"],
    queryFn: fetchHistory,
    enabled: isNetworkReady && chainId === CHAIN_ID.mainnet,
    ...QUERY_PROFILES.LONG_CACHE,
  })
  return {
    entries: query.data?.entries ?? [],
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  }
}
