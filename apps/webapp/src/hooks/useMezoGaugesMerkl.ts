import { QUERY_PROFILES } from "@/config/queryProfiles"
import { useNetwork } from "@/contexts/NetworkContext"
import {
  type MezoGaugesMerkl,
  mezoGaugesMerklSchema,
} from "@/lib/mezoGauges/schema"
import { CHAIN_ID } from "@repo/shared/contracts"
import { useQuery } from "@tanstack/react-query"

async function fetchMerkl(): Promise<MezoGaugesMerkl> {
  const response = await fetch("/api/mezo-gauges/merkl", {
    cache: "no-store",
  })
  if (!response.ok) {
    throw new Error(`Unable to load merkl data (${response.status})`)
  }
  return mezoGaugesMerklSchema.parse(await response.json())
}

export function useMezoGaugesMerkl() {
  const { chainId, isNetworkReady } = useNetwork()
  const query = useQuery({
    queryKey: ["mezo-gauges-merkl"],
    queryFn: fetchMerkl,
    enabled: isNetworkReady && chainId === CHAIN_ID.mainnet,
    ...QUERY_PROFILES.LONG_CACHE,
  })
  return {
    campaigns: query.data?.campaigns ?? {},
    claims: query.data?.claims,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  }
}
