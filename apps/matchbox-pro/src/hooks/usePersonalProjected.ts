import { getContractConfig } from "@/lib/contracts"
import { microUsdToTokenAmount, priceToMicroUsd } from "@/lib/money"
import { useNetwork } from "@/lib/network"
import { QUERY_PROFILES } from "@/lib/queryProfiles"
import { useMemo } from "react"
import { useReadContracts } from "wagmi"
import { incentiveMicroByGauge, projectedMicro } from "./personalProjected"
import { useBtcPrice, useMezoPrice } from "./usePrices"
import { useTopology } from "./useTopology"
import { useAllVoteAllocations } from "./useVoteAllocations"

/**
 * The viewer's projected voting incentives this epoch: each voted gauge's
 * incentives pro rata to the locks' share of its votes. Reads only the gauges
 * the locks voted for, never the full gauge list.
 */
export function usePersonalProjected(tokenIds: bigint[]) {
  const { chainId } = useNetwork()
  const contracts = getContractConfig(chainId)
  const topologyQuery = useTopology()
  const topology = topologyQuery.data
  const { data: btcPrice = null } = useBtcPrice()
  const { data: mezoPrice = null } = useMezoPrice()
  const { aggregatedAllocations, votedGauges, isLoading, error } =
    useAllVoteAllocations(tokenIds)

  // Runs alongside the `votes` reads: both only need the voted gauge list.
  const weightsRead = useReadContracts({
    contracts: votedGauges.map((gauge) => ({
      ...contracts.boostVoter,
      functionName: "weights" as const,
      args: [gauge] as const,
    })),
    query: {
      ...QUERY_PROFILES.SHORT_CACHE,
      enabled: votedGauges.length > 0,
    },
  })

  const gaugeWeights = useMemo(() => {
    const map = new Map<string, bigint>()
    votedGauges.forEach((gauge, index) => {
      const result = weightsRead.data?.[index]?.result
      if (typeof result === "bigint") map.set(gauge.toLowerCase(), result)
    })
    return map
  }, [votedGauges, weightsRead.data])

  const incentiveByGauge = useMemo(
    () =>
      incentiveMicroByGauge(topology?.gauges ?? [], {
        btcPriceUsd: btcPrice,
        mezoPriceUsd: mezoPrice,
      }),
    [btcPrice, mezoPrice, topology],
  )

  const projected = useMemo(
    () =>
      projectedMicro(
        aggregatedAllocations,
        (gauge) => gaugeWeights.get(gauge),
        incentiveByGauge,
      ),
    [aggregatedAllocations, gaugeWeights, incentiveByGauge],
  )

  const mezoAmount =
    mezoPrice && projected > 0n
      ? microUsdToTokenAmount(projected, 18, mezoPrice)
      : 0n

  return {
    projectedMicro: projected,
    mezoAmount,
    mezoPrice,
    assetPriceMicroUsd: mezoPrice ? priceToMicroUsd(mezoPrice) : 0n,
    isLoading:
      tokenIds.length > 0 &&
      (isLoading || weightsRead.isLoading || topologyQuery.isLoading),
    error: error ?? weightsRead.error ?? topologyQuery.error,
    hasVotes: aggregatedAllocations.length > 0,
  }
}
