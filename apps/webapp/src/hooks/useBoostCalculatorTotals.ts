import { getContractConfig } from "@/config/contracts"
import { QUERY_PROFILES } from "@/config/queryProfiles"
import { useNetwork } from "@/contexts/NetworkContext"
import { useReadContracts } from "wagmi"

export type BoostCalculatorTotalsResult = {
  /** Unboosted veBTC voting power system total (matches boost denominator). */
  totalUnboostedVeBtcVp: number | undefined
  /** Total veMEZO weight allocated to gauges (matches boost + optimal veMEZO math). */
  totalAllocatedVeMezoWeight: number | undefined
  isLoading: boolean
  error: Error | null
}

/**
 * Live totals for the boost calculator. Token `supply()` is the wrong dimension:
 * user inputs are voting power, so we use the same bases as `getBoost` /
 * optimal veMEZO (unboosted veBTC VP and boost voter total weight).
 */
export function useBoostCalculatorTotals(): BoostCalculatorTotalsResult {
  const { chainId, isNetworkReady } = useNetwork()
  const contracts = getContractConfig(chainId)

  const { data, isLoading, error } = useReadContracts({
    contracts: [
      { ...contracts.veBTC, functionName: "unboostedTotalVotingPower" },
      { ...contracts.boostVoter, functionName: "totalWeight" },
    ],
    query: {
      ...QUERY_PROFILES.SHORT_CACHE,
      enabled: isNetworkReady,
    },
  })

  const rawBtc = data?.[0]?.result as bigint | undefined
  const rawMezo = data?.[1]?.result as bigint | undefined

  return {
    totalUnboostedVeBtcVp:
      rawBtc !== undefined ? Number(rawBtc) / 1e18 : undefined,
    totalAllocatedVeMezoWeight:
      rawMezo !== undefined ? Number(rawMezo) / 1e18 : undefined,
    isLoading,
    error,
  }
}
