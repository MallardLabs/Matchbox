import { getContractConfig } from "@/config/contracts"
import { QUERY_PROFILES } from "@/config/queryProfiles"
import { useNetwork } from "@/contexts/NetworkContext"
import { useReadContracts } from "wagmi"

type VeSupplyResult = {
  totalVeBtcRaw: bigint | undefined
  totalVeMezoRaw: bigint | undefined
  totalVeBtc: number | undefined
  totalVeMezo: number | undefined
  isLoading: boolean
  error: Error | null
}

export function useVeSupply(): VeSupplyResult {
  const { chainId, isNetworkReady } = useNetwork()
  const contracts = getContractConfig(chainId)

  const { data, isLoading, error } = useReadContracts({
    contracts: [
      {
        ...contracts.veBTC,
        functionName: "supply",
      },
      {
        ...contracts.veMEZO,
        functionName: "supply",
      },
    ],
    query: {
      ...QUERY_PROFILES.SHORT_CACHE,
      enabled: isNetworkReady,
    },
  })

  const totalVeBtcRaw =
    data?.[0]?.status === "success" ? (data[0].result as bigint) : undefined
  const totalVeMezoRaw =
    data?.[1]?.status === "success" ? (data[1].result as bigint) : undefined

  const toNumber = (val: bigint | undefined): number | undefined => {
    if (val === undefined) return undefined
    return Number(val) / 1e18
  }

  return {
    totalVeBtcRaw,
    totalVeMezoRaw,
    totalVeBtc: toNumber(totalVeBtcRaw),
    totalVeMezo: toNumber(totalVeMezoRaw),
    isLoading,
    error,
  }
}

export default useVeSupply
