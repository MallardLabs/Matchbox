import { QUERY_PROFILES } from "@/config/queryProfiles"
import { useNetwork } from "@/contexts/NetworkContext"
import {
  type MezoGaugesSnapshot,
  mezoGaugesSnapshotSchema,
} from "@/lib/mezoGauges/schema"
import { CHAIN_ID } from "@repo/shared/contracts"
import { useQuery } from "@tanstack/react-query"

async function fetchSnapshot(): Promise<MezoGaugesSnapshot> {
  const response = await fetch("/api/mezo-gauges/snapshot", {
    cache: "no-store",
  })
  if (!response.ok) {
    throw new Error(`Unable to load snapshot (${response.status})`)
  }
  return mezoGaugesSnapshotSchema.parse(await response.json())
}

export function useMezoGaugesSnapshot() {
  const { chainId, isNetworkReady } = useNetwork()
  const query = useQuery({
    queryKey: ["mezo-gauges-snapshot"],
    queryFn: fetchSnapshot,
    enabled: isNetworkReady && chainId === CHAIN_ID.mainnet,
    ...QUERY_PROFILES.SHORT_CACHE,
  })
  return {
    snapshot: query.data,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  }
}
