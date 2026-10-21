import { useMemo } from "react"
import { poolTargets } from "./marketTargets"
import type { TargetData } from "./model"
import type { Prices } from "./targets"
import { usePoolMarket } from "./useMarkets"

/**
 * PoolsVoter targets are pools and vaults (not gauges): `vote`, `votes` and
 * `weights` take the target; `isAlive` and the reward lookups take its gauge.
 */
export function usePoolTargets(prices: Prices): TargetData {
  const market = usePoolMarket()
  const targets = useMemo(
    () => (market.market ? poolTargets(market.market, prices) : []),
    [market.market, prices],
  )
  return {
    targets,
    isLoading: market.isLoading,
    incentivesLoading: market.isLoading,
    unavailable: market.unavailable,
    retry: market.retry,
  }
}
