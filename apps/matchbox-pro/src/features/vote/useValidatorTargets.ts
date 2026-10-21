import { useNetwork } from "@/lib/network"
import { QUERY_PROFILES } from "@/lib/queryProfiles"
import { supabase } from "@/lib/supabase"
import { useQuery } from "@tanstack/react-query"
import { useMemo } from "react"
import { z } from "zod"
import { type ValidatorProfile, validatorTargets } from "./marketTargets"
import type { TargetData } from "./model"
import type { Prices } from "./targets"
import { useValidatorMarket } from "./useMarkets"

const profileSchema = z.object({
  gauge_address: z.string(),
  operator_address: z.string().nullish(),
  display_name: z.string().nullish(),
  description: z.string().nullish(),
  profile_picture_url: z.string().nullish(),
})

const NO_PROFILES: ValidatorProfile[] = []

function useValidatorProfiles(chainId: number) {
  return useQuery({
    queryKey: ["validator-profiles", chainId],
    queryFn: async (): Promise<ValidatorProfile[]> => {
      if (!supabase) return []
      const { data, error } = await supabase
        .from("validator_profiles")
        .select(
          "gauge_address, operator_address, display_name, description, profile_picture_url",
        )
        .eq("chain_id", chainId)
      if (error) throw error
      const parsed = z.array(profileSchema).safeParse(data ?? [])
      return parsed.success ? parsed.data : []
    },
    ...QUERY_PROFILES.LONG_CACHE,
    enabled: Boolean(supabase),
  })
}

/**
 * Validator gauges (ValidatorsVoter keeps gauges of validators that left the
 * PoA set), named from the registry and Supabase `validator_profiles`.
 */
export function useValidatorTargets(prices: Prices): TargetData {
  const { chainId } = useNetwork()
  const market = useValidatorMarket()
  const profiles = useValidatorProfiles(chainId)
  const targets = useMemo(
    () =>
      market.market
        ? validatorTargets(market.market, profiles.data ?? NO_PROFILES, prices)
        : [],
    [market.market, prices, profiles.data],
  )
  return {
    targets,
    isLoading: market.isLoading,
    incentivesLoading: market.isLoading,
    unavailable: market.unavailable,
    retry: market.retry,
  }
}
