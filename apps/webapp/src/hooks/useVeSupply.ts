import { getContractConfig } from "@/config/contracts"
import { QUERY_PROFILES } from "@/config/queryProfiles"
import { useNetwork } from "@/contexts/NetworkContext"
import { useCallback, useEffect, useRef, useState } from "react"
import { useReadContracts } from "wagmi"

type FetchStatus = "loading" | "success" | "error"

type VeSupplyResult = {
  totalVeBtc: number | undefined
  totalVeMezo: number | undefined
  fetchStatus: FetchStatus
}

/** Live veBTC / veMEZO totals from escrow `supply()` — Boost calculator system defaults. */
export function useVeSupply(): VeSupplyResult {
  const { chainId, isNetworkReady } = useNetwork()
  const contracts = getContractConfig(chainId)

  const { data, isFetching, isError, refetch } = useReadContracts({
    contracts: [
      { ...contracts.veBTC, functionName: "supply" },
      { ...contracts.veMEZO, functionName: "supply" },
    ],
    query: {
      ...QUERY_PROFILES.SHORT_CACHE,
      enabled: isNetworkReady,
      retry: false,
    },
  })

  const [fetchStatus, setFetchStatus] = useState<FetchStatus>("loading")
  const retryCountRef = useRef(0)
  const retryTimerRef = useRef<ReturnType<typeof setTimeout>>()

  const clearRetryTimer = useCallback(() => {
    if (retryTimerRef.current !== undefined) {
      clearTimeout(retryTimerRef.current)
      retryTimerRef.current = undefined
    }
  }, [])

  useEffect(() => {
    clearRetryTimer()

    if (isFetching) {
      setFetchStatus("loading")
      return
    }

    if (isError) {
      setFetchStatus("error")
      const delay = Math.min(2000 * 2 ** retryCountRef.current, 30_000)
      retryTimerRef.current = setTimeout(() => {
        retryCountRef.current++
        refetch()
      }, delay)
      return
    }

    // Success
    retryCountRef.current = 0
    setFetchStatus("success")
  }, [isFetching, isError, refetch, clearRetryTimer])

  // Cleanup retry timer on unmount
  useEffect(() => clearRetryTimer, [clearRetryTimer])

  const rawVeBtc = data?.[0]?.result as bigint | undefined
  const rawVeMezo = data?.[1]?.result as bigint | undefined

  return {
    totalVeBtc: rawVeBtc !== undefined ? Number(rawVeBtc) / 1e18 : undefined,
    totalVeMezo: rawVeMezo !== undefined ? Number(rawVeMezo) / 1e18 : undefined,
    fetchStatus,
  }
}

export default useVeSupply
