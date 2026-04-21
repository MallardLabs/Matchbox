import { useGaugesAPY } from "@/hooks/useAPY"
import { useBtcPrice } from "@/hooks/useBtcPrice"
import { useEpochCountdown } from "@/hooks/useEpochCountdown"
import { useBoostGauges, useVoterTotals } from "@/hooks/useGauges"
import { useMezoPrice } from "@/hooks/useMezoPrice"
import { useVeSupply } from "@/hooks/useVeSupply"
import { useMemo } from "react"

export type AnalyticsKPIs = {
  /** Global TVL = veBTC TVL + veMEZO TVL (both in USD). Null if prices not loaded. */
  globalTvlUsd: number | null
  /** Total value locked in veBTC (supply * BTC price). */
  totalLockedBtcUsd: number | null
  /** Current epoch total incentives across all gauges, in USD. */
  epochFeesUsd: number | null
  /** Total veBTC voting power (raw bigint, 1e18 precision). */
  veBTCVotingPower: bigint | undefined
  /** Total veMEZO voting power (raw bigint, 1e18 precision). */
  veMEZOVotingPower: bigint | undefined
  /** Number of active gauges this epoch. */
  gaugeCount: number
  /** Time remaining in current epoch, formatted string. */
  epochCountdown: string
  /** Current epoch week number (approximate). */
  epochWeek: number | null
  /** Current BTC and MEZO prices. */
  btcPrice: number | null
  mezoPrice: number | null
  /** True if any underlying data is still loading. */
  isLoading: boolean
}

/**
 * Epochs on Mezo start Thursday 00:00 UTC and run weekly.
 * Calculate approximate week number since protocol inception.
 * Using Thursday, Jan 2, 2025 as week 1 start (example anchor).
 */
const EPOCH_ANCHOR_UNIX = 1_735_862_400 // 2025-01-02 00:00 UTC (Thursday)

function calculateEpochWeek(): number | null {
  const now = Math.floor(Date.now() / 1000)
  if (now < EPOCH_ANCHOR_UNIX) return null
  const weeksSince = Math.floor((now - EPOCH_ANCHOR_UNIX) / (7 * 86_400))
  return weeksSince + 1
}

/**
 * Composite hook that orchestrates all KPI data sources. Does not make any
 * new network requests beyond what the underlying hooks already make — this
 * is purely a data composition hook.
 */
export function useAnalyticsKPIs(): AnalyticsKPIs {
  const { price: btcPrice, isLoading: isLoadingBtc } = useBtcPrice()
  const { price: mezoPrice, isLoading: isLoadingMezo } = useMezoPrice()
  const { totalVeBtc, totalVeMezo, isLoading: isLoadingSupply } = useVeSupply()
  const { timeRemaining, isLoading: isLoadingEpoch } = useEpochCountdown()
  const { gauges, isLoading: isLoadingGauges } = useBoostGauges({
    includeOwnership: false,
  })
  const {
    veBTCTotalVotingPower,
    veMEZOTotalVotingPower,
    isLoading: isLoadingVoterTotals,
  } = useVoterTotals()

  const gaugesForAPY = useMemo(
    () =>
      gauges.map((g) => ({ address: g.address, totalWeight: g.totalWeight })),
    [gauges],
  )
  const { apyMap, isLoading: isLoadingAPY } = useGaugesAPY(gaugesForAPY)

  const totalLockedBtcUsd = useMemo(() => {
    if (btcPrice === null || totalVeBtc === undefined) return null
    return totalVeBtc * btcPrice
  }, [totalVeBtc, btcPrice])

  const totalLockedMezoUsd = useMemo(() => {
    if (mezoPrice === null || totalVeMezo === undefined) return null
    return totalVeMezo * mezoPrice
  }, [totalVeMezo, mezoPrice])

  const globalTvlUsd = useMemo(() => {
    if (totalLockedBtcUsd === null && totalLockedMezoUsd === null) return null
    return (totalLockedBtcUsd ?? 0) + (totalLockedMezoUsd ?? 0)
  }, [totalLockedBtcUsd, totalLockedMezoUsd])

  const epochFeesUsd = useMemo(() => {
    if (apyMap.size === 0) return null
    let total = 0
    for (const data of apyMap.values()) {
      total += data.totalIncentivesUSD
    }
    return total
  }, [apyMap])

  const gaugeCount = gauges.length

  const epochWeek = useMemo(() => calculateEpochWeek(), [])

  const isLoading =
    isLoadingBtc ||
    isLoadingMezo ||
    isLoadingSupply ||
    isLoadingEpoch ||
    isLoadingGauges ||
    isLoadingVoterTotals ||
    isLoadingAPY

  return {
    globalTvlUsd,
    totalLockedBtcUsd,
    epochFeesUsd,
    veBTCVotingPower: veBTCTotalVotingPower,
    veMEZOVotingPower: veMEZOTotalVotingPower,
    gaugeCount,
    epochCountdown: timeRemaining,
    epochWeek,
    btcPrice,
    mezoPrice,
    isLoading,
  }
}

export default useAnalyticsKPIs
