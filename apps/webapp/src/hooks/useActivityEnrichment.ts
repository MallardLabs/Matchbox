import type { GaugeProfile } from "@/config/supabase"
import { useBoostableTokenGauges } from "@/hooks/useBoostableTokenGauges"
import { useAllGaugeProfiles } from "@/hooks/useGaugeProfiles"
import { useMezoPrice } from "@/hooks/useMezoPrice"
import { type Pool, usePools } from "@/hooks/usePools"
import type { EnrichmentContext } from "@/lib/mezoActivity/format"
import type { MezoActivityItem } from "@/types/mezoActivity"
import { useMemo } from "react"
import type { Address } from "viem"

export function useActivityEnrichment(
  items: MezoActivityItem[],
): EnrichmentContext {
  const { pools } = usePools()
  const { profiles } = useAllGaugeProfiles()
  const mezoPrice = useMezoPrice()

  const poolsByGauge = useMemo(() => {
    const map = new Map<string, Pool>()
    for (const pool of pools) {
      if (pool.gauge) map.set(pool.gauge.toLowerCase(), pool)
    }
    return map
  }, [pools])

  const gaugeProfilesByAddress = useMemo<Map<string, GaugeProfile>>(() => {
    return new Map(profiles)
  }, [profiles])

  const boostableIds = useMemo(() => {
    const ids: bigint[] = []
    const seen = new Set<string>()
    for (const item of items) {
      if (item.actionType !== "boostPoke") continue
      if (item.tokenId === undefined) continue
      const key = item.tokenId.toString()
      if (seen.has(key)) continue
      seen.add(key)
      ids.push(item.tokenId)
    }
    return ids
  }, [items])

  const { byTokenId: boostableGaugeByTokenIdRaw } =
    useBoostableTokenGauges(boostableIds)

  const boostableGauges = useMemo(() => {
    const map = new Map<string, Address>()
    for (const [key, value] of boostableGaugeByTokenIdRaw.entries()) {
      map.set(key, value)
    }
    return map
  }, [boostableGaugeByTokenIdRaw])

  return {
    poolsByGauge,
    gaugeProfilesByAddress,
    boostableGauges,
    mezoPriceUsd: mezoPrice.price ?? null,
    btcPriceUsd: null,
  }
}
