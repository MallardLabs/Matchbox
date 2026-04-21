import { getContractConfig } from "@/config/contracts"
import { QUERY_PROFILES } from "@/config/queryProfiles"
import { useNetwork } from "@/contexts/NetworkContext"
import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { useReadContracts } from "wagmi"

type FetchStatus = "loading" | "success" | "error"

type PreviewModeContextValue = {
  enabled: boolean
  toggle: () => void
  setEnabled: (enabled: boolean) => void
  veBTCOverride: bigint | undefined
  veMEZOOverride: bigint | undefined
  setVeBTCOverride: (v: bigint | undefined) => void
  setVeMEZOOverride: (v: bigint | undefined) => void
  resetToLive: () => void
  realVeBTCSupply: bigint | undefined
  realVeMEZOSupply: bigint | undefined
  fetchStatus: FetchStatus
  refetchReal: () => Promise<unknown>
}

const PreviewModeContext = createContext<PreviewModeContextValue | null>(null)

export function usePreviewMode(): PreviewModeContextValue {
  const ctx = useContext(PreviewModeContext)
  if (!ctx) {
    throw new Error(
      "usePreviewMode must be used within a <PreviewModeProvider>",
    )
  }
  return ctx
}

/**
 * Holds simulation overrides for boost-system totals, plus the live fetch that
 * seeds the overrides when preview mode is toggled on. veBTC uses
 * `unboostedTotalVotingPower()` while veMEZO uses `totalVotingPower()`.
 * State is session-scoped (no persistence).
 */
export function PreviewModeProvider({ children }: { children: ReactNode }) {
  const { chainId, isNetworkReady } = useNetwork()
  const contracts = getContractConfig(chainId)

  const { data, isFetching, isError, refetch } = useReadContracts({
    contracts: [
      { ...contracts.veBTC, functionName: "unboostedTotalVotingPower" },
      { ...contracts.veMEZO, functionName: "totalVotingPower" },
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

    retryCountRef.current = 0
    setFetchStatus("success")
  }, [isFetching, isError, refetch, clearRetryTimer])

  useEffect(() => clearRetryTimer, [clearRetryTimer])

  const realVeBTCSupply = data?.[0]?.result as bigint | undefined
  const realVeMEZOSupply = data?.[1]?.result as bigint | undefined

  const [enabled, setEnabled] = useState(false)
  const [veBTCOverride, setVeBTCOverride] = useState<bigint | undefined>(
    undefined,
  )
  const [veMEZOOverride, setVeMEZOOverride] = useState<bigint | undefined>(
    undefined,
  )

  const toggle = useCallback(() => {
    setEnabled((prev) => {
      const next = !prev
      if (next) {
        // Seed overrides with current real values so the simulation starts
        // from reality rather than zero.
        setVeBTCOverride((current) => current ?? realVeBTCSupply)
        setVeMEZOOverride((current) => current ?? realVeMEZOSupply)
      }
      return next
    })
  }, [realVeBTCSupply, realVeMEZOSupply])

  const resetToLive = useCallback(() => {
    setVeBTCOverride(realVeBTCSupply)
    setVeMEZOOverride(realVeMEZOSupply)
  }, [realVeBTCSupply, realVeMEZOSupply])

  const value = useMemo<PreviewModeContextValue>(
    () => ({
      enabled,
      toggle,
      setEnabled,
      veBTCOverride,
      veMEZOOverride,
      setVeBTCOverride,
      setVeMEZOOverride,
      resetToLive,
      realVeBTCSupply,
      realVeMEZOSupply,
      fetchStatus,
      refetchReal: refetch,
    }),
    [
      enabled,
      toggle,
      veBTCOverride,
      veMEZOOverride,
      resetToLive,
      realVeBTCSupply,
      realVeMEZOSupply,
      fetchStatus,
      refetch,
    ],
  )

  return (
    <PreviewModeContext.Provider value={value}>
      {children}
    </PreviewModeContext.Provider>
  )
}
