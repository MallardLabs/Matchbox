import { QUERY_PROFILES } from "@/config/queryProfiles"
import { useQuery } from "@tanstack/react-query"

export type HistoryPeriod = "1m" | "3m" | "all"

export type ProtocolEpochDatum = {
  epochStart: number
  totalIncentivesUsd: number
  gaugeCount: number
  totalVemezoWeight: string
  totalVebtcWeight: string
  avgBoostMultiplier: number | null
}

type ApiResponse = {
  epochs: ProtocolEpochDatum[]
  period?: string
  error?: string
  timestamp: number
}

async function fetchProtocolHistory(
  period: HistoryPeriod,
): Promise<ProtocolEpochDatum[]> {
  const response = await fetch(
    `/api/analytics/gauge-history-aggregate?period=${period}`,
  )

  if (!response.ok) {
    throw new Error(`Failed to fetch protocol history: ${response.status}`)
  }

  const body = (await response.json()) as ApiResponse
  if (body.error) {
    return []
  }
  return body.epochs ?? []
}

/**
 * Fetch aggregated gauge_history data across all gauges, grouped by epoch.
 * Powers the protocol revenue and earning power charts.
 */
export function useProtocolHistory(period: HistoryPeriod = "all") {
  const query = useQuery({
    queryKey: ["protocol-history", period],
    queryFn: () => fetchProtocolHistory(period),
    ...QUERY_PROFILES.LONG_CACHE,
  })

  return {
    epochs: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  }
}

export default useProtocolHistory
