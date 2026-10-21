import { profileForGauge, useGaugeProfiles } from "@/hooks/useProfiles"
import { useCallback, useMemo } from "react"
import type { Names } from "./activityModel"

/** Gauge display names for activity rows. */
export function useActivityNames(): Names {
  const { data: profiles } = useGaugeProfiles()
  const gauge = useCallback(
    (address: string) =>
      profileForGauge(profiles, address)?.display_name ?? null,
    [profiles],
  )
  return useMemo(() => ({ gauge }), [gauge])
}
