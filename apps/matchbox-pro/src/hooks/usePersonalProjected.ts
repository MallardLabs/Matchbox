import { microUsdToTokenAmount, priceToMicroUsd } from "@/lib/money"
import { tokenUsdMicro } from "@/lib/tokenUsd"
import { useMemo } from "react"
import { useBoostGauges } from "./useBoostGauges"
import { useBtcPrice, useMezoPrice } from "./usePrices"
import { useTopology } from "./useTopology"
import { useAllVoteAllocations } from "./useVoteAllocations"

export function usePersonalProjected(tokenIds: bigint[]) {
  const { gauges, isLoading: gaugesLoading } = useBoostGauges()
  const topologyQuery = useTopology()
  const topology = topologyQuery.data
  const { data: btcPrice = null } = useBtcPrice()
  const { data: mezoPrice = null } = useMezoPrice()
  const gaugeAddresses = useMemo(
    () => gauges.map((gauge) => gauge.address),
    [gauges],
  )
  const { aggregatedAllocations, isLoading, error } = useAllVoteAllocations(
    tokenIds,
    gaugeAddresses,
  )

  const incentiveByGauge = useMemo(() => {
    const map = new Map<string, bigint>()
    for (const entry of topology?.gauges ?? []) {
      const micro = entry.rewardTokens.reduce((sum, token) => {
        return (
          sum +
          tokenUsdMicro({
            amount: BigInt(token.epochAmount),
            decimals: token.decimals,
            tokenAddress: token.tokenAddress,
            symbol: token.symbol,
            btcPriceUsd: btcPrice,
            mezoPriceUsd: mezoPrice,
          })
        )
      }, 0n)
      map.set(entry.gaugeAddress.toLowerCase(), micro)
    }
    return map
  }, [btcPrice, mezoPrice, topology])

  const projectedMicro = useMemo(() => {
    return aggregatedAllocations.reduce((sum, allocation) => {
      const gauge = gauges.find(
        (item) =>
          item.address.toLowerCase() === allocation.gaugeAddress.toLowerCase(),
      )
      if (!gauge || gauge.totalWeight === 0n || allocation.weight === 0n) {
        return sum
      }
      const incentives =
        incentiveByGauge.get(allocation.gaugeAddress.toLowerCase()) ?? 0n
      return sum + (incentives * allocation.weight) / gauge.totalWeight
    }, 0n)
  }, [aggregatedAllocations, gauges, incentiveByGauge])

  const mezoAmount =
    mezoPrice && projectedMicro > 0n
      ? microUsdToTokenAmount(projectedMicro, 18, mezoPrice)
      : 0n

  return {
    projectedMicro,
    mezoAmount,
    mezoPrice,
    assetPriceMicroUsd: mezoPrice ? priceToMicroUsd(mezoPrice) : 0n,
    isLoading:
      tokenIds.length > 0 &&
      (isLoading || gaugesLoading || topologyQuery.isLoading),
    error: error ?? topologyQuery.error,
    hasVotes: aggregatedAllocations.length > 0,
  }
}
