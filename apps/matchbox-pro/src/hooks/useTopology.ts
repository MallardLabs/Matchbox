import { useNetwork } from "@/lib/network"
import { QUERY_PROFILES } from "@/lib/queryProfiles"
import { fetchGaugeTopology } from "@/lib/topology"
import { useQuery } from "@tanstack/react-query"

export function useTopology() {
  const { chainId } = useNetwork()
  return useQuery({
    queryKey: ["gauge-topology", chainId],
    queryFn: ({ signal }) => fetchGaugeTopology(chainId, signal),
    ...QUERY_PROFILES.LONG_CACHE,
  })
}
