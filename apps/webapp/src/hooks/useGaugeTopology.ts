import { QUERY_PROFILES } from "@/config/queryProfiles"
import { useNetwork } from "@/contexts/NetworkContext"
import { getContractConfig } from "@/config/contracts"
import type { GaugeTopologyResponse } from "@/types/gaugeTopology"
import { useQuery } from "@tanstack/react-query"
import { useMemo } from "react"
import type { Address } from "viem"
import { useReadContract } from "wagmi"

type UseGaugeTopologyOptions = {
  enabled?: boolean
}

async function fetchGaugeTopology(
  chainId: number,
  signal: AbortSignal,
): Promise<GaugeTopologyResponse> {
  const response = await fetch(
    `/api/analytics/gauge-topology?chainId=${chainId}`,
    {
      method: "GET",
      signal,
    },
  )

  if (!response.ok) {
    throw new Error(`Failed to fetch gauge topology (${response.status})`)
  }

  return (await response.json()) as GaugeTopologyResponse
}

export function useGaugeTopology(options: UseGaugeTopologyOptions = {}) {
  const { chainId, isNetworkReady } = useNetwork()
  const enabled = (options.enabled ?? true) && isNetworkReady
  const contracts = getContractConfig(chainId)

  // Fetch epochStart so cache key invalidates at epoch boundaries
  const now = useMemo(() => BigInt(Math.floor(Date.now() / 1000)), [])
  const { data: epochNextData } = useReadContract({
    ...contracts.boostVoter,
    functionName: "epochNext",
    args: [now],
    query: {
      ...QUERY_PROFILES.LONG_CACHE,
      enabled: isNetworkReady,
    },
  })
  const epochStart =
    epochNextData !== undefined
      ? (epochNextData as bigint) - 604800n
      : undefined
  const epochKey = epochStart?.toString() ?? "unknown"

  const query = useQuery({
    queryKey: ["gauge-topology", chainId, epochKey],
    queryFn: ({ signal }) => fetchGaugeTopology(chainId, signal),
    enabled,
    ...QUERY_PROFILES.SHORT_CACHE,
  })

  const gaugeToBribe = useMemo(() => {
    const map = new Map<string, Address | null>()
    for (const gauge of query.data?.gauges ?? []) {
      map.set(gauge.gaugeAddress.toLowerCase(), gauge.bribeAddress)
    }
    return map
  }, [query.data])

  const gaugeRewardTokens = useMemo(() => {
    const map = new Map<
      string,
      GaugeTopologyResponse["gauges"][number]["rewardTokens"]
    >()
    for (const gauge of query.data?.gauges ?? []) {
      map.set(gauge.gaugeAddress.toLowerCase(), gauge.rewardTokens)
    }
    return map
  }, [query.data])

  const allGaugeAddresses = useMemo(
    () => query.data?.gauges.map((gauge) => gauge.gaugeAddress) ?? [],
    [query.data],
  )

  return {
    topology: query.data ?? null,
    gaugeToBribe,
    gaugeRewardTokens,
    allGaugeAddresses,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  }
}
