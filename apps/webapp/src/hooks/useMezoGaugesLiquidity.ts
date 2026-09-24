import { QUERY_PROFILES } from "@/config/queryProfiles"
import { useNetwork } from "@/contexts/NetworkContext"
import {
  type MezoGaugesLiquidityResponse,
  mezoGaugesLiquiditySchema,
} from "@/lib/mezoGauges/schema"
import { CHAIN_ID } from "@repo/shared/contracts"
import { useQuery } from "@tanstack/react-query"

async function fetchLiquidity(): Promise<MezoGaugesLiquidityResponse> {
  const response = await fetch("/api/mezo-gauges/liquidity", {
    cache: "no-store",
  })
  if (!response.ok) {
    throw new Error(`Unable to load liquidity (${response.status})`)
  }
  return mezoGaugesLiquiditySchema.parse(await response.json())
}

export function useMezoGaugesLiquidity() {
  const { chainId, isNetworkReady } = useNetwork()
  const query = useQuery({
    queryKey: ["mezo-gauges-liquidity"],
    queryFn: fetchLiquidity,
    enabled: isNetworkReady && chainId === CHAIN_ID.mainnet,
    ...QUERY_PROFILES.LONG_CACHE,
  })
  return {
    venues: query.data?.venues ?? {},
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  }
}
