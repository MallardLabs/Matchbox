import { getContractConfig } from "@/config/contracts"
import { QUERY_PROFILES } from "@/config/queryProfiles"
import { useNetwork } from "@/contexts/NetworkContext"
import { useReadContracts } from "wagmi"

type VeSupplyResult = {
  totalVeBtc: number | undefined
  totalVeMezo: number | undefined
  isLoading: boolean
  error: Error | null
}

/** Live veBTC / veMEZO totals from escrow `supply()` — Boost calculator system defaults. */
export function useVeSupply(): VeSupplyResult {
  const { chainId, isNetworkReady } = useNetwork()
  const contracts = getContractConfig(chainId)

  const { data, isLoading, error } = useReadContracts({
    contracts: [
      { ...contracts.veBTC, functionName: "supply" },
      { ...contracts.veMEZO, functionName: "supply" },
    ],
    query: {
      ...QUERY_PROFILES.SHORT_CACHE,
      enabled: isNetworkReady,
    },
  })

  const rawVeBtc = data?.[0]?.result as bigint | undefined
  const rawVeMezo = data?.[1]?.result as bigint | undefined

  return {
    totalVeBtc: rawVeBtc !== undefined ? Number(rawVeBtc) / 1e18 : undefined,
    totalVeMezo: rawVeMezo !== undefined ? Number(rawVeMezo) / 1e18 : undefined,
    isLoading,
    error,
  }
}

export default useVeSupply
