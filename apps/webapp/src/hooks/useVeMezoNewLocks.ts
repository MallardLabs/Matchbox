import { QUERY_PROFILES } from "@/config/queryProfiles"
import { useNetwork } from "@/contexts/NetworkContext"
import {
  type MezoGaugesLocks,
  mezoGaugesLocksSchema,
} from "@/lib/mezoGauges/schema"
import { CHAIN_ID } from "@repo/shared/contracts"
import { useQuery } from "@tanstack/react-query"

async function fetchLocks(): Promise<MezoGaugesLocks> {
  const response = await fetch("/api/mezo-gauges/locks", {
    cache: "no-store",
  })
  if (!response.ok) {
    throw new Error(`Unable to load lock stats (${response.status})`)
  }
  return mezoGaugesLocksSchema.parse(await response.json())
}

export function useVeMezoNewLocks() {
  const { chainId, isNetworkReady } = useNetwork()
  const query = useQuery({
    queryKey: ["mezo-gauges-locks"],
    queryFn: fetchLocks,
    enabled: isNetworkReady && chainId === CHAIN_ID.mainnet,
    ...QUERY_PROFILES.LONG_CACHE,
  })
  return {
    locks: query.data,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  }
}
