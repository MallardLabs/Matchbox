import { useBoostGauges } from "@/hooks/useBoostGauges"
import { profileForGauge, useGaugeProfiles } from "@/hooks/useProfiles"
import { useTopology } from "@/hooks/useTopology"
import { useMemo } from "react"
import type { TargetData, VoteTarget } from "./model"
import {
  INFINITE_APY,
  PER_10K_VEMEZO,
  type Prices,
  boostFooter,
  formatVeBtc,
  formatWhole,
  priceRewards,
  rewardPerUnit,
  sumPriced,
  targetApy,
} from "./targets"

function parseAmount(value: string): bigint {
  try {
    return /^\d+$/.test(value) ? BigInt(value) : 0n
  } catch {
    return 0n
  }
}

/** veMEZO boost gauges: one card per BoostVoter gauge. */
export function useVeMezoTargets(prices: Prices): TargetData {
  const { gauges, isLoading } = useBoostGauges()
  const { data: profiles } = useGaugeProfiles()
  const topology = useTopology()

  const targets = useMemo(() => {
    const rewardsByGauge = new Map(
      (topology.data?.gauges ?? []).map((entry) => [
        entry.gaugeAddress.toLowerCase(),
        entry.rewardTokens.map((token) => ({
          tokenAddress: token.tokenAddress,
          symbol: token.symbol,
          decimals: token.decimals,
          amount: parseAmount(token.epochAmount),
        })),
      ]),
    )
    return gauges.map((gauge): VoteTarget => {
      const profile = profileForGauge(profiles, gauge.address)
      const rewards = priceRewards(
        rewardsByGauge.get(gauge.address.toLowerCase()) ?? [],
        prices,
      )
      const { microUsd, hasUnpriced } = sumPriced(rewards)
      const apyBps = targetApy(microUsd, gauge.totalWeight, prices.mezo)
      const name =
        profile?.display_name?.trim() || `Gauge ${gauge.address.slice(0, 6)}`
      const chip = profile?.vebtc_token_id ?? gauge.veBTCTokenId?.toString()
      return {
        id: gauge.address,
        name,
        description: profile ? profile.description : "Unclaimed",
        mark: profile?.profile_picture_url
          ? { kind: "image", url: profile.profile_picture_url }
          : { kind: "monogram", name, seed: gauge.address },
        chip: chip ? `#${chip}` : null,
        isAlive: gauge.isAlive,
        needsBoost: gauge.needsBoost,
        totalWeight: gauge.totalWeight,
        rewards,
        incentiveMicroUsd: microUsd,
        hasUnpriced,
        apyBps,
        perUnitMicroUsd:
          microUsd > 0n
            ? rewardPerUnit(microUsd, gauge.totalWeight, PER_10K_VEMEZO)
            : null,
        stats: [
          {
            label: "veBTC",
            value:
              gauge.veBTCWeight !== undefined
                ? formatVeBtc(gauge.veBTCWeight)
                : "—",
          },
          { label: "veMEZO", value: formatWhole(gauge.totalWeight) },
        ],
        footer: boostFooter({
          optimal: gauge.optimalVeMEZO,
          weight: gauge.totalWeight,
          boost: gauge.boostMultiplier,
        }),
        sortValues: {
          apy: apyBps === -1n ? INFINITE_APY : (apyBps ?? 0n),
          incentives: microUsd,
          vebtc: gauge.veBTCWeight ?? 0n,
          vemezo: gauge.totalWeight,
          boost: BigInt(Math.round(gauge.boostMultiplier * 100)),
        },
        searchText: [
          name,
          profile?.description ?? "",
          gauge.address,
          chip ?? "",
        ]
          .join(" ")
          .toLowerCase(),
        hasDetail: true,
      }
    })
  }, [gauges, prices, profiles, topology.data])

  return {
    targets,
    isLoading,
    incentivesLoading: topology.isLoading,
    unavailable: false,
    retry: () => void topology.refetch(),
  }
}
