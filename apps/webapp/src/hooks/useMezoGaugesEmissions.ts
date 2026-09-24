import { QUERY_PROFILES } from "@/config/queryProfiles"
import { useNetwork } from "@/contexts/NetworkContext"
import {
  type MezoGaugesEmissions,
  mezoGaugesEmissionsSchema,
} from "@/lib/mezoGauges/schema"
import { CHAIN_ID } from "@repo/shared/contracts"
import { useQuery } from "@tanstack/react-query"

async function fetchEmissions(): Promise<MezoGaugesEmissions> {
  const response = await fetch("/api/mezo-gauges/emissions", {
    cache: "no-store",
  })
  if (!response.ok) {
    throw new Error(`Unable to load emissions (${response.status})`)
  }
  return mezoGaugesEmissionsSchema.parse(await response.json())
}

export function useMezoGaugesEmissions() {
  const { chainId, isNetworkReady } = useNetwork()
  const query = useQuery({
    queryKey: ["mezo-gauges-emissions"],
    queryFn: fetchEmissions,
    enabled: isNetworkReady && chainId === CHAIN_ID.mainnet,
    ...QUERY_PROFILES.LONG_CACHE,
  })
  return {
    emissions: query.data,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  }
}
