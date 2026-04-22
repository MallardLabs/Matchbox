import { QUERY_PROFILES } from "@/config/queryProfiles"
import { useQuery } from "@tanstack/react-query"

export type GaugeVoteRow = {
  gaugeAddress: string
  vemezoWeight: string
  vebtcWeight: string
  totalIncentivesUsd: number
  boostMultiplier: number | null
}

export type EpochVotesBundle = {
  epochStart: number
  totalVemezoWeight: string
  totalVebtcWeight: string
  totalIncentivesUsd: number
  gauges: GaugeVoteRow[]
}

type ApiResponse = {
  epochs: EpochVotesBundle[]
  error?: string
  timestamp: number
}

async function fetchGaugeVotes(limit: number): Promise<EpochVotesBundle[]> {
  const response = await fetch(
    `/api/analytics/gauge-votes-by-epoch?limit=${limit}`,
  )

  if (!response.ok) {
    throw new Error(`Failed to fetch gauge votes: ${response.status}`)
  }

  const body = (await response.json()) as ApiResponse
  if (body.error) {
    return []
  }
  return body.epochs ?? []
}

/**
 * Fetch per-gauge-per-epoch vote weights (veBTC + veMEZO) for the most recent
 * `limit` epochs, ordered newest-first. Powers the gauge-votes breakdown and
 * epoch time-travel UI.
 */
export function useGaugeVotesByEpoch(limit = 12) {
  const query = useQuery({
    queryKey: ["gauge-votes-by-epoch", limit],
    queryFn: () => fetchGaugeVotes(limit),
    ...QUERY_PROFILES.LONG_CACHE,
  })

  return {
    epochs: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  }
}

export default useGaugeVotesByEpoch
