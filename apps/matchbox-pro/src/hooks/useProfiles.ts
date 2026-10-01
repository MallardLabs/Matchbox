import { QUERY_PROFILES } from "@/lib/queryProfiles"
import { type GaugeProfile, supabase } from "@/lib/supabase"
import { useQuery } from "@tanstack/react-query"

export function useGaugeProfiles() {
  return useQuery({
    queryKey: ["gauge-profiles"],
    queryFn: async () => {
      if (!supabase) return []
      const { data, error } = await supabase.from("gauge_profiles").select("*")
      if (error) throw error
      return (data ?? []) as unknown as GaugeProfile[]
    },
    ...QUERY_PROFILES.LONG_CACHE,
    enabled: Boolean(supabase),
  })
}

export function profileForGauge(
  profiles: GaugeProfile[] | undefined,
  address: string,
): GaugeProfile | undefined {
  return profiles?.find(
    (profile) => profile.gauge_address.toLowerCase() === address.toLowerCase(),
  )
}
